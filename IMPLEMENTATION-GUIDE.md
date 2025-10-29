# Implementation Guide: Advanced Edge Connections

## � Document Status

**Current System**: Your application already has **smart multi-handle routing** implemented. This guide shows how to **add marriage points on top** of that foundation.

**Prerequisites**: 
- ✅ `FamilyNode` component with 8 handles (already implemented)
- ✅ Smart handle selection in `App.jsx` (already implemented)
- ✅ Color-coded edges by relationship type (already implemented)

**What This Guide Adds**:
- Virtual marriage point connector nodes
- Enhanced edge rendering with Bezier curves
- Automatic family unit detection

---

## �🚀 Quick Start Integration

This guide walks you through integrating the advanced edge connection system **on top of your existing smart handle implementation**.

---

## Phase 0: Current State Verification (15 minutes)

Before proceeding, verify your current implementation matches expectations:

### ✅ Checklist

1. **FamilyNode Component** (`client/src/components/FamilyNode.jsx`)
   - [ ] Has 8 Handle components (top, bottom, left, right × source/target)
   - [ ] Handles have distinct IDs (`top-source`, `bottom-target`, etc.)
   - [ ] Visual distinction (green borders for sources, black for targets)

2. **Smart Handle Selection** (`client/src/App.jsx` - `mapTreeToGraph()`)
   - [ ] Parent/Child relationships use vertical handles
   - [ ] Spouse/Sibling relationships use horizontal handles  
   - [ ] Position-aware routing (calculates dx/dy for optimal routing)

3. **Edge Deduplication** (`client/src/App.jsx`)
   - [ ] Bidirectional pairs collapsed to single edge
   - [ ] Prefers labeled edges over unlabeled
   - [ ] Prefers 'parent' type over 'child' type

4. **Color Coding**
   - [ ] RELATIONSHIP_COLORS constant defined
   - [ ] Edges styled with `stroke` and `markerEnd` colors

If all checks pass ✅, proceed to Phase 1. If any fail ❌, refer to [`CURRENT-IMPLEMENTATION-ANALYSIS.md`](./CURRENT-IMPLEMENTATION-ANALYSIS.md) to understand the current state.

---

## Phase 1: Foundation Setup (2-3 hours)

### Step 1: Install Dependencies

No new dependencies required! The implementation uses existing ReactFlow APIs.

### Step 2: Register Custom Components

Update `client/src/components/TreeBoard.jsx`:

```javascript
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  // ... existing imports
} from 'reactflow';
import FamilyNode from './FamilyNode'; // EXISTING import

// Add new imports
import FamilyEdge from './edges/FamilyEdge';
import MarriagePointNode from './nodes/MarriagePointNode';

// Update custom node types (ADD marriagePoint, KEEP familyNode)
const nodeTypes = {
  familyNode: FamilyNode,           // EXISTING - keep this!
  marriagePoint: MarriagePointNode,  // NEW - add this
};

// Add custom edge type
const edgeTypes = {
  default: FamilyEdge, // Replace default edge with custom
};

// In TreeBoard component, pass to ReactFlow:
<ReactFlow
  nodes={nodes}
  edges={edges}
  nodeTypes={nodeTypes}  // Now includes both familyNode and marriagePoint
  edgeTypes={edgeTypes}  // Now uses custom FamilyEdge
  // ... rest of props
>
```

### Step 3: Integrate Enhanced Graph Structure

**IMPORTANT**: Your existing `mapTreeToGraph()` function has sophisticated handle selection logic. We'll **enhance it** rather than replace it.

**Option A: Side-by-Side (Recommended for Testing)**
- Keep your existing `mapTreeToGraph()` function as `mapTreeToGraphV1()`
- Add new function `mapTreeToGraphV2()` using `graphStructure.js`
- Add toggle button to switch between versions
- Compare results before committing to new system

**Option B: Direct Integration (Production Ready)**
- Import `buildFamilyGraph` and `graphToReactFlow` from `graphStructure.js`
- Replace existing node/edge building logic with new functions
- Test thoroughly with existing trees before deploying

**Side-by-Side Implementation Example**:

```javascript
// client/src/App.jsx

// Add new imports
import { buildFamilyGraph, graphToReactFlow } from './utils/graphStructure.js';

// Keep your existing function (rename it)
function mapTreeToGraphV1(tree) {
  // ... your existing smart handle logic (100+ lines)
  // This becomes the fallback/legacy mode
}

// Add new function using marriage points
function mapTreeToGraphV2(tree) {
  // Step 1: Build enhanced graph with marriage points
  const familyGraph = buildFamilyGraph(tree.members);
  
  // Step 2: Convert to ReactFlow format
  const { nodes, edges } = graphToReactFlow(familyGraph, RELATIONSHIP_COLORS);
  
  return { n: nodes, e: edges, members: tree.members };
}

// Add state to track which version to use
const [useMarriagePoints, setUseMarriagePoints] = useState(false);

// Use in mapTreeToGraph caller
function mapTreeToGraph(tree) {
  return useMarriagePoints ? mapTreeToGraphV2(tree) : mapTreeToGraphV1(tree);
}
```

**Testing Toggle UI** (add to TreeBoard or App):
```jsx
<button onClick={() => setUseMarriagePoints(!useMarriagePoints)}>
  {useMarriagePoints ? '🔄 Switch to Legacy Mode' : '✨ Enable Marriage Points'}
</button>
```

---

**Option B: Direct Replacement** (once tested):

Replace the entire `mapTreeToGraph` function in `App.jsx`:

```javascript
import { buildFamilyGraph, graphToReactFlow, updateMarriagePointPositions } from './utils/graphStructure';

function mapTreeToGraph(tree) {
  const members = Array.isArray(tree.members) ? tree.members : [];
  
  // Filter members with positions (on canvas)
  const canvasMembers = members.filter(m => hasPosVal(m.position));
  
  console.log(`[mapTreeToGraph] Processing ${canvasMembers.length} canvas members`);
  
  // Build enhanced graph structure
  const graph = buildFamilyGraph(canvasMembers);
  
  // Extract existing positions
  const existingPositions = new Map();
  canvasMembers.forEach(m => {
    if (m.position) {
      existingPositions.set(String(m._id), m.position);
    }
  });
  
  // Convert to ReactFlow format
  let { nodes: n, edges: e } = graphToReactFlow(graph, existingPositions);
  
  // Update virtual node positions dynamically
  const virtualNodes = n.filter(node => node.type === 'marriagePoint');
  const memberNodes = n.filter(node => node.type !== 'marriagePoint');
  const updatedVirtualNodes = updateMarriagePointPositions(memberNodes, virtualNodes);
  
  // Merge updated virtual nodes back
  n = [...memberNodes, ...updatedVirtualNodes];
  
  console.log(`[mapTreeToGraph] Created ${n.length} nodes (${virtualNodes.length} virtual), ${e.length} edges`);
  
  return { n, e, members };
}
```

---

## Phase 2: Enhanced Edge Rendering (1-2 hours)

### Step 4: Update Edge Styling

The `FamilyEdge` component is already configured with:
- ✅ Color-coded edges by relationship type
- ✅ Smooth Bezier curves for parent-child
- ✅ Straight lines for spouses
- ✅ Orthogonal routing for virtual connectors
- ✅ Hover states and selection highlighting

### Step 5: Add Edge Color Legend

Update the toolbar in `TreeBoard.jsx` to reflect the new edge types:

```javascript
<span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: '#64748b' }}>
  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
    <div style={{ width: 14, height: 2, background: '#10b981', borderRadius: 1 }}></div>
    parent/child
  </span>
  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
    <div style={{ width: 14, height: 3, background: '#ec4899', borderRadius: 1 }}></div>
    spouse (bold)
  </span>
  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
    <div style={{ width: 14, height: 1, background: '#94a3b8', borderRadius: 1, opacity: 0.5 }}></div>
    connector (dashed)
  </span>
</span>
```

---

## Phase 3: Multi-Parent Connection Logic (2-3 hours)

### Step 6: Test Multi-Parent Scenario

Create a test family structure:

1. **Add two parent nodes**: "Parent A" and "Parent B"
2. **Connect them as spouses**: Draw edge from Parent A → Parent B, select "spouse"
3. **Add child node**: "Child C"
4. **Connect both parents to child**:
   - Parent A → Child C, select "parent"
   - Parent B → Child C, select "parent"

**Expected Result**: 
- Horizontal spouse edge between parents
- Virtual marriage point node appears
- Both parents connect to marriage point
- Marriage point connects to child
- Clean, organized visual flow

### Step 7: Handle Edge Updates on Node Movement

Add to `TreeBoard.jsx`:

```javascript
const handleNodeDragStop = useCallback((event, node) => {
  // Call original handler
  onNodeDragStop?.(event, node);
  
  // Force edge recalculation
  if (node.type !== 'marriagePoint') {
    // Update marriage point positions
    setNodes(currentNodes => {
      const memberNodes = currentNodes.filter(n => n.type !== 'marriagePoint');
      const virtualNodes = currentNodes.filter(n => n.type === 'marriagePoint');
      const updated = updateMarriagePointPositions(memberNodes, virtualNodes);
      return [...memberNodes, ...updated];
    });
  }
}, [onNodeDragStop]);
```

---

## Phase 4: Auto-Layout Integration (Optional, 3-4 hours)

### Step 8: Add Layout Button

Add to `TreeBoard.jsx` toolbar:

```javascript
import { applySugiyamaLayout } from '../utils/layouts/sugiyamaLayout';

// In component
const [layoutInProgress, setLayoutInProgress] = useState(false);

const applyAutoLayout = useCallback(() => {
  setLayoutInProgress(true);
  
  try {
    // Get current graph structure
    const graph = buildFamilyGraph(members.filter(m => hasPosVal(m.position)));
    
    // Apply Sugiyama layout
    const positions = applySugiyamaLayout(
      Array.from(graph.nodes.values()), 
      graph.familyUnits,
      {
        nodeWidth: 160,
        horizontalSpacing: 80,
        verticalSpacing: 160,
      }
    );
    
    // Update node positions
    setNodes(currentNodes => 
      currentNodes.map(node => {
        const pos = positions.get(node.id);
        if (pos && node.type !== 'marriagePoint') {
          return { ...node, position: { x: pos.x, y: pos.y } };
        }
        return node;
      })
    );
    
    // Persist positions to backend
    positions.forEach(async (pos, memberId) => {
      await Members.update(memberId, { position: { x: pos.x, y: pos.y } });
    });
    
    showToast('Auto-layout applied');
  } catch (error) {
    showToast('Layout failed: ' + error.message);
  } finally {
    setLayoutInProgress(false);
  }
}, [members, setNodes]);

// Add button to toolbar
<button 
  onClick={applyAutoLayout}
  disabled={!canAdd || layoutInProgress}
  style={{ 
    padding: '6px 10px', 
    borderRadius: 6, 
    background: layoutInProgress ? '#94a3b8' : '#8b5cf6', 
    color: '#fff', 
    border: 'none',
    cursor: layoutInProgress ? 'wait' : 'pointer',
  }}
>
  {layoutInProgress ? '⏳ Layouting...' : '🎨 Auto-Layout'}
</button>
```

---

## Phase 5: Validation & Error Prevention (1-2 hours)

### Step 9: Add Relationship Validation

Update `handleConnectEdge` in `App.jsx`:

```javascript
import { validateRelationship } from './utils/relationshipValidator';

function handleConnectEdge(params) {
  if (!treeId) return;
  
  // Get source and target members
  const sourceMember = members.find(m => String(m._id) === params.source);
  const targetMember = members.find(m => String(m._id) === params.target);
  
  if (!sourceMember || !targetMember) {
    showToast('Invalid connection');
    return;
  }
  
  // Pre-validate before showing relationship picker
  // We'll validate again when type is selected
  setRelPicker({ 
    open: true, 
    source: params.source, 
    target: params.target,
    sourceMember,
    targetMember,
  });
}

async function confirmRelationship(type, label) {
  try {
    // Validate relationship
    const validation = validateRelationship(
      relPicker.sourceMember,
      relPicker.target,
      type,
      members
    );
    
    if (!validation.valid) {
      showToast(`Cannot add relationship: ${validation.errors.join(', ')}`);
      return;
    }
    
    if (validation.warnings.length > 0) {
      const confirmed = window.confirm(
        `Warning:\n${validation.warnings.join('\n')}\n\nContinue anyway?`
      );
      if (!confirmed) return;
    }
    
    // Create relationship
    await Relationships.create({ 
      fromMemberId: relPicker.source, 
      toMemberId: relPicker.target, 
      type, 
      label 
    });
    
    setRelPicker({ open: false, source: '', target: '' });
    await loadTree(treeId);
    showToast('Relationship added');
  } catch (e) {
    showToast(`Add relationship failed: ${e.message}`);
  }
}
```

### Step 10: Add Max Parents Validation to Backend

Update `server/controllers/relationshipController.js`:

```javascript
export async function addRelationship(req, res) {
  try {
    const parsed = relationshipSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    
    const { fromMemberId, toMemberId, type, label } = parsed.data;
    const from = await Member.findById(fromMemberId);
    const to = await Member.findById(toMemberId);
    
    if (!from || !to) return res.status(404).json({ error: 'Member not found' });
    if (!from.tree.equals(to.tree)) return res.status(400).json({ error: 'Members must belong to same tree' });
    
    // NEW: Validate max 2 parents
    if (type === 'parent') {
      const existingParents = from.relationships.filter(r => r.type === 'parent').length;
      if (existingParents >= 2) {
        return res.status(400).json({ error: 'Member already has maximum of 2 parents' });
      }
    }
    
    // Authorization check
    const tree = await FamilyTree.findById(from.tree);
    if (!(tree.owner.equals(req.user.id) || tree.permissions.some((p) => p.user.equals(req.user.id) && p.access !== 'viewer')))
      return res.status(403).json({ error: 'Forbidden' });

    // ... rest of existing code
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
```

---

## Phase 6: Testing & Refinement (2-3 hours)

### Test Cases to Verify

#### Test 1: Simple Parent-Child
1. Add parent node
2. Add child node
3. Connect parent → child (type: parent)
4. **Verify**: Single Bezier curve edge

#### Test 2: Two Parents, One Child
1. Add Parent A and Parent B
2. Connect as spouses
3. Add Child C
4. Connect Parent A → Child C (parent)
5. Connect Parent B → Child C (parent)
6. **Verify**: 
   - Horizontal spouse edge
   - Marriage point appears
   - Both parents connect to marriage point
   - Marriage point connects to child

#### Test 3: Multiple Children
1. Use setup from Test 2
2. Add Child D
3. Connect both parents to Child D
4. **Verify**: Same marriage point used for both children

#### Test 4: Drag and Update
1. Move Parent A to new position
2. **Verify**: Marriage point updates position automatically

#### Test 5: Edge Crossing Detection
1. Create complex structure with many connections
2. **Verify**: No excessive edge crossings (use validation)

#### Test 6: Max Parents Validation
1. Add child with 2 parents
2. Try to add 3rd parent
3. **Verify**: Error message prevents addition

---

## Troubleshooting

### Issue: Virtual nodes not appearing
**Solution**: Ensure `nodeTypes` includes `marriagePoint: MarriagePointNode`

### Issue: Edges not updating on drag
**Solution**: Implement `handleNodeDragStop` with virtual node position update

### Issue: Duplicate edges
**Solution**: Use `deduplicateEdges` utility before setting edges

### Issue: Marriage point in wrong position
**Solution**: Call `updateMarriagePointPositions` after any node position change

---

## Performance Optimization

### For Large Trees (100+ members)

1. **Enable virtualization**:
```javascript
<ReactFlow
  onlyRenderVisibleElements={true}
  // ... other props
/>
```

2. **Memoize graph calculation**:
```javascript
const graph = useMemo(() => 
  buildFamilyGraph(members.filter(m => hasPosVal(m.position))),
  [members]
);
```

3. **Debounce position updates**:
```javascript
import { debounce } from 'lodash';

const debouncedUpdatePosition = useCallback(
  debounce(async (nodeId, position) => {
    await Members.update(nodeId, { position });
  }, 500),
  []
);
```

---

## Migration Strategy

### For Existing Trees

1. **No database changes required** - the new system is backward compatible
2. **Existing edges continue to work** - they'll render with enhanced styling
3. **Multi-parent connections auto-detected** - virtual nodes created automatically
4. **Gradual rollout**: Enable feature flag if desired

### Optional: Add Generation Field

If you want to use auto-layout:

```javascript
// MongoDB migration script
db.members.updateMany(
  { generation: { $exists: false } },
  { $set: { generation: 0 } }
);
```

---

## Next Steps

1. ✅ Implement Phase 1-3 for core functionality
2. ✅ Test with your existing family tree data
3. ⭐ Add auto-layout (Phase 4) for enhanced UX
4. ⭐ Implement validation (Phase 5) for data integrity
5. 🚀 Deploy and gather user feedback

---

## Support & Resources

- **Proposal Document**: `ADVANCED-EDGE-PROPOSAL.md`
- **Component Files**: 
  - `client/src/components/edges/FamilyEdge.jsx`
  - `client/src/components/nodes/MarriagePointNode.jsx`
- **Utilities**:
  - `client/src/utils/graphStructure.js`
  - `client/src/utils/layouts/sugiyamaLayout.js`
  - `client/src/utils/relationshipValidator.js`

Need help? Review the inline code comments and console logs for debugging.
