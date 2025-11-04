import mongoose from 'mongoose';

const RecomputeJobSchema = new mongoose.Schema({
  treeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  attempts: { type: Number, default: 0 },
  nextAttempt: { type: Date, default: () => new Date(Date.now() + 1000) },
  status: { type: String, enum: ['pending', 'processing', 'failed', 'done'], default: 'pending' },
  lastError: { type: String, default: null },
}, { timestamps: true });

export default mongoose.models.RecomputeJob || mongoose.model('RecomputeJob', RecomputeJobSchema);
