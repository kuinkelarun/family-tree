import mongoose from 'mongoose';

const AdminAuditSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    treeId: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyTree', required: false },
    details: { type: Object, default: {} },
  },
  { timestamps: { createdAt: 'createdAt' } }
);

export default mongoose.model('AdminAudit', AdminAuditSchema);
