# Quick Reference: Advanced Edge System API

## � API Status

This document describes the **marriage point system APIs**. Your current implementation uses a **different approach** (smart multi-handle routing). See comparison below.

---

## Current Implementation (ui-update-nodes-adv)

### mapTreeToGraph(tree) - Current Function

**Location**: `client/src/App.jsx` (lines ~100-200)

**Current Logic**:
```javascript
function mapTreeToGraph(tree) {
  const members = tree.members || [];
  const n = []; // nodes
  const e = []; // edges
  const pairMap = new Map(); // edge deduplication
  
  // Build nodes with 8-handle FamilyNode type
  for (const m of members) {
    if (hasPosVal(m.position)) {
      n.push({
        id: String(m._id),
        type: 'familyNode',  // Uses FamilyNode component with 8 handles
        position: m.position,
        data: { label: m.name }
      });
    }
  }
  
  // Build edges with smart handle selection
  for (const m of members) {
    for (const r of m.relationships || []) {
      const type = r.type || 'custom';
      const edgeColor = RELATIONSHIP_COLORS[type];
      
      // Smart handle selection
      let sourceHandle, targetHandle;
      if (type === 'parent' || type === 'child') {
        sourceHandle = 'top-source';
        targetHandle = 'bottom-target';
      } else if (type === 'spouse' || type === 'sibling') {
        // Position-aware routing
        const dx = targetPos.x - sourcePos.x;
        const dy = targetPos.y - sourcePos.y;
        if (Math.abs(dx) > Math.abs(dy)) {
          sourceHandle = dx > 0 ? 'right-source' : 'left-source';
          targetHandle = dx > 0 ? 'left-target' : 'right-target';
        }
      }
      
      e.push({
        id: `e-${src}-${dst}`,
        source: String(src),
        target: String(dst),
        type: 'default',
        sourceHandle,
        targetHandle,
        style: { stroke: edgeColor, strokeWidth: 2 },
        markerEnd: { type: 'arrowclosed', color: edgeColor },
        data: { type, label: r.label, from: src, to: dst }
      });
    }
  }
  
  // Edge deduplication
  // ... (collapse bidirectional pairs)
  
  return { n, e, members };
}
```

**Characteristics**:
- ✅ Smart handle routing (8 handles per node)
- ✅ Position-aware routing (dx/dy calculation)
- ✅ Color-coded edges
- ✅ Edge deduplication
- ⚠️ No virtual marriage point nodes
- ⚠️ Multi-parent connections = 2 separate edges

---

## Proposed Marriage Point APIs

### buildFamilyGraph(members)
**NEW** - Builds enhanced graph structure with virtual marriage points.

**Location**: `client/src/utils/graphStructure.js`

```javascript
import { buildFamilyGraph } from './utils/graphStructure';

const graph = buildFamilyGraph(members);
// Returns: {
//   nodes: Map,         // memberId -> enhanced member data
//   edges: Array,       // edge definitions WITH virtual connectors
//   generations: Map,   // generation -> [memberIds]
//   familyUnits: Map,   // unitId -> family structure (detected 2-parent units)
//   virtualNodes: Array // marriage point nodes
// }
```

**Key Difference**: Automatically **detects family units** and creates virtual nodes

---

### graphToReactFlow(graph, existingPositions)
Converts graph to ReactFlow format.

```javascript
import { graphToReactFlow } from './utils/graphStructure';

const { nodes, edges } = graphToReactFlow(graph, positionMap);
// Returns ReactFlow-compatible nodes and edges
```

---

### updateMarriagePointPositions(nodes, virtualNodes)
Updates marriage point node positions based on parent positions.

```javascript
import { updateMarriagePointPositions } from './utils/graphStructure';

const updated = updateMarriagePointPositions(memberNodes, marriagePoints);
// Returns updated virtual nodes with recalculated positions
```

---

### applySugiyamaLayout(members, familyUnits, options)
Applies hierarchical auto-layout algorithm.

```javascript
import { applySugiyamaLayout } from './utils/layouts/sugiyamaLayout';

const positions = applySugiyamaLayout(members, familyUnits, {
  nodeWidth: 160,
  nodeHeight: 80,
  horizontalSpacing: 60,
  verticalSpacing: 140,
  centerX: 600,
  startY: 100,
});
// Returns: Map<memberId, {x, y, generation}>
```

---

### validateRelationship(fromMember, toMemberId, type, allMembers)
Validates relationship before creation.

```javascript
import { validateRelationship } from './utils/relationshipValidator';

const result = validateRelationship(member, targetId, 'parent', members);
// Returns: {
//   valid: boolean,
//   errors: string[],
//   warnings: string[]
// }
```

---

## 🎨 Custom Components

