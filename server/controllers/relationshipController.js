import Member from '../models/Member.js';
import FamilyTree from '../models/FamilyTree.js';
import { relationshipSchema, relationshipUpdateSchema, relationshipDeleteSchema } from '../utils/validate.js';

export async function addRelationship(req, res) {
  try {
    const parsed = relationshipSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { fromMemberId, toMemberId, type, label } = parsed.data;
    const from = await Member.findById(fromMemberId);
    const to = await Member.findById(toMemberId);
    if (!from || !to) return res.status(404).json({ error: 'Member not found' });
    if (!from.tree.equals(to.tree)) return res.status(400).json({ error: 'Members must belong to same tree' });
    const tree = await FamilyTree.findById(from.tree);
    if (!(tree.owner.equals(req.user.id) || tree.permissions.some((p) => p.user.equals(req.user.id) && p.access !== 'viewer')))
      return res.status(403).json({ error: 'Forbidden' });

  // Add directionally and ensure reciprocal where appropriate
  if (!Array.isArray(from.relationships)) from.relationships = [];
  from.relationships.push({ relative: to._id, type, label });
  if (!Array.isArray(to.relationships)) to.relationships = [];
  if (type === 'parent') to.relationships.push({ relative: from._id, type: 'child' });
  else if (type === 'child') to.relationships.push({ relative: from._id, type: 'parent' });
  else if (type === 'spouse') to.relationships.push({ relative: from._id, type: 'spouse' });
  else if (type === 'sibling') to.relationships.push({ relative: from._id, type: 'sibling' });

    await from.save();
    await to.save();
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

function reciprocalOf(type) {
  if (type === 'parent') return 'child';
  if (type === 'child') return 'parent';
  if (type === 'spouse') return 'spouse';
  if (type === 'sibling') return 'sibling';
  return null; // custom has no enforced reciprocal
}

export async function updateRelationship(req, res) {
  try {
    const parsed = relationshipUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { fromMemberId, toMemberId, type, newType, label } = parsed.data;
    const from = await Member.findById(fromMemberId);
    const to = await Member.findById(toMemberId);
    if (!from || !to) return res.status(404).json({ error: 'Member not found' });
    if (!from.tree.equals(to.tree)) return res.status(400).json({ error: 'Members must belong to same tree' });
    const tree = await FamilyTree.findById(from.tree);
    if (!(tree.owner.equals(req.user.id) || tree.permissions.some((p) => p.user.equals(req.user.id) && p.access !== 'viewer')))
      return res.status(403).json({ error: 'Forbidden' });

    // locate existing relationship on 'from'
    const idx = (from.relationships || []).findIndex((r) => String(r.relative) === String(to._id) && r.type === type);
    if (idx === -1) return res.status(404).json({ error: 'Relationship not found' });

    // update from side
    const nextType = newType || type;
    from.relationships[idx].type = nextType;
    if (typeof label !== 'undefined') from.relationships[idx].label = label;

    // update reciprocal on 'to' side for supported types
    const prevRecip = reciprocalOf(type);
    const nextRecip = reciprocalOf(nextType);
    if (prevRecip) {
      // remove previous reciprocal entry
      to.relationships = (to.relationships || []).filter((r) => !(String(r.relative) === String(from._id) && r.type === prevRecip));
    }
    if (nextRecip) {
      // ensure new reciprocal exists
      to.relationships = to.relationships || [];
      to.relationships.push({ relative: from._id, type: nextRecip });
    }

    await from.save();
    await to.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteRelationship(req, res) {
  try {
    const parsed = relationshipDeleteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { fromMemberId, toMemberId, type } = parsed.data;
    const from = await Member.findById(fromMemberId);
    const to = await Member.findById(toMemberId);
    if (!from || !to) return res.status(404).json({ error: 'Member not found' });
    if (!from.tree.equals(to.tree)) return res.status(400).json({ error: 'Members must belong to same tree' });
    const tree = await FamilyTree.findById(from.tree);
    if (!(tree.owner.equals(req.user.id) || tree.permissions.some((p) => p.user.equals(req.user.id) && p.access !== 'viewer')))
      return res.status(403).json({ error: 'Forbidden' });

    from.relationships = (from.relationships || []).filter((r) => !(String(r.relative) === String(to._id) && r.type === type));
    const recip = reciprocalOf(type);
    if (recip) {
      to.relationships = (to.relationships || []).filter((r) => !(String(r.relative) === String(from._id) && r.type === recip));
    }

    await from.save();
    await to.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
