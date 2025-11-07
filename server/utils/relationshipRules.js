// Configurable relationship validation rules and helpers
// This module evaluates proposed edges against logical family constraints

import Member from '../models/Member.js';

/**
 * Load minimal graph for a tree: id -> relationships
 */
export async function loadTreeGraph(treeId) {
  const members = await Member.find({ tree: treeId })
    .select('_id name generation relationships')
    .lean();
  const index = new Map(members.map((m) => [String(m._id), m]));
  const parentsOf = new Map();
  const childrenOf = new Map();
  const spousesOf = new Map();
  const explicitSiblingsOf = new Map();
  for (const m of members) {
    const id = String(m._id);
    parentsOf.set(id, new Set());
    childrenOf.set(id, new Set());
    spousesOf.set(id, new Set());
    explicitSiblingsOf.set(id, new Set());
  }
  for (const m of members) {
    const id = String(m._id);
    for (const r of m.relationships || []) {
      const rid = String(r.relative);
      if (!index.has(rid)) continue; // skip dangling
      if (r.type === 'parent') parentsOf.get(id).add(rid);
      else if (r.type === 'child') childrenOf.get(id).add(rid);
      else if (r.type === 'spouse') spousesOf.get(id).add(rid);
      else if (r.type === 'sibling') explicitSiblingsOf.get(id).add(rid);
    }
  }

  // Propagate known parents across explicit sibling edges so siblings share parents
  // Build connected components of the explicit sibling graph and unify parent sets
  const visited = new Set();
  for (const start of index.keys()) {
    if (visited.has(start)) continue;
    // BFS over explicit sibling edges only
    const queue = [start];
    const component = [];
    visited.add(start);
    while (queue.length) {
      const u = queue.shift();
      component.push(u);
      for (const v of explicitSiblingsOf.get(u) || []) {
        if (!visited.has(v)) { visited.add(v); queue.push(v); }
      }
    }
    if (component.length <= 1) continue;
    // Union parents of the component
    const unionParents = new Set();
    for (const n of component) for (const p of parentsOf.get(n) || []) unionParents.add(p);
    // Apply the union to all members in the component and update childrenOf for those parents
    for (const n of component) {
      for (const p of unionParents) {
        parentsOf.get(n).add(p);
        childrenOf.get(p)?.add(n);
      }
    }
  }
  // Derive siblings from shared parents as well (consanguine siblings)
  const derivedSiblingsOf = new Map(Array.from(index.keys()).map((k) => [k, new Set()]));
  for (const [child, ps] of parentsOf.entries()) {
    for (const p of ps) {
      for (const sib of childrenOf.get(p) || []) {
        if (sib !== child) derivedSiblingsOf.get(child).add(sib);
      }
    }
  }
  // Merge explicit and derived
  const siblingsOf = new Map();
  for (const id of index.keys()) {
    const merged = new Set();
    for (const x of explicitSiblingsOf.get(id) || []) merged.add(x);
    for (const x of derivedSiblingsOf.get(id) || []) merged.add(x);
    siblingsOf.set(id, merged);
  }
  return { index, parentsOf, childrenOf, spousesOf, siblingsOf };
}

function ancestorsOf(startId, parentsOf, maxDepth = 10) {
  const result = new Map(); // id -> distance
  const q = [[startId, 0]];
  const seen = new Set([startId]);
  while (q.length) {
    const [cur, d] = q.shift();
    if (d >= maxDepth) continue;
    for (const p of parentsOf.get(cur) || []) {
      if (seen.has(p)) continue;
      seen.add(p);
      result.set(p, d + 1);
      q.push([p, d + 1]);
    }
  }
  return result; // Map of ancestorId -> distance (1 = parent)
}

function descendantsOf(startId, childrenOf, maxDepth = 10) {
  const result = new Map();
  const q = [[startId, 0]];
  const seen = new Set([startId]);
  while (q.length) {
    const [cur, d] = q.shift();
    if (d >= maxDepth) continue;
    for (const c of childrenOf.get(cur) || []) {
      if (seen.has(c)) continue;
      seen.add(c);
      result.set(c, d + 1);
      q.push([c, d + 1]);
    }
  }
  return result; // Map of descendantId -> distance (1 = child)
}

