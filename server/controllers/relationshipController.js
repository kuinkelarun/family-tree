import mongoose from 'mongoose';
import Member from '../models/Member.js';
import FamilyTree from '../models/FamilyTree.js';
import { relationshipSchema, relationshipUpdateSchema, relationshipDeleteSchema } from '../utils/validate.js';
import { recomputeGenerationsForTree } from '../utils/generation.js';
import { enqueueRecompute } from '../utils/recomputeQueue.js';
import { runAtomic } from '../utils/dbTransactions.js';
import { loadTreeGraph, validateProposedRelationship } from '../utils/relationshipRules.js';
import AdminConfig from '../models/AdminConfig.js';

export async function addRelationship(req, res) {
  const parsed = relationshipSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { fromMemberId, toMemberId, type, label } = parsed.data;
  try {
    const result = await runAtomic(async (session) => {
      // Re-load documents inside the transaction/session (or without session when fallback)
      const from = session ? await Member.findById(fromMemberId).session(session) : await Member.findById(fromMemberId);
      const to = session ? await Member.findById(toMemberId).session(session) : await Member.findById(toMemberId);
      if (!from || !to) throw new Error('Member not found');
      if (!String(from.tree) === '') { /* noop to satisfy linter */ }
      if (!from.tree.equals(to.tree)) throw new Error('Members must belong to same tree');
      const tree = session ? await FamilyTree.findById(from.tree).session(session) : await FamilyTree.findById(from.tree);
      if (!(tree.owner.equals(req.user.id) || tree.permissions.some((p) => p.user.equals(req.user.id) && p.access !== 'viewer')))
        throw new Error('Forbidden');

          // Load graph once for semantic validation
          const graph = await loadTreeGraph(from.tree);
          // Use global severities only (per-tree overrides removed)
          const cfg = await AdminConfig.findOne({ key: 'globalValidationSeverities' }).lean();
          const globalSeverities = (cfg && cfg.value && typeof cfg.value === 'object') ? cfg.value : {};
          const combined = { ...globalSeverities };
  const v = validateProposedRelationship(graph, String(from._id), String(to._id), type, { mode: 'create', severityOverrides: combined });
      if (!v.ok) {
        return { ok: false, error: 'Validation failed', errors: v.errors, warnings: v.warnings, ruleIds: v.ruleIds };
      }

      // Add directionally and ensure reciprocal where appropriate
      if (!Array.isArray(from.relationships)) from.relationships = [];
  from.relationships.push({ relative: to._id, type, label, authored: true });
      if (!Array.isArray(to.relationships)) to.relationships = [];
  if (type === 'parent') to.relationships.push({ relative: from._id, type: 'child' });
  else if (type === 'child') to.relationships.push({ relative: from._id, type: 'parent' });
  else if (type === 'spouse') to.relationships.push({ relative: from._id, type: 'spouse' });
  else if (type === 'sibling') to.relationships.push({ relative: from._id, type: 'sibling' });

      await from.save(session ? { session } : undefined);
      await to.save(session ? { session } : undefined);

      // Recompute canonical generation numbers for the tree so layout remains consistent
      try {
        const r = await recomputeGenerationsForTree(String(from.tree || ''), session);
        if (!r || !r.ok) {
          console.error('[relationshipController.addRelationship] recomputeGenerationsForTree reported failure', r);
          // enqueue for background retry
          enqueueRecompute(String(from.tree || ''));
        }
      } catch (e) {
        console.error('[relationshipController.addRelationship] recomputeGenerationsForTree failed', e);
        enqueueRecompute(String(from.tree || ''));
      }

      return { ok: true };
    });
    if (result?.ok) return res.status(201).json(result);
    return res.status(400).json(result);
  } catch (e) {
    if (e.message === 'Member not found') return res.status(404).json({ error: 'Member not found' });
    if (e.message === 'Members must belong to same tree') return res.status(400).json({ error: 'Members must belong to same tree' });
    if (e.message === 'Forbidden') return res.status(403).json({ error: 'Forbidden' });
    return res.status(500).json({ error: e.message });
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
  const parsed = relationshipUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { fromMemberId, toMemberId, type, newType, label } = parsed.data;
  try {
    const result = await runAtomic(async (session) => {
      const from = session ? await Member.findById(fromMemberId).session(session) : await Member.findById(fromMemberId);
      const to = session ? await Member.findById(toMemberId).session(session) : await Member.findById(toMemberId);
      if (!from || !to) throw new Error('Member not found');
      if (!from.tree.equals(to.tree)) throw new Error('Members must belong to same tree');
      const tree = session ? await FamilyTree.findById(from.tree).session(session) : await FamilyTree.findById(from.tree);
      if (!(tree.owner.equals(req.user.id) || tree.permissions.some((p) => p.user.equals(req.user.id) && p.access !== 'viewer')))
        throw new Error('Forbidden');

      // locate existing relationship on 'from'
      const idx = (from.relationships || []).findIndex((r) => String(r.relative) === String(to._id) && r.type === type);
      if (idx === -1) throw new Error('Relationship not found');

      // Validate the proposed new type before applying
    const graph = await loadTreeGraph(from.tree);
    const nextType = newType || type;
    // Use global severities only (per-tree overrides removed)
    const cfg = await AdminConfig.findOne({ key: 'globalValidationSeverities' }).lean();
    const globalSeverities = (cfg && cfg.value && typeof cfg.value === 'object') ? cfg.value : {};
    const combined = { ...globalSeverities };
      const v = validateProposedRelationship(graph, String(from._id), String(to._id), nextType, { mode: 'update', previousType: type, severityOverrides: combined });
      if (!v.ok) {
        return { ok: false, error: 'Validation failed', errors: v.errors, warnings: v.warnings, ruleIds: v.ruleIds };
      }

      // update from side
  from.relationships[idx].type = nextType;
  // Preserve authored flag on original side; if user changes type it remains authored
  if (typeof from.relationships[idx].authored !== 'boolean') from.relationships[idx].authored = true;
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
  // Reciprocal is system-generated; do not mark authored
  to.relationships.push({ relative: from._id, type: nextRecip });
      }

      await from.save(session ? { session } : undefined);
      await to.save(session ? { session } : undefined);

      // Recompute generations after relationship update
      try {
        const r = await recomputeGenerationsForTree(String(from.tree || ''), session);
        if (!r || !r.ok) {
          console.error('[relationshipController.updateRelationship] recomputeGenerationsForTree reported failure', r);
          enqueueRecompute(String(from.tree || ''));
        }
      } catch (e) {
        console.error('[relationshipController.updateRelationship] recomputeGenerationsForTree failed', e);
        enqueueRecompute(String(from.tree || ''));
      }

      return { ok: true };
    });
    if (result?.ok) return res.json(result);
    return res.status(400).json(result);
  } catch (e) {
    if (e.message === 'Member not found') return res.status(404).json({ error: 'Member not found' });
    if (e.message === 'Members must belong to same tree') return res.status(400).json({ error: 'Members must belong to same tree' });
    if (e.message === 'Forbidden') return res.status(403).json({ error: 'Forbidden' });
    if (e.message === 'Relationship not found') return res.status(404).json({ error: 'Relationship not found' });
    return res.status(500).json({ error: e.message });
  }
}

