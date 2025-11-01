# Family Tree Visualization Enhancement Guide

This document provides detailed guidance on improving a family tree visualization application built with **React** and **React Flow**, with optional support for **Cytoscape.js** and **D3.js** for more complex hierarchical and multi-parent layouts.

---

## 🧩 Current Tech Stack Summary

**Framework:** React (SPA using ReactDOM)

**Canvas Library:** React Flow (^11.11.4)

**Custom Nodes:** FamilyNode.jsx registered via `nodeTypes = { familyNode: FamilyNode }`

**Edge Type:** Smoothstep (React Flow built-in)

**Export Feature:** html-to-image for SVG/PNG export

**Data Mapping:** `mapTreeToGraph(tree)` converts backend tree → React Flow graph nodes/edges.

---

## 🎯 Goals

1. Support **multi-parent and multi-child** relationships.
2. Improve **edge layout** and **node spacing** for clarity.
3. Introduce **advanced layout algorithms** for automatic positioning.
4. Keep the codebase **maintainable and scalable**.

---

## 🧠 Tools & Libraries for Advanced Layouts

| Category | Tool | Notes |
|-----------|------|-------|
| Layout Algorithm | **ELK.js** | Excellent for hierarchical and flow-based layouts. React Flow plugin available. |
| Graph Rendering | **Cytoscape.js** | Handles complex graphs (multi-edges, curved links). React integration available. |
| Tree Layout | **D3.js (d3-hierarchy)** | Great for traditional tree visualization and radial layouts. |
| Edge Routing | **dagre-d3 / ELK / Cola.js** | Improves edge curves, avoids overlaps. |
| React Integration | **react-flow-renderer + elkjs layout plugin** | Combines React Flow’s interactivity with ELK layout precision. |

---

## ⚙️ Recommended Implementation Plan

### 1. Introduce an Automatic Layout Engine (ELK.js)

Use **elkjs** to compute optimal positions for nodes and edges:

```bash
npm install elkjs
```

Example integration with React Flow:

```javascript
import ELK from 'elkjs';

const elk = new ELK();

async function layoutNodesAndEdges(nodes, edges) {
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '60',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100'
    },
    children: nodes.map(n => ({ id: n.id, width: 180, height: 60 })),
    edges: edges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }))
  };

  const layout = await elk.layout(graph);
  return nodes.map(n => ({
    ...n,
    position: {
      x: layout.children.find(c => c.id === n.id).x,
      y: layout.children.find(c => c.id === n.id).y
    }
  }));
}
```

Then in your `onNodesChange` or `onConnect` handlers, re-run this layout.

---

### 2. Curved, Routed, or Smart Edges

To avoid edge overlap:

- Use **smoothstep** or **bezier** edges with custom offset.
- Implement **curved multi-parent connectors** (custom edge type).

Example custom edge definition:

```javascript
import { getBezierPath } from 'reactflow';

function CurvedEdge({ id, sourceX, sourceY, targetX, targetY, style }) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, targetX, targetY });
  return <path id={id} d={edgePath} stroke="#333" fill="none" style={style} />;
}
```

Register it in `nodeTypes` as:

```javascript
const edgeTypes = { curved: CurvedEdge };
```

Then in your edges:

```js
{ id: 'e1-2', source: '1', target: '2', type: 'curved' }
```

---

### 3. Implement Dynamic Spacing and Auto-Panning

React Flow supports `fitView()` and `fitViewOptions` to maintain proper spacing automatically:

```javascript
rfInstance.fitView({ padding: 0.3, includeHiddenNodes: true });
```

Additionally, you can dynamically calculate spacing using node degree:

```javascript
function computeSpacing(nodeCount) {
  return Math.max(80, Math.min(200, 100 + nodeCount * 5));
}
```

Use this to adjust layout spacing automatically as tree size grows.

---

### 4. Optimize Edge Overlap and Routing Techniques

Use the following methods to improve clarity:

1. **Avoid long straight lines:** Use curves (`getBezierPath`).
2. **Add edge offsets:** Offset edges slightly for nodes with multiple connections.
3. **Enable orthogonal routing:** If using ELK, set `'elk.edgeRouting': 'ORTHOGONAL'`.
4. **Edge bundling:** Group edges that share similar paths.

---

### 5. Optional Frameworks for Robust Layouts

#### **Cytoscape.js Integration**

**Installation:**
```bash
npm install cytoscape react-cytoscapejs
```

