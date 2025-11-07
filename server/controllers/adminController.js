import { listQueuedJobs, forceRetry, removeJob } from '../utils/recomputeQueue.js';
import RecomputeJob from '../models/RecomputeJob.js';
import FamilyTree from '../models/FamilyTree.js';
import { validationRuleMetadata } from '../utils/relationshipRules.js';

const VALID_SEVERITIES = ['error','warn','off'];

export async function getRecomputeQueue(req, res) {
  try {
    // Support pagination/filtering via query params: page, limit, status, treeId
    const page = parseInt(req.query.page || '1', 10) || 1;
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const status = req.query.status || undefined;
    const treeId = req.query.treeId || undefined;

    const { items, total } = await listQueuedJobs({ page, limit, status, treeId });
    // Populate tree title for convenience
    const withMeta = await Promise.all(items.map(async (j) => {
      const tree = await FamilyTree.findById(j.treeId).select('title owner').lean();
      return { ...j, treeTitle: tree?.title || null, treeOwner: tree?.owner || null };
    }));
    res.json({ items: withMeta, total, page, limit });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function postForceRetry(req, res) {
  try {
    const { jobId } = req.params;
    const job = await forceRetry(jobId);
    res.json({ ok: true, job });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function postRemoveJob(req, res) {
  try {
    const { jobId } = req.params;
    await removeJob(jobId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function getRuleSeverities(req, res) {
  try {
    const { treeId } = req.params;
    const tree = await FamilyTree.findById(treeId).select('validationConfig owner permissions').lean();
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    // Basic access: owner or editor via permissions (admin middleware already applied)
    const allowed = String(tree.owner) === String(req.user.id) || (tree.permissions || []).some(p => String(p.user) === String(req.user.id) && p.access !== 'viewer');
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  const rawSev = tree.validationConfig?.severities;
  const severities = rawSev instanceof Map ? Object.fromEntries(rawSev.entries()) : (rawSev && typeof rawSev === 'object' ? { ...rawSev } : {});
  res.json({ ok: true, severities });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function patchRuleSeverities(req, res) {
  try {
    const { treeId } = req.params;
    const { updates } = req.body || {};
    if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'updates object required' });
    const tree = await FamilyTree.findById(treeId);
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    const allowed = String(tree.owner) === String(req.user.id) || (tree.permissions || []).some(p => String(p.user) === String(req.user.id) && p.access !== 'viewer');
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    tree.validationConfig = tree.validationConfig || {};
    const map = tree.validationConfig.severities instanceof Map ? tree.validationConfig.severities : new Map();
    for (const [ruleId, severity] of Object.entries(updates)) {
      if (!VALID_SEVERITIES.includes(severity)) return res.status(400).json({ error: `Invalid severity '${severity}' for rule '${ruleId}'` });
      // If the requested value equals the default for this rule, do not persist an override
      const meta = validationRuleMetadata.find(m => m.id === ruleId);
      const defaultSeverity = meta?.defaultSeverity || 'error';
      if (severity === defaultSeverity) {
        // Ensure any existing override is removed
        if (map.has(ruleId)) map.delete(ruleId);
      } else {
        map.set(ruleId, severity);
      }
    }
    tree.validationConfig.severities = map;
    await tree.save();
    res.json({ ok: true, severities: Object.fromEntries(map.entries()) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteRuleSeverity(req, res) {
  try {
    const { treeId, ruleId } = req.params;
    const tree = await FamilyTree.findById(treeId);
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    const allowed = String(tree.owner) === String(req.user.id) || (tree.permissions || []).some(p => String(p.user) === String(req.user.id) && p.access !== 'viewer');
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    if (tree.validationConfig?.severities instanceof Map && tree.validationConfig.severities.has(ruleId)) {
      tree.validationConfig.severities.delete(ruleId);
      await tree.save();
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function getValidationRulesMetadata(req, res) {
  try {
    // No DB needed; served from code metadata to keep server authoritative
    res.json({ ok: true, rules: validationRuleMetadata });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
