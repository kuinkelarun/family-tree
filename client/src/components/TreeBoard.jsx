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
      // allow layout to settle then fit view
      const t = setTimeout(() => {
        try { rfInstance.fitView({ padding: 0.1 }); } catch (err) { /* ignore fit errors */ }
      }, 80);
      return () => clearTimeout(t);
    }
  }, [maximized, rfInstance, nodes, edges]);

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
            <div style={{ width: 14, height: 2, background: '#3b82f6', borderRadius: 1 }}></div>
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
      <div ref={exportRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
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
          onNodeDragStop={onNodeDragStop ? (e, node) => onNodeDragStop(node) : undefined}
          onEdgeClick={onEdgeClick ? (e, edge) => onEdgeClick(e, edge) : undefined}
          onInit={setRfInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap pannable zoomable />
        <Controls position="bottom-left" />
        <Background variant="dots" gap={16} size={1} />
      </ReactFlow>
      {!!notice && (
        <div style={{ position: 'absolute', left: 12, bottom: 12, background: '#111827', color: '#fff', padding: '6px 8px', borderRadius: 6, fontSize: 12, boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
          {notice}
        </div>
      )}
      </div>
    </div>
  );
}
