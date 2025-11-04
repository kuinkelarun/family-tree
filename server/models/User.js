import mongoose from 'mongoose';

const PermissionSchema = new mongoose.Schema(
  {
    tree: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyTree', required: true },
    access: { type: String, enum: ['owner', 'editor', 'viewer'], required: true },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    // Roles allow role-based access checks (e.g. ['admin'])
    roles: [{ type: String }],
    trees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FamilyTree' }],
    permissions: [PermissionSchema],
  },
  { timestamps: true }
);

export default mongoose.model('User', UserSchema);
