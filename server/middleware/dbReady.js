import mongoose from 'mongoose';

export function ensureDbReady(req, res, next) {
  // 1 = connected, 2 = connecting, others = disconnected
  const state = mongoose.connection.readyState;
  if (state === 1) return next();
  return res.status(503).json({ error: 'Database not connected. Please start MongoDB and try again.' });
}