**Starter Example:**
```javascript
import CytoscapeComponent from 'react-cytoscapejs';

const elements = [
  { data: { id: 'p1', label: 'Parent 1' } },
  { data: { id: 'p2', label: 'Parent 2' } },
  { data: { id: 'c1', label: 'Child' } },
  { data: { source: 'p1', target: 'c1' } },
  { data: { source: 'p2', target: 'c1' } }
];

<CytoscapeComponent
  elements={elements}
  layout={{ name: 'breadthfirst', directed: true, spacingFactor: 1.5 }}
  style={{ width: '100%', height: '600px' }}
/>
```

Cytoscape handles multi-parent edges elegantly and provides built-in zoom/pan.

---

#### **D3.js Tree Example**

**Installation:**
```bash
npm install d3
```

**Sample Implementation:**
```javascript
import * as d3 from 'd3';

export function renderFamilyTree(data, container) {
  const width = 900, height = 700;
  const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);

  const root = d3.hierarchy(data);
  const treeLayout = d3.tree().size([width - 200, height - 200]);
  treeLayout(root);

  const g = svg.append('g').attr('transform', 'translate(100,100)');

  // Edges
  g.selectAll('path')
    .data(root.links())
    .join('path')
    .attr('d', d3.linkHorizontal()
      .x(d => d.y)
      .y(d => d.x))
    .attr('fill', 'none')
    .attr('stroke', '#555');

  // Nodes
  g.selectAll('circle')
    .data(root.descendants())
    .join('circle')
    .attr('cx', d => d.y)
    .attr('cy', d => d.x)
    .attr('r', 8)
    .attr('fill', '#69b3a2');

  // Labels
  g.selectAll('text')
    .data(root.descendants())
    .join('text')
    .attr('x', d => d.y + 12)
    .attr('y', d => d.x + 5)
    .text(d => d.data.name)
    .style('font-family', 'sans-serif');
}
```

**Example Data:**
```javascript
const familyData = {
  name: 'Grandparent',
  children: [
    {
      name: 'Parent 1',
      children: [ { name: 'Child 1' }, { name: 'Child 2' } ]
    },
    {
      name: 'Parent 2',
      children: [ { name: 'Child 3' } ]
    }
  ]
};
```

This D3.js setup gives you full control over zoom, curve smoothing, and spacing.

---

## 🔧 Layout Optimization Techniques

### 1. Collision Detection Between Nodes
Use bounding-box logic to detect and push apart overlapping nodes:
```javascript
function separateOverlappingNodes(nodes) {
  const spacing = 100;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = a.position.x - b.position.x;
      const dy = a.position.y - b.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < spacing) {
        const move = (spacing - dist) / 2;
        a.position.x += (dx / dist) * move;
        b.position.x -= (dx / dist) * move;
      }
    }
  }
  return nodes;
}
```

### 2. Hierarchical Separation by Generation
Group family members by generation depth:
```javascript
function groupByGeneration(nodes) {
  const levels = {};
  nodes.forEach(n => {
    const depth = n.data.generation || 0;
    if (!levels[depth]) levels[depth] = [];
    levels[depth].push(n);
  });
  return levels;
}
```

Use this grouping to assign consistent vertical spacing per generation.

### 3. Edge Bundling for Shared Children
If multiple parents share the same child, use an intermediate “merge node” to visually bundle edges before connecting to the child node.

```javascript
// Example: Instead of connecting both parents → child directly
// Connect both parents → merge node → child
```

This technique drastically improves readability in dense family networks.

### 4. Adaptive Layout Refresh
When a new node or edge is added:
- Recompute layout via ELK.
- Smoothly animate transitions using D3 transitions or React Flow’s built-in animations.

```javascript
rfInstance.fitView({ duration: 800 });
```

### 5. Edge Label Placement
For readability, dynamically position edge labels:
```javascript
function edgeLabelPosition(source, target) {
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;
  return { x: midX, y: midY - 10 };
}
```

---

## ✅ Summary of Key Recommendations

| Area | Recommendation |
|------|----------------|
| Layout | Use ELK.js or D3’s hierarchy for automatic spacing |
| Edges | Prefer Bezier or Smoothstep edges; bundle where possible |
| Performance | Apply layout only on major updates |
| Clarity | Use edge routing, curved connectors, and clear color codes |
| Scalability | Store relationships in normalized graph structure |

---

## 🚀 Next Steps

1. Integrate **ELK.js layout** with your existing React Flow setup.
2. Introduce **custom curved edge type** for multi-parent relationships.
3. Add **dynamic spacing logic** and **collision detection**.
4. Optionally, prototype a **Cytoscape.js or D3.js** version for scalability testing.

