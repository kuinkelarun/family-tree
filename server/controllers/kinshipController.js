import FamilyTree from '../models/FamilyTree.js';
import Member from '../models/Member.js';
import { kinshipBetween } from '../utils/kinship.js';

async function ensureTreeAccess(treeId, userId) {
  const tree = await FamilyTree.findById(treeId).lean();
  if (!tree) return { status: 404, error: 'Not found' };
  const allowed = String(tree.owner) === String(userId) ||
    (tree.permissions || []).some((p) => String(p.user) === String(userId));
  if (!allowed) return { status: 403, error: 'Forbidden' };
  return { status: 200, tree };
}

export async function getKinshipBetween(req, res) {
  try {
    const treeId = req.params.id;
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

    const access = await ensureTreeAccess(treeId, req.user.id);
    if (access.status !== 200) return res.status(access.status).json({ error: access.error });

    const members = await Member.find({ tree: treeId }).select('_id relationships').lean();
    const result = kinshipBetween(from, to, members, { depthLimit: parseInt(req.query.depth || '10', 10) });
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

export async function getKinshipMapForMember(req, res) {
  try {
    const treeId = req.params.id;
    const memberId = String(req.params.memberId || '');
    if (!memberId) return res.status(400).json({ error: 'memberId required' });

    const access = await ensureTreeAccess(treeId, req.user.id);
    if (access.status !== 200) return res.status(access.status).json({ error: access.error });

    const limit = Math.max(1, Math.min(10, parseInt(req.query.depth || '10', 10)));
    const members = await Member.find({ tree: treeId }).select('_id relationships').lean();

    // Naive map: compute relation from memberId to every other member (acceptable for typical sizes)
    const out = [];
    for (const m of members) {
      if (String(m._id) === memberId) continue;
      const r = kinshipBetween(memberId, String(m._id), members, { depthLimit: limit });
      out.push({ to: String(m._id), ...r });
    }
    return res.json({ count: out.length, relations: out });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
