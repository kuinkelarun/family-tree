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
      } else if (r.type === 'spouse' || r.type === 'partner' || (r.type === 'custom' && typeof r.label === 'string' && ['partner','spouse'].includes(r.label.toLowerCase()))) {
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

  // Inference pass: propagate known parents across explicit sibling edges.
  // If X is an explicit sibling of Y and Y has a parent P, infer P as a parent of X (and X as a child of P).
  // This helps when sibling links exist but parent links are missing for one sibling (common in partial data entry).
  for (const [x, sibs] of siblingsOf.entries()) {
    const xParents = parentsOf.get(x) || new Set();
    for (const y of sibs) {
      const yParents = parentsOf.get(y) || new Set();
      for (const p of yParents) {
        if (!xParents.has(p)) {
          add(parentsOf, x, p);
          add(childrenOf, p, x);
        }
      }
    }
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

  // Lineal (A relative to B):
  // If B is a descendant of A, then A is an ancestor of B (parent/grandparent...).
  const downA = bfsDown(a, childrenOf, depthLimit);
  if (downA.has(b)) {
    const d = downA.get(b);
    const label = linealLabel('up', d); // A is parent/grandparent of B
    return { label, class: 'lineal', meta: { role: 'ancestor', steps: d } };
  }
  // If B is an ancestor of A, then A is a descendant of B (child/grandchild...).
  const upA = bfsUp(a, parentsOf, depthLimit);
  if (upA.has(b)) {
    const d = upA.get(b);
    const label = linealLabel('down', d); // A is child/grandchild of B
    return { label, class: 'lineal', meta: { role: 'descendant', steps: d } };
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

  // Collateral via explicit siblings: aunt/uncle and niece/nephew through sibling-of-parent (or higher ancestors)
  // Case 1: A is sibling of an ancestor of B => A is (great-)* aunt/uncle of B
  const upB2 = bfsUp(b, parentsOf, depthLimit);
  let bestAU = null;
  for (const [anc, k] of upB2) {
    if (k < 1) continue;
    if ((siblingsOf.get(anc) || new Set()).has(a)) {
      if (!bestAU || k < bestAU.k) bestAU = { anc, k };
    }
  }
  if (bestAU) {
    const label = auntUncleLabel(bestAU.k);
    return { label, class: 'collateral', meta: { viaAncestor: bestAU.anc, stepsUp: bestAU.k, kind: 'aunt-uncle' } };
  }

  // Case 2: B is sibling of an ancestor of A => A is (great-)* niece/nephew of B
  const upA2 = bfsUp(a, parentsOf, depthLimit);
  let bestNN = null;
  for (const [anc, k] of upA2) {
    if (k < 1) continue;
    if ((siblingsOf.get(anc) || new Set()).has(b)) {
      if (!bestNN || k < bestNN.k) bestNN = { anc, k };
    }
  }
  if (bestNN) {
    const label = nieceNephewLabel(bestNN.k);
    return { label, class: 'collateral', meta: { viaAncestor: bestNN.anc, stepsUp: bestNN.k, kind: 'niece-nephew' } };
  }

  // Cousins via explicit sibling links between ancestors
  // If some ancestor of A is an explicit sibling of some ancestor of B, treat as cousins
  // Approximate MRCA at one generation above those sibling-ancestors.
  let bestCousin = null; // { ancA, kA, ancB, kB, degree, removal, cost }
  for (const [ancA, kA] of upA2) {
    if (kA < 1) continue;
    const sibsA = siblingsOf.get(ancA) || new Set();
    if (!sibsA.size) continue;
    for (const [ancB, kB] of upB2) {
      if (kB < 1) continue;
      if (sibsA.has(ancB)) {
        // Effective distances to inferred MRCA are (kA+1) and (kB+1)
        const effA = kA + 1;
        const effB = kB + 1;
        const degree = Math.min(effA, effB) - 1;
        const removal = Math.abs(effA - effB);
        const cost = effA + effB; // prefer closer common ancestry
        if (degree >= 1) {
          if (!bestCousin || cost < bestCousin.cost || (cost === bestCousin.cost && removal < bestCousin.removal)) {
            bestCousin = { ancA, kA, ancB, kB, degree, removal, cost };
          }
        }
      }
    }
  }
  if (bestCousin) {
    const ord = ordinalForDegree(bestCousin.degree);
    const label = bestCousin.removal === 0 ? `${ord} cousin` : `${ord} cousin ${removalLabel(bestCousin.removal)}`;
    return { label, class: 'collateral', meta: { viaAncestors: [bestCousin.ancA, bestCousin.ancB], stepsUpA: bestCousin.kA, stepsUpB: bestCousin.kB, degree: bestCousin.degree, removal: bestCousin.removal } };
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
  // Base consanguine/spouse/sibling detection
  const base = classifyConsanguine(A, B, graphs, options);
  // If we already have a specific non-none label (including spouse), return it
  if (base && base.class !== 'none' && base.label && !/^related \(undetermined/.test(base.label)) {
    return { ...base, meta: { ...(base.meta || {}), affinal: !!(base.class === 'affinal'), step: false } };
  }
  // Try step- and in-law overlays
  const over = overlayAffinalStep(A, B, graphs, options);
  if (over) return over;
  // Fallback to base (unrelated or undetermined)
  return { ...base, meta: { ...(base.meta || {}), affinal: false, step: false } };
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

// Generate aunt/uncle style labels based on ancestor distance k (1 => aunt/uncle, 2 => grand-aunt/uncle, 3+ => great-...grand-aunt/uncle)
function auntUncleLabel(k) {
  if (k <= 1) return 'aunt/uncle';
  if (k === 2) return 'grand-aunt/uncle';
  return `${'great-'.repeat(k - 2)}grand-aunt/uncle`;
}

// Generate niece/nephew labels based on ancestor distance k (1 => niece/nephew, 2 => grand-niece/nephew, 3+ => great-...grand-niece/nephew)
function nieceNephewLabel(k) {
  if (k <= 1) return 'niece/nephew';
  if (k === 2) return 'grand-niece/nephew';
  return `${'great-'.repeat(k - 2)}grand-niece/nephew`;
}

// -------- affinal & step overlays --------
export function overlayAffinalStep(A, B, graphs, options = {}) {
  const { parentsOf, spousesOf } = graphs;
  const a = String(A), b = String(B);

  // Step-parent / step-child
  // A is spouse of a parent of B (but not a parent) => A is step-parent of B
  for (const p of (parentsOf.get(b) || [])) {
    if ((spousesOf.get(p) || new Set()).has(a) && !(parentsOf.get(b) || new Set()).has(a)) {
      return { label: 'step-parent', class: 'step', meta: { role: 'step-parent', viaParent: p, affinal: false, step: true } };
    }
  }
  // B is spouse of a parent of A (but not a parent) => A is step-child of B
  for (const p of (parentsOf.get(a) || [])) {
    if ((spousesOf.get(p) || new Set()).has(b) && !(parentsOf.get(a) || new Set()).has(b)) {
      return { label: 'step-child', class: 'step', meta: { role: 'step-child', viaParent: p, affinal: false, step: true } };
    }
  }

  // Step-sibling: parents not shared, but a parent of A is married to a parent of B
  const pA = parentsOf.get(a) || new Set();
  const pB = parentsOf.get(b) || new Set();
  if (intersectCount(pA, pB) === 0) {
    for (const pa of pA) {
      const sp = spousesOf.get(pa) || new Set();
      for (const pb of pB) {
        if (sp.has(pb)) {
          return { label: 'step-sibling', class: 'step', meta: { viaParents: [pa, pb], affinal: false, step: true } };
        }
      }
    }
  }

  // In-law overlays: consanguine relation with the other's spouse, or between spouses
  // 1) A with any spouse of B
  for (const sb of (spousesOf.get(b) || [])) {
    const r = classifyConsanguine(a, sb, graphs, options);
    if (r && r.class !== 'none' && r.label && !/^related \(undetermined/.test(r.label) && r.label !== 'unrelated (by blood)') {
      return affinalize(r);
    }
  }
  // 2) Any spouse of A with B
  for (const sa of (spousesOf.get(a) || [])) {
    const r = classifyConsanguine(sa, b, graphs, options);
    if (r && r.class !== 'none' && r.label && !/^related \(undetermined/.test(r.label) && r.label !== 'unrelated (by blood)') {
      return affinalize(r);
    }
  }
  // 3) Spouse of A with spouse of B
  for (const sa of (spousesOf.get(a) || [])) {
    for (const sb of (spousesOf.get(b) || [])) {
      const r = classifyConsanguine(sa, sb, graphs, options);
      if (r && r.class !== 'none' && r.label && !/^related \(undetermined/.test(r.label) && r.label !== 'unrelated (by blood)') {
        return affinalize(r);
      }
    }
  }

  return null;
}

function affinalize(res) {
  // Normalize some common labels to -in-law forms
  let base = res.label || '';
  // Map half-sibling -> sibling-in-law as common social label
  if (base === 'half-sibling') base = 'sibling';
  // parent/grandparent/...-in-law, sibling-in-law, cousin-in-law, aunt/uncle-in-law, niece/nephew-in-law
  const label = `${base} in-law`;
  return { label, class: 'affinal', meta: { ...(res.meta || {}), affinal: true, step: false } };
}
