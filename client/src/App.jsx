import { useEffect, useMemo, useState, useRef } from 'react';
import './App.css';
import Sidebar from './components/Sidebar.jsx';
import TreeBoard from './components/TreeBoard.jsx';
import MemberModal from './components/MemberModal.jsx';
import RelationshipPicker from './components/RelationshipPicker.jsx';
import EdgeEditorPopover from './components/EdgeEditorPopover.jsx';
import { api, Auth, Trees, Members, Relationships, Users, getToken, setToken, getTreeId, setTreeId } from './utils/api.js';
import * as htmlToImage from 'html-to-image';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Color coding for relationship types
const RELATIONSHIP_COLORS = {
  parent: '#10b981',    // emerald-500 (green) - parent to child
  child: '#10b981',     // emerald-500 (same as parent)
  spouse: '#ec4899',    // pink-500 (romantic)
  sibling: '#3b82f6',   // blue-500 (sibling bond)
  custom: '#8b5cf6',    // violet-500 (custom/other)
};

function App() {
  const [apiStatus, setApiStatus] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setTokenState] = useState(getToken());
  const [currentUser, setCurrentUser] = useState(null);
  const [treeId, setTreeIdState] = useState(getTreeId());
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [treeMeta, setTreeMeta] = useState(null);

  async function checkApi() {
    try {
      const res = await fetch(`/health`);
      const data = await res.json();
      setApiStatus(data.status || 'unknown');
    } catch (e) {
      setApiStatus('offline');
    }
  }

  // Helpers
  const isAuthed = useMemo(() => !!token, [token]);

  async function handleRegister() {
    try {
      const { token: t } = await Auth.register(email, password);
      setTokenState(t);
    } catch (e) {
      showToast(`Register failed: ${e.message}`);
    }
  }

  async function handleLogin() {
    try {
      const { token: t } = await Auth.login(email, password);
      setTokenState(t);
    } catch (e) {
      showToast(`Login failed: ${e.message}`);
    }
  }

  function handleLogout() {
    Auth.logout();
    setTokenState('');
    setTreeIdState('');
    setNodes([]);
    setEdges([]);
    setTreeId('');
  }

  const [myTrees, setMyTrees] = useState([]);

  async function handleCreateTree() {
    try {
      const t = `My Tree ${new Date().toLocaleString()}`;
      const tree = await Trees.create(t);
      setTreeIdState(tree._id);
      setTreeId(tree._id);
      await loadTree(tree._id);
      await loadMyTrees();
    } catch (e) {
      showToast(`Create tree failed: ${e.message}`);
    }
  }

  async function loadMyTrees() {
    try {
      const list = await Trees.list();
      setMyTrees(Array.isArray(list) ? list : []);
    } catch (e) {
      // ignore in UI, can be unauth
    }
  }

  function hasPosVal(pos) {
    return pos && typeof pos.x === 'number' && typeof pos.y === 'number';
  }

  function fallbackPosForIndex(idx) {
    return { x: (idx % 6) * 180, y: Math.floor(idx / 6) * 140 };
  }

  function mapTreeToGraph(tree) {
    const members = Array.isArray(tree.members) ? tree.members : [];
    const posById = new Map(members.map(m => [String(m._id), m.position || { x: 0, y: 0 }]))
    
    // ONLY create nodes for members WITH positions (on canvas)
    const n = members
      .filter(m => hasPosVal(m.position))  // ⬅ Filter FIRST
      .map((m, idx) => {
        console.log(`[mapTreeToGraph] Adding member to canvas: ${m.name}`, m.position);
        return {
          id: m._id,
          data: { label: m.name || `Member ${idx + 1}` },
          position: { x: m.position.x, y: m.position.y },
          // use the familyNode custom renderer so left/right handles are available
          type: 'familyNode',
        };
      });
    
    console.log(`[mapTreeToGraph] Total members: ${members.length}, On canvas: ${n.length}`);
    
    // Build single, directional edges based on the original (authored) record.
    // Heuristic: the authored record has a 'label' defined; reciprocal entries do not.
    // Fallback: if neither has label (legacy), prefer 'parent' over 'child', otherwise first seen.
    const pairMap = new Map(); // key: sorted 'a|b' -> edge payload
    for (const m of members) {
      for (const r of m.relationships || []) {
        const src = m._id;
        const dst = (r.relative && r.relative._id) || r.relative;
        if (!src || !dst) continue;
        const a = String(src);
        const b = String(dst);
        const sortedKey = a < b ? `${a}|${b}` : `${b}|${a}`;
        const current = pairMap.get(sortedKey);

        const type = r.type || 'custom';
        const label = r.label || type;
        const edgeColor = RELATIONSHIP_COLORS[type] || RELATIONSHIP_COLORS.custom;
        
  // Display rule: always render edge as SOURCE -> TARGET (arrow points to target)
  const displaySourceId = String(src);
  const displayTargetId = String(dst);
  const srcPos = posById.get(displaySourceId) || { x: 0, y: 0 };
  const dstPos = posById.get(displayTargetId) || { x: 0, y: 0 };
        const dx = (dstPos.x || 0) - (srcPos.x || 0);
        const dy = (dstPos.y || 0) - (srcPos.y || 0);

        function sideForHorizontal(isRight) {
          return isRight ? 'right' : 'left';
        }
        function sideForVertical(isDown) {
          return isDown ? 'bottom' : 'top';
        }

        let sourceHandle = undefined;
        let targetHandle = undefined;

        if (type === 'parent') {
          // For relationship type "parent": source is the child and target is the parent (upwards)
          // Draw from source TOP to target BOTTOM
          sourceHandle = 'top-source';
          targetHandle = 'bottom-target';
        } else if (type === 'child') {
          // For relationship type "child": source is the parent and target is the child (downwards)
          // Draw from source BOTTOM to target TOP
          sourceHandle = 'bottom-source';
          targetHandle = 'top-target';
        } else if (type === 'spouse' || type === 'sibling') {
          // horizontal preferred; choose sides based on relative x
          const srcRight = dx >= 0; // target is to the right
          sourceHandle = `${sideForHorizontal(srcRight)}-source`;
          targetHandle = `${sideForHorizontal(!srcRight)}-target`;
        } else {
          // custom: choose dominant axis
          if (Math.abs(dx) >= Math.abs(dy)) {
            const srcRight = dx >= 0;
            sourceHandle = `${sideForHorizontal(srcRight)}-source`;
            targetHandle = `${sideForHorizontal(!srcRight)}-target`;
          } else {
            const srcDown = dy >= 0;
            sourceHandle = `${sideForVertical(srcDown)}-source`;
            targetHandle = `${sideForVertical(!srcDown)}-target`;
          }
        }

  // Configure arrow markers: arrow at the end (target)
  const markers = { markerEnd: { type: 'arrowclosed', color: edgeColor } };

        // Generate edge ID that includes direction to prevent React Flow from reusing old edges
        // Use source->target order (not sorted) so ID changes if direction changes
        const edgeId = `${String(src)}-${String(dst)}-${type}`;

        const candidate = {
          id: edgeId,
          // Display edge as SOURCE -> TARGET (arrow points to target)
          source: displaySourceId,
          target: displayTargetId,
          type: 'smoothstep',
          label,
          sourceHandle,
          targetHandle,
          labelStyle: { fill: '#111827', fontSize: 12, fontWeight: 600 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95, stroke: edgeColor, strokeWidth: 1 },
          labelBgPadding: [3, 4],
          labelBgBorderRadius: 4,
          style: { stroke: edgeColor, strokeWidth: 2 },
          ...markers,
          // Keep original logical direction for editing APIs
          data: { type, label, from: String(src), to: String(dst) },
        };

        if (!current) {
          // Store the edge metadata with actual source and target from the edge object
          pairMap.set(sortedKey, { edge: candidate, hasLabel: !!r.label, type, src: String(src), dst: String(dst) });
        } else {
          // Preference logic for which edge to keep:
          // 1. For spouse/sibling: always prefer lexicographically smaller ID as source (consistent direction)
          // 2. For parent/child: prefer the authored record (hasLabel), or prefer 'parent' over 'child'
          // 3. For others: prefer the authored record (hasLabel)
          
          let preferThis = false;
          // Debug info to help track direction decisions
          const debugInfo = {
            key: sortedKey,
            candidate: { src: String(src), dst: String(dst), type, hasLabel: !!r.label },
            current: { src: current.src, dst: current.dst, type: current.type, hasLabel: current.hasLabel },
          };
          
          if (type === 'parent' || type === 'child') {
            // For parent/child, prefer the entry WITH A LABEL (user's intention)
            // This ensures the relationship type the user selected is displayed
            
            // First priority: prefer the entry with a label (user's explicit choice)
            if (!!r.label && !current.hasLabel) {
              preferThis = true; // This entry has label, current doesn't
            } else if (!r.label && current.hasLabel) {
              preferThis = false; // Current has label, keep it
            } 
            // If both have labels OR both don't have labels, normalize to 'parent' type
            else if (type === 'parent' && current.type === 'child') {
              preferThis = true; // Prefer 'parent' over 'child' as tiebreaker
            } else if (type === 'child' && current.type === 'parent') {
              preferThis = false; // Keep 'parent' as tiebreaker
            } else {
              // Both same type and same label status (rare)
              preferThis = false; // Keep first one
            }
          } else if (type === 'sibling' || type === 'spouse') {
            // For symmetric relationships (spouse/sibling): prefer the explicitly authored entry (has label).
            // If neither side has a label, keep the first-seen direction to remain deterministic.
            const candidateHasLabel = !!r.label;
            const currentHasLabel = current.hasLabel;
            if (candidateHasLabel && !currentHasLabel) {
              preferThis = true;
            } else if (!candidateHasLabel && currentHasLabel) {
              preferThis = false;
            } else {
              // Neither or both have labels -> keep the first encountered (do not force lexicographic ordering)
              preferThis = false;
            }
          } else if (type === 'custom') {
            // For custom relationships, use consistent direction like spouse/sibling
            // This handles cases where users create bidirectional custom relationships
            
            const candidateSourceId = String(src);
            const candidateTargetId = String(dst);
            const candidateCorrectDirection = candidateSourceId < candidateTargetId;
            const currentCorrectDirection = current.src < current.dst;
            
            if (!currentCorrectDirection && candidateCorrectDirection) {
              preferThis = true;
            } else if (currentCorrectDirection && !candidateCorrectDirection) {
              preferThis = false;
            } else {
              preferThis = !!r.label && !current.hasLabel;
            }
          } else {
            // Fallback for any other relationship types
            preferThis = !!r.label && !current.hasLabel;
          }
          
          if (preferThis) {
            console.debug('[mapTreeToGraph] Replacing edge for', debugInfo.key, 'decision=preferThis', debugInfo);
            // Store the edge metadata with actual source and target from the edge object
            pairMap.set(sortedKey, { edge: candidate, hasLabel: !!r.label, type, src: String(src), dst: String(dst) });
          }
          else {
            console.debug('[mapTreeToGraph] Keeping existing edge for', debugInfo.key, 'decision=keepCurrent', debugInfo);
          }
        }
      }
    }
    const e = Array.from(pairMap.values()).map((v) => v.edge);
    return { n, e, members };
  }

  async function loadTree(id) {
    if (!id) return;
    try {
      const tree = await Trees.get(id);
      console.log('[loadTree] Raw tree data:', tree);
      console.log('[loadTree] Members with positions:', tree.members?.map(m => ({ 
        id: m._id, 
        name: m.name, 
        pos: m.position,
        hasPos: hasPosVal(m.position)
      })));
      
      const { n, e, members } = mapTreeToGraph(tree);
      setNodes(n);
      setEdges(e);
      setMembers(members);
      setTreeMeta({ owner: tree.owner, permissions: tree.permissions || [], title: tree.title || '' });

      console.log(`[loadTree] Loaded ${members.length} total members, ${n.length} on canvas`);
    } catch (e) {
      showToast(`Load tree failed: ${e.message}`);
    }
  }

  // CANVAS WORKFLOW: Add a basic visual node (not creating a member in DB)
  async function handleAddPerson() {
    if (!treeId) return alert('Create a tree first.');
    try {
      const idx = nodes.length;
      const name = `Person ${idx + 1}`;
      const position = fallbackPosForIndex(idx);
      // Create member with basic info, will appear on canvas
      await Members.create({ tree: treeId, name, position });
      await loadTree(treeId);
    } catch (e) {
      showToast(`Add node failed: ${e.message}`);
    }
  }

  // MEMBER POOL WORKFLOW: Add existing member from pool to canvas
  async function handleAddMemberToCanvas(member) {
    if (!member?._id) return;
    try {
      const idx = nodes.length;
      const position = fallbackPosForIndex(idx);
      console.log(`[handleAddMemberToCanvas] Adding member ${member._id} to canvas at position:`, position);
      // Update member with position - this adds them to canvas
      await Members.update(member._id, { position });
      await loadTree(treeId);
      showToast(`${member.name} added to canvas`);
    } catch (e) {
      showToast(`Failed to add to canvas: ${e.message}`);
    }
  }

  // Handle drag-drop from sidebar to canvas
  async function handleDropMember(memberId, position) {
    if (!memberId || !position) return;
    try {
      console.log(`[handleDropMember] Dropping member ${memberId} at position:`, position);
      await Members.update(memberId, { position });
      await loadTree(treeId);
      showToast('Member added to canvas');
    } catch (e) {
      showToast(`Failed to drop member: ${e.message}`);
    }
  }

  const [relPicker, setRelPicker] = useState({ open: false, source: '', target: '' });
  const [modalOpen, setModalOpen] = useState(false);

  // Debug: log when modal state changes to verify wiring in the UI
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[UI Debug] MemberModal open =', modalOpen, 'selectedId =', selectedId);
  }, [modalOpen, selectedId]);

  function handleConnectEdge(params) {
    if (!treeId) return;
    setRelPicker({ open: true, source: params.source, target: params.target });
  }

  async function confirmRelationship(type, label) {
    try {
      await Relationships.create({ fromMemberId: relPicker.source, toMemberId: relPicker.target, type, label });
      setRelPicker({ open: false, source: '', target: '' });
      await loadTree(treeId);
      showToast('Relationship added');
    } catch (e) {
      showToast(`Add relationship failed: ${e.message}`);
    }
  }

  function cancelRelationship() {
    setRelPicker({ open: false, source: '', target: '' });
  }

  function handleSelectNode(id) {
    setSelectedId(String(id || ''));
    if (id) setModalOpen(true);
  }

  function selectedMember() {
    return members.find((m) => String(m._id) === String(selectedId));
  }

  const canEdit = useMemo(() => {
    if (!currentUser || !treeMeta) return false;
    if (String(treeMeta.owner) === String(currentUser._id)) return true;
    const perm = (treeMeta.permissions || []).find((p) => String(p.user) === String(currentUser._id));
    return !!(perm && perm.access !== 'viewer');
  }, [currentUser, treeMeta]);

  const isOwner = useMemo(() => {
    if (!currentUser || !treeMeta) return false;
    return String(treeMeta.owner) === String(currentUser._id);
  }, [currentUser, treeMeta]);

  async function handleSaveMember(form) {
    if (!token) return alert('Please login first.');
    if (!treeId) return alert('Create a tree first.');
    try {
      if (selectedId) {
        // EDITING existing member - keep position if they have one
        await Members.update(selectedId, form);
        showToast('Member updated');
      } else {
        // CREATING new member - NO position, goes to member pool
        await Members.create({ tree: treeId, ...form });
        showToast('Member added to pool. Drag to canvas or click "Add" to visualize.');
      }
      await loadTree(treeId);
      setSelectedId(''); // Clear selection after save
      setModalOpen(false);
    } catch (e) {
      showToast(`Save member failed: ${e.message}`);
    }
  }

  // Delete member with options: Move to Pool OR Delete Entirely
  async function handleDeleteMember(memberId, deleteEntirely = false) {
    if (!memberId) return;
    
    const member = members.find(m => m._id === memberId);
    const memberName = member?.name || 'this member';
    
    if (deleteEntirely) {
      // Confirm before permanent deletion
      const confirmed = window.confirm(
        `Are you sure you want to permanently delete "${memberName}"?\n\n` +
        `This will remove the member and all their relationships from the tree. This action cannot be undone.`
      );
      if (!confirmed) return;
      
      try {
        await Members.delete(memberId);
        setSelectedId('');
        await loadTree(treeId);
        showToast(`${memberName} permanently deleted`);
        setModalOpen(false);
      } catch (e) {
        showToast(`Delete failed: ${e.message}`);
      }
    } else {
      // Move to pool (remove position)
      const confirmed = window.confirm(
        `Remove "${memberName}" from canvas?\n\n` +
        `The member will be moved to the Member Pool and can be added back to the canvas later.`
      );
      if (!confirmed) return;
      
      try {
        await Members.update(memberId, { position: null });
        setSelectedId('');
        await loadTree(treeId);
        showToast(`${memberName} moved to Member Pool`);
        setModalOpen(false);
      } catch (e) {
        showToast(`Failed to remove from canvas: ${e.message}`);
      }
    }
  }

  async function handleNodeDragStop(node) {
    // Persist node position on drag end without reloading entire tree
    try {
      if (!node?.id) return;
      const { x, y } = node.position || {};
      if (typeof x !== 'number' || typeof y !== 'number') return;
      console.log(`[handleNodeDragStop] Saving position for ${node.id}:`, { x, y });
      await Members.update(node.id, { position: { x, y } });
      console.log(`[handleNodeDragStop] Position saved successfully`);
    } catch (e) {
      console.error('[handleNodeDragStop] Save position failed:', e?.message || e, e);
    }
  }

  useEffect(() => {
    // If we already have a token and tree, load it
    if (token && treeId) loadTree(treeId);
    if (token) loadMyTrees();
    if (token) {
      Users.me().then(setCurrentUser).catch(() => {});
    } else {
      setCurrentUser(null);
    }
  }, [token, treeId]);

  // Toasts
  const [toast, setToast] = useState('');
  function showToast(msg) {
    setToast(String(msg || ''));
    setTimeout(() => setToast(''), 2500);
  }

  // Modal helpers
  function openNewMemberModal() {
    setSelectedId('');
    setModalOpen(true);
  }
  function closeMemberModal() {
    setModalOpen(false);
    // don't clear selection here; caller does it as needed
  }

  // Edge editing and export helpers
  const [edgeEditor, setEdgeEditor] = useState({ open: false, source: '', target: '', type: 'custom', label: '', x: 0, y: 0 });
  function handleEdgeClick(e, edge) {
    const type = edge?.data?.type || (String(edge?.id || '').split('-').pop() || 'custom');
    const label = edge?.data?.label || edge?.label || '';
    // Use original logical direction for edit operations (from = data.from, to = data.to)
    const logicalFrom = edge?.data?.from || edge?.source;
    const logicalTo = edge?.data?.to || edge?.target;
    setEdgeEditor({ open: true, source: logicalFrom, target: logicalTo, type, label, x: e.clientX, y: e.clientY });
  }
  async function updateEdge(editor, newType, newLabel) {
    try {
      await Relationships.update({ fromMemberId: editor.source, toMemberId: editor.target, type: editor.type, newType, label: newLabel });
      setEdgeEditor({ open: false, source: '', target: '', type: 'custom', label: '', x: 0, y: 0 });
      await loadTree(treeId);
      showToast('Relationship updated');
    } catch (e) {
      showToast(`Update failed: ${e.message}`);
    }
  }
  async function deleteEdge(editor) {
    try {
      await Relationships.remove({ fromMemberId: editor.source, toMemberId: editor.target, type: editor.type });
      setEdgeEditor({ open: false, source: '', target: '', type: 'custom', label: '', x: 0, y: 0 });
      await loadTree(treeId);
      showToast('Relationship deleted');
    } catch (e) {
      showToast(`Delete failed: ${e.message}`);
    }
  }
  function cancelEdgeEdit() {
    setEdgeEditor({ open: false, source: '', target: '', type: 'custom', label: '', x: 0, y: 0 });
  }
  const exportRef = useRef(null);
  function makeFilename(ext) {
    const title = treeMeta?.title?.trim() || 'family-tree';
  const safeTitle = title.replace(/[^a-z0-9\- _.]/gi, '').replace(/\s+/g, ' ').trim();
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${safeTitle} ${y}-${m}-${d}.${ext}`;
  }

  async function handleExportPng() {
    try {
      if (!exportRef.current) return;
      // Use SVG render path first (captures React Flow edges reliably), then rasterize to PNG
      const svgUrl = await htmlToImage.toSvg(exportRef.current, { backgroundColor: '#ffffff' });
      const pngUrl = await svgDataUrlToPng(svgUrl, 2);
      const link = document.createElement('a');
      link.download = makeFilename('png');
      link.href = pngUrl;
      link.click();
    } catch (e) {
      showToast('Export failed');
    }
  }

  // Delete the currently selected tree (owner-only). Cascade-deletes members.
  async function handleDeleteTree() {
    if (!treeId) return;
    const title = treeMeta?.title || 'this tree';
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${title}"?\n\nThis will remove the tree and all its members. This action cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await Trees.delete(treeId);
      // Clear UI state
      setTreeIdState('');
      setTreeId('');
      setNodes([]);
      setEdges([]);
      setMembers([]);
      setTreeMeta(null);
      await loadMyTrees();
      showToast('Tree deleted');
    } catch (e) {
      showToast(`Delete failed: ${e.message}`);
    }
  }

  function svgDataUrlToPng(svgUrl, pixelRatio = 2) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        canvas.width = Math.max(1, Math.floor(w * pixelRatio));
        canvas.height = Math.max(1, Math.floor(h * pixelRatio));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = svgUrl;
    });
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif', background: '#f8fafc' }}>
      <Sidebar 
        onCheckApi={checkApi} 
        apiStatus={apiStatus}
        members={members}
        nodesOnCanvas={nodes.map(n => n.id)}
        onAddMemberToCanvas={handleAddMemberToCanvas}
        onSelectMember={(id) => { setSelectedId(id); setModalOpen(true); }}
        onDeleteMember={canEdit ? handleDeleteMember : undefined}
        onAddNewMember={openNewMemberModal}
      />
      <main style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>Family Tree Builder</h1>
          {/* Header is kept minimal; debug/info moved to the footer details */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {isAuthed ? (
              <>
                <span style={{ color: '#1f2937', fontSize: 12 }}>{currentUser?.email}</span>
                <button onClick={handleCreateTree} style={{ padding: '6px 10px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none' }}>Create Tree</button>
                <select value={treeId || ''} onChange={(e) => { const id = e.target.value; setTreeIdState(id); setTreeId(id); if (id) loadTree(id); }} style={{ padding: 6 }}>
                  <option value="">Select a tree…</option>
                  {myTrees.map((t) => (
                    <option key={t._id} value={t._id}>{t.title}</option>
                  ))}
                </select>
                {isOwner && treeId && (
                  <button onClick={handleDeleteTree} title="Permanently delete this tree" style={{ padding: '6px 10px', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none' }}>Delete Tree</button>
                )}
                <button title="Refresh list" onClick={loadMyTrees} style={{ padding: '6px 10px', borderRadius: 6, background: '#e2e8f0', color: '#111', border: '1px solid #cbd5e1' }}>↻</button>
                <button onClick={handleExportPng} disabled={!nodes.length} style={{ padding: '6px 10px', borderRadius: 6, background: nodes.length ? '#0ea5e9' : '#94a3b8', color: '#fff', border: 'none' }}>Export PNG</button>
                <button onClick={handleLogout} style={{ padding: '6px 10px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none' }}>Logout</button>
              </>
            ) : (
              <>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" style={{ padding: 6 }} />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" style={{ padding: 6 }} />
                <button onClick={handleLogin} style={{ padding: '6px 10px', borderRadius: 6, background: '#1f6feb', color: '#fff', border: 'none' }}>Login</button>
                <button onClick={handleRegister} style={{ padding: '6px 10px', borderRadius: 6, background: '#475569', color: '#fff', border: 'none' }}>Register</button>
              </>
            )}
          </div>
        </header>
        <TreeBoard
          nodes={nodes}
          edges={edges}
          setNodes={setNodes}
          setEdges={setEdges}
          onAddPerson={isAuthed && treeId && canEdit ? handleAddPerson : undefined}
          canAdd={!!(isAuthed && treeId && canEdit)}
          onConnect={isAuthed && canEdit ? handleConnectEdge : undefined}
          onNodeClick={handleSelectNode}
          onNodeDragStop={isAuthed && canEdit ? handleNodeDragStop : undefined}
          onEdgeClick={isAuthed && canEdit ? handleEdgeClick : undefined}
          onDropMember={isAuthed && canEdit ? handleDropMember : undefined}
          exportRef={exportRef}
        />
        {relPicker.open && (
          <RelationshipPicker
            open={relPicker.open}
            onCancel={cancelRelationship}
            onConfirm={confirmRelationship}
          />
        )}
        {edgeEditor.open && (
          <EdgeEditorPopover
            x={edgeEditor.x}
            y={edgeEditor.y}
            type={edgeEditor.type}
            label={edgeEditor.label || ''}
            onUpdate={(newType, newLabel) => updateEdge(edgeEditor, newType, newLabel)}
            onDelete={() => deleteEdge(edgeEditor)}
            onClose={cancelEdgeEdit}
          />
        )}
        {/* Unified Add/Edit Modal */}
        <MemberModal
          open={modalOpen}
          member={selectedMember()}
          onSave={(payload) => handleSaveMember(payload)}
          onClose={() => { closeMemberModal(); setSelectedId(''); }}
          canSave={!!(token && treeId && canEdit)}
          onDelete={canEdit ? (id) => handleDeleteMember(id, true) : undefined}
          onMoveToPool={canEdit ? (id) => handleDeleteMember(id, false) : undefined}
        />
        {toast && (
          <div style={{ position: 'fixed', right: 16, top: 16, background: '#111827', color: '#fff', padding: '10px 12px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.25)', zIndex: 1000 }}>
            {toast}
          </div>
        )}
        
      </main>
    </div>
  );
}

export default App;
