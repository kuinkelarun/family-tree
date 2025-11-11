import { useEffect, useMemo, useState, useRef } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/solid';
import './App.css';
import Sidebar from './components/Sidebar.jsx';
import TreeBoard from './components/TreeBoard.jsx';
import MemberModal from './components/MemberModal.jsx';
import ArchivedModal from './components/ArchivedModal.jsx';
import CreateTreeModal from './components/CreateTreeModal.jsx';
import RelationshipPicker from './components/RelationshipPicker.jsx';
import EdgeEditorPopover from './components/EdgeEditorPopover.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import KinshipPanel from './components/KinshipPanel.jsx';
import { api, Auth, Trees, Members, Relationships, Users, getToken, setToken, getTreeId, setTreeId } from './utils/api.js';
import { displayMemberName } from './utils/format.js';
import * as htmlToImage from 'html-to-image';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Color coding for relationship types
const RELATIONSHIP_COLORS = {
  parent: '#f97316',    // orange-500 (was sibling) - parent to child
  child: '#f97316',     // orange-500 (same as parent)
  spouse: '#ec4899',    // pink-500 (romantic)
  sibling: '#10b981',   // emerald-500 (was parent) - sibling bond
  custom: '#8b5cf6',    // violet-500 (custom/other)
};

// (generation-based auto-arrange removed)

