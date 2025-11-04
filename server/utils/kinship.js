// Kinship inference utilities (Phase 1: consanguine relationships)
// ES modules; exported helpers are pure functions working on plain objects

/**
 * Build normalized adjacency from members list.
 * @param {Array} members - array of member docs (lean objects) with relationships
 * @returns {{ parentsOf: Map<string, Set<string>>, childrenOf: Map<string, Set<string>>, spousesOf: Map<string, Set<string>> }}
 */
export function buildAdjacency(members) {
  const parentsOf = new Map();
  const childrenOf = new Map();
  const spousesOf = new Map();
  const siblingsOf = new Map();

  const add = (map, k, v) => {
    const ks = String(k);
    const vs = String(v);
    if (!map.has(ks)) map.set(ks, new Set());
    map.get(ks).add(vs);
  };

  for (const m of members || []) {
    const mid = String(m._id);
    for (const r of m.relationships || []) {
      const rid = String((r.relative && r.relative._id) || r.relative);
      if (!rid) continue;
      if (r.type === 'child') {
        add(childrenOf, mid, rid); // m -> child
        add(parentsOf, rid, mid);  // child -> m
      } else if (r.type === 'parent') {
        add(parentsOf, mid, rid);  // m -> parent
        add(childrenOf, rid, mid); // parent -> m
      } else if (r.type === 'spouse') {
        add(spousesOf, mid, rid);  // symmetric spouse relation
        add(spousesOf, rid, mid);
      } else if (r.type === 'sibling') {
        // Track explicit sibling edges (may exist even without parent data)
        if (!siblingsOf.has(mid)) siblingsOf.set(mid, new Set());
        if (!siblingsOf.has(rid)) siblingsOf.set(rid, new Set());
        siblingsOf.get(mid).add(rid);
        siblingsOf.get(rid).add(mid);
      }
    }
    // ensure keys exist
    if (!parentsOf.has(mid)) parentsOf.set(mid, new Set());
    if (!childrenOf.has(mid)) childrenOf.set(mid, new Set());
    if (!spousesOf.has(mid)) spousesOf.set(mid, new Set());
    if (!siblingsOf.has(mid)) siblingsOf.set(mid, new Set());
  }

  return { parentsOf, childrenOf, spousesOf, siblingsOf };
}

/** BFS upwards to ancestors returning distances (steps). */
export function bfsUp(start, parentsOf, limit = 10) {
  const s = String(start);
  const dist = new Map([[s, 0]]);
  const q = [s];
  while (q.length) {
    const u = q.shift();
    const d = dist.get(u) || 0;
    if (d >= limit) continue;
    for (const p of parentsOf.get(u) || []) {
      if (!dist.has(p)) { dist.set(p, d + 1); q.push(p); }
    }
  }
  dist.delete(s);
  return dist; // id -> steps up
}

/** BFS downwards to descendants returning distances (steps). */
export function bfsDown(start, childrenOf, limit = 10) {
  const s = String(start);
  const dist = new Map([[s, 0]]);
  const q = [s];
  while (q.length) {
    const u = q.shift();
    const d = dist.get(u) || 0;
    if (d >= limit) continue;
    for (const c of childrenOf.get(u) || []) {
      if (!dist.has(c)) { dist.set(c, d + 1); q.push(c); }
    }
  }
  dist.delete(s);
  return dist; // id -> steps down
}

/** Find nearest common ancestor minimizing k+l (steps up from A and B). */
export function findMRCA(A, B, parentsOf, limit = 10) {
  const ancA = bfsUp(A, parentsOf, limit);
  const ancB = bfsUp(B, parentsOf, limit);
  let best = null;
  for (const [id, k] of ancA) {
    const l = ancB.get(id);
    if (l == null) continue;
    const cost = k + l;
    if (!best || cost < best.cost) best = { id, k, l, cost };
  }
  return best; // or null
}

/**
 * Classify consanguine relationship between A and B using adjacency.
 * @returns {{ label: string, class: string, meta: object }}
 */
