import FamilyTree from '../models/FamilyTree.js';
import Member from '../models/Member.js';
import { kinshipBetween } from '../utils/kinship.js';
import { localizeKinship } from '../utils/kinshipLocalization.js';
import { derivePronouns } from '../utils/pronouns.js';

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

  // Include gender for localization (gendered relation labels later)
  const members = await Member.find({ tree: treeId }).select('_id relationships gender').lean();
  // Optional: restrict kinship inference to only members present on the canvas
  // (client may pass a comma-separated list of member ids via ?canvasMembers=id1,id2,...)
  const canvasMembersParam = String(req.query.canvasMembers || '').trim();
  let membersForInference = members;
  if (canvasMembersParam) {
    const allowed = new Set(canvasMembersParam.split(',').map(s => String(s).trim()).filter(Boolean));
    // If either of the queried members is not present on the canvas, the relationship cannot be determined here
    if (!allowed.has(from) || !allowed.has(to)) {
      return res.status(400).json({ error: 'Both "from" and "to" must be present on the canvas (pass their ids via canvasMembers).' });
    }
    membersForInference = members.filter(m => allowed.has(String(m._id)));
  }
  const locale = String(req.query.locale || 'en');
  const includePronouns = String(req.query.includePronouns || 'false') === 'true';
  const result = kinshipBetween(from, to, membersForInference, { depthLimit: parseInt(req.query.depth || '10', 10) });
  // Gendered label based on relationCode.gender (relative A)
  const genderedLabel = localizeKinship(result, locale);
  // Neutral label for comparison (force neutral gender selection)
  const neutralLabel = localizeKinship(result, locale, { forceGender: 'neutral' });
  const payload = { ...result, localizedLabel: genderedLabel, genderedLabel, neutralLabel, locale };
  if (includePronouns) {
    const byId = new Map(members.map(m => [String(m._id), m]));
    const mA = byId.get(String(from));
    const mB = byId.get(String(to));
    payload.pronounsA = derivePronouns(mA?.gender, mA?.pronounOverride);
    payload.pronounsB = derivePronouns(mB?.gender, mB?.pronounOverride);
  }
  return res.json(payload);
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
  const members = await Member.find({ tree: treeId }).select('_id relationships gender').lean();
  const canvasMembersParam = String(req.query.canvasMembers || '').trim();
  let membersForInference = members;
  if (canvasMembersParam) {
    const allowed = new Set(canvasMembersParam.split(',').map(s => String(s).trim()).filter(Boolean));
    if (!allowed.has(memberId)) return res.status(400).json({ error: 'memberId must be present on the canvas (pass canvasMembers).' });
    membersForInference = members.filter(m => allowed.has(String(m._id)));
  }

    // Naive map: compute relation from memberId to every other member (acceptable for typical sizes)
    const out = [];
    for (const m of members) {
      if (String(m._id) === memberId) continue;
      const locale = String(req.query.locale || 'en');
      const includePronouns = String(req.query.includePronouns || 'false') === 'true';
  const r = kinshipBetween(memberId, String(m._id), membersForInference, { depthLimit: limit });
      const genderedLabel = localizeKinship(r, locale);
      const neutralLabel = localizeKinship(r, locale, { forceGender: 'neutral' });
      const row = { to: String(m._id), ...r, localizedLabel: genderedLabel, genderedLabel, neutralLabel, locale };
      if (includePronouns) {
        const me = members.find(x => String(x._id) === memberId);
        row.pronounsA = derivePronouns(me?.gender, me?.pronounOverride);
        row.pronounsB = derivePronouns(m?.gender, m?.pronounOverride);
      }
      out.push(row);
    }
    return res.json({ count: out.length, relations: out });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