### FamilyEdge
Custom edge component with advanced rendering.

**Props**:
- `data.type`: 'parent' | 'child' | 'spouse' | 'sibling' | 'custom'
- `data.label`: Display label
- `data.virtual`: Boolean for virtual connectors
- `data.renderStyle`: 'bezier' | 'orthogonal' | 'horizontal'

**Usage**:
```javascript
const edgeTypes = {
  default: FamilyEdge,
};

<ReactFlow edgeTypes={edgeTypes} />
```

---

### MarriagePointNode
Virtual connector node for multi-parent connections.

**Data Structure**:
```javascript
{
  id: 'mp_unit_123',
  type: 'marriagePoint',
  position: { x, y },
  data: {
    label: '⚭',
    parents: [parentId1, parentId2],
    virtual: true,
    verified: false,
  }
}
```

**Usage**:
```javascript
const nodeTypes = {
  marriagePoint: MarriagePointNode,
};

<ReactFlow nodeTypes={nodeTypes} />
```

---

## 📊 Data Structures

### Family Unit
```javascript
{
  id: 'unit_parent1Id_parent2Id',
  parents: [parentId1, parentId2],
  children: [childId1, childId2, ...],
  marriagePointId: 'mp_unit_...',
}
```

### Enhanced Member Node
```javascript
{
  id: memberId,
  type: 'default',
  position: { x, y },
  data: {
    label: 'Name',
    generation: 0,
    photo: 'url',
    relationships: [...]
  }
}
```

### Enhanced Edge
```javascript
{
  id: 'parent_src_tgt',
  source: sourceId,
  target: targetId,
  type: 'smoothstep',
  data: {
    type: 'parent',
    label: 'parent',
    virtual: false,
    renderStyle: 'bezier',
    fromMarriagePoint: false,
  },
  style: {
    stroke: '#10b981',
    strokeWidth: 2,
  }
}
```

---

## 🎯 Common Patterns

### Pattern 1: Initialize Enhanced Graph

```javascript
// In App.jsx mapTreeToGraph()
function mapTreeToGraph(tree) {
  const members = tree.members.filter(m => hasPosVal(m.position));
  const graph = buildFamilyGraph(members);
  
  const existingPositions = new Map();
  members.forEach(m => existingPositions.set(String(m._id), m.position));
  
  let { nodes, edges } = graphToReactFlow(graph, existingPositions);
  
  // Update virtual nodes
  const virtualNodes = nodes.filter(n => n.type === 'marriagePoint');
  const memberNodes = nodes.filter(n => n.type !== 'marriagePoint');
  const updated = updateMarriagePointPositions(memberNodes, virtualNodes);
  
  nodes = [...memberNodes, ...updated];
  
  return { n: nodes, e: edges, members };
}
```

---

### Pattern 2: Handle Node Drag

```javascript
const handleNodeDragStop = useCallback((event, node) => {
  // Save position
  onNodeDragStop?.(event, node);
  
  // Update marriage points
  if (node.type !== 'marriagePoint') {
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

### Pattern 3: Add Relationship with Validation

```javascript
async function confirmRelationship(type, label) {
  // Validate
  const validation = validateRelationship(
    relPicker.sourceMember,
    relPicker.target,
    type,
    members
  );
  
  if (!validation.valid) {
    showToast(`Error: ${validation.errors.join(', ')}`);
    return;
  }
  
  if (validation.warnings.length > 0) {
    const confirmed = window.confirm(
      `Warning:\n${validation.warnings.join('\n')}\n\nContinue?`
    );
    if (!confirmed) return;
  }
  
  // Create
  await Relationships.create({ 
    fromMemberId: relPicker.source, 
    toMemberId: relPicker.target, 
    type, 
    label 
  });
  
  await loadTree(treeId);
}
```

---

### Pattern 4: Apply Auto-Layout

```javascript
const applyAutoLayout = useCallback(() => {
  const graph = buildFamilyGraph(
    members.filter(m => hasPosVal(m.position))
  );
  
  const positions = applySugiyamaLayout(
    Array.from(graph.nodes.values()),
    graph.familyUnits,
    {
      nodeWidth: 160,
      horizontalSpacing: 80,
      verticalSpacing: 160,
    }
  );
  
  // Update nodes
  setNodes(currentNodes =>
    currentNodes.map(node => {
      const pos = positions.get(node.id);
      if (pos && node.type !== 'marriagePoint') {
        return { ...node, position: { x: pos.x, y: pos.y } };
      }
      return node;
    })
  );
  
  // Persist to backend
  positions.forEach(async (pos, memberId) => {
    await Members.update(memberId, { position: { x: pos.x, y: pos.y } });
  });
}, [members, setNodes]);
```

---

## 🔧 Configuration Options

### Edge Colors
```javascript
const RELATIONSHIP_COLORS = {
  parent: '#10b981',      // emerald-500
  child: '#10b981',       // same as parent
  spouse: '#ec4899',      // pink-500
  sibling: '#3b82f6',     // blue-500
  custom: '#8b5cf6',      // violet-500
  'parent-connector': '#94a3b8', // gray-400
};
```

### Layout Parameters
```javascript
{
  nodeWidth: 160,         // Width of member nodes
  nodeHeight: 80,         // Height of member nodes
  horizontalSpacing: 60,  // Gap between siblings
  verticalSpacing: 140,   // Gap between generations
  centerX: 600,           // Center X coordinate
  startY: 100,            // Top Y coordinate
}
```

### Validation Rules
- Max parents per member: **2**
- Max spouses: **Unlimited** (with warnings)
- Cycle detection: **Enabled**
- Generation validation: **Warning only**

---

## 🐛 Debugging Tips

### Enable Console Logging
```javascript
console.log('[mapTreeToGraph]', { members, nodes, edges });
console.log('[buildFamilyGraph]', { familyUnits: graph.familyUnits });
console.log('[virtualNodes]', virtualNodes);
```

### Check Edge Deduplication
```javascript
import { deduplicateEdges } from './utils/graphStructure';

