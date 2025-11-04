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
