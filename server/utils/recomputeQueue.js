import mongoose from 'mongoose';
import { recomputeGenerationsForTree } from './generation.js';
import RecomputeJob from '../models/RecomputeJob.js';
import logger from './logger.js';

// Retry schedule (ms): exponential backoff base
const BASE_DELAY = parseInt(process.env.RECOMPUTE_BASE_DELAY_MS || '15000', 10); // default 15s
const MAX_ATTEMPTS = parseInt(process.env.RECOMPUTE_MAX_ATTEMPTS || '10', 10); // default 10 attempts

let workerRunning = false;

async function processQueueOnce() {
  // If DB isn't connected, skip processing to avoid noisy MongoNetworkError exceptions.
  if (mongoose.connection.readyState !== 1) {
    logger.warn('Skipping recompute worker run: MongoDB not connected', { readyState: mongoose.connection.readyState });
    return;
  }
  // Find pending jobs where nextAttempt <= now
  const now = new Date();
  let jobs;
  try {
    jobs = await RecomputeJob.find({ status: { $in: ['pending', 'failed'] }, nextAttempt: { $lte: now } }).limit(20);
  } catch (err) {
    // If there's a network error, log and skip this run. Worker will retry on next interval.
    const isNetErr = err && (err.name === 'MongoNetworkError' || String(err).includes('ECONNRESET') || String(err).includes('topology'));
    if (isNetErr) {
      logger.warn('Recompute worker could not query jobs due to Mongo network error; will retry later', { error: String(err?.message || err) });
      return;
    }
    // Otherwise rethrow to be handled by caller
    throw err;
  }
  for (const job of jobs) {
    try {
      logger.info('Processing recompute job', { jobId: String(job._id), treeId: String(job.treeId), attempt: job.attempts + 1 });
      job.status = 'processing';
      await job.save();
      const res = await recomputeGenerationsForTree(String(job.treeId));
      if (res && res.ok) {
        job.status = 'done';
        job.attempts += 1;
        job.lastError = null;
        await job.save();
        logger.info('Recompute succeeded', { treeId: String(job.treeId), updated: res.updated });
      } else {
        job.attempts += 1;
        job.status = job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        job.lastError = res && res.error ? String(res.error) : 'recompute returned failure';
        const delay = BASE_DELAY * Math.pow(2, Math.max(0, job.attempts - 1));
        job.nextAttempt = new Date(Date.now() + delay);
        await job.save();
        logger.warn('Recompute failed; scheduled retry', { treeId: String(job.treeId), attempts: job.attempts, nextAttempt: job.nextAttempt });
        if (job.attempts >= MAX_ATTEMPTS) logger.error('Giving up recompute for tree after max attempts', { treeId: String(job.treeId), attempts: job.attempts });
      }
    } catch (err) {
      job.attempts += 1;
      job.status = job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      job.lastError = String(err?.message || err);
      const delay = BASE_DELAY * Math.pow(2, Math.max(0, job.attempts - 1));
      job.nextAttempt = new Date(Date.now() + delay);
      await job.save();
      logger.error('Error processing recompute job', { treeId: String(job.treeId), error: err?.message || String(err), attempts: job.attempts });
    }
  }
}

export function startWorker() {
  if (workerRunning) return;
  workerRunning = true;
  // Run process loop every 5 seconds
  setInterval(() => {
    processQueueOnce().catch((err) => logger.error('[recomputeQueue] Worker error', { error: String(err?.message || err) }));
  }, 5000);
}

export async function enqueueRecompute(treeId) {
  if (!treeId) return;
  const tid = String(treeId);
  // Upsert a pending job for this tree if one doesn't exist or if it's not done
  const existing = await RecomputeJob.findOne({ treeId: tid, status: { $in: ['pending', 'processing'] } });
  if (existing) {
    // bump nextAttempt sooner
    existing.nextAttempt = new Date(Date.now() + 1000);
    await existing.save();
    return existing;
  }
  const job = await RecomputeJob.create({ treeId: tid, attempts: 0, nextAttempt: new Date(Date.now() + 1000), status: 'pending' });
  return job;
}

export async function listQueuedJobs({ page = 1, limit = 50, status, treeId } = {}) {
  const q = {};
  if (status) q.status = status;
  if (treeId) q.treeId = String(treeId);
  const skip = Math.max(0, page - 1) * limit;
  const [items, total] = await Promise.all([
    RecomputeJob.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    RecomputeJob.countDocuments(q),
  ]);
  return { items, total, page, limit };
}

export async function forceRetry(jobId) {
  const job = await RecomputeJob.findById(jobId);
  if (!job) throw new Error('Not found');
  job.attempts = 0;
  job.status = 'pending';
  job.nextAttempt = new Date(Date.now() + 1000);
  job.lastError = null;
  await job.save();
  return job;
}

export async function removeJob(jobId) {
  const job = await RecomputeJob.findById(jobId);
  if (!job) throw new Error('Not found');
  await job.deleteOne();
  return true;
}

