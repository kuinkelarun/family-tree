import React, { useCallback, useEffect, useState, useRef } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import FamilyNode from './FamilyNode';
import MarriagePointNode from './nodes/MarriagePointNode';

// nodeTypes are memoized inside the component to keep a stable reference

const initialNodes = [
  { id: 'me', position: { x: 0, y: 0 }, data: { label: 'You' }, type: 'familyNode' },
  { id: 'spouse', position: { x: 220, y: 0 }, data: { label: 'Spouse' }, type: 'familyNode' },
  { id: 'child1', position: { x: 110, y: 120 }, data: { label: 'Child' }, type: 'familyNode' },
  { id: 'parent', position: { x: 0, y: -140 }, data: { label: 'Parent' }, type: 'familyNode' },
];

const initialEdges = [
  // Spouse: horizontal left/right handles will be assigned after drag; leave handles undefined
  { id: 'e1', source: 'me', target: 'spouse', type: 'smoothstep', label: 'spouse', markerEnd: { type: 'arrowclosed', color: '#111827' } },
  // Parent relationships (source is parent). Enforce top-source -> bottom-target per user rules.
  { id: 'e2', source: 'me', target: 'child1', type: 'smoothstep', label: 'parent', sourceHandle: 'top-source', targetHandle: 'bottom-target', markerEnd: { type: 'arrowclosed', color: '#111827' } },
  { id: 'e3', source: 'spouse', target: 'child1', type: 'smoothstep', label: 'parent', sourceHandle: 'top-source', targetHandle: 'bottom-target', markerEnd: { type: 'arrowclosed', color: '#111827' } },
  { id: 'e4', source: 'parent', target: 'me', type: 'smoothstep', label: 'parent', sourceHandle: 'top-source', targetHandle: 'bottom-target', markerEnd: { type: 'arrowclosed', color: '#111827' } },
];

