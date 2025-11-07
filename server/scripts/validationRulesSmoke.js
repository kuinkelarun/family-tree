// Validation rules smoke tests (no DB required)
// Builds an in-memory graph and runs validateProposedRelationship for key scenarios

import { validateProposedRelationship } from '../utils/relationshipRules.js';

function buildGraph(members) {
  // Emulate the structure produced by loadTreeGraph, but from in-memory data
  const index = new Map(members.map((m) => [String(m._id), { ...m, _id: String(m._id) }]));
  const parentsOf = new Map();
  const childrenOf = new Map();
  const spousesOf = new Map();
  const explicitSiblingsOf = new Map();
  for (const id of index.keys()) {
    parentsOf.set(id, new Set());
    childrenOf.set(id, new Set());
    spousesOf.set(id, new Set());
    explicitSiblingsOf.set(id, new Set());
  }
  for (const m of members) {
    const id = String(m._id);
    for (const r of m.relationships || []) {
      const rid = String(r.relative);
      if (!index.has(rid)) continue;
      if (r.type === 'parent') parentsOf.get(id).add(rid);
      else if (r.type === 'child') childrenOf.get(id).add(rid);
      else if (r.type === 'spouse') spousesOf.get(id).add(rid);
      else if (r.type === 'sibling') explicitSiblingsOf.get(id).add(rid);
    }
  }

  // Unify parent sets across explicit sibling components
  const visited = new Set();
  for (const start of index.keys()) {
    if (visited.has(start)) continue;
    const queue = [start];
    const comp = [];
    visited.add(start);
    while (queue.length) {
      const u = queue.shift();
      comp.push(u);
      for (const v of explicitSiblingsOf.get(u) || []) {
        if (!visited.has(v)) { visited.add(v); queue.push(v); }
      }
    }
    if (comp.length <= 1) continue;
    const unionParents = new Set();
    for (const n of comp) for (const p of parentsOf.get(n) || []) unionParents.add(p);
    for (const n of comp) {
      for (const p of unionParents) {
        parentsOf.get(n).add(p);
        childrenOf.get(p)?.add(n);
      }
    }
  }
  // Derived siblings via shared parents
  const derivedSiblingsOf = new Map(Array.from(index.keys()).map((k) => [k, new Set()]));
  for (const [child, ps] of parentsOf.entries()) {
    for (const p of ps) {
      for (const sib of childrenOf.get(p) || []) {
        if (sib !== child) derivedSiblingsOf.get(child).add(sib);
      }
    }
  }
  const siblingsOf = new Map();
  for (const id of index.keys()) {
    const merged = new Set();
    for (const x of explicitSiblingsOf.get(id) || []) merged.add(x);
    for (const x of derivedSiblingsOf.get(id) || []) merged.add(x);
    siblingsOf.set(id, merged);
  }
  return { index, parentsOf, childrenOf, spousesOf, siblingsOf };
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`PASS: ${msg}`);
}

