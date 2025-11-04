import { listQueuedJobs, forceRetry, removeJob } from '../utils/recomputeQueue.js';
import RecomputeJob from '../models/RecomputeJob.js';
import FamilyTree from '../models/FamilyTree.js';

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
