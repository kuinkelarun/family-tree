import FamilyTree from '../models/FamilyTree.js';
import Member from '../models/Member.js';
import { treeSchema } from '../utils/validate.js';
import { recomputeGenerationsForTree } from '../utils/generation.js';
import { enqueueRecompute } from '../utils/recomputeQueue.js';
import { startWorker } from '../utils/recomputeQueue.js';

export async function createTree(req, res) {
  try {
    const parsed = treeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const tree = await FamilyTree.create({ owner: req.user.id, title: parsed.data.title, permissions: [{ user: req.user.id, access: 'owner' }] });
    res.status(201).json(tree);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function getTree(req, res) {
  try {
    // Populate members and convert to plain object to ensure all fields are included
    const tree = await FamilyTree.findById(req.params.id).populate('members').lean();
    if (!tree) return res.status(404).json({ error: 'Not found' });
    // Hide soft-deleted trees from normal access
    if (tree.deletedAt) return res.status(404).json({ error: 'Not found' });
    // Simple access check: owner or permission entry
    const allowed = String(tree.owner) === String(req.user.id) || 
      tree.permissions?.some((p) => String(p.user) === String(req.user.id));
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    console.log('[getTree] Returning tree with', tree.members?.length, 'members');
    tree.members?.forEach((m, i) => {
      console.log(`  [${i}] ${m.name}: position=`, m.position);
    });
    res.json(tree);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function listMyTrees(req, res) {
  try {
    // By default exclude soft-deleted trees. If caller provides ?showDeleted=true include them.
    const includeDeleted = req.query.showDeleted === 'true';
    const baseQ = { $or: [{ owner: req.user.id }, { 'permissions.user': req.user.id }] };
    if (!includeDeleted) baseQ.deletedAt = { $exists: false };
    const trees = await FamilyTree.find(baseQ).select('title owner settings createdAt updatedAt deletedAt');
    res.json(trees);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteTree(req, res) {
  try {
    const tree = await FamilyTree.findById(req.params.id);
    if (!tree) return res.status(404).json({ error: 'Not found' });
    // Only owner may delete an entire tree
    if (!tree.owner.equals(req.user.id)) return res.status(403).json({ error: 'Forbidden' });

    const hard = !!req.query.hard;
    if (hard) {
      // permanent removal: cascade-delete members then remove tree
      await Member.deleteMany({ tree: tree._id });
      await tree.deleteOne();
      return res.json({ ok: true, deleted: true });
    }

    // Soft-delete: mark with deletedAt timestamp so it can be restored later
    tree.deletedAt = new Date();
    await tree.save();
    return res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function listArchivedTrees(req, res) {
  try {
    // list soft-deleted trees for the current user
  const trees = await FamilyTree.find({ owner: req.user.id, deletedAt: { $exists: true } }).populate('owner', 'email').select('title owner createdAt deletedAt').lean();
  // Map owner email into ownerEmail for client convenience
  const out = trees.map(t => ({ ...t, ownerEmail: t.owner?.email || String(t.owner) }));
  res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function restoreTree(req, res) {
  try {
    const tree = await FamilyTree.findById(req.params.id);
    if (!tree) return res.status(404).json({ error: 'Not found' });
    if (!tree.owner.equals(req.user.id)) return res.status(403).json({ error: 'Forbidden' });
    tree.deletedAt = undefined;
    await tree.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function updateMarriagePoint(req, res) {
  try {
    const treeId = req.params.id;
    const { id, position, parents } = req.body || {};
    if (!id) return res.status(400).json({ error: 'marriage point id required' });

    const tree = await FamilyTree.findById(treeId);
    if (!tree) return res.status(404).json({ error: 'Not found' });

    // Permission: owner or editor
    const allowed = String(tree.owner) === String(req.user.id) ||
      tree.permissions?.some((p) => String(p.user) === String(req.user.id) && p.access !== 'viewer');
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    // Locate existing marriagePoint by id
    const idx = (tree.marriagePoints || []).findIndex(mp => String(mp.id) === String(id));
    const toSet = { id };
    if (Array.isArray(parents)) toSet.parents = parents.map(p => p);
    if (position && typeof position.x === 'number' && typeof position.y === 'number') toSet.position = { x: position.x, y: position.y };

    if (idx >= 0) {
      // merge
      tree.marriagePoints[idx] = { ...tree.marriagePoints[idx].toObject?.(), ...toSet };
    } else {
      tree.marriagePoints.push(toSet);
    }

    await tree.save();
    res.json({ ok: true, marriagePoints: tree.marriagePoints });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function recomputeGenerations(req, res) {
  try {
    const treeId = req.params.id;
    const tree = await FamilyTree.findById(treeId);
    if (!tree) return res.status(404).json({ error: 'Not found' });
    const allowed = String(tree.owner) === String(req.user.id) ||
      tree.permissions?.some((p) => String(p.user) === String(req.user.id) && p.access !== 'viewer');
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    try {
      const result = await recomputeGenerationsForTree(treeId);
      if (result && result.ok) return res.json({ ok: true, updated: result.updated });
      // If recompute reported failure, enqueue and return accepted
      enqueueRecompute(treeId);
      return res.status(202).json({ ok: false, message: 'Recompute enqueued for background retry' });
    } catch (e) {
      console.error('[treeController.recomputeGenerations] recompute failed', e);
      enqueueRecompute(treeId);
      return res.status(202).json({ ok: false, message: 'Recompute enqueued for background retry' });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// Start the background worker when treeController is loaded (ensures it's started once)
try {
  startWorker();
  console.log('[treeController] recompute worker started');
} catch (e) {
  console.error('[treeController] failed to start recompute worker', e);
}
