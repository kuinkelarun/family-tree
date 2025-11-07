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

  console.log('\nAll validation smoke tests PASSED');
}

try {
  run();
} catch (e) {
  console.error(e.message || e);
  process.exitCode = 1;
}