/**
 * Validate a proposed relationship using configured rules.
 * @param {object} graph - Output of loadTreeGraph
 * @param {string} fromId
 * @param {string} toId
 * @param {'parent'|'child'|'spouse'|'sibling'|'custom'} type
 * @param {object} options
 *   - mode: 'create' | 'update'
 *   - previousType?: string (when updating)
 * @returns {{ok:boolean, errors:string[], warnings:string[], ruleIds:string[]}}
 */
export function validateProposedRelationship(graph, fromId, toId, type, options = {}) {
  const { index, parentsOf, childrenOf, spousesOf, siblingsOf } = graph;
  const mode = options.mode || 'create';

  const errors = [];
  const warnings = [];
  const ruleIds = [];

  // r0: no self edge
  if (fromId === toId) {
    errors.push('Cannot create relationship with self');
    ruleIds.push('no-self');
  }

  if (!index.has(fromId) || !index.has(toId)) {
    errors.push('Member not found in the same tree');
    ruleIds.push('same-tree');
    return { ok: false, errors, warnings, ruleIds };
  }

  // r1: duplicate exact relationship (same direction)
  if (mode === 'create') {
    const existing = (index.get(fromId).relationships || []).some(
      (r) => String(r.relative) === toId && r.type === type
    );
    if (existing) {
      errors.push(`A ${type} relationship already exists`);
      ruleIds.push('no-duplicate');
    }
    // r1b: duplicate via reciprocal already present (e.g., spouse, or child/parent inverse existing)
    const reciprocalNeeded = (t) => (t === 'parent' ? 'child' : t === 'child' ? 'parent' : t);
    const recip = reciprocalNeeded(type);
    if (recip) {
      const recipExists = (index.get(toId).relationships || []).some(
        (r) => String(r.relative) === fromId && r.type === recip
      );
      if (recipExists) {
        errors.push(`This ${type} relationship already exists (via reciprocal entry)`);
        ruleIds.push('no-duplicate-reciprocal');
      }
    }
  }

  // r2: at most two parents for a child
  if (type === 'parent') {
    const currentParents = Array.from(parentsOf.get(fromId) || []);
    if (!currentParents.includes(toId) && currentParents.length >= 2) {
      errors.push('Member already has 2 parents');
      ruleIds.push('max-two-parents');
    }
  }

  // Helper maps
  const anc = ancestorsOf(fromId, parentsOf, 10);
  const desc = descendantsOf(fromId, childrenOf, 10);
  const ancOfTo = ancestorsOf(toId, parentsOf, 10);
  const descOfTo = descendantsOf(toId, childrenOf, 10);

  // r3: prevent cycles for parent/child (include explanatory distances)
  if (type === 'parent') {
    // Setting toId as parent of fromId: if fromId is already an ancestor of toId, it creates a cycle
    if (ancOfTo.has(fromId)) {
      const nameFrom = index.get(fromId)?.name || 'Source';
      const nameTo = index.get(toId)?.name || 'Target';
      errors.push(`Cannot set ${nameTo} as parent of ${nameFrom}: this would create a cycle because ${nameFrom} is already an ancestor of ${nameTo}.`);
      ruleIds.push('no-cycle');
    }
  } else if (type === 'child') {
    if (descOfTo.has(fromId)) {
      const nameFrom = index.get(fromId)?.name || 'Source';
      const nameTo = index.get(toId)?.name || 'Target';
      errors.push(`Cannot set ${nameTo} as child of ${nameFrom}: this would create a cycle because ${nameFrom} is already an ancestor of ${nameTo}.`);
      ruleIds.push('no-cycle');
    }
  }

  // r4: siblings cannot be parent/child
  if ((type === 'parent' || type === 'child') && (siblingsOf.get(fromId)?.has(toId) || siblingsOf.get(toId)?.has(fromId))) {
    errors.push('Siblings cannot be linked as parent/child');
    ruleIds.push('no-parent-child-between-siblings');
  }

  // r4b: spouses cannot be parent/child
  if ((type === 'parent' || type === 'child') && (spousesOf.get(fromId)?.has(toId) || spousesOf.get(toId)?.has(fromId))) {
    errors.push('Spouses cannot be linked as parent/child');
    ruleIds.push('no-parent-child-between-spouses');
  }

  // r5: disallow skipping generations for direct parent/child if already connected via intermediate nodes
  if (type === 'parent') {
    // toId should be a direct parent only if not already a grand/ancestor (distance >= 2)
    const dist = anc.get(toId);
    if (typeof dist === 'number' && dist >= 2) {
      const nameFrom = index.get(fromId)?.name || 'Source';
      const nameTo = index.get(toId)?.name || 'Target';
      const relWord = dist === 2 ? 'grandparent' : `great-${'great-'.repeat(dist - 3)}grandparent`;
      errors.push(`Cannot set ${nameTo} as parent of ${nameFrom}: ${nameTo} is already a ${relWord} of ${nameFrom} via existing connections.`);
      ruleIds.push('no-grandparent-as-parent');
    }
  } else if (type === 'child') {
    const dist = desc.get(toId);
    if (typeof dist === 'number' && dist >= 2) {
      const nameFrom = index.get(fromId)?.name || 'Source';
      const nameTo = index.get(toId)?.name || 'Target';
      const relWord = dist === 2 ? 'grandchild' : `great-${'great-'.repeat(dist - 3)}grandchild`;
      errors.push(`Cannot set ${nameTo} as child of ${nameFrom}: ${nameTo} is already a ${relWord} of ${nameFrom} via existing connections.`);
      ruleIds.push('no-grandchild-as-child');
    }
  }

  // r9: generation order integrity (use generation numbers when available)
  const genFrom = index.get(fromId)?.generation ?? null;
  const genTo = index.get(toId)?.generation ?? null;
  if (genFrom !== null && genTo !== null) {
    const nameFrom = index.get(fromId)?.name || 'Source';
    const nameTo = index.get(toId)?.name || 'Target';
    if (type === 'parent') {
      // parent (to) should be in an earlier (smaller) generation than child (from)
      if (genTo >= genFrom) {
        const hasKnownTopo = ancOfTo.has(fromId) || descOfTo.has(fromId) || anc.has(toId) || desc.has(toId);
        // Try to clarify using ancestor/descendant maps if available
        const dist = anc.get(toId);
        if (typeof dist === 'number' && dist >= 1) {
          const relWord = dist === 1 ? 'parent' : dist === 2 ? 'grandparent' : `great-${'great-'.repeat(dist - 3)}grandparent`;
          errors.push(`Cannot set ${nameTo} as parent of ${nameFrom}: ${nameTo} is already a ${relWord} of ${nameFrom}.`);
          ruleIds.push('generation-order');
        } else if (descOfTo.has(fromId)) {
          errors.push(`Cannot set ${nameTo} as parent of ${nameFrom}: ${nameFrom} is already a descendant of ${nameTo}.`);
          ruleIds.push('generation-order');
        } else {
          // No known topology between the two; do not warn to avoid noisy hints on isolated nodes
        }
      }
    } else if (type === 'child') {
      // child (to) should be in a later (larger) generation than parent (from)
      if (genTo <= genFrom) {
        const hasKnownTopo = ancOfTo.has(fromId) || descOfTo.has(fromId) || anc.has(toId) || desc.has(toId);
        const dist = desc.get(toId);
        if (typeof dist === 'number' && dist >= 1) {
          const relWord = dist === 1 ? 'child' : dist === 2 ? 'grandchild' : `great-${'great-'.repeat(dist - 3)}grandchild`;
          errors.push(`Cannot set ${nameTo} as child of ${nameFrom}: ${nameTo} is already a ${relWord} of ${nameFrom}.`);
          ruleIds.push('generation-order');
        } else if (ancOfTo.has(fromId)) {
          errors.push(`Cannot set ${nameTo} as child of ${nameFrom}: ${nameTo} is already an ancestor of ${nameFrom}.`);
          ruleIds.push('generation-order');
        } else {
          // No known topology between the two; do not warn to avoid noisy hints on isolated nodes
        }
      }
    }
  }

  // r7b: sibling cannot be created between ancestor/descendant or spouses
  if (type === 'sibling') {
    const isAncestor = ancOfTo.has(fromId) || anc.has(toId);
    const isDescendant = descOfTo.has(fromId) || desc.has(toId);
    if (isAncestor || isDescendant) {
      errors.push('Cannot create sibling relationship between ancestor and descendant');
      ruleIds.push('no-siblings-ancestor-descendant');
    }
    if (spousesOf.get(fromId)?.has(toId) || spousesOf.get(toId)?.has(fromId)) {
      errors.push('Cannot create sibling relationship between spouses');
      ruleIds.push('no-siblings-between-spouses');
    }
  }

  // r6: disallow spouse between ancestor/descendant
  if (type === 'spouse') {
    const isAncestor = ancOfTo.has(fromId) || anc.has(toId);
    const isDescendant = descOfTo.has(fromId) || desc.has(toId);
    if (isAncestor || isDescendant) {
      errors.push('Cannot create spouse relationship between ancestor and descendant');
      ruleIds.push('no-incest-ancestor-descendant');
    }
    // Also disallow spouse between siblings
    if (siblingsOf.get(fromId)?.has(toId) || siblingsOf.get(toId)?.has(fromId)) {
      errors.push('Cannot create spouse relationship between siblings');
      ruleIds.push('no-incest-siblings');
    }
  }

  // r7: optional soft warnings (e.g., many spouses)
  if (type === 'spouse') {
    const spouseCount = (spousesOf.get(fromId) || new Set()).size;
    if (spouseCount >= 1) {
      warnings.push('Member already has a spouse (adding additional spouse)');
      ruleIds.push('warn-multiple-spouses');
    }
  }

  // r8: in-law constraint — block direct parent/child/sibling/spouse links between parent-in-law and child-in-law
  if (type === 'parent' || type === 'child' || type === 'sibling' || type === 'spouse') {
    const inlaw = getInLawRelation(fromId, toId, { parentsOf, childrenOf, spousesOf });
    if (inlaw) {
      const nameFrom = index.get(fromId)?.name || 'Source';
      const nameTo = index.get(toId)?.name || 'Target';
      // Build a directional message that explains the specific in-law relation
      const msg = `Invalid connection: ${nameTo} is the ${inlaw.bIs} of ${nameFrom}, and cannot be set as ${type}.`;
      errors.push(msg);
      ruleIds.push('no-direct-between-inlaws');
    }
  }

  return { ok: errors.length === 0, errors, warnings, ruleIds };
}