export async function validateRelationship(req, res) {
  const parsed = relationshipSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { fromMemberId, toMemberId, type } = parsed.data;
  try {
    const from = await Member.findById(fromMemberId);
    const to = await Member.findById(toMemberId);
    if (!from || !to) return res.status(404).json({ error: 'Member not found' });
    if (!from.tree.equals(to.tree)) return res.status(400).json({ error: 'Members must belong to same tree' });
    const tree = await FamilyTree.findById(from.tree);
    if (!(tree.owner.equals(req.user.id) || tree.permissions.some((p) => p.user.equals(req.user.id) && p.access !== 'viewer')))
      return res.status(403).json({ error: 'Forbidden' });
  const graph = await loadTreeGraph(from.tree);
  // Use global severities only (per-tree overrides removed)
  const cfg = await AdminConfig.findOne({ key: 'globalValidationSeverities' }).lean();
  const globalSeverities = (cfg && cfg.value && typeof cfg.value === 'object') ? cfg.value : {};
  const combined = { ...globalSeverities };
  const v = validateProposedRelationship(graph, String(from._id), String(to._id), type, { mode: 'create', severityOverrides: combined });
    return res.json({ ok: v.ok, errors: v.errors, warnings: v.warnings, ruleIds: v.ruleIds });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

export async function deleteRelationship(req, res) {
  // Accept delete parameters in body (typical) or query string (some clients/proxies strip DELETE bodies)
  const payload = (req.body && Object.keys(req.body).length) ? req.body : req.query;
  const parsed = relationshipDeleteSchema.safeParse(payload);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { fromMemberId, toMemberId, type } = parsed.data;
  try {
    const result = await runAtomic(async (session) => {
      const from = session ? await Member.findById(fromMemberId).session(session) : await Member.findById(fromMemberId);
      const to = session ? await Member.findById(toMemberId).session(session) : await Member.findById(toMemberId);
      if (!from || !to) throw new Error('Member not found');
      if (!from.tree.equals(to.tree)) throw new Error('Members must belong to same tree');
      const tree = session ? await FamilyTree.findById(from.tree).session(session) : await FamilyTree.findById(from.tree);
      if (!(tree.owner.equals(req.user.id) || tree.permissions.some((p) => p.user.equals(req.user.id) && p.access !== 'viewer')))
        throw new Error('Forbidden');
      from.relationships = (from.relationships || []).filter((r) => !(String(r.relative) === String(to._id) && r.type === type));
      const recip = reciprocalOf(type);
      if (recip) {
        to.relationships = (to.relationships || []).filter((r) => !(String(r.relative) === String(from._id) && r.type === recip));
      }

      await from.save(session ? { session } : undefined);
      await to.save(session ? { session } : undefined);
      // Recompute generations after deletion
      try {
        const r = await recomputeGenerationsForTree(String(from.tree || ''), session);
        if (!r || !r.ok) {
          console.error('[relationshipController.deleteRelationship] recomputeGenerationsForTree reported failure', r);
          enqueueRecompute(String(from.tree || ''));
        }
      } catch (e) {
        console.error('[relationshipController.deleteRelationship] recomputeGenerationsForTree failed', e);
        enqueueRecompute(String(from.tree || ''));
      }

      return { ok: true };
    });
    return res.json(result);
  } catch (e) {
    if (e.message === 'Member not found') return res.status(404).json({ error: 'Member not found' });
    if (e.message === 'Members must belong to same tree') return res.status(400).json({ error: 'Members must belong to same tree' });
    if (e.message === 'Forbidden') return res.status(403).json({ error: 'Forbidden' });
    return res.status(500).json({ error: e.message });
  }
}