const uniqueEdges = deduplicateEdges(edges);
console.log(`Removed ${edges.length - uniqueEdges.length} duplicate edges`);
```

### Validate Graph Structure
```javascript
// Check for orphaned virtual nodes
virtualNodes.forEach(vn => {
  const hasIncoming = edges.some(e => e.target === vn.id);
  const hasOutgoing = edges.some(e => e.source === vn.id);
  if (!hasIncoming || !hasOutgoing) {
    console.warn('Orphaned virtual node:', vn.id);
  }
});
```

### Debug Marriage Point Position
```javascript
console.log('Marriage point position:', {
  id: vpNode.id,
  parents: vpNode.data.parents,
  position: vpNode.position,
  parentPositions: parents.map(p => nodes.find(n => n.id === p)?.position)
});
```

---

## ⚡ Performance Tips

### 1. Memoize Graph Calculation
```javascript
const graph = useMemo(() => 
  buildFamilyGraph(members.filter(m => hasPosVal(m.position))),
  [members]
);
```

### 2. Debounce Position Updates
```javascript
const debouncedUpdate = debounce(async (id, pos) => {
  await Members.update(id, { position: pos });
}, 500);
```

### 3. Enable ReactFlow Virtualization
```javascript
<ReactFlow onlyRenderVisibleElements={true} />
```

### 4. Use Edge Intersection Detection
```javascript
import { validateEdgeCrossings } from './utils/relationshipValidator';

const { valid, crossingCount } = validateEdgeCrossings(
  sourceNode, targetNode, existingEdges, nodes
);
```

---

## 📚 Type Definitions (TypeScript)

```typescript
interface FamilyGraph {
  nodes: Map<string, EnhancedMember>;
  edges: EnhancedEdge[];
  generations: Map<number, string[]>;
  familyUnits: Map<string, FamilyUnit>;
  virtualNodes: VirtualNode[];
}

interface EnhancedMember {
  _id: string;
  name: string;
  position: { x: number; y: number };
  generation: number;
  relationships: Relationship[];
}

interface FamilyUnit {
  id: string;
  parents: string[];
  children: string[];
  marriagePointId: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

---

## 🔗 File Reference

| File | Purpose |
|------|---------|
| `graphStructure.js` | Core graph building logic |
| `sugiyamaLayout.js` | Auto-layout algorithm |
| `relationshipValidator.js` | Validation utilities |
| `FamilyEdge.jsx` | Custom edge component |
| `MarriagePointNode.jsx` | Virtual connector node |

---

## 🎓 Learning Resources

1. **ReactFlow Docs**: https://reactflow.dev/docs
2. **Sugiyama Algorithm**: Hierarchical graph layout
3. **Bezier Curves**: For smooth edge rendering
4. **Force-Directed Layout**: Alternative auto-layout
5. **Graph Theory**: Understanding family tree as DAG

---

## 📝 Quick Checklist

Before deploying:
- [ ] Custom components registered in ReactFlow
- [ ] Edge types configured properly
- [ ] Validation rules enabled
- [ ] Console logs removed (or behind feature flag)
- [ ] Performance optimization applied
- [ ] Backward compatibility tested
- [ ] Migration strategy documented

---

**Last Updated**: Based on implementation proposal v1.0
**Maintainer**: Family Tree Development Team
**Support**: See IMPLEMENTATION-GUIDE.md for detailed setup