/**
 * Convenience function to load graph and run validation for a tree
 */
export async function validateForTree(treeId, fromId, toId, type, options) {
  const graph = await loadTreeGraph(treeId);
  return validateProposedRelationship(graph, String(fromId), String(toId), type, options);
}

function getInLawRelation(a, b, { parentsOf, childrenOf, spousesOf }) {
  // If b is parent of any spouse of a => b is parent-in-law of a; a is child-in-law of b
  for (const s of (spousesOf.get(a) || [])) {
    if ((parentsOf.get(s) || new Set()).has(b)) return { aIs: 'child-in-law', bIs: 'parent-in-law' };
  }
  // If b is spouse of any child of a => b is child-in-law of a; a is parent-in-law of b
  for (const c of (childrenOf.get(a) || [])) {
    if ((spousesOf.get(c) || new Set()).has(b)) return { aIs: 'parent-in-law', bIs: 'child-in-law' };
  }
  // Symmetric checks
  for (const s of (spousesOf.get(b) || [])) {
    if ((parentsOf.get(s) || new Set()).has(a)) return { aIs: 'parent-in-law', bIs: 'child-in-law' };
  }
  for (const c of (childrenOf.get(b) || [])) {
    if ((spousesOf.get(c) || new Set()).has(a)) return { aIs: 'child-in-law', bIs: 'parent-in-law' };
  }
  return null;
}
