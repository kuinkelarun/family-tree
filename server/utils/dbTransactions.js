import mongoose from 'mongoose';

let _cachedSupportsTransactions = null;

async function detectTransactionsSupport() {
  if (typeof _cachedSupportsTransactions === 'boolean') return _cachedSupportsTransactions;
  try {
    const admin = mongoose.connection.db.admin();
    // 'hello' is the modern hello/ismaster command; older servers may require ismaster
    const info = await admin.command({ hello: 1 }).catch(() => admin.command({ ismaster: 1 }));
    _cachedSupportsTransactions = !!info && !!info.setName;
  } catch (err) {
    _cachedSupportsTransactions = false;
  }
  return _cachedSupportsTransactions;
}

/**
 * Run an operation atomically if the server supports transactions. The provided
 * callback receives a `session` object when transactions are available, or
 * `null` when running in fallback (non-transactional) mode.
 *
 * The callback may return any value; that value will be returned by runAtomic.
 */
export async function runAtomic(fn) {
  const supports = await detectTransactionsSupport();
  if (!supports) {
    // Fallback: run without a session. The callback should handle session === null.
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    await session.endSession();
    return result;
  } catch (err) {
    try { await session.endSession(); } catch (er) {}
    // If transactions are not supported in this deployment (some managed clusters)
    // fall back to non-transactional execution once.
    if (/transactions? are not supported/i.test(String(err.message))) {
      return fn(null);
    }
    throw err;
  }
}

export async function supportsTransactions() {
  return detectTransactionsSupport();
}