function App() {
  const [apiStatus, setApiStatus] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setTokenState] = useState(getToken() || '');
  const [currentUser, setCurrentUser] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(window.location.pathname === '/admin');
  const [createOpen, setCreateOpen] = useState(false);
  const [adminUnsaved, setAdminUnsaved] = useState(false);
  const [treeId, setTreeIdState] = useState(getTreeId());
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [treeMeta, setTreeMeta] = useState(null);
  const [showKinship, setShowKinship] = useState(false);
  const rfApiRef = useRef(null);
  const elkWorkerRef = useRef(null);
  const [layoutActive, setLayoutActive] = useState(false);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const prevPositionsRef = useRef(null); // { positions: { id -> {x,y} }, viewport }
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [slotHover, setSlotHover] = useState(false);
  

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
    setMembers([]);
    setMyTrees([]);
    setTreeMeta(null);
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

  async function handleTreeCreated(tree) {
    try {
      if (!tree || !tree._id) return;
      setCreateOpen(false);
      setTreeIdState(tree._id);
      setTreeId(tree._id);
      await loadTree(tree._id);
      await loadMyTrees();
      showToast('Tree created');
    } catch (e) {
      console.error('[handleTreeCreated] error', e);
      showToast(`Load tree failed: ${e.message}`);
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

  function clearSelectedTreeState() {
    setTreeIdState('');
    setTreeId('');
    setNodes([]);
    setEdges([]);
    setMembers([]);
    setTreeMeta(null);
  }

  function handleSelectTree(id) {
    if (!id) {
      clearSelectedTreeState();
      return;
    }
    setTreeIdState(id);
    setTreeId(id);
    loadTree(id).catch(() => {});
  }

  function hasPosVal(pos) {
    return pos && typeof pos.x === 'number' && typeof pos.y === 'number';
  }

  function fallbackPosForIndex(idx) {
    return { x: (idx % 6) * 180, y: Math.floor(idx / 6) * 140 };
  }

  // Find the smallest available "Person N" name not already used across ALL members (canvas + pool)
  function nextAvailablePersonName() {
    const used = new Set();
    for (const m of members) {
      const nm = (m.name || '').trim();
      const match = /^Person\s+(\d+)$/.exec(nm);
      if (match) {
        const n = parseInt(match[1], 10);
        if (Number.isFinite(n) && n > 0) used.add(n);
      }
    }
    let candidate = 1;
    while (used.has(candidate)) candidate++;
    return `Person ${candidate}`;
  }

  // Given an arbitrary base name, return a unique variant across ALL members by appending " (k)" if needed
  function uniqueNameAcrossApp(base, excludeId) {
    const trimBase = String(base || '').trim();
    if (!trimBase) return trimBase;
    const names = new Set(
      members
        .filter(m => !excludeId || String(m._id) !== String(excludeId))
        .map(m => (m.name || '').trim())
    );
    // If it's a Person N pattern, reuse the numeric generator to avoid odd suffixes
    const personMatch = /^Person\s+(\d+)$/.exec(trimBase);
    if (personMatch) {
      // If 'Person N' is free, return it; else compute next available numeric "Person X"
      if (!names.has(trimBase)) return trimBase;
      return nextAvailablePersonName();
    }
    if (!names.has(trimBase)) return trimBase;
    // Append (2), (3), ... until free
    let k = 2;
    let candidate = `${trimBase} (${k})`;
    while (names.has(candidate)) {
      k += 1;
      candidate = `${trimBase} (${k})`;
    }
    return candidate;
  }

  function mapTreeToGraph(tree) {
    const members = Array.isArray(tree.members) ? tree.members : [];
    const posById = new Map(members.map(m => [String(m._id), m.position || { x: 0, y: 0 }]));
    const membersById = new Map(members.map(m => [String(m._id), m]));

    // Build disambiguated labels for members on the canvas when names collide
    const onCanvasMembers = members.filter(m => hasPosVal(m.position));
    const nameCounts = new Map();
    for (const m of onCanvasMembers) {
      const nm = (m.name || '').trim();
      nameCounts.set(nm, (nameCounts.get(nm) || 0) + 1);
    }
    const labelById = new Map();
    for (const m of onCanvasMembers) {
      const nm = (m.name || '').trim();
      const nick = (m.nickname || '').trim();
      // If neither name nor nickname, leave empty
      if (!nm && !nick) { labelById.set(String(m._id), ''); continue; }

      // If a nickname exists, always show it (either alone or as `Name (Nickname)`)
      if (nick) {
        labelById.set(String(m._id), nm ? `${nm} (${nick})` : nick);
        continue;
      }

      // No nickname: fall back to name, preserving existing duplicate logic
      const count = nameCounts.get(nm) || 0;
      if (count <= 1) {
        // First/only member with this name: keep as-is
        labelById.set(String(m._id), nm);
      } else {
        // Multiple members share this name and no nickname available: keep the name
        labelById.set(String(m._id), nm);
      }
    }

    // 1. Create nodes for all members on the canvas.
    // If a member has a saved position, use it. Otherwise prefer the current UI node position
    // (so transient UI drags are preserved across a reload), and fallback to a sensible grid.
    const personNodes = [];
    for (let idx = 0; idx < members.length; idx++) {
      const m = members[idx];
      // Only render members that have a persisted position (i.e., are on the canvas).
      // Members with no saved position belong to the Member Pool and should not be shown here.
      if (!hasPosVal(m.position)) continue;
      const pos = { x: m.position.x, y: m.position.y };
      personNodes.push({
        id: m._id,
        data: { label: labelById.get(String(m._id)) || m.name || `Member ${idx + 1}` },
        position: pos,
        type: 'familyNode',
      });
    }

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
        // Debug: log family unit detection in dev
        try {
          if (import.meta?.env?.MODE !== 'production') {
            console.log('[mapTreeToGraph] Creating marriage point', { pairKey, parents: [p1Id, p2Id], commonChildren });
          }
        } catch (e) {}
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
          // Also check persisted marriagePoints returned from the server
          const savedMarriagePoint = (tree.marriagePoints || []).find(mp => String(mp.id) === marriagePointId);
          if (existingMarriageNode && existingMarriageNode.position && typeof existingMarriageNode.position.x === 'number' && typeof existingMarriageNode.position.y === 'number') {
            // Use the previously dragged marriage point position from UI state
            marriagePointPos = { x: existingMarriageNode.position.x, y: existingMarriageNode.position.y };
          } else if (savedMarriagePoint && savedMarriagePoint.position && typeof savedMarriagePoint.position.x === 'number' && typeof savedMarriagePoint.position.y === 'number') {
            // Use persisted marriage point position from the tree
            marriagePointPos = { x: savedMarriagePoint.position.x, y: savedMarriagePoint.position.y };
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
          // Remove pointer on edges that terminate at marriage point (intermediary structure)
          // markerEnd removed intentionally
          data: { bundle: false, type: 'parent-connector' },
        });
        allEdges.push({
          id: `e-${p2Id}-${marriagePointId}`,
          source: p2Id,
          target: marriagePointId,
          sourceHandle: 'bottom-source',
          targetHandle: 'top-target',
          type: 'smoothstep',
          style: { stroke: RELATIONSHIP_COLORS.child, strokeWidth: 2 },
          // Remove pointer on edges that terminate at marriage point (intermediary structure)
          // markerEnd removed intentionally
          data: { bundle: false, type: 'parent-connector' },
        });

        // Also add the spouse edge between the parents.
        // Use deterministic lexicographic ordering for the source->target ids so the
        // edge direction never flips due to transient position changes. Handles are
        // assigned to visually indicate left->right but the canonical source is
        // stable (sorted id).
  const ordered = [String(p1Id), String(p2Id)].sort();
        const leftId = ordered[0];
        const rightId = ordered[1];
        // Determine which visual node is on the right for handle placement
  const visualRight = (p2Pos.x >= p1Pos.x) ? p2Id : p1Id;
  const sourceHandle = (String(leftId) === String(visualRight)) ? 'right-source' : 'right-source';
  const targetHandle = (String(rightId) === String(visualRight)) ? 'left-target' : 'left-target';
        allEdges.push({
          id: `e-${pairKey}-spouse`,
          source: leftId,
          target: rightId,
          type: 'smoothstep',
          label: 'spouse',
          data: { type: 'spouse', bundle: false },
          sourceHandle,
          targetHandle,
          labelStyle: { fill: '#111827', fontSize: 12, fontWeight: 600 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95, stroke: RELATIONSHIP_COLORS.spouse, strokeWidth: 1 },
          labelBgPadding: [3, 4],
          labelBgBorderRadius: 4,
          style: { stroke: RELATIONSHIP_COLORS.spouse, strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed', color: RELATIONSHIP_COLORS.spouse },
        });

  // Edges from marriage point to children
        for (const childId of commonChildren) {
          // Prefer an existing label from either parent relationship to the child (non-empty), otherwise default to 'child'
          const p1Rel = (p1.relationships || []).find(r => String((r.relative && r.relative._id) || r.relative) === String(childId));
          const p2Rel = (p2.relationships || []).find(r => String((r.relative && r.relative._id) || r.relative) === String(childId));
          const labelText = (p1Rel && p1Rel.label) || (p2Rel && p2Rel.label) || 'child';
          allEdges.push({
            id: `e-${marriagePointId}-${childId}`,
            source: marriagePointId,
            target: childId,
            sourceHandle: 'bottom-source',
            targetHandle: 'top-target',
            type: 'smoothstep',
            label: labelText,
            labelStyle: { fill: '#111827', fontSize: 12, fontWeight: 600 },
            labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95, stroke: RELATIONSHIP_COLORS.child, strokeWidth: 1 },
            labelBgPadding: [3, 4],
            labelBgBorderRadius: 4,
            style: { stroke: RELATIONSHIP_COLORS.child, strokeWidth: 2 },
            // Keep pointer on marriagePoint -> child segment to indicate actual parent→child direction
            markerEnd: { type: 'arrowclosed', color: RELATIONSHIP_COLORS.child },
            // Surface a logical relationship so edge editor maps to a real DB relationship.
            // Map to the first parent by default (editing will operate on that relationship).
            data: { type: 'child', label: labelText, from: p1Id, to: childId, fromMarriagePoint: true },
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

        const markers = { markerEnd: { type: 'arrowclosed', color: edgeColor } };

        // Decide edge endpoints, type, label, and handles
        let edgeSourceId = displaySourceId;
        let edgeTargetId = displayTargetId;
        let edgeType = type;
        let edgeLabel = label || type;

        if (type === 'parent' || type === 'child') {
          // Preserve authored direction. If BOTH reciprocal sides are present and neither authored, prefer the side whose source is visually above.
          const srcRelAuthored = !!r.authored;
          let prefer = true;
          if (!srcRelAuthored && current && !current.authored) {
            // Neither side authored: pick the edge whose source y < target y for consistency
            const sPos = posById.get(displaySourceId) || { y: 0 };
            const tPos = posById.get(displayTargetId) || { y: 0 };
            prefer = sPos.y <= tPos.y; // source above or same
          }
          if (prefer) {
            edgeSourceId = displaySourceId;
            edgeTargetId = displayTargetId;
            edgeType = type;
            edgeLabel = label || type;
            if (type === 'child') {
              sourceHandle = 'bottom-source';
              targetHandle = 'top-target';
            } else {
              sourceHandle = 'top-source';
              targetHandle = 'bottom-target';
            }
          } else {
            // Skip adding this candidate if we don't prefer it
            // by continuing without touching pairMap (acts like a filtered-out duplicate)
            continue;
          }
        } else if (type === 'spouse' || type === 'sibling') {
          // Side connectors based on horizontal position
          const srcRight = dx >= 0;
          sourceHandle = `${srcRight ? 'right' : 'left'}-source`;
          targetHandle = `${srcRight ? 'left' : 'right'}-target`;
        } else {
          // Fallback: choose by dominant axis
          if (Math.abs(dx) >= Math.abs(dy)) {
            const srcRight = dx >= 0;
            sourceHandle = `${srcRight ? 'right' : 'left'}-source`;
            targetHandle = `${srcRight ? 'left' : 'right'}-target`;
          } else {
            const srcDown = dy >= 0;
            sourceHandle = `${srcDown ? 'bottom' : 'top'}-source`;
            targetHandle = `${srcDown ? 'top' : 'bottom'}-target`;
          }
        }

        const edgeId = `${String(edgeSourceId)}-${String(edgeTargetId)}-${edgeType}`;

        const candidate = {
          id: edgeId,
          source: edgeSourceId,
          target: edgeTargetId,
          type: 'smoothstep',
          label: edgeLabel,
          sourceHandle,
          targetHandle,
          labelStyle: { fill: '#111827', fontSize: 12, fontWeight: 600 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95, stroke: edgeColor, strokeWidth: 1 },
          labelBgPadding: [3, 4],
          labelBgBorderRadius: 4,
          style: { stroke: edgeColor, strokeWidth: 2 },
          ...markers,
          data: { type: edgeType, label: edgeLabel, authored: !!r.authored, from: String(edgeSourceId), to: String(edgeTargetId) },
        };

        if (!current) {
          pairMap.set(sortedKey, { edge: candidate, hasLabel: !!r.label, authored: !!r.authored, type, src: String(src), dst: String(dst) });
        } else {
          let preferThis = false;
          if (type === 'parent' || type === 'child') {
            // New simpler preference: authored beats unauthored; otherwise keep existing.
            if (!!r.authored && !current.authored) preferThis = true;
            else preferThis = false;
          } else if (type === 'sibling' || type === 'spouse') {
            if (!!r.authored && !current.authored) preferThis = true;
            else if (!r.authored && current.authored) preferThis = false;
            else if (!!r.label && !current.hasLabel) preferThis = true;
            else if (!r.label && current.hasLabel) preferThis = false;
            else preferThis = false;
          } else {
            preferThis = (!!r.authored && !current.authored) || (!!r.label && !current.hasLabel);
          }

          if (preferThis) {
            pairMap.set(sortedKey, { edge: candidate, hasLabel: !!r.label, authored: !!r.authored, type, src: String(src), dst: String(dst) });
          }
        }
      }
    }
    
    const remainingEdges = Array.from(pairMap.values()).map((v) => v.edge);
    allEdges.push(...remainingEdges);

    const e = bundleEdges(allEdges, allNodes);
    // Mark nodes as connected if they appear in any edge (source or target)
    const connectedSet = new Set();
    for (const ed of e) {
      if (ed && ed.source) connectedSet.add(String(ed.source));
      if (ed && ed.target) connectedSet.add(String(ed.target));
    }
    const n = allNodes.map((node) => {
      // Only mark actual family nodes (not marriagePoint helpers)
      if (node.type === 'familyNode') {
        const isConnected = connectedSet.has(String(node.id));
        return { ...node, data: { ...(node.data || {}), connected: !!isConnected } };
      }
      return node;
    });
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

  // Trigger layered (Sugiyama) layout via ELK worker and apply positions to current nodes.
  // If layout is already active, revert to previous positions.
  async function handleAutoLayout() {
    try {
      if (layoutBusy) return; // prevent concurrent clicks
      setLayoutBusy(true);
      // If currently active, revert to saved positions
      if (layoutActive && prevPositionsRef.current) {
        const prev = prevPositionsRef.current;
        setNodes((nds) => nds.map((n) => {
          const p = prev.positions?.[String(n.id)];
          return p ? { ...n, position: { x: p.x, y: p.y } } : n;
        }));
        setLayoutActive(false);
        // Restore previous viewport if available; otherwise fit
        try {
          const vp = prev.viewport;
          if (vp && rfApiRef.current?.setViewport) {
            rfApiRef.current.setViewport(vp, { duration: 0 });
          } else {
            rfApiRef.current?.fitView?.({ padding: 0.1 });
          }
        } catch (e) {}
        // keep history cleared after revert
        prevPositionsRef.current = null;
        setLayoutBusy(false);
        showToast('Restored previous layout');
        return;
      }

      // Save current positions for revert
      const liveNodes = (rfApiRef.current && typeof rfApiRef.current.getNodes === 'function')
        ? rfApiRef.current.getNodes()
        : nodes;
      const positions = {};
      (liveNodes || []).forEach((n) => {
        const pos = (n && n.position) ? n.position : { x: 0, y: 0 };
        positions[String(n.id)] = { x: Number(pos.x) || 0, y: Number(pos.y) || 0 };
      });
      let viewport = null;
  try { viewport = rfApiRef.current?.getViewport?.() || null; } catch (e) {}
      prevPositionsRef.current = { positions, viewport };

      // Lazy-create worker
      if (!elkWorkerRef.current) {
        elkWorkerRef.current = new Worker(new URL('./workers/elkWorker.js', import.meta.url), { type: 'module' });
      }
      const worker = elkWorkerRef.current;

      // Get measured nodes (width/height) from React Flow if available, and ensure
      // helper nodes like marriagePoint are included even if not measured yet.
      const rfNodes = (rfApiRef.current && typeof rfApiRef.current.getNodes === 'function')
        ? rfApiRef.current.getNodes()
        : nodes.map(n => ({ ...n }));
      const rfNodeMap = new Map((rfNodes || []).map(n => [String(n.id), n]));
      const allNodeIds = new Set([...(rfNodes || []).map(n => String(n.id)), ...(nodes || []).map(n => String(n.id))]);
      const allNodesForLayout = Array.from(allNodeIds).map(id => {
        const snap = rfNodeMap.get(id) || (nodes || []).find(n => String(n.id) === id) || {};
        const w = Number.isFinite(snap.width) ? snap.width : 160;
        const h = Number.isFinite(snap.height) ? snap.height : 80;
        return { id, width: w, height: h };
      });

      const graph = {
        nodes: allNodesForLayout,
        // ELK requires both endpoints to exist as children; filter any dangling edges
        edges: (edges || [])
          .filter(e => allNodeIds.has(String(e.source)) && allNodeIds.has(String(e.target)))
          // Only include hierarchical edges in layout (parent/child and marriage edges)
          .filter(e => {
            const t = String(e?.data?.type || e?.label || 'custom').toLowerCase();
            return t === 'parent' || t === 'child';
          })
          .map(e => ({
            id: String(e.id || `${e.source}-${e.target}`),
            source: String(e.source),
            target: String(e.target),
            // pass type for port-side mapping
            type: String(e?.data?.type || e?.label || 'custom'),
          })),
        // Provide in-layer constraints: sibling ordering and spouse grouping/order
        orderConstraints: (() => {
          try {
            const memById = new Map((members || []).map(m => [String(m._id), m]));
            const toConstraints = [];

            // 1) Sibling groups under each marriage node (children of m-...)
            const byMarriage = new Map();
            for (const ed of (edges || [])) {
              if (String(ed?.data?.type || '').toLowerCase() !== 'child') continue;
              const src = String(ed.source || '');
              const tgt = String(ed.target || '');
              if (src.startsWith('m-')) {
                if (!byMarriage.has(src)) byMarriage.set(src, new Set());
                byMarriage.get(src).add(tgt);
              }
            }
            for (const [, set] of byMarriage.entries()) {
              const ids = Array.from(set);
              if (ids.length <= 1) continue;
              ids.sort((a, b) => {
                const A = memById.get(String(a)) || {};
                const B = memById.get(String(b)) || {};
                const da = A.dob ? new Date(A.dob).getTime() : NaN;
                const db = B.dob ? new Date(B.dob).getTime() : NaN;
                if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
                const na = (A.name || '').localeCompare?.(B.name || '') || 0;
                if (na) return na;
                const ca = A.createdAt ? new Date(A.createdAt).getTime() : NaN;
                const cb = B.createdAt ? new Date(B.createdAt).getTime() : NaN;
                if (Number.isFinite(ca) && Number.isFinite(cb) && ca !== cb) return ca - cb;
                return String(a).localeCompare(String(b));
              });
              toConstraints.push({ type: 'SAME_LAYER', ids });
              toConstraints.push({ type: 'ORDER', ids });
            }

            // 1b) Fallback: Sibling groups by shared parent when no marriage point
            // Build children lists from member relationships to capture single-parent families
            const childrenByParent = new Map(); // parentId -> Set(childIds)
            for (const [mid, m] of memById.entries()) {
              for (const r of (m.relationships || [])) {
                if (String(r?.type) !== 'child') continue;
                const childId = String((r?.relative && r.relative._id) || r?.relative || '');
                if (!childId) continue;
                // only consider nodes present on the canvas
                if (!allNodeIds.has(childId)) continue;
                if (!childrenByParent.has(mid)) childrenByParent.set(mid, new Set());
                childrenByParent.get(mid).add(childId);
              }
            }
            for (const [, set] of childrenByParent.entries()) {
              const ids = Array.from(set).filter(id => allNodeIds.has(id));
              if (ids.length <= 1) continue;
              ids.sort((a, b) => {
                const A = memById.get(String(a)) || {};
                const B = memById.get(String(b)) || {};
                const da = A.dob ? new Date(A.dob).getTime() : NaN;
                const db = B.dob ? new Date(B.dob).getTime() : NaN;
                if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
                const na = (A.name || '').localeCompare?.(B.name || '') || 0;
                if (na) return na;
                const ca = A.createdAt ? new Date(A.createdAt).getTime() : NaN;
                const cb = B.createdAt ? new Date(B.createdAt).getTime() : NaN;
                if (Number.isFinite(ca) && Number.isFinite(cb) && ca !== cb) return ca - cb;
                return String(a).localeCompare(String(b));
              });
              toConstraints.push({ type: 'SAME_LAYER', ids });
              toConstraints.push({ type: 'ORDER', ids });
            }

            // 2) Spouse pairs: SAME_LAYER and a deterministic ORDER
            const spousePairs = new Set();
            for (const ed of (edges || [])) {
              if (String(ed?.data?.type || '').toLowerCase() !== 'spouse') continue;
              const a = String(ed.source || '');
              const b = String(ed.target || '');
              if (!allNodeIds.has(a) || !allNodeIds.has(b)) continue;
              const key = a < b ? `${a}|${b}` : `${b}|${a}`;
              spousePairs.add(key);
            }
            for (const key of spousePairs) {
              const [a, b] = key.split('|');
              const ma = memById.get(a) || {};
              const mb = memById.get(b) || {};
              // Deterministic order: by name, fallback to id
              const order = ((ma.name || '').localeCompare?.(mb.name || '') || 0) <= 0 ? [a, b] : [b, a];
              toConstraints.push({ type: 'SAME_LAYER', ids: [a, b] });
              toConstraints.push({ type: 'ORDER', ids: order });
            }

            // 3) Sibling components from explicit sibling edges (works even without parents/marriage)
            const adj = new Map(); // id -> Set(id)
            for (const ed of (edges || [])) {
              if (String(ed?.data?.type || '').toLowerCase() !== 'sibling') continue;
              const a = String(ed.source || '');
              const b = String(ed.target || '');
              if (!allNodeIds.has(a) || !allNodeIds.has(b)) continue;
              if (!adj.has(a)) adj.set(a, new Set());
              if (!adj.has(b)) adj.set(b, new Set());
              adj.get(a).add(b);
              adj.get(b).add(a);
            }
            const visited = new Set();
            for (const v of adj.keys()) {
              if (visited.has(v)) continue;
              const comp = [];
              const stack = [v];
              visited.add(v);
              while (stack.length) {
                const u = stack.pop();
                comp.push(u);
                for (const w of (adj.get(u) || [])) {
                  if (visited.has(w)) continue;
                  visited.add(w);
                  stack.push(w);
                }
              }
              if (comp.length > 1) {
                comp.sort((a, b) => {
                  const A = memById.get(String(a)) || {};
                  const B = memById.get(String(b)) || {};
                  const da = A.dob ? new Date(A.dob).getTime() : NaN;
                  const db = B.dob ? new Date(B.dob).getTime() : NaN;
                  if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
                  const na = (A.name || '').localeCompare?.(B.name || '') || 0;
                  if (na) return na;
                  const ca = A.createdAt ? new Date(A.createdAt).getTime() : NaN;
                  const cb = B.createdAt ? new Date(B.createdAt).getTime() : NaN;
                  if (Number.isFinite(ca) && Number.isFinite(cb) && ca !== cb) return ca - cb;
                  return String(a).localeCompare(String(b));
                });
                toConstraints.push({ type: 'SAME_LAYER', ids: comp });
                toConstraints.push({ type: 'ORDER', ids: comp });
              }
            }

            return toConstraints;
          } catch { return []; }
        })(),
      };

      // Dev-only diagnostics to verify layout inputs
      try {
        if (import.meta?.env?.MODE !== 'production') {
          const marriageCount = Array.from(allNodeIds).filter(id => id.startsWith('m-')).length;
          // eslint-disable-next-line no-console
          console.info('[AutoLayout] nodes:', graph.nodes.length, 'marriages:', marriageCount, 'hierEdges:', graph.edges.length);
        }
      } catch {}

      const options = {
        direction: 'DOWN',
        nodePlacement: 'NETWORK_SIMPLEX',
        edgeRouting: 'POLYLINE',
        spacingNodeNode: 56,
        spacingBetweenLayers: 100,
        spacingEdgeNodeBetweenLayers: 24,
        defaultNodeWidth: 160,
        defaultNodeHeight: 80,
      };

      const layoutPositions = await new Promise((resolve, reject) => {
        const onMsg = (ev) => {
          const data = ev?.data || {};
          if (data.type !== 'layout-result') return;
          worker.removeEventListener('message', onMsg);
          if (data.error) reject(new Error(data.error));
          else resolve(data.positions || {});
        };
        worker.addEventListener('message', onMsg);
        worker.postMessage({ type: 'layout', graph, options });
      });

      // Post-process: generation inference + vertical leveling
      try {
        const memById = new Map((members || []).map(m => [String(m._id), m]));
        // Infer missing generation values from parent/child edges (parent = source, child = target)
        const genMap = new Map();
        for (const [id, m] of memById.entries()) {
          const g = Number(m?.generation);
          if (Number.isFinite(g)) genMap.set(String(id), g);
        }
        const pcPairs = [];
        for (const ed of (graph.edges || [])) {
          const t = String(ed?.type || '').toLowerCase();
          if (t !== 'child') continue;
          const p = String(ed.source);
          const c = String(ed.target);
          if (p.startsWith('m-') || c.startsWith('m-')) continue;
          pcPairs.push([p, c]);
        }
        let changed = true, rounds = 0;
        while (changed && rounds++ < 10) {
          changed = false;
          for (const [p, c] of pcPairs) {
            const gp = genMap.get(p);
            const gc = genMap.get(c);
            if (gp != null && gc == null) { genMap.set(c, gp + 1); changed = true; }
            else if (gp == null && gc != null) { genMap.set(p, gc - 1); changed = true; }
          }
        }
        const hierDegree = new Map(); // nodeId -> count of hierarchical edges (parent/child) touching it
        (graph.edges || []).forEach(ed => {
          const s = String(ed.source);
          const t = String(ed.target);
          hierDegree.set(s, (hierDegree.get(s) || 0) + 1);
          hierDegree.set(t, (hierDegree.get(t) || 0) + 1);
        });
        // Compute anchored Y per generation from nodes that participate in hierarchy
        const yByGen = new Map(); // gen -> array of y
        for (const [id, pos] of Object.entries(layoutPositions)) {
          if (String(id).startsWith('m-')) continue; // skip marriage helpers
          const deg = hierDegree.get(String(id)) || 0;
          if (deg <= 0) continue;
          const memGen = Number(memById.get(String(id))?.generation);
          const gen = Number.isFinite(memGen) ? memGen : (genMap.has(String(id)) ? genMap.get(String(id)) : NaN);
          if (!Number.isFinite(gen)) continue;
          if (!yByGen.has(gen)) yByGen.set(gen, []);
          yByGen.get(gen).push(Number(pos.y) || 0);
        }
        const anchoredY = new Map(); // gen -> median y
        for (const [gen, arr] of yByGen.entries()) {
          const sorted = arr.slice().sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          const val = sorted.length ? (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) : undefined;
          if (Number.isFinite(val)) anchoredY.set(gen, val);
        }
        // If no anchored value for a generation, optionally derive from nearest known generation
        const knownGens = Array.from(anchoredY.keys()).sort((a, b) => a - b);
        function nearestAnchored(gen) {
          if (!knownGens.length || !Number.isFinite(gen)) return undefined;
          let best = knownGens[0];
          let bestDist = Math.abs(gen - best);
          for (const g of knownGens) {
            const d = Math.abs(gen - g);
            if (d < bestDist) { best = g; bestDist = d; }
          }
          return anchoredY.get(best);
        }
        // Adjust orphan siblings (no hier edges) to their generation's anchored Y
        let orphanAdjusted = 0;
        for (const [id, pos] of Object.entries(layoutPositions)) {
          if (String(id).startsWith('m-')) continue; // skip helpers
          const deg = hierDegree.get(String(id)) || 0;
          if (deg > 0) continue; // already anchored by hierarchy
          const memGen2 = Number(memById.get(String(id))?.generation);
          const gen = Number.isFinite(memGen2) ? memGen2 : (genMap.has(String(id)) ? genMap.get(String(id)) : NaN);
          const y = anchoredY.has(gen) ? anchoredY.get(gen) : nearestAnchored(gen);
          if (Number.isFinite(y)) {
            layoutPositions[String(id)] = { ...pos, y };
            orphanAdjusted += 1;
          }
        }
        if (import.meta?.env?.MODE !== 'production' && orphanAdjusted > 0) {
          try { console.info('[AutoLayout] sibling-only nodes adjusted to generation rows:', orphanAdjusted); } catch {}
        }
        
        // 2) Level spouses to same horizontal Y, favoring the anchored partner
        try {
          for (const ed of (edges || [])) {
            if (String(ed?.data?.type || '').toLowerCase() !== 'spouse') continue;
            const a = String(ed.source || '');
            const b = String(ed.target || '');
            const pa = layoutPositions[a];
            const pb = layoutPositions[b];
            if (!pa || !pb) continue;
            const aAnch = (hierDegree.get(a) || 0) > 0;
            const bAnch = (hierDegree.get(b) || 0) > 0;
            if (aAnch && !bAnch) {
              layoutPositions[b] = { ...pb, y: pa.y };
            } else if (!aAnch && bAnch) {
              layoutPositions[a] = { ...pa, y: pb.y };
            } else if (!aAnch && !bAnch) {
              // Neither anchored: try generation anchor, else equalize to average
              const ga = Number(memById.get(a)?.generation);
              const gb = Number(memById.get(b)?.generation);
              const ya = anchoredY.has(ga) ? anchoredY.get(ga) : nearestAnchored(ga);
              const yb = anchoredY.has(gb) ? anchoredY.get(gb) : nearestAnchored(gb);
              const y = Number.isFinite(ya) ? ya : (Number.isFinite(yb) ? yb : ((pa.y + pb.y) / 2));
              if (Number.isFinite(y)) {
                layoutPositions[a] = { ...pa, y };
                layoutPositions[b] = { ...pb, y };
              }
            }
          }
        } catch {}

  // 3) Level sibling components to a common Y (consistent row), using anchored members or generation
        try {
          // Build sibling adjacency
          const adj = new Map();
          for (const ed of (edges || [])) {
            if (String(ed?.data?.type || '').toLowerCase() !== 'sibling') continue;
            const u = String(ed.source || '');
            const v = String(ed.target || '');
            if (!layoutPositions[u] || !layoutPositions[v]) continue;
            if (!adj.has(u)) adj.set(u, new Set());
            if (!adj.has(v)) adj.set(v, new Set());
            adj.get(u).add(v); adj.get(v).add(u);
          }
          const visited = new Set();
          for (const start of adj.keys()) {
            if (visited.has(start)) continue;
            // Collect component
            const comp = [];
            const stack = [start];
            visited.add(start);
            while (stack.length) {
              const u = stack.pop();
              comp.push(u);
              for (const w of (adj.get(u) || [])) {
                if (visited.has(w)) continue;
                visited.add(w);
                stack.push(w);
              }
            }
            if (comp.length <= 1) continue;
            // Determine anchor Y for this component
            const anchoredYs = comp
              .filter(id => (hierDegree.get(id) || 0) > 0)
              .map(id => layoutPositions[id]?.y)
              .filter(y => Number.isFinite(y));
            let yComp;
            if (anchoredYs.length) {
              const sorted = anchoredYs.slice().sort((a, b) => a - b);
              yComp = sorted[Math.floor(sorted.length / 2)];
            } else {
              // fallback to generation anchor of most members
              const genCounts = new Map();
              for (const id of comp) {
                const mg = Number(memById.get(id)?.generation);
                const g = Number.isFinite(mg) ? mg : (genMap.has(id) ? genMap.get(id) : NaN);
                if (!Number.isFinite(g)) continue;
                genCounts.set(g, (genCounts.get(g) || 0) + 1);
              }
              const gens = Array.from(genCounts.entries()).sort((a, b) => b[1] - a[1]);
              if (gens.length) {
                const g = gens[0][0];
                yComp = anchoredY.has(g) ? anchoredY.get(g) : nearestAnchored(g);
              }
            }
            if (!Number.isFinite(yComp)) continue;
            // Apply to unanchored nodes in component
            for (const id of comp) {
              if ((hierDegree.get(id) || 0) > 0) continue;
              const pos = layoutPositions[id];
              if (!pos) continue;
              layoutPositions[id] = { ...pos, y: yComp };
            }
          }
        } catch {}

        // 4) Horizontal spacing for siblings and children (prevent stacking/overlap)
        function enforceMinGap(ids, minGap = 64, anchorX) {
          const items = ids
            .map(id => ({ id, x: layoutPositions[id]?.x ?? 0, w:  (Number.isFinite(rfNodeMap.get(id)?.width) ? rfNodeMap.get(id).width : 160) }))
            .filter(it => layoutPositions[it.id]);
          if (items.length <= 1) return;
          items.sort((a, b) => a.x - b.x);
          // Make a first pass spacing to ensure min gaps
          let cursorRight = items[0].x + items[0].w;
          for (let i = 1; i < items.length; i++) {
            const it = items[i];
            const desiredLeft = Math.max(it.x, cursorRight + minGap);
            const dx = desiredLeft - it.x;
            if (dx !== 0) {
              const p = layoutPositions[it.id];
              layoutPositions[it.id] = { ...p, x: p.x + dx };
            }
            cursorRight = (layoutPositions[it.id].x) + it.w;
          }
          if (Number.isFinite(anchorX)) {
            const left = Math.min(...items.map(it => layoutPositions[it.id].x));
            const right = Math.max(...items.map(it => layoutPositions[it.id].x + it.w));
            const center = (left + right) / 2;
            const shift = anchorX - center;
            if (shift && Number.isFinite(shift)) {
              for (const it of items) {
                const p = layoutPositions[it.id];
                layoutPositions[it.id] = { ...p, x: p.x + shift };
              }
            }
          }
        }

        // 4a) Space sibling components
        try {
          const adj2 = new Map();
          for (const ed of (edges || [])) {
            if (String(ed?.data?.type || '').toLowerCase() !== 'sibling') continue;
            const u = String(ed.source || '');
            const v = String(ed.target || '');
            if (!layoutPositions[u] || !layoutPositions[v]) continue;
            if (!adj2.has(u)) adj2.set(u, new Set());
            if (!adj2.has(v)) adj2.set(v, new Set());
            adj2.get(u).add(v); adj2.get(v).add(u);
          }
          const vis2 = new Set();
          for (const s of adj2.keys()) {
            if (vis2.has(s)) continue;
            const comp = [];
            const st = [s]; vis2.add(s);
            while (st.length) {
              const u = st.pop();
              comp.push(u);
              for (const w of (adj2.get(u) || [])) {
                if (vis2.has(w)) continue;
                vis2.add(w); st.push(w);
              }
            }
            if (comp.length > 1) enforceMinGap(comp, 72);
          }
        } catch {}

        // 4b) Space children under each marriage point and center around marriage
        try {
          const byMarriage2 = new Map();
          for (const ed of (edges || [])) {
            if (String(ed?.data?.type || '').toLowerCase() !== 'child') continue;
            const src = String(ed.source || '');
            const tgt = String(ed.target || '');
            if (!src.startsWith('m-')) continue;
            if (!layoutPositions[src] || !layoutPositions[tgt]) continue;
            if (!byMarriage2.has(src)) byMarriage2.set(src, new Set());
            byMarriage2.get(src).add(tgt);
          }
          for (const [m, set] of byMarriage2.entries()) {
            const kids = Array.from(set);
            if (kids.length <= 1) continue;
            const anchorX = layoutPositions[m]?.x;
            enforceMinGap(kids, 64, anchorX);
          }
        } catch {}
      } catch {}

      // Apply positions to current nodes
      setNodes(prev => prev.map(n => {
        const p = layoutPositions[String(n.id)];
        return p ? { ...n, position: { x: p.x, y: p.y } } : n;
      }));

      // After applying layout, adjust edge handles based on new positions
      try {
        setEdges(prev => {
          const updated = prev.map(e => {
            const t = String(e?.data?.type || '').toLowerCase();
            const sp = layoutPositions[String(e.source)];
            const tp = layoutPositions[String(e.target)];
            if (!sp || !tp) return e;
            if (t === 'spouse' || t === 'sibling') {
              const dx = (tp.x || 0) - (sp.x || 0);
              const srcRight = dx >= 0;
              const sourceHandle = `${srcRight ? 'right' : 'left'}-source`;
              const targetHandle = `${srcRight ? 'left' : 'right'}-target`;
              if (e.sourceHandle === sourceHandle && e.targetHandle === targetHandle) return e;
              return { ...e, sourceHandle, targetHandle };
            }
            if (t === 'child') {
              const sourceHandle = 'bottom-source';
              const targetHandle = 'top-target';
              if (e.sourceHandle === sourceHandle && e.targetHandle === targetHandle) return e;
              return { ...e, sourceHandle, targetHandle };
            }
            return e;
          });
          return updated;
        });
      } catch (e) { /* ignore handle adjust errors */ }

      // Optionally fit view after layout
  try { rfApiRef.current?.fitView?.({ padding: 0.1 }); } catch (e) {}

      setLayoutActive(true);
      setLayoutBusy(false);
      showToast('Auto layout applied');
    } catch (err) {
      setLayoutBusy(false);
      showToast(`Layout failed: ${err?.message || err}`);
    }
  }

  // CANVAS WORKFLOW: Add a basic visual node (not creating a member in DB)
  async function handleAddPersonAt(position) {
    if (!treeId) return alert('Create a tree first.');
    try {
      const name = nextAvailablePersonName();
      const idx = nodes.length;
      const pos = position && typeof position.x === 'number' && typeof position.y === 'number'
        ? position
        : fallbackPosForIndex(idx);
      const created = await Members.create({ tree: treeId, name, position: pos });
      if (created?._id) {
        // created successfully
      }
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
  // reload to get up-to-date member object for toast
  const refreshed = (await Trees.get(treeId)).members.find(m => String(m._id) === String(member._id));
  showToast(`${displayMemberName(refreshed || member)} added to canvas`);
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
      const mem = members.find(m => String(m._id) === String(memberId));
      showToast(`${displayMemberName(mem)} added to canvas`);
    } catch (e) {
      showToast(`Failed to drop member: ${e.message}`);
    }
  }

  const [relPicker, setRelPicker] = useState({ open: false, source: '', target: '', sourceHandle: '', targetHandle: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [previewEdge, setPreviewEdge] = useState(null);

  // Debug: log when modal state changes to verify wiring in the UI
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[UI Debug] MemberModal open =', modalOpen, 'selectedId =', selectedId);
  }, [modalOpen, selectedId]);

  async function handleConnectEdge(params) {
    if (!treeId) return;
    console.log(`[handleConnectEdge] Connection initiated: ${params.source} (${params.sourceHandle}) -> ${params.target} (${params.targetHandle})`);

    // Helper: compute current parent ids for a given child id using loaded `members`, and
    // also by inspecting the current `edges` and `nodes` (covers marriage-point virtual edges).
    function getParentIdsFromMembers(childId) {
      const ids = new Set();
      if (!childId) return ids;
      const childStr = String(childId);

      // 1) Parents recorded on other members as rel.type === 'parent'
      for (const m of members || []) {
        for (const r of m.relationships || []) {
          try {
            const relId = String((r.relative && r.relative._id) || r.relative);
            if (r.type === 'parent' && relId === childStr) ids.add(String(m._id));
          } catch (e) {
            // ignore
          }
        }
      }

      // 2) Reciprocal entries on the child (type === 'child')
      const child = (members || []).find((m) => String(m._id) === childStr);
      if (child) {
        for (const r of child.relationships || []) {
          try {
            if (r.type === 'child') ids.add(String((r.relative && r.relative._id) || r.relative));
          } catch (e) {}
        }
      }

      // 3) Inspect current edges: find edges whose target is the child
      //    - If source is a marriage point (id starts with 'm-'), collect its parents from nodes
      //    - If edge.data.type === 'parent' or markerEnd exists and points to child, treat source as parent
      try {
        for (const ed of edges || []) {
          try {
            if (String(ed.target) !== childStr) continue;
            const src = String(ed.source || '');
            if (src.startsWith('m-')) {
              // find marriage node to extract parents
              const mp = (nodes || []).find(n => String(n.id) === src);
              const mpParents = mp?.data?.parents || [];
              for (const p of mpParents) ids.add(String(p));
            } else {
              const t = String((ed.data && ed.data.type) || '').toLowerCase();
              if (t === 'parent') {
                ids.add(src);
              } else if (ed.markerEnd) {
                // If edge has a markerEnd (arrow at target), interpret as direction -> target
                ids.add(src);
              }
            }
          } catch (e) { /* ignore per-edge errors */ }
        }
      } catch (e) {
        // ignore
      }

      return ids;
    }

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
  const validationFailures = [];
        // Pre-check: if the target already has two parents, and adding any of these parents
        // would increase the count above 2, block early to avoid unnecessary server calls.
        try {
          const existingParentIds = getParentIdsFromMembers(tgt);
          // Count how many of the marriage parents are new
          const newParentCandidates = (parents || []).filter(p => !existingParentIds.has(String(p)));
          if (existingParentIds.size + newParentCandidates.length > 2) {
            showToast('Cannot add child relationship(s): target already has two parents');
            return;
          }
        } catch (e) {
          // ignore pre-check errors and proceed to server validation
        }
        for (const parentId of parents) {
          // skip self-connections
          if (String(parentId) === tgt) continue;

          // Skip if an explicit child relationship already exists between this parent and the target
          const parentMember = members.find(m => String(m._id) === String(parentId));
          const already = (parentMember?.relationships || []).some(r => String((r.relative && r.relative._id) || r.relative) === String(tgt) && r.type === 'child');
          if (already) continue;

          // validate on server before queuing
          try {
            const v = await Relationships.validate({ fromMemberId: parentId, toMemberId: tgt, type: 'child' });
            if (!v.ok) {
              validationFailures.push({ parentId, errors: v.errors || [], ruleIds: v.ruleIds || [] });
              continue;
            }
            if (v.warnings && v.warnings.length) {
              showToast(`Warning for ${parentId} -> ${tgt}: ${v.warnings.join('; ')}`);
            }
            // mark as authored so layout/visualization preserves the direction as entered by the user
            ops.push(Relationships.create({ fromMemberId: parentId, toMemberId: tgt, type: 'child', label: 'child', authored: true }));
          } catch (ve) {
            validationFailures.push({ parentId, errors: [ve.message], ruleIds: [] });
          }
        }

        if (!ops.length) {
          if (validationFailures.length) {
            // Attempt an ultra-compact, human-friendly summary
            const membersById = new Map((members || []).map(m => [String(m._id), m]));
            const childName = membersById.get(String(tgt))?.name || String(tgt);

            // If all failures contain the specific topology rule 'no-grandchild-as-child', aggregate into one sentence
            const failuresWithRule = validationFailures.filter(f => (f.ruleIds || []).includes('no-grandchild-as-child'));
            if (failuresWithRule.length === validationFailures.length && failuresWithRule.length > 0) {
              const parentNames = failuresWithRule.map(f => membersById.get(String(f.parentId))?.name || String(f.parentId));
              const uniqueParents = Array.from(new Set(parentNames));
              const parentsStr = uniqueParents.length === 1 ? uniqueParents[0] : uniqueParents.join(' and ');
              showToast(`Cannot add child relationship(s): ${childName} is already a grandchild of ${parentsStr} via existing connections.`);
              return;
            }

            // Fallback: collapse repetitive affinal messages and show parent names instead of IDs
            const collapse = (errs) => {
              const seen = new Set();
              const out = [];
              for (const e of errs) {
                const key = /spouse of .* \(an ancestor/.test(e) ? 'AFFINAL_ANCESTOR' : e;
                if (key === 'AFFINAL_ANCESTOR') {
                  if (!seen.has(key)) { out.push('Blocked due to ancestor hierarchy (affinal relationship).'); seen.add(key); }
                } else {
                  // Trim verbose prefixes like "Cannot set X as child of Y: "
                  const m = e.match(/^Cannot set .*? as child of .*?:\s*(.*)$/i);
                  out.push(m ? m[1] : e);
                }
              }
              return out;
            };
            const msg = validationFailures.map(f => {
              const parentName = membersById.get(String(f.parentId))?.name || String(f.parentId);
              const collapsed = collapse(f.errors || []);
              // Show only first error and summarize remainder
              if (collapsed.length > 1) {
                return `${parentName}: ${collapsed[0]} (+${collapsed.length - 1} more)`;
              }
              return `${parentName}: ${collapsed[0] || 'Blocked'}`;
            }).join(' | ');
            showToast(`Cannot add child relationship(s): ${msg}`);
          } else {
            showToast('No new child relationships to add');
          }
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
    // Note: do not pre-block here — allow user to choose relationship type (spouse/sibling/parent)
    // and perform validation after selection. Server-side validation remains authoritative.
    setRelPicker({ open: true, source: params.source, target: params.target, sourceHandle: params.sourceHandle, targetHandle: params.targetHandle });
  }

  async function confirmRelationship(type, label) {
    try {
      console.log(`[confirmRelationship] Creating: ${relPicker.source} -> ${relPicker.target}, type=${type}, label=${label}`);
      // Pre-validate
      const v = await Relationships.validate({ fromMemberId: relPicker.source, toMemberId: relPicker.target, type });
      if (!v.ok) {
        showToast(`Validation failed: ${v.errors.join('; ')}`);
        return;
      }
      if (v.warnings && v.warnings.length) {
        showToast(`Note: ${v.warnings.join('; ')}`);
      }
      // Remove any preview once we commit (we'll show the real edge after reload)
      // Keeping the preview until after loadTree would avoid any single-frame overlap, but both are acceptable.
  // Mark user-created relationship as authored so the visual direction remains as the user specified
  await Relationships.create({ fromMemberId: relPicker.source, toMemberId: relPicker.target, type, label, authored: true });
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
        // Do not auto-rename on edit; allow duplicates but warn in the modal UI
        await Members.update(selectedId, form);
        showToast('Member updated');
      } else {
        // CREATING new member - NO position, goes to member pool
        // If no name provided, use an available Person N; otherwise, accept name as-is (duplicates allowed)
        const incomingName = (form?.name ?? '').trim();
        const name = incomingName || nextAvailablePersonName();
        await Members.create({ tree: treeId, ...form, name });
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
    const memberName = member ? displayMemberName(member) : 'this member';
    
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
        try {
          if (treeId) {
            // Persist marriage point position to tree metadata
            await Trees.updateMarriagePoint(treeId, { id: node.id, position: { x, y } });
            console.log('[handleNodeDragStop] Marriage point position persisted to server');
          }
        } catch (e) {
          console.error('[handleNodeDragStop] Failed to persist marriage point position:', e?.message || e, e);
        }
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

  // (Removed) temporary node highlight feature

  // Expose a small router hook for the admin page so other scripts can update the app state
  useEffect(() => {
    // expose setter for legacy code but keep a local popstate handler below
    window.__app_setShowAdmin = setShowAdminPanel;
    // initialize from current pathname (any /admin/* route should open admin)
    setShowAdminPanel(window.location.pathname.startsWith('/admin'));
    return () => {
      try { delete window.__app_setShowAdmin; } catch (e) {}
    };
  }, []);

  // Use a React effect to handle browser navigation (back/forward)
  useEffect(() => {
    const onPop = (ev) => {
      try {
        const isAdmin = window.location.pathname.startsWith('/admin');
        if (!isAdmin && adminUnsaved) {
          const ok = window.confirm('You have unsaved admin changes. Leave without saving?');
          if (!ok) {
            // user cancelled navigation — push back to /admin
            history.pushState(null, '', '/admin');
            setShowAdminPanel(true);
            return;
          }
          // otherwise clear the flag and continue
          setAdminUnsaved(false);
        }
        setShowAdminPanel(isAdmin);
      } catch (e) {
        // best-effort: ensure admin panel visibility matches pathname
        setShowAdminPanel(window.location.pathname === '/admin');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [adminUnsaved]);

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
    // If this edge is parent->marriage (parent -> m-...), it's a visual helper: advise user and don't open editor
    if (String(edge?.target || '').startsWith('m-') && !String(edge?.source || '').startsWith('m-')) {
      showToast('Edit child relationships by clicking the marriage→child edge');
      return;
    }

    const type = edge?.data?.type || (String(edge?.id || '').split('-').pop() || 'custom');
    // Resolve the authoritative saved label for this logical relationship by
    // looking up the member.relationships entries in memory. Edge objects in the
    // renderer can be derived or bundled and may not include the persisted label.
    let label = '';
    try {
      const logicalFrom = edge?.data?.from || edge?.source;
      const logicalTo = edge?.data?.to || edge?.target;

      // Helper to normalize id strings
      const normalize = (v) => (v == null ? '' : String(v));
      const fromId = normalize(logicalFrom);
      const toId = normalize(logicalTo);

      // 1) Check relationships on the fromMember pointing to the toMember
      const fromMember = members.find(m => normalize(m._id) === fromId);
      if (fromMember) {
        const rel = (fromMember.relationships || []).find(r => normalize((r.relative && r.relative._id) || r.relative) === toId);
        if (rel && rel.label) label = rel.label;
      }

      // 2) If not found, check relationships on the toMember pointing to the fromMember
      if (!label) {
        const toMember = members.find(m => normalize(m._id) === toId);
        if (toMember) {
          const rel2 = (toMember.relationships || []).find(r => normalize((r.relative && r.relative._id) || r.relative) === fromId);
          if (rel2 && rel2.label) label = rel2.label;
        }
      }

      // 3) As a last resort, scan all members for any relationship record between the two ids
      if (!label) {
        for (const m of members) {
          const rel = (m.relationships || []).find(r => {
            const rid = normalize((r.relative && r.relative._id) || r.relative);
            return (rid === fromId && normalize(m._id) === toId) || (rid === toId && normalize(m._id) === fromId);
          });
          if (rel && rel.label) { label = rel.label; break; }
        }
      }
    } catch (err) {
      // ignore lookup errors and fallback below
    }
    if (!label) label = edge?.data?.label || edge?.label || '';

    // Debug logging to help trace label resolution when the editor opens.
    try {
      console.debug('[handleEdgeClick] edge:', edge);
      console.debug('[handleEdgeClick] resolved logicalFrom/to:', { logicalFrom: edge?.data?.from || edge?.source, logicalTo: edge?.data?.to || edge?.target });
      console.debug('[handleEdgeClick] lookup result labels:', { fromMemberLabel: (members.find(m => String(m._id) === String(edge?.data?.from || edge?.source))?.relationships || []).map(r => ({ type: r.type, label: r.label, relative: r.relative })) , finalLabel: label });
    } catch (err) {
      // swallow logging errors
    }
    // Use original logical direction for edit operations (from = data.from, to = data.to)
    const logicalFrom = edge?.data?.from || edge?.source;
    const logicalTo = edge?.data?.to || edge?.target;
    // include original edge reference so update/delete can special-case marriage->child edges
    setEdgeEditor({ open: true, source: logicalFrom, target: logicalTo, type, label, x: e.clientX, y: e.clientY, originalEdge: edge });
  }
  async function updateEdge(editor, newType, newLabel) {
    try {
      // Special-case: if the original edge was from a marriage point, update both parents' relationships
      const orig = editor.originalEdge;
      if (orig && String(orig.source || '').startsWith('m-')) {
        // find marriage node to get parents
        const marriageNode = nodes.find(n => String(n.id) === String(orig.source));
        const parents = marriageNode?.data?.parents || [];
        if (!parents.length) {
          showToast('No parents found for marriage point');
        } else {
          // Perform updates sequentially to avoid concurrent-modification/version conflicts
          let successCount = 0;
          for (const pid of parents) {
            try {
              const parentMember = members.find(m => String(m._id) === String(pid));
              const rel = (parentMember?.relationships || []).find(r => String((r.relative && r.relative._id) || r.relative) === String(editor.target));
              const existingType = rel?.type || 'child';
              if (!rel) {
                // nothing to update for this parent
                continue;
              }
              await Relationships.update({ fromMemberId: pid, toMemberId: editor.target, type: existingType, newType: existingType, label: newLabel });
              successCount++;
            } catch (e) {
              const msg = (e && e.message) || String(e || '');
              if (msg.includes('No matching document') || msg.includes('version')) {
                // Reload tree and retry this single parent once
                try {
                  await loadTree(treeId);
                  const parentMember2 = members.find(m => String(m._id) === String(pid));
                  const rel2 = (parentMember2?.relationships || []).find(r => String((r.relative && r.relative._id) || r.relative) === String(editor.target));
                  const existingType2 = rel2?.type || 'child';
                  if (rel2) await Relationships.update({ fromMemberId: pid, toMemberId: editor.target, type: existingType2, newType: existingType2, label: newLabel });
                } catch (err2) {
                  console.error('[updateEdge] retry update failed for parent', pid, err2);
                }
              } else {
                console.error('[updateEdge] update failed for parent', pid, e);
              }
            }
          }
          setEdgeEditor({ open: false, source: '', target: '', type: 'custom', label: '', x: 0, y: 0, originalEdge: null });
          await loadTree(treeId);
          if (successCount > 0) showToast('Updated parent→child relationship label(s)');
          else showToast('No parent→child relationships were updated');
        }
        return;
      }

      // Default single-edge update
      await Relationships.update({ fromMemberId: editor.source, toMemberId: editor.target, type: editor.type, newType, label: newLabel });
      setEdgeEditor({ open: false, source: '', target: '', type: 'custom', label: '', x: 0, y: 0, originalEdge: null });
      await loadTree(treeId);
      showToast('Relationship updated');
    } catch (e) {
      showToast(`Update failed: ${e.message}`);
    }
  }
  async function deleteEdge(editor) {
    try {
      const orig = editor.originalEdge;
      if (orig && String(orig.source || '').startsWith('m-')) {
        // delete both parents' relationships to the child sequentially to avoid
        // concurrent-modification/version conflicts on member documents.
        const marriageNode = nodes.find(n => String(n.id) === String(orig.source));
        const parents = marriageNode?.data?.parents || [];
        if (!parents.length) {
          showToast('No parents found for marriage point');
        } else {
          for (const pid of parents) {
            try {
              const parentMember = members.find(m => String(m._id) === String(pid));
              const rel = (parentMember?.relationships || []).find(r => String((r.relative && r.relative._id) || r.relative) === String(editor.target));
              const existingType = rel?.type || 'child';
              if (!rel) {
                // nothing to delete for this parent
                continue;
              }
              await Relationships.remove({ fromMemberId: pid, toMemberId: editor.target, type: existingType });
            } catch (e) {
              // If we hit a 'No matching document' / version conflict, try refreshing the tree
              // and attempt to remove again for this parent once.
              const msg = (e && e.message) || String(e || '');
              if (msg.includes('No matching document') || msg.includes('version')) {
                try {
                  await loadTree(treeId);
                  // re-resolve parent and relationship after reload
                  const parentMember2 = members.find(m => String(m._id) === String(pid));
                  const rel2 = (parentMember2?.relationships || []).find(r => String((r.relative && r.relative._id) || r.relative) === String(editor.target));
                  const existingType2 = rel2?.type || 'child';
                  if (rel2) await Relationships.remove({ fromMemberId: pid, toMemberId: editor.target, type: existingType2 });
                } catch (err2) {
                  console.error('[deleteEdge] retry delete failed for parent', pid, err2);
                }
              } else {
                console.error('[deleteEdge] remove failed for parent', pid, e);
              }
            }
          }
          setEdgeEditor({ open: false, source: '', target: '', type: 'custom', label: '', x: 0, y: 0, originalEdge: null });
          await loadTree(treeId);
          showToast('Relationship(s) deleted');
        }
        return;
      }

      await Relationships.remove({ fromMemberId: editor.source, toMemberId: editor.target, type: editor.type });
      setEdgeEditor({ open: false, source: '', target: '', type: 'custom', label: '', x: 0, y: 0, originalEdge: null });
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
      // If we have a React Flow instance, fitView first so all nodes/edges are visible in the export
      const inst = rfApiRef.current;
      let prevViewport = null;
      try {
        if (inst && typeof inst.getViewport === 'function') {
          prevViewport = inst.getViewport();
        }
      } catch (err) {}

      try {
        if (inst && typeof inst.fitView === 'function') {
          inst.fitView({ padding: 0.1 });
          // allow a short delay for layout/paint
          await new Promise(r => setTimeout(r, 180));
        }
      } catch (err) {
        // ignore
      }

      // Use SVG render path first (captures React Flow edges reliably), then rasterize to PNG
      const svgUrl = await htmlToImage.toSvg(exportRef.current, { backgroundColor: '#ffffff' });

      // Decide pixel ratio based on current viewport zoom so labels remain readable on large graphs
      const MIN_ZOOM = 0.12; // below this, increase pixel ratio
      const MAX_PIXEL_RATIO = 6; // do not exceed this to avoid insane memory usage
      let pixelRatio = 2;
      try {
        if (inst && typeof inst.getViewport === 'function') {
          const vp = inst.getViewport();
          const zoom = vp?.zoom || 1;
          if (zoom < MIN_ZOOM) {
            pixelRatio = Math.min(MAX_PIXEL_RATIO, Math.ceil(MIN_ZOOM / zoom) * 2);
          }
        }
      } catch (err) {
        // fallback to default pixelRatio
        pixelRatio = 2;
      }

      // Safety cap based on resulting raster size (browser canvas limits)
      const MAX_CANVAS_DIM = 16000; // conservative cap to avoid OOM or browser failures
      const tempImg = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = svgUrl;
      });
      const naturalW = tempImg.naturalWidth || tempImg.width || 0;
      const naturalH = tempImg.naturalHeight || tempImg.height || 0;
      if (naturalW > 0 && naturalH > 0) {
        const maxDim = Math.max(naturalW, naturalH);
        if (maxDim * pixelRatio > MAX_CANVAS_DIM) {
          const cap = Math.floor(MAX_CANVAS_DIM / maxDim) || 1;
          if (cap < pixelRatio) {
            showToast(`Large tree detected — reducing export resolution to ${cap}× to avoid browser limits`);
            pixelRatio = cap;
          }
        }
      }

      const pngUrl = await svgDataUrlToPng(svgUrl, pixelRatio);

      // Restore previous viewport if possible
      try {
        if (inst && prevViewport) {
          if (typeof inst.setViewport === 'function') {
            inst.setViewport(prevViewport, { duration: 0 });
          } else if (typeof inst.setCenter === 'function') {
            inst.setCenter(prevViewport.x, prevViewport.y, { duration: 0 });
            if (typeof inst.setViewport === 'undefined' && typeof inst.setCenter === 'function') {
              // best-effort: no zoom restore available
            }
          }
        }
      } catch (err) {
        // ignore restore errors
      }

      const link = document.createElement('a');
      link.download = makeFilename('png');
      link.href = pngUrl;
      link.click();
    } catch (e) {
      showToast('Export failed');
    }
  }

  // Soft-delete (archive) the currently selected tree (owner-only).
  async function handleDeleteTree() {
    if (!treeId) return;
    const title = treeMeta?.title || 'this tree';
    const confirmed = window.confirm(
      `Archive "${title}"?\n\nThis will soft-delete (archive) the tree. You can restore it later from Archived.`
    );
    if (!confirmed) return;
    try {
      await Trees.delete(treeId, false);
      // Clear UI state
      setTreeIdState('');
      setTreeId('');
      setNodes([]);
      setEdges([]);
      setMembers([]);
      setTreeMeta(null);
      await loadMyTrees();
      showToast('Tree archived');
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
  {!showAdminPanel && sidebarCollapsed && (
        <div
          onClick={() => setSidebarCollapsed(false)}
          onMouseEnter={() => setSlotHover(true)}
          onMouseLeave={() => setSlotHover(false)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSidebarCollapsed(false);
            }
          }}
          style={{
            width: slotHover ? 20 : 18,
            background: slotHover ? 'linear-gradient(to right,#e2e8f0,#ffffff)' : 'linear-gradient(to right,#f1f5f9,#ffffff)',
            borderRight: `1px solid ${slotHover ? '#cbd5e1' : '#e2e8f0'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'width 150ms ease, background-color 150ms ease, border-color 150ms ease'
          }}
          title="Expand sidebar"
        >
          <ChevronRightIcon style={{ width: 16, height: 16, color: '#475569', opacity: slotHover ? 0.85 : 0.6 }} />
        </div>
      )}
      {!showAdminPanel && !sidebarCollapsed && <Sidebar 
        onCheckApi={checkApi} 
        apiStatus={apiStatus}
        members={members}
        nodesOnCanvas={nodes.map(n => n.id)}
        onAddMemberToCanvas={handleAddMemberToCanvas}
        onSelectMember={(id) => { setSelectedId(id); setModalOpen(true); }}
        onDeleteMember={canEdit ? handleDeleteMember : undefined}
        onAddNewMember={openNewMemberModal}
        currentUser={currentUser}
  onOpenAdmin={() => { window.history.pushState(null, '', '/admin/trees'); setShowAdminPanel(true); }}
        canAddMember={!!(isAuthed && treeId && canEdit)}
        showToast={showToast}
        onCollapse={() => setSidebarCollapsed(true)}
      />}
  <main style={{ flex: 1, padding: '6px 12px 12px', display: showAdminPanel ? 'none' : 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.2 }}>Family Tree Builder</h1>
          {/* Right-aligned action bar (restored). Only change: email is positioned above the Logout button */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
            {isAuthed ? (
              <>
                {/* Keep original order of controls */}
                <button onClick={() => setCreateOpen(true)} style={{ padding: '6px 10px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none', flexShrink: 0 }}>Create Tree</button>
                <select value={treeId || ''} onChange={(e) => { const id = e.target.value; handleSelectTree(id); }} style={{ padding: 6 }}>
                  <option value="">Select a tree…</option>
                  {myTrees.map((t) => (
                    <option key={t._id} value={t._id}>{t.title}</option>
                  ))}
                </select>
                {isOwner && treeId && (
                  <button onClick={handleDeleteTree} title="Archive this tree" style={{ padding: '6px 10px', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none', flexShrink: 0 }}>Archive</button>
                )}
                {isAuthed && (
                  <button onClick={() => setArchivedOpen(true)} title="View archived trees" style={{ marginLeft: 6, padding: '6px 10px', borderRadius: 6, background: '#e2e8f0', color: '#111', border: '1px solid #cbd5e1', flexShrink: 0 }}>Archived</button>
                )}
                <button title="Refresh list" onClick={loadMyTrees} style={{ padding: '6px 10px', borderRadius: 6, background: '#e2e8f0', color: '#111', border: '1px solid #cbd5e1' }}>↻</button>
                <button onClick={() => setShowKinship(true)} disabled={!treeId || !members.length} style={{ padding: '6px 10px', borderRadius: 6, background: (treeId && members.length) ? '#6b7280' : '#94a3b8', color: '#fff', border: 'none' }}>Kinship</button>
                <button onClick={handleExportPng} disabled={!nodes.length} style={{ padding: '6px 10px', borderRadius: 6, background: nodes.length ? '#0ea5e9' : '#94a3b8', color: '#fff', border: 'none', flexShrink: 0 }}>Export PNG</button>
                {/* Logout group with email above, aligned right */}
                <div style={{ position: 'relative', display: 'inline-flex' }}>
                  <span style={{ position: 'absolute', right: 0, bottom: '100%', marginBottom: 2, color: '#1f2937', fontSize: 12 }}>{currentUser?.email}</span>
                  <button onClick={handleLogout} style={{ padding: '6px 10px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none' }}>Logout</button>
                </div>
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
          canAdd={!!(isAuthed && myTrees && myTrees.length > 0 && treeId && canEdit)}
          onConnect={isAuthed && canEdit ? handleConnectEdge : undefined}
          onNodeDoubleClick={handleSelectNode}
          onNodeDragStop={isAuthed && canEdit ? handleNodeDragStop : undefined}
          onEdgeDoubleClick={isAuthed && canEdit ? handleEdgeClick : undefined}
          onDropMember={isAuthed && canEdit ? handleDropMember : undefined}
          exportRef={exportRef}
          onRfReady={(inst) => { rfApiRef.current = inst; }}
          onAutoLayout={handleAutoLayout}
          layoutActive={layoutActive}
          layoutBusy={layoutBusy}
          controlsDisabled={!myTrees || myTrees.length === 0 || !treeId}
          showToast={showToast}
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
            allowTypeChange={!String(edgeEditor?.originalEdge?.source || '').startsWith('m-')}
            onUpdate={(newType, newLabel) => updateEdge(edgeEditor, newType, newLabel)}
            onDelete={() => deleteEdge(edgeEditor)}
            onClose={cancelEdgeEdit}
          />
        )}
        {/* Unified Add/Edit Modal */}
        <MemberModal
          open={modalOpen}
          member={selectedMember()}
          allMembers={members}
          onSave={(payload) => handleSaveMember(payload)}
          onClose={() => { closeMemberModal(); setSelectedId(''); }}
          canSave={!!(token && treeId && canEdit)}
          onDelete={canEdit ? (id) => handleDeleteMember(id, true) : undefined}
          onMoveToPool={canEdit ? (id) => handleDeleteMember(id, false) : undefined}
        />
        <ArchivedModal
          open={archivedOpen}
          onClose={() => setArchivedOpen(false)}
          onRestored={async (action) => {
            await loadMyTrees();
            if (action === 'requestedDelete') showToast('Delete requested — pending admin review');
            else showToast('Tree restored');
          }}
        />
        <CreateTreeModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(tree) => { handleTreeCreated(tree); }}
        />
        {toast && (
          <div style={{ position: 'fixed', right: 16, top: 16, background: '#111827', color: '#fff', padding: '10px 12px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.25)', zIndex: 99999 }}>
            {toast}
          </div>
        )}
        {/* AdminPanel is rendered as a sibling of <main> so it can take over the page when route is /admin */}
        {showKinship && (
          <KinshipPanel
            open={showKinship}
            onClose={() => setShowKinship(false)}
            members={members}
            treeId={treeId}
            canQuery={!!(token && treeId)}
          />
        )}
        {/* popstate is handled in a React effect to keep navigation and prompts inside React */}
        
      </main>
      {showAdminPanel && (
        <AdminPanel onClose={() => { window.history.back(); }} page adminUnsaved={adminUnsaved} setAdminUnsaved={setAdminUnsaved} />
      )}
    </div>
  );
}

export default App;