export function classifyConsanguine(A, B, graphs, options = {}) {
  const { parentsOf, childrenOf, spousesOf, siblingsOf } = graphs;
  const depthLimit = options.depthLimit || 10;
  const a = String(A), b = String(B);
  if (a === b) return { label: 'self', class: 'none', meta: {} };

  // Direct spouse relation (affinal)
  if ((spousesOf.get(a) || new Set()).has(b)) {
    return { label: 'spouse', class: 'affinal', meta: { affinal: true } };
  }

  // Lineal: descendants
  const downA = bfsDown(a, childrenOf, depthLimit);
  if (downA.has(b)) {
    const d = downA.get(b);
    const label = linealLabel('down', d);
    return { label, class: 'lineal', meta: { direction: 'descendant', steps: d } };
  }
  // Lineal: ancestors
  const upA = bfsUp(a, parentsOf, depthLimit);
  if (upA.has(b)) {
    const d = upA.get(b);
    const label = linealLabel('up', d);
    return { label, class: 'lineal', meta: { direction: 'ancestor', steps: d } };
  }

  // Siblings / half-siblings
  const pA = parentsOf.get(a) || new Set();
  const pB = parentsOf.get(b) || new Set();
  const shared = intersectCount(pA, pB);
  if (shared > 0) {
    const half = shared === 1; // 2 => full siblings (or >2 in complex graphs)
    return { label: half ? 'half-sibling' : 'sibling', class: 'collateral', meta: { half, sharedParents: shared } };
  }
  // If explicit sibling edge exists (without parent data), treat as sibling
  if ((siblingsOf.get(a) || new Set()).has(b)) {
    return { label: 'sibling', class: 'collateral', meta: { explicit: true } };
  }

  // MRCA for collateral relations (aunt/uncle/niece/nephew/cousins)
  const mrca = findMRCA(a, b, parentsOf, depthLimit);
  if (!mrca) {
    return { label: 'unrelated (by blood)', class: 'none', meta: {} };
  }

  const { k, l, id: mrcaId } = mrca;
  const minKL = Math.min(k, l);
  const maxKL = Math.max(k, l);

  if (minKL === 1 && maxKL >= 2) {
    // Aunt/Uncle vs Niece/Nephew
    const isAuntUncle = k === 1; // A is the aunt/uncle of B if A is 1 up from MRCA
    const greats = maxKL - 2;
    const base = isAuntUncle ? 'aunt/uncle' : 'niece/nephew';
    const label = greats > 0 ? `${'great-'.repeat(greats)}${base}` : base;
    return { label, class: 'collateral', meta: { mrcaId, k, l, kind: isAuntUncle ? 'aunt-uncle' : 'niece-nephew', greats } };
  }

  if (minKL >= 2) {
    const degree = minKL - 1;
    const removal = Math.abs(k - l);
    const ord = ordinalForDegree(degree);
    const label = removal === 0 ? `${ord} cousin` : `${ord} cousin ${removalLabel(removal)}`;
    return { label, class: 'collateral', meta: { mrcaId, k, l, degree, removal } };
  }

  // Fallback
  return { label: 'related (undetermined collateral)', class: 'collateral', meta: { mrcaId, k, l } };
}

export function kinshipBetween(A, B, members, options = {}) {
  const graphs = buildAdjacency(members);
  const res = classifyConsanguine(A, B, graphs, options);
  return { ...res, meta: { ...(res.meta || {}), affinal: false, step: false } };
}

// -------- helpers --------
function intersectCount(a, b) {
  let n = 0; for (const x of a) if (b.has(x)) n++; return n;
}

function linealLabel(direction, steps) {
  if (direction === 'down') {
    if (steps === 1) return 'child';
    if (steps === 2) return 'grandchild';
    return `${'great-'.repeat(steps - 2)}grandchild`;
  } else { // up
    if (steps === 1) return 'parent';
    if (steps === 2) return 'grandparent';
    return `${'great-'.repeat(steps - 2)}grandparent`;
  }
}

function ordinalForDegree(deg) {
  const fixed = ['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth'];
  return fixed[deg - 1] || `${deg}th`;
}

function removalLabel(rem) {
  if (rem === 1) return 'once removed';
  if (rem === 2) return 'twice removed';
  return `${rem} times removed`;
}
