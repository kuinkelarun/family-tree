import { listQueuedJobs, forceRetry, removeJob } from '../utils/recomputeQueue.js';
import RecomputeJob from '../models/RecomputeJob.js';
import FamilyTree from '../models/FamilyTree.js';
import Member from '../models/Member.js';
import mongoose from 'mongoose';
import AdminAudit from '../models/AdminAudit.js';
import User from '../models/User.js';
import { validationRuleMetadata } from '../utils/relationshipRules.js';
import AdminConfig from '../models/AdminConfig.js';

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

// Per-tree severity endpoints removed: per-tree overrides are no longer supported.
// The server now uses global severities stored in AdminConfig (key: 'globalValidationSeverities')
// for validation. If you need a migration, see scripts/migrations.

export async function getValidationRulesMetadata(req, res) {
  try {
    // No DB needed; served from code metadata to keep server authoritative
    res.json({ ok: true, rules: validationRuleMetadata });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Global severities stored under key 'globalValidationSeverities' as plain object: { ruleId: severity }
export async function getGlobalSeverities(req, res) {
  try {
    // only admins should call this (route enforces requireAdmin)
    const cfg = await AdminConfig.findOne({ key: 'globalValidationSeverities' }).lean();
    const value = (cfg && cfg.value) ? cfg.value : {};
    res.json({ ok: true, severities: value });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function patchGlobalSeverities(req, res) {
  try {
    const { updates } = req.body || {};
    if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'updates object required' });
    // Validate severities values
    const VALID = ['error','warn','off'];
    for (const [k,v] of Object.entries(updates)) {
      if (!VALID.includes(v)) return res.status(400).json({ error: `Invalid severity '${v}' for rule '${k}'` });
    }
    let cfg = await AdminConfig.findOne({ key: 'globalValidationSeverities' });
    if (!cfg) cfg = new AdminConfig({ key: 'globalValidationSeverities', value: {} });
    // Merge: updates may set to default; caller should send the canonical desired map
    cfg.value = { ...(cfg.value || {}), ...updates };
    await cfg.save();
    res.json({ ok: true, severities: cfg.value });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export async function deleteGlobalSeverity(req, res) {
  try {
    const { ruleId } = req.params;
    if (!ruleId) return res.status(400).json({ error: 'ruleId required' });
    let cfg = await AdminConfig.findOne({ key: 'globalValidationSeverities' });
    if (!cfg || !cfg.value || typeof cfg.value !== 'object') return res.json({ ok: true, severities: {} });
    if (Object.prototype.hasOwnProperty.call(cfg.value, ruleId)) {
      // remove the key and persist
      const copy = { ...cfg.value };
      delete copy[ruleId];
      cfg.value = copy;
      await cfg.save();
    }
    res.json({ ok: true, severities: cfg.value || {} });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

// --- Admin Trees listing and management ---
export async function listTrees(req, res) {
  try {
    // Only admins allowed (router should enforce requireAdmin)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const offset = Math.max(0, parseInt(req.query.offset || req.query.page || '0', 10));
    const sortField = req.query.sort || 'updatedAt';
    const dir = req.query.dir === 'asc' ? 1 : -1;
    const search = (req.query.search || '').trim();
    // Build an aggregation pipeline that looks up owner email and matches title OR owner.email
    // This uses a single DB roundtrip and allows exact-email matching when the search looks like an email.
    function escapeRegExp(str) {
      return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    const pipeline = [];

    // If the caller is not an admin, restrict results to trees the user owns or has permissions on
    const userPayload = req.user || {};
    const roles = Array.isArray(userPayload.roles) ? userPayload.roles.map(r => String(r).toLowerCase()) : [];
    const envAdmins = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
    const isAdmin = roles.includes('admin') || (userPayload.email && envAdmins.includes(userPayload.email));

    // Exclude soft-deleted trees by default for non-admins; admins see all states (including archived and pending admin deletion)
    if (!req.query.showDeleted && !isAdmin) pipeline.push({ $match: { deletedAt: { $exists: false } } });

    if (!isAdmin) {
      try {
        const uid = mongoose.Types.ObjectId(userPayload.id);
        pipeline.push({ $match: { $or: [ { owner: uid }, { 'permissions.user': uid } ] } });
      } catch (e) {
        // if the user id is not a valid ObjectId for some reason, deny by returning empty
        return res.json({ ok: true, items: [], total: 0, limit, offset });
      }
    }

    // Lookup owner document to expose owner email for matching and projection
    pipeline.push({
      $lookup: {
        from: User.collection.name,
        localField: 'owner',
        foreignField: '_id',
        as: 'ownerDoc',
      }
    });
    // Lookup the user who requested admin deletion (if any) to expose requester email
    pipeline.push({
      $lookup: {
        from: User.collection.name,
        localField: 'pendingDeletionRequestedBy',
        foreignField: '_id',
        as: 'requesterDoc',
      }
    });
    // Simplify owner email into a top-level field for easier matching
    pipeline.push({ $addFields: { ownerEmail: { $arrayElemAt: ['$ownerDoc.email', 0] }, requesterEmail: { $arrayElemAt: ['$requesterDoc.email', 0] } } });

    if (search) {
      if (search.includes('@')) {
        // Prefer exact email matches when the query looks like an email (case-insensitive)
        const esc = escapeRegExp(search);
        pipeline.push({ $match: {
          $or: [
            { title: { $regex: search, $options: 'i' } },
            { ownerEmail: { $regex: `^${esc}$`, $options: 'i' } }
          ]
        } });
      } else {
        // General substring match on title or ownerEmail
        pipeline.push({ $match: {
          $or: [
            { title: { $regex: search, $options: 'i' } },
            { ownerEmail: { $regex: search, $options: 'i' } }
          ]
        } });
      }
    }

    // Facet to get total and paginated items in a single aggregation
    pipeline.push({
      $facet: {
        metadata: [{ $count: 'total' }],
        items: [
          { $sort: { [sortField]: dir } },
          { $skip: offset },
          { $limit: limit },
          { $project: { title: 1, owner: 1, ownerEmail: 1, createdAt: 1, updatedAt: 1, members: 1, deletedAt: 1, pendingAdminDeletion: 1, pendingDeletionRequestedAt: 1, pendingDeletionRequestedBy: 1 } }
        ]
      }
    });

    const aggRes = await FamilyTree.aggregate(pipeline).exec();
    const meta = Array.isArray(aggRes) && aggRes[0] && Array.isArray(aggRes[0].metadata) ? aggRes[0].metadata : [];
    const items = Array.isArray(aggRes) && aggRes[0] && Array.isArray(aggRes[0].items) ? aggRes[0].items : [];
    const total = (meta[0] && meta[0].total) ? meta[0].total : 0;

    // Map to UI-friendly shape
    const mapped = items.map(t => ({
      id: t._id,
      title: t.title,
      ownerId: t.owner || null,
      ownerEmail: t.ownerEmail || null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      deletedAt: t.deletedAt || null,
      pendingAdminDeletion: !!t.pendingAdminDeletion,
      pendingDeletionRequestedAt: t.pendingDeletionRequestedAt || null,
      pendingDeletionRequestedBy: t.pendingDeletionRequestedBy || null,
      nodeCount: Array.isArray(t.members) ? t.members.length : 0,
    }));

    res.json({ ok: true, items: mapped, total, limit, offset });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function getTreeDetails(req, res) {
  try {
    const { id } = req.params;
    const tree = await FamilyTree.findById(id).populate('owner', 'email displayName').lean();
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    // If the caller is not an admin, ensure they are owner or in permissions
    const userPayload = req.user || {};
    const roles = Array.isArray(userPayload.roles) ? userPayload.roles.map(r => String(r).toLowerCase()) : [];
    const envAdmins = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
    const isAdmin = roles.includes('admin') || (userPayload.email && envAdmins.includes(userPayload.email));
    if (!isAdmin) {
      const uid = String(userPayload.id);
      const ownerId = String(tree.owner?._id || tree.owner);
      const hasPerm = Array.isArray(tree.permissions) && tree.permissions.some(p => String(p.user) === uid);
      if (ownerId !== uid && !hasPerm) return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ ok: true, tree });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function postArchiveTree(req, res) {
  try {
    const { id } = req.params;
    const { archive } = req.body || {};
    const tree = await FamilyTree.findById(id);
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    if (archive) {
      tree.deletedAt = new Date();
      await tree.save();
      await AdminAudit.create({ actor: req.user.id, action: 'archive-tree', treeId: tree._id, details: { archive: true } });
      return res.json({ ok: true });
    }

    // restore / unarchive: also clear any pending admin-deletion flags
    tree.deletedAt = undefined;
    tree.pendingAdminDeletion = false;
    tree.pendingDeletionRequestedAt = undefined;
    tree.pendingDeletionRequestedBy = undefined;
    await tree.save();
    await AdminAudit.create({ actor: req.user.id, action: 'restore-tree', treeId: tree._id, details: {} });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function postTransferTree(req, res) {
  try {
    const { id } = req.params;
    const { newOwnerId } = req.body || {};
    if (!newOwnerId) return res.status(400).json({ error: 'newOwnerId required' });
    const tree = await FamilyTree.findById(id);
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    const prev = tree.owner;
    tree.owner = newOwnerId;
    await tree.save();
    await AdminAudit.create({ actor: req.user.id, action: 'transfer-tree', treeId: tree._id, details: { from: prev, to: newOwnerId } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteTree(req, res) {
  try {
    const { id } = req.params;
    const hard = !!req.query.hard;
    const tree = await FamilyTree.findById(id);
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    if (hard) {
      // Cascade-delete related data to avoid orphaned members and jobs
      try {
        await Member.deleteMany({ tree: id });
      } catch (e) {
        // log but continue with tree deletion
        console.error('[adminController.deleteTree] failed to delete members for tree', id, e);
      }
      try {
        await RecomputeJob.deleteMany({ treeId: id });
      } catch (e) {
        console.error('[adminController.deleteTree] failed to delete recompute jobs for tree', id, e);
      }
      await FamilyTree.deleteOne({ _id: id });
      await AdminAudit.create({ actor: req.user.id, action: 'delete-tree-hard', treeId: id, details: {} });
      return res.json({ ok: true, deleted: true });
    }
    tree.deletedAt = new Date();
    await tree.save();
    await AdminAudit.create({ actor: req.user.id, action: 'delete-tree-soft', treeId: id, details: {} });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function bulkTreesAction(req, res) {
  try {
    const { action, ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });
    if (!['archive', 'delete', 'export'].includes(action)) return res.status(400).json({ error: 'invalid action' });
    const results = [];
    for (const id of ids) {
      try {
        if (action === 'archive') {
          const t = await FamilyTree.findById(id);
          if (t) { t.deletedAt = new Date(); await t.save(); }
          await AdminAudit.create({ actor: req.user.id, action: 'archive-tree-bulk', treeId: id, details: {} });
          results.push({ id, ok: true });
        } else if (action === 'delete') {
          await FamilyTree.deleteOne({ _id: id });
          await AdminAudit.create({ actor: req.user.id, action: 'delete-tree-hard-bulk', treeId: id, details: {} });
          results.push({ id, ok: true });
        } else if (action === 'export') {
          // export placeholder — real export handled elsewhere
          results.push({ id, ok: true, exported: true });
        }
      } catch (ee) {
        results.push({ id, ok: false, error: ee.message });
      }
    }
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
