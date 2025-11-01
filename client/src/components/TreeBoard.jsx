import React, { useCallback, useEffect, useState } from 'react';
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

// Keep nodeTypes stable across renders to avoid React Flow warnings
const nodeTypes = { familyNode: FamilyNode };

const initialNodes = [
  { id: 'me', position: { x: 0, y: 0 }, data: { label: 'You' }, type: 'familyNode' },
  { id: 'spouse', position: { x: 220, y: 0 }, data: { label: 'Spouse' }, type: 'familyNode' },
  { id: 'child1', position: { x: 110, y: 120 }, data: { label: 'Child' }, type: 'familyNode' },
  { id: 'parent', position: { x: 0, y: -140 }, data: { label: 'Parent' }, type: 'familyNode' },
];

const initialEdges = [
  // spouse: single direction pointing to target
  { id: 'e1', source: 'me', target: 'spouse', type: 'smoothstep', label: 'spouse', markerEnd: { type: 'arrowclosed', color: '#111827' } },
  // parent: single pointer to target
  { id: 'e2', source: 'me', target: 'child1', type: 'smoothstep', label: 'parent', markerEnd: { type: 'arrowclosed', color: '#111827' } },
  { id: 'e3', source: 'spouse', target: 'child1', type: 'smoothstep', label: 'parent', markerEnd: { type: 'arrowclosed', color: '#111827' } },
  { id: 'e4', source: 'parent', target: 'me', type: 'smoothstep', label: 'parent', markerEnd: { type: 'arrowclosed', color: '#111827' } },
];

