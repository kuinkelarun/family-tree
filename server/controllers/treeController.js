import FamilyTree from '../models/FamilyTree.js';
import Member from '../models/Member.js';
import { treeSchema } from '../utils/validate.js';

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
    const trees = await FamilyTree.find({ $or: [{ owner: req.user.id }, { 'permissions.user': req.user.id }] }).select('title owner settings createdAt updatedAt');
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

    // Remove all members belonging to this tree, then delete the tree
    await Member.deleteMany({ tree: tree._id });
    await tree.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
