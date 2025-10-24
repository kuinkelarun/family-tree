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

const initialNodes = [
  { id: 'me', position: { x: 0, y: 0 }, data: { label: 'You' }, type: 'default' },
  { id: 'spouse', position: { x: 220, y: 0 }, data: { label: 'Spouse' }, type: 'default' },
  { id: 'child1', position: { x: 110, y: 120 }, data: { label: 'Child' }, type: 'default' },
  { id: 'parent', position: { x: 0, y: -140 }, data: { label: 'Parent' }, type: 'default' },
];

const initialEdges = [
  { id: 'e1', source: 'me', target: 'spouse', type: 'smoothstep', label: 'spouse' },
  { id: 'e2', source: 'me', target: 'child1', type: 'smoothstep', label: 'parent' },
  { id: 'e3', source: 'spouse', target: 'child1', type: 'smoothstep', label: 'parent' },
  { id: 'e4', source: 'parent', target: 'me', type: 'smoothstep', label: 'parent' },
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

  const onConnect = useCallback((params) => {
    if (onConnectExt) return onConnectExt(params);
    setEdges((eds) => addEdge({ ...params, type: 'smoothstep' }, eds));
  }, [setEdges, onConnectExt]);

  const addPerson = () => {
    if (onAddPersonExt) return onAddPersonExt();
    const id = `new-${Date.now()}-${counter}`;
    const x = 60 + (nodes.length % 6) * 140;
    const y = 60 + Math.floor(nodes.length / 6) * 120;
    setNodes((nds) => nds.concat({ id, position: { x, y }, data: { label: `Person ${counter}` }, type: 'default' }));
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
        try { rfInstance.fitView({ padding: 0.1 }); } catch {}
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
        <span style={{ color: '#64748b', fontSize: 12, flex: 1 }}>
          Drag to pan, scroll to zoom, connect nodes to add edges
        </span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: '#64748b' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 14, height: 2, background: '#10b981', borderRadius: 1 }}></div>
            parent
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 14, height: 2, background: '#10b981', borderRadius: 1 }}></div>
            child
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 14, height: 2, background: '#ec4899', borderRadius: 1 }}></div>
            spouse
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 14, height: 2, background: '#3b82f6', borderRadius: 1 }}></div>
            sibling
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 14, height: 2, background: '#8b5cf6', borderRadius: 1 }}></div>
            custom
          </span>
        </span>
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
      </div>
    </div>
  );
}