export default function TreeBoard({ 
  nodes: extNodes, 
  edges: extEdges, 
  setNodes: setNodesExt, 
  setEdges: setEdgesExt, 
  onAddPerson: onAddPersonExt, 
  onConnect: onConnectExt, 
  onNodeClick, 
  onNodeDragStop, 
  onEdgeClick, 
  exportRef, 
  canAdd = true,
  onDropMember // NEW: callback when member is dropped from sidebar
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
  const [notice, setNotice] = useState('');
  // Alignment guide state (flow-space coordinates)
  const [alignGuides, setAlignGuides] = useState({ x: null, y: null });
  // Track viewport to convert flow-space guide coordinates to screen-space for overlay rendering
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  // Group-drag state: when user holds Shift and drags a node, move all nodes together
  const [groupDrag, setGroupDrag] = useState({ active: false, startX: 0, startY: 0, snapshot: [] });
  const groupDragRef = React.useRef(groupDrag);
  // keep ref in sync
  useEffect(() => { groupDragRef.current = groupDrag; }, [groupDrag]);

  // Normalize any connection so that the final edge always points from a node's "source" handle to the other node's "target" handle.
  // This prevents flipped directions when users start dragging from a target handle by accident (e.g., right-side target dot).
  const normalizeConnection = useCallback((p) => {
    const sh = String(p.sourceHandle || '');
    const th = String(p.targetHandle || '');
    const sourceIsSource = sh.includes('source');
    const targetIsTarget = th.includes('target');
    if (sourceIsSource && targetIsTarget) return p; // already correct

    const sourceIsTarget = sh.includes('target');
    const targetIsSource = th.includes('source');
    if (sourceIsTarget && targetIsSource) {
      // fully reversed -> swap ends
      return {
        ...p,
        source: p.target,
        target: p.source,
        sourceHandle: p.targetHandle,
        targetHandle: p.sourceHandle,
      };
    }
    // Partially mismatched (loose mode can allow odd combos) -> prefer swapping to enforce source->target semantics
    return {
      ...p,
      source: p.target,
      target: p.source,
      sourceHandle: p.targetHandle,
      targetHandle: p.sourceHandle,
    };
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
    // Align to nearby nodes' left/center/right (x) and top/center/bottom (y) within threshold
    try {
      if (!node?.id) return;
      const threshold = 8; // px
      const curId = String(node.id);
      const curPos = node.position || { x: 0, y: 0 };
  let curW = Number.isFinite(node.width) ? node.width : undefined;
  let curH = Number.isFinite(node.height) ? node.height : undefined;

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

      // Find closest X snap
      let snapX = curLeft;
      let bestDx = Infinity;
      let bestAnchorX = null; // flow-space coordinate where we align (guide position)
      anchorsX.forEach((ax) => {
        // Try aligning our left -> ax
        const dxLeft = Math.abs(ax - curLeft);
        if (dxLeft < bestDx && dxLeft <= threshold) {
          bestDx = dxLeft;
          snapX = ax; // left alignment
          bestAnchorX = ax;
        }
        // Try aligning our center -> ax
        if (curCenterX != null && curW != null) {
          const dxCenter = Math.abs(ax - curCenterX);
          if (dxCenter < bestDx && dxCenter <= threshold) {
            bestDx = dxCenter;
            snapX = ax - curW / 2; // center alignment
            bestAnchorX = ax;
          }
        }
        // Try aligning our right -> ax
        if (curRight != null && curW != null) {
          const dxRight = Math.abs(ax - curRight);
          if (dxRight < bestDx && dxRight <= threshold) {
            bestDx = dxRight;
            snapX = ax - curW; // right alignment
            bestAnchorX = ax;
          }
        }
      });

      // Find closest Y snap
      let snapY = curTop;
      let bestDy = Infinity;
      let bestAnchorY = null; // flow-space coordinate where we align (guide position)
      anchorsY.forEach((ay) => {
        // Align our top -> ay
        const dyTop = Math.abs(ay - curTop);
        if (dyTop < bestDy && dyTop <= threshold) {
          bestDy = dyTop;
          snapY = ay; // top alignment
          bestAnchorY = ay;
        }
        // Align our center -> ay
        if (curCenterY != null && curH != null) {
          const dyCenter = Math.abs(ay - curCenterY);
          if (dyCenter < bestDy && dyCenter <= threshold) {
            bestDy = dyCenter;
            snapY = ay - curH / 2; // center alignment
            bestAnchorY = ay;
          }
        }
        // Align our bottom -> ay
        if (curBottom != null && curH != null) {
          const dyBottom = Math.abs(ay - curBottom);
          if (dyBottom < bestDy && dyBottom <= threshold) {
            bestDy = dyBottom;
            snapY = ay - curH; // bottom alignment
            bestAnchorY = ay;
          }
        }
      });

      // Update only the dragged node position if a snap was found close enough
      if (bestDx !== Infinity || bestDy !== Infinity) {
        setNodes((nds) => nds.map((n) => (String(n.id) === curId ? { ...n, position: { x: snapX, y: snapY } } : n)));
        setAlignGuides({ x: bestDx !== Infinity ? bestAnchorX : null, y: bestDy !== Infinity ? bestAnchorY : null });
      } else {
        // No close anchors -> clear guides
        setAlignGuides({ x: null, y: null });
      }
    } catch (err) {
      // Fail-safe: ignore snapping if any calculation fails
    }
  }, [setNodes]);

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

  const addPerson = () => {
    if (onAddPersonExt) return onAddPersonExt();
    const id = `new-${Date.now()}-${counter}`;
    const x = 60 + (nodes.length % 6) * 140;
    const y = 60 + Math.floor(nodes.length / 6) * 120;
  setNodes((nds) => nds.concat({ id, position: { x, y }, data: { label: `Person ${counter}` }, type: 'familyNode' }));
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

  useEffect(() => {
    if (!maximized) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setMaximized(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximized]);

  useEffect(() => {
    if (maximized && rfInstance) {
      // Run fitView only once on entering fullscreen; do not re-run on node/edge selection changes
      const t = setTimeout(() => {
        try { rfInstance.fitView({ padding: 0.1 }); } catch (err) { /* ignore fit errors */ }
      }, 80);
      return () => clearTimeout(t);
    }
  }, [maximized, rfInstance]);

  const containerStyle = maximized
    ? { position: 'fixed', inset: 0, background: '#ffffff', zIndex: 1100, display: 'flex', flexDirection: 'column' }
    : { flex: 1, height: '65vh', minHeight: 420, border: '1px solid #e5e7eb', borderRadius: 8, display: 'flex', flexDirection: 'column' };

  return (
    <div style={containerStyle}>
      <div style={{ padding: 8, borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={addPerson} disabled={!canAdd} style={{ padding: '6px 10px', borderRadius: 6, background: canAdd ? '#1f6feb' : '#94a3b8', color: '#fff', border: 'none', cursor: canAdd ? 'pointer' : 'not-allowed' }}>
          + Add Node
        </button>
        <span style={{ color: '#64748b', fontSize: 12, flex: '1 1 0', minWidth: 0 }}>
          Drag to pan, scroll to zoom, connect nodes to add edges
        </span>

        {/* Right-aligned, responsive legend: items will wrap on small widths */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 11, color: '#64748b', justifyContent: 'flex-end', flexWrap: 'wrap', minWidth: 0, maxWidth: '48%' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 2, background: '#10b981', borderRadius: 1 }}></div>
            parent
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 2, background: '#10b981', borderRadius: 1 }}></div>
            child
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 2, background: '#ec4899', borderRadius: 1 }}></div>
            spouse
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 2, background: '#f97316', borderRadius: 1 }}></div>
            sibling
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 2, background: '#8b5cf6', borderRadius: 1 }}></div>
            custom
          </span>
        </div>

        <button onClick={() => setMaximized((m) => !m)} style={{ padding: '6px 10px', borderRadius: 6, background: '#0f172a', color: '#fff', border: 'none' }}>
          {maximized ? 'Exit Fullscreen' : 'Maximize'}
        </button>
      </div>
      <div ref={exportRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        onEdgeUpdate={onEdgeUpdate}
        connectionLineType="smoothstep"
        connectionMode="loose"
          onNodeClick={onNodeClick ? (_e, node) => onNodeClick(node?.id, node) : undefined}
          onNodeDragStart={onNodeDragStartLocal}
          onNodeDrag={onNodeDragLocal}
          onNodeDragStop={onNodeDragStopLocal}
          onEdgeClick={onEdgeClick ? (e, edge) => onEdgeClick(e, edge) : undefined}
          onInit={(inst) => { setRfInstance(inst); try { const vp = inst?.getViewport?.(); if (vp) setViewport(vp); } catch {} }}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onMove={(_evt, vp) => { try { if (vp) setViewport(vp); } catch {} }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap pannable zoomable />
        <Controls position="bottom-left" />
        <Background variant="dots" gap={16} size={1} />
      </ReactFlow>
      {/* Alignment guides overlay (screen-space) */}
      {(() => {
        const lines = [];
        const z = viewport?.zoom || 1;
        const vx = viewport?.x || 0;
        const vy = viewport?.y || 0;
        if (alignGuides.x != null) {
          const left = Math.round(vx + (alignGuides.x * z));
          lines.push(
            <div key="v-guide" style={{ position: 'absolute', top: 0, bottom: 0, left, width: 1, background: 'rgba(59,130,246,0.5)', pointerEvents: 'none' }} />
          );
        }
        if (alignGuides.y != null) {
          const top = Math.round(vy + (alignGuides.y * z));
          lines.push(
            <div key="h-guide" style={{ position: 'absolute', left: 0, right: 0, top, height: 1, background: 'rgba(59,130,246,0.5)', pointerEvents: 'none' }} />
          );
        }
        return lines.length ? (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {lines}
          </div>
        ) : null;
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
