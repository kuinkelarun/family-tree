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
  sibling: '#f97316',   // orange-500 (sibling bond)
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
    const posById = new Map(members.map(m => [String(m._id), m.position || { x: 0, y: 0 }]));
    const membersById = new Map(members.map(m => [String(m._id), m]));

    // 1. Create nodes for all members on the canvas.
    // If a member has a saved position, use it. Otherwise prefer the current UI node position
    // (so transient UI drags are preserved across a reload), and fallback to a sensible grid.
    const personNodes = members.map((m, idx) => {
      const savedPos = hasPosVal(m.position) ? { x: m.position.x, y: m.position.y } : null;
      // If the app already has this node in the current UI state, prefer that position when savedPos is missing.
      const uiNode = nodes?.find?.(n => String(n.id) === String(m._id));
      const uiPos = uiNode && uiNode.position && typeof uiNode.position.x === 'number' && typeof uiNode.position.y === 'number' ? { x: uiNode.position.x, y: uiNode.position.y } : null;
      const pos = savedPos || uiPos || fallbackPosForIndex(idx);
      return {
        id: m._id,
        data: { label: m.name || `Member ${idx + 1}` },
        position: pos,
        type: 'familyNode',
      };
    });

    const allNodes = [...personNodes];
    const allEdges = [];
    const processedMemberPairs = new Set(); // Tracks pairs like 'id1-id2' that are part of a family unit

    // 2. Identify family units (spouse pairs and their children)
    const spousePairs = new Map(); // spouseId -> partnerId
    for (const member of members) {
      for (const rel of member.relationships || []) {
        if (rel.type === 'spouse') {
          const p1 = String(member._id);
          const p2 = String(rel.relative?._id || rel.relative);
          const key = p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
          if (!spousePairs.has(key)) {
            spousePairs.set(key, [p1, p2]);
          }
        }
      }
    }

    for (const [pairKey, [p1Id, p2Id]] of spousePairs) {
      const p1 = membersById.get(p1Id);
      const p2 = membersById.get(p2Id);
      if (!p1 || !p2) continue;

      const p1Children = new Set((p1.relationships || []).filter(r => r.type === 'child').map(r => String(r.relative?._id || r.relative)));
      const p2Children = new Set((p2.relationships || []).filter(r => r.type === 'child').map(r => String(r.relative?._id || r.relative)));
      const commonChildren = [...p1Children].filter(cId => p2Children.has(cId));

      if (commonChildren.length > 0) {
        // Define marriage point id up-front
        const marriagePointId = `m-${pairKey}`;
        let marriagePointPos = null;

        // For parent positions prefer saved positions, then current UI node positions (so transient drags are preserved), then fallback.
        const p1Saved = hasPosVal(p1.position) ? { x: p1.position.x, y: p1.position.y } : null;
        const p2Saved = hasPosVal(p2.position) ? { x: p2.position.x, y: p2.position.y } : null;
        const p1Ui = nodes?.find?.(n => String(n.id) === p1Id)?.position || null;
        const p2Ui = nodes?.find?.(n => String(n.id) === p2Id)?.position || null;
        const p1Pos = p1Saved || p1Ui || { x: 0, y: 0 };
        const p2Pos = p2Saved || p2Ui || { x: 0, y: 0 };

        // Prefer any existing marriage node position first (user may have dragged it), otherwise compute from parent positions.
        const existingMarriageNode = nodes?.find?.((n) => String(n.id) === marriagePointId);
        if (existingMarriageNode && existingMarriageNode.position && typeof existingMarriageNode.position.x === 'number' && typeof existingMarriageNode.position.y === 'number') {
          // Use the previously dragged marriage point position
          marriagePointPos = { x: existingMarriageNode.position.x, y: existingMarriageNode.position.y };
        } else {
          marriagePointPos = {
            x: (p1Pos.x + p2Pos.x) / 2 + 70, // offset to center between nodes
            y: Math.max(p1Pos.y, p2Pos.y) + 50, // place below parents
          };
        }

        // Push a single marriage point node
        allNodes.push({
          id: marriagePointId,
          type: 'marriagePoint',
          position: marriagePointPos,
          // keep minimal data but record parents so interactions from this node can act on both parents
          data: { parents: [p1Id, p2Id], type: 'marriage', verified: false },
          // allow dragging the marriage point in the canvas (visual only)
          draggable: true,
          // keep unselectable to avoid editing modal; selection is handled only for familyNode
          selectable: false,
        });

        // Edges from parents to marriage point (styled like child edges)
        allEdges.push({
          id: `e-${p1Id}-${marriagePointId}`,
          source: p1Id,
          target: marriagePointId,
          sourceHandle: 'bottom-source',
          targetHandle: 'top-target',
          type: 'smoothstep',
          style: { stroke: RELATIONSHIP_COLORS.child, strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed', color: RELATIONSHIP_COLORS.child },
          data: { bundle: false, type: 'child' },
        });
        allEdges.push({
          id: `e-${p2Id}-${marriagePointId}`,
          source: p2Id,
          target: marriagePointId,
          sourceHandle: 'bottom-source',
          targetHandle: 'top-target',
          type: 'smoothstep',
          style: { stroke: RELATIONSHIP_COLORS.child, strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed', color: RELATIONSHIP_COLORS.child },
          data: { bundle: false, type: 'child' },
        });

        // Also add the spouse edge between the parents
        const dx = p2Pos.x - p1Pos.x;
        const isP2Right = dx >= 0;
        allEdges.push({
          id: `e-${pairKey}-spouse`,
          source: p1Id,
          target: p2Id,
          type: 'smoothstep',
          label: 'spouse',
          sourceHandle: isP2Right ? 'right-source' : 'left-source',
          targetHandle: isP2Right ? 'left-target' : 'right-target',
          labelStyle: { fill: '#111827', fontSize: 12, fontWeight: 600 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95, stroke: RELATIONSHIP_COLORS.spouse, strokeWidth: 1 },
          labelBgPadding: [3, 4],
          labelBgBorderRadius: 4,
          style: { stroke: RELATIONSHIP_COLORS.spouse, strokeWidth: 2 },
        });

        // Edges from marriage point to children
        for (const childId of commonChildren) {
          allEdges.push({
            id: `e-${marriagePointId}-${childId}`,
            source: marriagePointId,
            target: childId,
            sourceHandle: 'bottom-source',
            targetHandle: 'top-target',
            type: 'smoothstep',
            label: 'child',
            labelStyle: { fill: '#111827', fontSize: 12, fontWeight: 600 },
            labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95, stroke: RELATIONSHIP_COLORS.child, strokeWidth: 1 },
            labelBgPadding: [3, 4],
            labelBgBorderRadius: 4,
            style: { stroke: RELATIONSHIP_COLORS.child, strokeWidth: 2 },
            markerEnd: { type: 'arrowclosed', color: RELATIONSHIP_COLORS.child },
            // Surface a logical relationship so edge editor maps to a real DB relationship.
            // Map to the first parent by default (editing will operate on that relationship).
            data: { type: 'child', label: 'child', from: p1Id, to: childId },
          });
        }

        // Mark parents and children as processed for this type of relationship
        processedMemberPairs.add(`${p1Id}-${p2Id}`);
        processedMemberPairs.add(`${p2Id}-${p1Id}`);
        commonChildren.forEach(cId => {
          processedMemberPairs.add(`${p1Id}-${cId}`);
          processedMemberPairs.add(`${cId}-${p1Id}`);
          processedMemberPairs.add(`${p2Id}-${cId}`);
          processedMemberPairs.add(`${cId}-${p2Id}`);
        });
      }
    }

    // 3. Process all other relationships that were not part of a family unit
    const pairMap = new Map();
    for (const m of members) {
      for (const r of m.relationships || []) {
        const src = m._id;
        const dst = (r.relative && r.relative._id) || r.relative;
        if (!src || !dst) continue;

        const pairKey = `${String(src)}-${String(dst)}`;
        if (processedMemberPairs.has(pairKey)) continue;

        const a = String(src);
        const b = String(dst);
        const sortedKey = a < b ? `${a}|${b}` : `${b}|${a}`;
        const current = pairMap.get(sortedKey);

        const type = r.type || 'custom';
        const label = r.label || type;
        const authored = !!r.authored;
        const edgeColor = RELATIONSHIP_COLORS[type] || RELATIONSHIP_COLORS.custom;
        
        const displaySourceId = String(src);
        const displayTargetId = String(dst);
        const srcPos = posById.get(displaySourceId) || { x: 0, y: 0 };
        const dstPos = posById.get(displayTargetId) || { x: 0, y: 0 };
        const dx = (dstPos.x || 0) - (srcPos.x || 0);
        const dy = (dstPos.y || 0) - (srcPos.y || 0);

        let sourceHandle, targetHandle;
        if (type === 'parent') {
          sourceHandle = 'top-source';
          targetHandle = 'bottom-target';
        } else if (type === 'child') {
          sourceHandle = 'bottom-source';
          targetHandle = 'top-target';
        } else if (type === 'spouse' || type === 'sibling') {
          const srcRight = dx >= 0;
          sourceHandle = `${srcRight ? 'right' : 'left'}-source`;
          targetHandle = `${!srcRight ? 'right' : 'left'}-target`;
        } else {
          if (Math.abs(dx) >= Math.abs(dy)) {
            const srcRight = dx >= 0;
            sourceHandle = `${srcRight ? 'right' : 'left'}-source`;
            targetHandle = `${!srcRight ? 'right' : 'left'}-target`;
          } else {
            const srcDown = dy >= 0;
            sourceHandle = `${srcDown ? 'bottom' : 'top'}-source`;
            targetHandle = `${!srcDown ? 'bottom' : 'top'}-target`;
          }
        }

        const markers = { markerEnd: { type: 'arrowclosed', color: edgeColor } };
        const edgeId = `${String(src)}-${String(dst)}-${type}`;

        const candidate = {
          id: edgeId,
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
          data: { type, label, authored, from: String(src), to: String(dst) },
        };

        if (!current) {
          pairMap.set(sortedKey, { edge: candidate, hasLabel: !!r.label, authored, type, src: String(src), dst: String(dst) });
        } else {
          let preferThis = false;
          if (type === 'parent' || type === 'child') {
            if (authored && !current.authored) preferThis = true;
            else if (!authored && current.authored) preferThis = false;
            else if (!!r.label && !current.hasLabel) preferThis = true;
            else if (!r.label && current.hasLabel) preferThis = false;
            else if (type === 'parent' && current.type === 'child') preferThis = true;
            else if (type === 'child' && current.type === 'parent') preferThis = false;
            else preferThis = false;
          } else if (type === 'sibling' || type === 'spouse') {
            if (authored && !current.authored) preferThis = true;
            else if (!authored && current.authored) preferThis = false;
            else if (!!r.label && !current.hasLabel) preferThis = true;
            else if (!r.label && current.hasLabel) preferThis = false;
            else preferThis = false;
          } else {
            preferThis = (authored && !current.authored) || (!!r.label && !current.hasLabel);
          }
          
          if (preferThis) {
            pairMap.set(sortedKey, { edge: candidate, hasLabel: !!r.label, authored, type, src: String(src), dst: String(dst) });
          }
        }
      }
    }
    
    const remainingEdges = Array.from(pairMap.values()).map((v) => v.edge);
    allEdges.push(...remainingEdges);

    const e = bundleEdges(allEdges, allNodes);
    const n = allNodes;
    return { n, e, members };
  }

  // Group edges that likely overlap (same type and orientation) and hide duplicate labels.
  // This is a non-destructive visual bundling: underlying relationships are preserved.
  function bundleEdges(edgesIn, nodesIn) {
    try {
      if (!Array.isArray(edgesIn) || !edgesIn.length) return [];
      
      const pos = new Map(nodesIn.map(nd => [String(nd.id), nd.position || { x: 0, y: 0 }]));
      const groups = new Map();
      const output = [];

      function quant(v, q = 20) { return Math.round((v || 0) / q) * q; }

      // First, separate edges that should not be bundled
      const edgesToBundle = [];
      for (const edge of edgesIn) {
        if (edge.data?.bundle === false) {
          output.push(edge); // Add directly to output
        } else {
          edgesToBundle.push(edge);
        }
      }

      // Group the remaining edges
      for (const edge of edgesToBundle) {
        const type = edge?.data?.type || edge?.label || 'custom';
        const sp = pos.get(String(edge.source)) || { x: 0, y: 0 };
        const tp = pos.get(String(edge.target)) || { x: 0, y: 0 };
        const dx = (tp.x || 0) - (sp.x || 0);
        const dy = (tp.y || 0) - (sp.y || 0);
        const orient = Math.abs(dy) >= Math.abs(dx) ? 'vertical' : 'horizontal';
        const midX = (sp.x + tp.x) / 2;
        const midY = (sp.y + tp.y) / 2;
        const key = orient === 'vertical'
          ? `${type}|${orient}|x=${quant(midX, 24)}`
          : `${type}|${orient}|y=${quant(midY, 24)}`;
        
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ edge, midX, midY, orient });
      }

      // Process the groups
      for (const [, arr] of groups) {
        if (arr.length <= 1) {
          output.push(arr[0].edge);
          continue;
        }
        
        const sorted = [...arr].sort((a, b) => (a.orient === 'vertical' ? a.midY - b.midY : a.midX - b.midX));
        const primary = sorted[Math.floor(sorted.length / 2)].edge;
        
        for (const { edge } of arr) {
          if (edge === primary) {
            output.push({ ...edge, data: { ...edge.data, bundlePrimary: true } });
          } else {
            // No longer applying a faded style, just removing the label
            output.push({ ...edge, label: '', data: { ...edge.data, bundleMember: true } });
          }
        }
      }
      
      return output;
    } catch (e) {
      return edgesIn; // Fallback on error
    }
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
  async function handleAddPersonAt(position) {
    if (!treeId) return alert('Create a tree first.');
    try {
      const idx = nodes.length;
      const name = `Person ${idx + 1}`;
      const pos = position && typeof position.x === 'number' && typeof position.y === 'number'
        ? position
        : fallbackPosForIndex(idx);
      await Members.create({ tree: treeId, name, position: pos });
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

  const [relPicker, setRelPicker] = useState({ open: false, source: '', target: '', sourceHandle: '', targetHandle: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [previewEdge, setPreviewEdge] = useState(null);

  // Debug: log when modal state changes to verify wiring in the UI
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[UI Debug] MemberModal open =', modalOpen, 'selectedId =', selectedId);
  }, [modalOpen, selectedId]);

  async function handleConnectEdge(params) {
    if (!treeId) return;
    console.log(`[handleConnectEdge] Connection initiated: ${params.source} (${params.sourceHandle}) -> ${params.target} (${params.targetHandle})`);

    // If initiating from a marriage point (visual hub), automatically create child relationships
    // from both parents to the target member (skipping duplicates).
    try {
      const src = String(params.source || '');
      const tgt = String(params.target || '');

      if (src.startsWith('m-')) {
        // find the marriage node in current nodes
        const marriageNode = nodes.find(n => String(n.id) === src);
        const parents = marriageNode?.data?.parents || [];

        if (!parents || !parents.length) {
          showToast('Marriage point has no parent info');
          return;
        }

        // disallow connecting marriage point to another marriage point
        if (tgt.startsWith('m-')) {
          showToast('Cannot connect marriage point to another marriage point');
          return;
        }

        const ops = [];
        for (const parentId of parents) {
          // skip self-connections
          if (String(parentId) === tgt) continue;

          // Skip if an explicit child relationship already exists between this parent and the target
          const parentMember = members.find(m => String(m._id) === String(parentId));
          const already = (parentMember?.relationships || []).some(r => String((r.relative && r.relative._id) || r.relative) === String(tgt) && r.type === 'child');
          if (already) continue;

          ops.push(Relationships.create({ fromMemberId: parentId, toMemberId: tgt, type: 'child', label: 'child' }));
        }

        if (!ops.length) {
          showToast('No new child relationships to add');
          return;
        }

        await Promise.all(ops);
        setPreviewEdge(null);
        await loadTree(treeId);
        showToast('Child relationship(s) added');
        return;
      }
    } catch (e) {
      console.error('[handleConnectEdge] auto-create from marriage point failed', e);
      showToast(`Failed to create relationships: ${e?.message || e}`);
      return;
    }

    // Default behavior: open relationship picker for manual relationship creation
    console.log(`[handleConnectEdge] Opening picker for connection: ${params.source} (${params.sourceHandle}) -> ${params.target} (${params.targetHandle})`);
    setRelPicker({ open: true, source: params.source, target: params.target, sourceHandle: params.sourceHandle, targetHandle: params.targetHandle });
  }

  async function confirmRelationship(type, label) {
    try {
      console.log(`[confirmRelationship] Creating: ${relPicker.source} -> ${relPicker.target}, type=${type}, label=${label}`);
      // Remove any preview once we commit (we'll show the real edge after reload)
      // Keeping the preview until after loadTree would avoid any single-frame overlap, but both are acceptable.
      await Relationships.create({ fromMemberId: relPicker.source, toMemberId: relPicker.target, type, label });
      setRelPicker({ open: false, source: '', target: '', sourceHandle: '', targetHandle: '' });
      await loadTree(treeId);
      setPreviewEdge(null);
      showToast('Relationship added');
    } catch (e) {
      showToast(`Add relationship failed: ${e.message}`);
    }
  }

  function cancelRelationship() {
    setRelPicker({ open: false, source: '', target: '', sourceHandle: '', targetHandle: '' });
    setPreviewEdge(null);
  }

  function handleSelectNode(id, node) {
    // Only open the member modal for actual family member nodes
    const nodeType = node?.type || '';
    if (!id) {
      setSelectedId('');
      return;
    }
    if (nodeType !== 'familyNode') {
      // ignore clicks on marriagePoint or other helper nodes
      return;
    }
    setSelectedId(String(id));
    setModalOpen(true);
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
        // Close modal immediately to avoid it re-rendering into "Add New" briefly
        setModalOpen(false);
        setSelectedId('');
        await Members.delete(memberId);
        await loadTree(treeId);
        showToast(`${memberName} permanently deleted`);
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
        // Close modal first to avoid flicker into "Add New Member" state
        setModalOpen(false);
        setSelectedId('');
        await Members.update(memberId, { position: null });
        await loadTree(treeId);
        showToast(`${memberName} moved to Member Pool`);
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
      // If it's a marriagePoint (virtual helper node), only update UI state — do not persist to server
      if (node.type === 'marriagePoint') {
        console.log(`[handleNodeDragStop] Updating marriage point position locally for ${node.id}:`, { x, y });
        setNodes((nds) => nds.map((n) => (String(n.id) === String(node.id) ? { ...n, position: { x, y } } : n)));
        return;
      }

      // For real member nodes, persist position to backend
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
    // If this edge is connected to a marriage point on the parent side (parent -> marriage),
    // edits should be performed on the marriage->child edge instead because the parent->marriage
    // edge is a visual helper. Inform the user.
    if (String(edge?.target || '').startsWith('m-') && !String(edge?.source || '').startsWith('m-')) {
      showToast('Edit child relationships by clicking the marriage→child edge');
      return;
    }

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
          edges={previewEdge ? [...edges, previewEdge] : edges}
          setNodes={setNodes}
          setEdges={setEdges}
          onAddPersonAt={isAuthed && treeId && canEdit ? handleAddPersonAt : undefined}
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
            onTypePreview={(t) => {
              try {
                if (!relPicker.source || !relPicker.target) return;
                const from = String(relPicker.source);
                const to = String(relPicker.target);
                // Apply strict handle rules
                let sourceHandle, targetHandle;
                if (t === 'parent') {
                  sourceHandle = 'top-source';
                  targetHandle = 'bottom-target';
                } else if (t === 'child') {
                  sourceHandle = 'bottom-source';
                  targetHandle = 'top-target';
                } else {
                  // For horizontal types, choose left/right based on current positions if available
                  const a = nodes.find(n => String(n.id) === from)?.position || { x: 0, y: 0 };
                  const b = nodes.find(n => String(n.id) === to)?.position || { x: 0, y: 0 };
                  const right = (b.x - a.x) >= 0;
                  sourceHandle = `${right ? 'right' : 'left'}-source`;
                  targetHandle = `${right ? 'left' : 'right'}-target`;
                }
                // Edge color per type
                const colorMap = {
                  parent: '#10b981',
                  child: '#10b981',
                  spouse: '#ec4899',
                  sibling: '#f97316',
                  custom: '#8b5cf6',
                };
                const edgeColor = colorMap[t] || colorMap.custom;
                const id = `preview-${from}-${to}`;
                setPreviewEdge({
                  id,
                  source: from,
                  target: to,
                  type: 'smoothstep',
                  label: t !== 'custom' ? t : '',
                  sourceHandle,
                  targetHandle,
                  style: { stroke: edgeColor, strokeWidth: 2, opacity: 0.8, strokeDasharray: '4,4' },
                  markerEnd: { type: 'arrowclosed', color: edgeColor },
                  data: { type: t, label: t !== 'custom' ? t : '', from, to, preview: true },
                });
              } catch {}
            }}
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