function run() {
  // Members
  const A = { _id: 'A', name: 'A', relationships: [] };
  const B = { _id: 'B', name: 'B', relationships: [] };
  const C = { _id: 'C', name: 'C', relationships: [] };
  const X = { _id: 'X', name: 'X', relationships: [] };
  const Y = { _id: 'Y', name: 'Y', relationships: [] };
  const G = { _id: 'G', name: 'G', relationships: [] };

  // Scenario 1: siblings cannot be spouses
  A.relationships.push({ type: 'sibling', relative: 'B' });
  B.relationships.push({ type: 'sibling', relative: 'A' });
  let graph = buildGraph([A, B]);
  let r = validateProposedRelationship(graph, 'A', 'B', 'spouse', { mode: 'create' });
  assert(!r.ok && r.ruleIds.includes('no-incest-siblings'), 'block spouse between siblings');

  // Scenario 2: co-spouses cannot marry directly (A - C, B - C)
  A.relationships.push({ type: 'spouse', relative: 'C' });
  C.relationships.push({ type: 'spouse', relative: 'A' });
  B.relationships.push({ type: 'spouse', relative: 'C' });
  C.relationships.push({ type: 'spouse', relative: 'B' });
  graph = buildGraph([A, B, C]);
  r = validateProposedRelationship(graph, 'A', 'B', 'spouse', { mode: 'create' });
  assert(!r.ok && r.ruleIds.includes('no-spouse-between-co-spouses') && /C/.test(r.errors.join(' ')), 'block spouse between co-spouses with shared spouse name');

  // Scenario 3: in-law direct block (A spouse X; B parent X) => A and B cannot be spouse/parent/child/sibling
  A.relationships.push({ type: 'spouse', relative: 'X' });
  X.relationships.push({ type: 'spouse', relative: 'A' });
  B.relationships.push({ type: 'child', relative: 'X' }); // B -> child X (so X has parent B)
  X.relationships.push({ type: 'parent', relative: 'B' });
  graph = buildGraph([A, B, X]);
  r = validateProposedRelationship(graph, 'A', 'B', 'spouse', { mode: 'create' });
  assert(!r.ok && r.ruleIds.includes('no-direct-between-inlaws'), 'block spouse between in-laws');
  r = validateProposedRelationship(graph, 'A', 'B', 'child', { mode: 'create' });
  assert(!r.ok && r.ruleIds.includes('no-direct-between-inlaws'), 'block child link between in-laws');

  // Scenario 4: grandparent-as-parent should be blocked
  // G -> parent Y; Y -> parent X; so G is grandparent of X; proposing G as parent of X must error
  G.relationships.push({ type: 'child', relative: 'Y' });
  Y.relationships.push({ type: 'parent', relative: 'G' });
  Y.relationships.push({ type: 'child', relative: 'X' });
  X.relationships.push({ type: 'parent', relative: 'Y' });
  graph = buildGraph([G, Y, X]);
  r = validateProposedRelationship(graph, 'X', 'G', 'parent', { mode: 'create' });
  assert(!r.ok && r.ruleIds.includes('no-grandparent-as-parent'), 'block setting grandparent as parent');

  // Scenario 5: spouse-of-ancestor and co-spouse-of-ancestor cannot be parent/child/spouse of descendant
  // Setup: 4 is grandparent of 21; 10 spouse of 4; 14 spouse of 4; 21 descendant of 14
  const p4 = { _id: '4', name: '4', relationships: [] };
  const p10 = { _id: '10', name: '10', relationships: [ { type: 'spouse', relative: '4' } ] };
  p4.relationships.push({ type: 'spouse', relative: '10' });
  const p14 = { _id: '14', name: '14', relationships: [ { type: 'spouse', relative: '4' } ] };
  p4.relationships.push({ type: 'spouse', relative: '14' });
  const p30 = { _id: '30', name: '30', relationships: [ { type: 'parent', relative: '14' } ] };
  p14.relationships.push({ type: 'child', relative: '30' });
  const p21 = { _id: '21', name: '21', relationships: [ { type: 'parent', relative: '30' } ] };
  p30.relationships.push({ type: 'child', relative: '21' });
  // Now 4 is grandparent of 21 via 14->30->21. 10 is spouse of 4; 14 is co-spouse with 10.
  graph = buildGraph([p4, p10, p14, p30, p21]);
  r = validateProposedRelationship(graph, '10', '21', 'spouse', { mode: 'create' });
  assert(!r.ok && (r.ruleIds.includes('no-direct-affinal-ancestor-descendant') || r.ruleIds.includes('no-direct-co-spouse-of-ancestor')), 'block spouse between spouse-of-ancestor and descendant');
  r = validateProposedRelationship(graph, '10', '21', 'parent', { mode: 'create' });
  assert(!r.ok && (r.ruleIds.includes('no-direct-affinal-ancestor-descendant') || r.ruleIds.includes('no-direct-co-spouse-of-ancestor')), 'block parent link from spouse-of-ancestor to descendant');
  r = validateProposedRelationship(graph, '10', '21', 'child', { mode: 'create' });
  assert(!r.ok && (r.ruleIds.includes('no-direct-affinal-ancestor-descendant') || r.ruleIds.includes('no-direct-co-spouse-of-ancestor')), 'block child link to spouse-of-ancestor from descendant');

  // Scenario 6: step-parent carve-out — allow direct parent/child edge with warning
  // 6 is parent of 2; 5 is spouse of 6; creating 5 -> child 2 should be allowed with a warning
  const s5 = { _id: '5', name: '5', relationships: [ { type: 'spouse', relative: '6' } ] };
  const s6 = { _id: '6', name: '6', relationships: [ { type: 'spouse', relative: '5' }, { type: 'child', relative: '2' } ] };
  const s2 = { _id: '2', name: '2', relationships: [ { type: 'parent', relative: '6' } ] };
  graph = buildGraph([s5, s6, s2]);
  r = validateProposedRelationship(graph, '5', '2', 'child', { mode: 'create' });
  assert(r.ok && r.ruleIds.includes('warn-direct-step-parent-link') && r.warnings.length > 0, 'allow step-parent direct child link with warning');

  console.log('\nAll validation smoke tests PASSED');
}

try {
  run();
} catch (e) {
  console.error(e.message || e);
  process.exitCode = 1;
}
