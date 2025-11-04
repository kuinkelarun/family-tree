import Member from '../models/Member.js';
import FamilyTree from '../models/FamilyTree.js';

// Recompute generation numbers for all members in a tree.
// Generation definition: generation(root) = 1 for members with no parents;
// generation(child) = max(generation(parent) for each parent) + 1.
// This function loads all members in the tree, builds parent/child maps using
// embedded relationship entries, runs a topological/BFS pass, and writes back
// generation fields for members whose value changed.

export async function recomputeGenerationsForTree(treeId, session = null) {
  // Load members for the tree
  const members = await Member.find({ tree: treeId }).lean();
  if (!Array.isArray(members) || members.length === 0) return { ok: true, updated: 0 };

  const membersById = new Map();
  const ids = [];
  members.forEach((m) => { ids.push(String(m._id)); membersById.set(String(m._id), m); });

  // Build parent and children maps. Be permissive: honor both 'parent' and 'child'
  // entries on each member to be robust against inconsistent data.
  const parents = {}; // childId -> Set(parentId)
  const children = {}; // parentId -> Set(childId)
  ids.forEach((id) => { parents[id] = new Set(); children[id] = new Set(); });

  // Helper to add parent/child
  const addParentChild = (p, c) => {
    if (!parents[c]) parents[c] = new Set();
    if (!children[p]) children[p] = new Set();
    parents[c].add(p);
    children[p].add(c);
  };

  // Inspect each member's relationships
  for (const m of members) {
    const me = String(m._id);
    for (const r of (m.relationships || [])) {
      const relId = String(r.relative);
      const t = String(r.type || '');
      if (!relId) continue;
      // If this member declares a 'child' relation to relId, treat me -> relId
      if (t === 'child') {
        addParentChild(me, relId);
      } else if (t === 'parent') {
        // If this member declares a 'parent' relation to relId, that means
        // this member is a child of relId, so relId -> me
        addParentChild(relId, me);
      }
      // ignore spouse/sibling/custom for generation computation
    }
  }

  // Topological/BFS recompute
  const indegree = {}; // childId -> count of parents remaining
  ids.forEach((id) => { indegree[id] = parents[id] ? parents[id].size : 0; });

  const gen = {}; // computed generation map
  const queue = [];
  // Initialize
  ids.forEach((id) => {
    if (!indegree[id] || indegree[id] === 0) {
      gen[id] = 1; // root
      queue.push(id);
    } else {
      gen[id] = 1; // default minimal
    }
  });

  while (queue.length) {
    const p = queue.shift();
    const parentGen = gen[p] || 1;
    for (const c of (children[p] || [])) {
      const candidate = parentGen + 1;
      if (!gen[c] || candidate > gen[c]) gen[c] = candidate;
      indegree[c] = (indegree[c] || 1) - 1;
      if (indegree[c] === 0) queue.push(c);
    }
  }

  // Nodes still with indegree > 0 are inside cycles. Assign fallback generation
  const inCycle = ids.filter((id) => indegree[id] > 0);
  if (inCycle.length) {
    // For each node in a cycle, set generation to max(parents)+1 if possible
    for (const id of inCycle) {
      const pList = Array.from(parents[id] || []);
      const pGens = pList.map((pid) => gen[pid] || 1);
      gen[id] = (pGens.length ? Math.max(...pGens) + 1 : 1);
    }
  }

  // Prepare bulk update operations only where generation differs
  const bulkOps = [];
  for (const id of ids) {
    const newGen = gen[id] || 1;
    const orig = membersById.get(id);
    const oldGen = orig && typeof orig.generation === 'number' ? orig.generation : 1;
    if (oldGen !== newGen) {
      bulkOps.push({ updateOne: { filter: { _id: id }, update: { $set: { generation: newGen } } } });
    }
  }

  if (!bulkOps.length) return { ok: true, updated: 0 };

  // Execute bulkWrite to update members. If a session is provided, pass it
  try {
    const opts = { ordered: true };
    if (session) opts.session = session;
    const result = await Member.bulkWrite(bulkOps, opts);
    const updated = (result && (result.modifiedCount || result.nModified || 0)) || 0;
    return { ok: true, updated };
  } catch (e) {
    console.error('[recomputeGenerationsForTree] bulkWrite failed', e);
    // Fallback: try sequential updates to at least attempt changes
    let updated = 0;
    for (const op of bulkOps) {
      try {
        if (session) {
          await Member.updateOne(op.updateOne.filter, op.updateOne.update, { session }).exec();
        } else {
          await Member.updateOne(op.updateOne.filter, op.updateOne.update).exec();
        }
        updated += 1;
      } catch (err) {
        console.error('[recomputeGenerationsForTree] sequential update failed for', op.updateOne.filter, err);
      }
    }
    return { ok: false, updated, error: 'bulkWrite failed; attempted sequential updates' };
  }
}