export default function TreeBoard({ 
  nodes: extNodes, 
  edges: extEdges, 
  setNodes: setNodesExt, 
  setEdges: setEdgesExt, 
  onAddPerson: onAddPersonExt, 
  onAddPersonAt, // NEW: callback to add a person at a specific position (flow-space)
  onConnect: onConnectExt, 
  onNodeDoubleClick, 
  onNodeDragStop, 
  onEdgeDoubleClick, 
  exportRef, 
  canAdd = true,
  onDropMember, // NEW: callback when member is dropped from sidebar
  onRfReady, // callback to expose react-flow instance to parent
  onAutoLayout, // trigger layered auto layout or revert
  layoutActive = false, // if true, button will say "Revert Layout"
  layoutBusy = false,
  controlsDisabled = false,
  showToast = null,
}) {
  const controlled = Array.isArray(extNodes) && Array.isArray(extEdges);
  const [nodesLocal, setNodesLocal, onNodesChangeLocal] = useNodesState(initialNodes);
  const [edgesLocal, setEdgesLocal, onEdgesChangeLocal] = useEdgesState(initialEdges);
  const nodes = controlled ? extNodes : nodesLocal;
  const edges = controlled ? extEdges : edgesLocal;
  const setNodes = controlled && setNodesExt ? setNodesExt : setNodesLocal;
  const setEdges = controlled && setEdgesExt ? setEdgesExt : setEdgesLocal;
  const onNodesChange = controlled && setNodesExt
    ? (changes) => setNodesExt((nds) => applyNodeChanges(changes, nds))
    : onNodesChangeLocal;
  const onEdgesChange = controlled && setEdgesExt
    ? (changes) => setEdgesExt((eds) => applyEdgeChanges(changes, eds))
    : onEdgesChangeLocal;
  const [counter, setCounter] = useState(1);
  const [maximized, setMaximized] = useState(false);
  const [rfInstance, setRfInstance] = useState(null);
  // Memoize node types so React Flow sees a stable object reference
  const nodeTypesMemo = React.useMemo(() => ({ familyNode: FamilyNode, marriagePoint: MarriagePointNode }), []);
  // Only mount ReactFlow once the container has a positive size to avoid React Flow measurement warnings
  const [flowReady, setFlowReady] = useState(false);
  const [notice, setNotice] = useState('');
  // Alignment guide state (flow-space coordinates)
  const [alignGuides, setAlignGuides] = useState({ x: null, y: null });
  // Track viewport to convert flow-space guide coordinates to screen-space for overlay rendering
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const didInitialFitRef = React.useRef(false);
  const didFullscreenFitRef = React.useRef(false);
  // Tuning: show guides a bit earlier than we snap, for a smoother feel
  const SNAP_THRESHOLD = 12;  // px distance at which we actually snap
  const GUIDE_THRESHOLD = 18; // px distance at which we show a guide (can be > SNAP_THRESHOLD)
  // Group-drag state: when user holds Shift and drags a node, move all nodes together
  const [groupDrag, setGroupDrag] = useState({ active: false, startX: 0, startY: 0, snapshot: [] });
  const groupDragRef = React.useRef(groupDrag);
  const connectStartRef = useRef(null);
  // keep ref in sync
  useEffect(() => { groupDragRef.current = groupDrag; }, [groupDrag]);

  const onConnectStart = useCallback((_, { nodeId, handleId, handleType }) => {
    connectStartRef.current = { nodeId, handleId, handleType };
  }, []);

  const onConnectEnd = useCallback(() => {
    connectStartRef.current = null;
  }, []);

  // Normalize any connection so that the final edge always points from a node's "source" handle to the other node's "target" handle.
  // This prevents flipped directions when users start dragging from a target handle by accident (e.g., right-side target dot).
  // Preserve user intent: always keep direction from the node where drag started (source) to the node where it ended (target).
  const normalizeConnection = useCallback((connection) => {
    const start = connectStartRef.current;
    if (!start) return connection;

    const { nodeId: startNodeId, handleId: startHandleId } = start;
    const { source, sourceHandle, target, targetHandle } = connection;

    // If the connection is already aligned with the drag start, do nothing.
    if (source === startNodeId) {
      const [sourceSide] = sourceHandle.split('-');
      const [targetSide] = targetHandle.split('-');
      const final = {
        source,
        target,
        sourceHandle: `${sourceSide}-source`,
        targetHandle: `${targetSide}-target`,
      };
      console.log(`Normalized (already correct): ${final.source} (${final.sourceHandle}) -> ${final.target} (${final.targetHandle})`);
      return final;
    }

    // If the drag started on the 'target' node of the connection, flip it.
    if (target === startNodeId) {
      const [sourceSide] = sourceHandle.split('-');
      const [targetSide] = targetHandle.split('-');
      const final = {
        source: target, // The node where drag started
        target: source, // The node where drag ended
        sourceHandle: `${targetSide}-source`,
        targetHandle: `${sourceSide}-target`,
      };
      console.log(`Normalized (flipped): ${final.source} (${final.sourceHandle}) -> ${final.target} (${final.targetHandle})`);
      return final;
    }

    return connection; // Fallback
  }, []);

  const onConnect = useCallback((rawParams) => {
    // Normalize so we always end up with source(handle: *-source) -> target(handle: *-target)
    // but preserve whichever side handles the user picked (top/right/bottom/left)
    const params = normalizeConnection(rawParams);
    // Prevent connecting a node to itself (different handles on same node)
    if (params.source === params.target) {
      setNotice('Cannot connect a node to itself');
      return;
    }
    if (onConnectExt) return onConnectExt(params);
    // Prevent duplicate edges (same source -> target)
    setEdges((eds) => {
      const alreadyExact = eds.some((e) => e.source === params.source && e.target === params.target && e.sourceHandle === params.sourceHandle && e.targetHandle === params.targetHandle);
      if (alreadyExact) {
        setNotice('Duplicate connection ignored');
        return eds;
      }
      // Near-duplicate policy: reject if same source->target regardless of handles
      const alreadySamePair = eds.some((e) => e.source === params.source && e.target === params.target);
      if (alreadySamePair) {
        setNotice('Connection already exists between these nodes');
        return eds;
      }

      // Add only the forward directed edge with an arrow marker to indicate source -> target.
      const forward = { ...params, id: `e-${params.source}-${params.target}-${Date.now()}`, type: 'smoothstep', markerEnd: { type: 'arrowclosed', color: '#111827' } };
      return addEdge(forward, eds);
    });
  }, [setEdges, onConnectExt, nodes, normalizeConnection]);

  // Handle multi-node move when user holds Shift while dragging a node
  const onNodeDragStartLocal = useCallback((event, node) => {
    try {
      const isGroup = !!(event && event.shiftKey);
      if (isGroup) {
        const startX = event.clientX || 0;
        const startY = event.clientY || 0;
        const snapshot = (nodes || []).map((n) => ({ id: n.id, x: n.position?.x || 0, y: n.position?.y || 0 }));
        const state = { active: true, startX, startY, snapshot };
        setGroupDrag(state);
        groupDragRef.current = state;
        setNotice('Group drag: moving all nodes (release Shift to stop)');
      }
      // Clear guides at drag start
      setAlignGuides({ x: null, y: null });
    } catch (err) {
      // ignore
    }
  }, [nodes]);

  const onNodeDragLocal = useCallback((event, node) => {
    const g = groupDragRef.current;
    // If group dragging (Shift held), move all nodes together and skip snapping
    if (g && g.active) {
      const dx = (event.clientX || 0) - g.startX;
      const dy = (event.clientY || 0) - g.startY;
      setNodes((nds) => nds.map((n) => {
        const s = g.snapshot.find((x) => x.id === n.id);
        if (!s) return n;
        return { ...n, position: { x: s.x + dx, y: s.y + dy } };
      }));
      return;
    }

    // Soft alignment snapping for single-node drag
    // Align to nearby nodes' left/center/right (x) and top/center/bottom (y)
    // Show guides when within GUIDE_THRESHOLD; snap when within SNAP_THRESHOLD
    try {
      if (!node?.id) return;
      const curId = String(node.id);
      const curPos = node.position || { x: 0, y: 0 };
  let curW = Number.isFinite(node.width) ? node.width : undefined;
  let curH = Number.isFinite(node.height) ? node.height : undefined;

      // Convert pixel thresholds to flow-space thresholds based on current zoom
      const z = Math.max(0.01, viewport?.zoom || 1);
      const snapTh = SNAP_THRESHOLD / z;
      const guideTh = GUIDE_THRESHOLD / z;

      // Prefer measured nodes from React Flow instance (includes width/height)
      const rfNodes = (rfInstance && typeof rfInstance.getNodes === 'function') ? rfInstance.getNodes() : nodes;
      const others = (rfNodes || []).filter((n) => String(n.id) !== curId);

      // If current node dimensions are missing, try to read from rfInstance snapshot
      if ((curW == null || curH == null) && Array.isArray(rfNodes)) {
        const self = rfNodes.find((n) => String(n.id) === curId);
        if (self) {
          if (curW == null && Number.isFinite(self.width)) curW = self.width;
          if (curH == null && Number.isFinite(self.height)) curH = self.height;
        }
      }

      // Helpers to compute anchors
      const anchorsX = [];
      const anchorsY = [];
      // Current node anchor values
      const curLeft = curPos.x;
      const curTop = curPos.y;
      const curCenterX = (curW != null) ? (curLeft + curW / 2) : undefined;
      const curCenterY = (curH != null) ? (curTop + curH / 2) : undefined;
      const curRight = (curW != null) ? (curLeft + curW) : undefined;
      const curBottom = (curH != null) ? (curTop + curH) : undefined;

      // Collect target anchors from other nodes
      others.forEach((n) => {
        const p = n.position || { x: 0, y: 0 };
        const w = Number.isFinite(n.width) ? n.width : undefined;
        const h = Number.isFinite(n.height) ? n.height : undefined;

        // X anchors: left, center, right (if known)
        anchorsX.push(p.x); // left
        if (w != null) {
          anchorsX.push(p.x + w / 2); // center
          anchorsX.push(p.x + w);     // right
        }

        // Y anchors: top, center, bottom (if known)
        anchorsY.push(p.y); // top
        if (h != null) {
          anchorsY.push(p.y + h / 2); // center
          anchorsY.push(p.y + h);     // bottom
        }
      });

      // Find closest X anchor
      let snapX = curLeft;
      let bestDx = Infinity; // distance to closest anchor for snapping
      let bestAnchorX = null; // flow-space coordinate where we align (guide position)
      anchorsX.forEach((ax) => {
        // Try aligning our left -> ax
        const dxLeft = Math.abs(ax - curLeft);
        if (dxLeft < bestDx) {
          bestDx = dxLeft;
          // Only compute snap target if within SNAP_THRESHOLD
          if (dxLeft <= snapTh) {
            snapX = ax; // left alignment
          }
          bestAnchorX = ax; // Always remember best anchor for guides
        }
        // Try aligning our center -> ax
        if (curCenterX != null && curW != null) {
          const dxCenter = Math.abs(ax - curCenterX);
          if (dxCenter < bestDx) {
            bestDx = dxCenter;
            if (dxCenter <= snapTh) {
              snapX = ax - curW / 2; // center alignment
            }
            bestAnchorX = ax;
          }
        }
        // Try aligning our right -> ax
        if (curRight != null && curW != null) {
          const dxRight = Math.abs(ax - curRight);
          if (dxRight < bestDx) {
            bestDx = dxRight;
            if (dxRight <= snapTh) {
              snapX = ax - curW; // right alignment
            }
            bestAnchorX = ax;
          }
        }
      });

      // Find closest Y anchor
      let snapY = curTop;
      let bestDy = Infinity; // distance to closest anchor for snapping
      let bestAnchorY = null; // flow-space coordinate where we align (guide position)
      anchorsY.forEach((ay) => {
        // Align our top -> ay
        const dyTop = Math.abs(ay - curTop);
        if (dyTop < bestDy) {
          bestDy = dyTop;
          if (dyTop <= snapTh) {
            snapY = ay; // top alignment
          }
          bestAnchorY = ay;
        }
        // Align our center -> ay
        if (curCenterY != null && curH != null) {
          const dyCenter = Math.abs(ay - curCenterY);
          if (dyCenter < bestDy) {
            bestDy = dyCenter;
            if (dyCenter <= snapTh) {
              snapY = ay - curH / 2; // center alignment
            }
            bestAnchorY = ay;
          }
        }
        // Align our bottom -> ay
        if (curBottom != null && curH != null) {
          const dyBottom = Math.abs(ay - curBottom);
          if (dyBottom < bestDy) {
            bestDy = dyBottom;
            if (dyBottom <= snapTh) {
              snapY = ay - curH; // bottom alignment
            }
            bestAnchorY = ay;
          }
        }
      });

      // Show guides when within guide threshold
      const showXGuide = bestAnchorX != null && bestDx <= guideTh;
      const showYGuide = bestAnchorY != null && bestDy <= guideTh;
      setAlignGuides({ x: showXGuide ? bestAnchorX : null, y: showYGuide ? bestAnchorY : null });

      // Snap only when within snap threshold on respective axis
      const shouldSnapX = bestDx <= snapTh;
      const shouldSnapY = bestDy <= snapTh;
      if (shouldSnapX || shouldSnapY) {
        setNodes((nds) => nds.map((n) => (String(n.id) === curId ? { ...n, position: { x: shouldSnapX ? snapX : curLeft, y: shouldSnapY ? snapY : curTop } } : n)));
      }
    } catch (err) {
      // Fail-safe: ignore snapping if any calculation fails
    }
  }, [setNodes, viewport, rfInstance, nodes]);

  const onNodeDragStopLocal = useCallback((event, node) => {
    const g = groupDragRef.current;
    if (g && g.active) {
      // Persist positions for all nodes via external handler if provided
      if (onNodeDragStop) {
        // call for each node currently in nodes
        try {
          nodes.forEach((n) => onNodeDragStop(n));
        } catch (e) {
          // ignore per-node errors
        }
      }
      setGroupDrag({ active: false, startX: 0, startY: 0, snapshot: [] });
      groupDragRef.current = { active: false, startX: 0, startY: 0, snapshot: [] };
      setTimeout(() => setNotice(''), 500);
      return;
    }
    if (onNodeDragStop) onNodeDragStop(node);
    // Clear guides after finishing drag
    setAlignGuides({ x: null, y: null });

    // After manual repositioning, update edge handles to reflect orientation rules:
    // - spouse & sibling: left/right based on horizontal position
    // - child (parent->child): always bottom-source (parent) -> top-target (child)
    try {
      const rfNodes = (rfInstance && typeof rfInstance.getNodes === 'function') ? rfInstance.getNodes() : nodes;
      const pos = new Map((rfNodes || []).map(n => [String(n.id), n.position || { x: 0, y: 0 }]));
      setEdges((eds) => eds.map((e) => {
        // Relationship type can be stored in e.data.type OR just in the label.
        // Some existing edges (legacy / initial) only have a label like 'parent' or 'spouse'.
        // Fallback to label so orientation logic always runs.
        const tData = String(e?.data?.type || '').toLowerCase();
        const rel = tData || String(e?.label || '').toLowerCase();
        const sp = pos.get(String(e.source));
        const tp = pos.get(String(e.target));
        if (!sp || !tp) return e;
        if (rel === 'spouse' || rel === 'sibling') {
          const dx = (tp.x || 0) - (sp.x || 0);
          const srcRight = dx >= 0;
            const sourceHandle = `${srcRight ? 'right' : 'left'}-source`;
            const targetHandle = `${srcRight ? 'left' : 'right'}-target`;
          if (e.sourceHandle === sourceHandle && e.targetHandle === targetHandle) return e;
          return { ...e, sourceHandle, targetHandle };
        }
        if (rel === 'parent' || rel === 'child') {
          // Enforce vertical orientation with direction based on relationship type
          const sourceHandle = (rel === 'child') ? 'bottom-source' : 'top-source';
          const targetHandle = (rel === 'child') ? 'top-target' : 'bottom-target';
          if (e.sourceHandle === sourceHandle && e.targetHandle === targetHandle) return e;
          return { ...e, sourceHandle, targetHandle };
        }
        return e;
      }));
    } catch (err) {
      // ignore handle alignment errors
    }
  }, [nodes, onNodeDragStop]);

  // Allow updating an edge by dragging its handle to another node
  const onEdgeUpdate = useCallback((oldEdge, newConnectionRaw) => {
    const newConnection = normalizeConnection(newConnectionRaw);
    setEdges((eds) => eds.map((e) => (e.id === oldEdge.id ? { ...e, source: newConnection.source, target: newConnection.target, sourceHandle: newConnection.sourceHandle, targetHandle: newConnection.targetHandle } : e)));
  }, [setEdges, normalizeConnection]);

  // small duplicate notice
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 1500);
    return () => clearTimeout(t);
  }, [notice]);

  function computeSmartAddPosition() {
    try {
      const z = viewport?.zoom || 1;
      const vx = viewport?.x || 0;
      // Container size in pixels
      const rect = exportRef?.current?.getBoundingClientRect?.();
      const widthPx = rect?.width || 800;
      const heightPx = rect?.height || 600;
      // Visible flow-space bounds
      const left = -vx / z;
      const top = -(viewport?.y || 0) / z;
      const right = left + widthPx / z;
      const bottom = top + heightPx / z;
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;

      // Measured nodes (for collision)
      const rfNodes = (rfInstance && typeof rfInstance.getNodes === 'function') ? rfInstance.getNodes() : nodes;
      const existing = (rfNodes || []).map((n) => ({
        x: (n.position?.x ?? 0),
        y: (n.position?.y ?? 0),
        w: Number.isFinite(n.width) ? n.width : 140,
        h: Number.isFinite(n.height) ? n.height : 80,
      }));
      // New node assumed size (approx FamilyNode)
      const NW = 140, NH = 80, MARGIN = 24;

      function overlaps(x, y) {
        const r = { x, y, w: NW, h: NH };
        for (const e of existing) {
          if (
            r.x < e.x + e.w + MARGIN &&
            r.x + r.w + MARGIN > e.x &&
            r.y < e.y + e.h + MARGIN &&
            r.y + r.h + MARGIN > e.y
          ) return true;
        }
        return false;
      }

      // Spiral search around center within visible bounds
      const maxRadius = Math.max(widthPx / z, heightPx / z);
      const step = 40; // grid step in flow units
      if (!overlaps(cx - NW / 2, cy - NH / 2)) return { x: cx - NW / 2, y: cy - NH / 2 };
      for (let radius = step; radius <= maxRadius; radius += step) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
          const x = cx + Math.cos(angle) * radius - NW / 2;
          const y = cy + Math.sin(angle) * radius - NH / 2;
          if (x < left || x + NW > right || y < top || y + NH > bottom) continue;
          if (!overlaps(x, y)) return { x, y };
        }
      }
      // Fallback: top-left of visible area with padding
      return { x: left + 20, y: top + 20 };
    } catch {
      // ultimate fallback near origin
      return { x: 60 + (nodes.length % 6) * 140, y: 60 + Math.floor(nodes.length / 6) * 120 };
    }
  }

  const addPerson = () => {
    // Prefer external add-at-position if provided
    if (typeof onAddPersonAt === 'function') {
      const pos = computeSmartAddPosition();
      return onAddPersonAt(pos);
    }
    // Backward-compat: call old handler if provided
    if (typeof onAddPersonExt === 'function') return onAddPersonExt();
    // Local demo mode
    const id = `new-${Date.now()}-${counter}`;
    const pos = computeSmartAddPosition();
    setNodes((nds) => nds.concat({ id, position: pos, data: { label: `Person ${counter}` }, type: 'familyNode' }));
    setCounter((c) => c + 1);
  };

  // Handle drag and drop from sidebar
  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();

    const type = e.dataTransfer.getData('application/reactflow');
    const memberId = e.dataTransfer.getData('memberId');

    if (type === 'member' && memberId && rfInstance && onDropMember) {
      const reactFlowBounds = e.target.getBoundingClientRect();
      const position = rfInstance.project({
        x: e.clientX - reactFlowBounds.left,
        y: e.clientY - reactFlowBounds.top,
      });

      onDropMember(memberId, position);
    }
  }, [rfInstance, onDropMember]);

  // Auto-fit view on first load so the initial viewport matches the effect of clicking the "Fit view" control.
  const didAutoFitRef = useRef(false);
  useEffect(() => {
    if (didAutoFitRef.current) return;
    if (!rfInstance) return;
    if (!Array.isArray(nodes) || nodes.length === 0) return;
    // Allow React Flow to finish any layout/measuring before calling fitView
    const t = setTimeout(() => {
      try {
        rfInstance.fitView?.({ padding: 0.1 });
      } catch (err) {
        // ignore
      }
      didAutoFitRef.current = true;
    }, 150);
    return () => clearTimeout(t);
  }, [rfInstance, nodes]);

  // Mount-safety: only render ReactFlow after the exportRef container has a measurable size.
  useEffect(() => {
    const el = exportRef?.current;
    if (!el) return;
    const check = () => {
      try {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) setFlowReady(true);
      } catch (e) {}
    };
    check();
    let ro;
    try {
      ro = new ResizeObserver(() => check());
      ro.observe(el);
    } catch (e) {
      // ResizeObserver may not be available in some environments; fallback to a timeout re-check
      const id = setTimeout(() => check(), 120);
      return () => clearTimeout(id);
    }
    return () => { try { ro.disconnect(); } catch (e) {} };
  }, [exportRef]);

  useEffect(() => {
    if (maximized) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setMaximized(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximized]);

  useEffect(() => {
    if (maximized && rfInstance) {
      // Run fitView only once per fullscreen session
      if (!didFullscreenFitRef.current) {
        didFullscreenFitRef.current = true;
        const t = setTimeout(() => {
          try { rfInstance.fitView({ padding: 0.1 }); } catch (err) { /* ignore fit errors */ }
        }, 80);
        return () => clearTimeout(t);
      }
    } else {
      // Reset flag when exiting fullscreen so next entry can fit once
      didFullscreenFitRef.current = false;
    }
  }, [maximized, rfInstance]);

  const containerStyle = maximized
    ? { position: 'fixed', inset: 0, background: '#ffffff', zIndex: 1100, display: 'flex', flexDirection: 'column' }
    : { flex: 1, height: '65vh', minHeight: 420, border: '1px solid #e5e7eb', borderRadius: 8, display: 'flex', flexDirection: 'column' };

  return (
    <div style={containerStyle}>
      <div style={{ padding: 8, borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={(e) => { if (canAdd) addPerson(); else if (typeof showToast === 'function') showToast('Create or select a tree to add node.'); }}
          aria-disabled={!canAdd}
          tabIndex={canAdd ? 0 : -1}
          title={!canAdd ? 'Create or select a tree to add node.' : undefined}
          style={{ padding: '6px 10px', borderRadius: 6, background: canAdd ? '#1f6feb' : '#c7d2fe', color: '#fff', border: 'none', cursor: canAdd ? 'pointer' : 'not-allowed' }}
        >
          + Add Node
        </button>
        <button onClick={onAutoLayout} disabled={layoutBusy || controlsDisabled} style={{ padding: '6px 10px', borderRadius: 6, background: (layoutBusy || controlsDisabled) ? '#94a3b8' : '#475569', color: '#fff', border: 'none', cursor: (layoutBusy || controlsDisabled) ? 'not-allowed' : 'pointer' }}>
          {layoutBusy ? 'Applying…' : (layoutActive ? 'Revert Layout' : 'Auto Layout')}
        </button>
        <span style={{ color: '#64748b', fontSize: 12, flex: '1 1 0', minWidth: 0 }}>
          Drag to pan, scroll to zoom, connect nodes to add edges
        </span>

        {/* Right-aligned, responsive legend: items will wrap on small widths */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 11, color: '#64748b', justifyContent: 'flex-end', flexWrap: 'wrap', minWidth: 0, maxWidth: '48%' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 2, background: '#f97316', borderRadius: 1 }}></div>
            parent
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 2, background: '#f97316', borderRadius: 1 }}></div>
            child
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 2, background: '#ec4899', borderRadius: 1 }}></div>
            spouse
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 2, background: '#10b981', borderRadius: 1 }}></div>
            sibling
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 2, background: '#8b5cf6', borderRadius: 1 }}></div>
            custom
          </span>
        </div>

        <button onClick={() => setMaximized((m) => !m)} disabled={controlsDisabled} style={{ padding: '6px 10px', borderRadius: 6, background: controlsDisabled ? '#94a3b8' : '#0f172a', color: '#fff', border: 'none', cursor: controlsDisabled ? 'not-allowed' : 'pointer' }}>
          {maximized ? 'Exit Fullscreen' : 'Maximize'}
        </button>
      </div>
      <div ref={exportRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', height: '100%' }}>
      {flowReady ? (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
  // Use memoized node types to keep reference stable
  nodeTypes={nodeTypesMemo}
        onEdgeUpdate={onEdgeUpdate}
        connectionLineType="smoothstep"
        connectionMode="loose"
          onNodeDoubleClick={onNodeDoubleClick ? (_e, node) => onNodeDoubleClick(node?.id, node) : undefined}
          onNodeDragStart={onNodeDragStartLocal}
          onNodeDrag={onNodeDragLocal}
          onNodeDragStop={onNodeDragStopLocal}
          onEdgeDoubleClick={onEdgeDoubleClick ? (e, edge) => onEdgeDoubleClick(e, edge) : undefined}
          onInit={(inst) => {
            setRfInstance(inst);
            try { if (typeof onRfReady === 'function') onRfReady(inst); } catch (e) {}
            try {
              const vp = inst?.getViewport?.();
              if (vp) setViewport(vp);
              // Do an initial fit once (not on updates) to avoid tiny shifts later
              if (!didInitialFitRef.current) {
                didInitialFitRef.current = true;
                setTimeout(() => {
                  try { inst.fitView?.({ padding: 0.1 }); } catch {}
                }, 0);
              }
            } catch {}
          }}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onMove={(_evt, vp) => { try { if (vp) setViewport(vp); } catch {} }}
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap pannable zoomable />
        <Controls position="bottom-left" />
        <Background variant="dots" gap={16} size={1} />
      </ReactFlow>
      ) : null}
      {/* Alignment guides overlay (screen-space) with smooth fade */}
      {(() => {
        const z = viewport?.zoom || 1;
        const vx = viewport?.x || 0;
        const vy = viewport?.y || 0;
        const hasX = alignGuides.x != null;
        const hasY = alignGuides.y != null;
        const vLeft = hasX ? Math.round(vx + (alignGuides.x * z)) : null;
        const hTop = hasY ? Math.round(vy + (alignGuides.y * z)) : null;
        const hasAny = hasX || hasY;

        return (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              opacity: hasAny ? 1 : 0,
              transition: 'opacity 140ms ease-in-out',
              willChange: 'opacity',
              zIndex: 50,
            }}
          >
            {hasX ? (
              <div
                key="v-guide"
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: vLeft,
                  width: 1,
                  background: 'rgba(59,130,246,0.45)',
                  pointerEvents: 'none',
                }}
              />
            ) : null}
            {hasY ? (
              <div
                key="h-guide"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: hTop,
                  height: 1,
                  background: 'rgba(59,130,246,0.45)',
                  pointerEvents: 'none',
                }}
              />
            ) : null}
          </div>
        );
      })()}
      {!!notice && (
        <div style={{ position: 'absolute', left: 12, bottom: 12, background: '#111827', color: '#fff', padding: '6px 8px', borderRadius: 6, fontSize: 12, boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
          {notice}
        </div>
      )}
      </div>
    </div>
  );
}
