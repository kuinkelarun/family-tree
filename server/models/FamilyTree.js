import mongoose from 'mongoose';

const TreePermissionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    access: { type: String, enum: ['owner', 'editor', 'viewer'], default: 'viewer' },
  },
  { _id: false }
);

const FamilyTreeSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
  members: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Member' }], default: [] },
  permissions: { type: [TreePermissionSchema], default: [] },
    settings: {
      visibility: { type: String, enum: ['private', 'shared', 'public'], default: 'private' },
      styles: { type: Object, default: {} },
    },
    validationConfig: {
      // Per-tree validation configuration removed in favor of global-only severities.
    },
  // Soft-delete timestamp. When set the tree is considered archived/deleted.
  deletedAt: { type: Date, required: false, index: true },
    // When an owner requests a permanent delete that requires admin review, this flag marks it pending.
    pendingAdminDeletion: { type: Boolean, default: false, index: true },
    pendingDeletionRequestedAt: { type: Date, required: false },
    pendingDeletionRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    // Visual-only nodes for bundling connections (virtual marriage points)
    marriagePoints: {
      type: [
        {
          id: { type: String, required: true },
          parents: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Member' }], default: [] },
          position: {
            x: { type: Number, required: false },
            y: { type: Number, required: false },
          },
        }
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model('FamilyTree', FamilyTreeSchema);
