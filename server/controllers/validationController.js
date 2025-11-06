import FamilyTree from '../models/FamilyTree.js';
import { validateTreeRelationships } from '../utils/normalizeRelationships.js';

export async function getValidateTree(req, res) {
  try {
    const { id } = req.params; // tree id
    const tree = await FamilyTree.findById(id);
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    // Basic RBAC: require owner or editor/admin access
    const allowed = String(tree.owner) === String(req.user.id) ||
      (tree.permissions || []).some(p => String(p.user) === String(req.user.id) && p.access !== 'viewer');
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const report = await validateTreeRelationships(id);
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