---

## 9. Performance Tuning — Large Trees

Handling very large family trees (hundreds to thousands of nodes) requires careful performance tuning. Below are practical strategies, code patterns, and configuration tips to keep the UI responsive and the layout computation tractable.

### 9.1 Batch & Debounce Layout Computation
- **Why:** Running ELK or heavy layout computations on every small change (drag, single node edit) will freeze the UI.
- **How:** Debounce layout triggers and run full layout only after a pause or on major structural changes.

```javascript
import debounce from 'lodash.debounce';

const runLayoutDebounced = debounce(async (nodes, edges) => {
  const layouted = await applyAutoLayout(nodes, edges);
  setNodes(layouted.nodes);
  setEdges(layouted.edges);
}, 400); // 400ms wait

// usage in handlers
onNodesChange = (changes) => {
  applyLocalNodeChanges(changes);
  runLayoutDebounced(currentNodes, currentEdges);
}
```

### 9.2 Incremental Layouts
- **Why:** Full re-layout of thousands of nodes is expensive.
- **How:** Use partial/incremental layout where only affected subgraph is re-laid out (ELK supports subgraphs; D3 can re-run layout on sub-tree).

```javascript
// Pseudo: compute subgraph around edited node (k-hop neighborhood)
const subgraph = extractNeighborhood(nodeId, nodes, edges, k=2);
const layoutedSub = await applyAutoLayout(subgraph.nodes, subgraph.edges);
// merge layoutedSub positions into main nodes
```

### 9.3 Web Worker for Layout Computation
- **Why:** ELK layout is CPU-bound; running it on the main thread blocks user interactions.
- **How:** Offload layout computations to a Web Worker and post results back to the main thread.

**worker.js**
```javascript
importScripts('path/to/elkjs.umd.js');
const elk = new ELK();
self.onmessage = async (evt) => {
  const { nodes, edges, options } = evt.data;
  const layout = await elk.layout({ /* build graph */ });
  postMessage(layout);
};
```

**main thread**
```javascript
const worker = new Worker('./worker.js');
worker.postMessage({ nodes, edges });
worker.onmessage = (evt) => {
  const layout = evt.data;
  setNodes(layoutedNodesFrom(layout));
};
```

### 9.4 Virtualize Rendering
- **Why:** Rendering thousands of DOM/SVG nodes can slow the browser.
- **How:** Use canvas-based rendering (React Konva) or virtualized layers (render only nodes within viewport). React Flow has some internal optimizations but can still lag at scale.

Options:
- **React Konva**: Draw nodes/edges on canvas for large datasets.
- **Viewport culling**: Compute which nodes are visible within current viewport and only render those DOM/SVG nodes.

### 9.5 Memoization & Pure Components
- Use `React.memo` on `FamilyNode` components and ensure node props are stable (avoid recreating functions inline).
- Memoize expensive computations like building adjacency maps, generation grouping, or layout options.

```javascript
const MemoFamilyNode = React.memo(FamilyNode);
```

### 9.6 Throttled Drag & Drop / Interaction
- Throttle drag events so position updates and re-renders do not happen every pixel.

```javascript
const onNodeDrag = throttle((id, pos) => {
  updateNodePosition(id, pos);
}, 50);
```

### 9.7 Pagination & Progressive Loading
- For giant trees, provide filters (by family branch, generation depth, or search) and load only the selected subset.
- Offer server-side APIs that return k-hop neighborhoods instead of the entire graph.

### 9.8 Caching Layout Results
- Cache computed layouts (e.g., localStorage or backend) keyed by a deterministic graph hash. Reuse cached coordinates unless the graph changed.

```javascript
const graphHash = computeGraphHash(nodes, edges);
if (cache[graphHash]) {
  setNodes(cache[graphHash].nodes);
} else {
  const layouted = await applyAutoLayout(nodes, edges);
  cache[graphHash] = layouted;
}
```

### 9.9 Performance Metrics & Debugging
- Measure layout time and render time (use `console.time()` or Performance API) to find bottlenecks.
- Add a lightweight profiling overlay in dev mode showing node count, layout duration, and frame rate.

---

## 10. Closing Notes
This document now includes detailed Performance Tuning strategies for large family trees, covering debouncing, incremental layout, web workers, virtualization, memoization, throttling, pagination, caching, and profiling. These techniques will help you scale from tens to thousands of nodes while keeping the UI responsive.

This document is designed to be **LLM (GPT-5 Mini) friendly**, so you can feed any section into a model for explanation, code generation, or debugging without confusion.

