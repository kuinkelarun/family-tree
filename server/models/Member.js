import mongoose from 'mongoose';

const RelationshipSchema = new mongoose.Schema(
  {
    relative: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
    type: {
      type: String,
      enum: ['parent', 'child', 'spouse', 'sibling', 'custom'],
      required: true,
    },
    label: { type: String }, // custom label when type = custom
  },
  { _id: false }
);

const EventSchema = new mongoose.Schema(
  {
    type: { type: String },
    date: { type: Date },
    description: { type: String },
  },
  { _id: false }
);

const PositionSchema = new mongoose.Schema(
  {
    x: { type: Number, required: false },
    y: { type: Number, required: false },
  },
  { _id: false, minimize: false }
);

const MemberSchema = new mongoose.Schema(
  {
    tree: { type: mongoose.Schema.Types.ObjectId, ref: 'FamilyTree', required: true, index: true },
    name: { type: String, required: true, index: true },
    nickname: { type: String },
    dob: { type: Date },
    photo: { type: String },
  location: { type: String },
    position: { type: PositionSchema, default: null },
  relationships: { type: [RelationshipSchema], default: [] },
  // Generation level for hierarchical layout (1 = root / oldest generation)
  generation: { type: Number, default: 1, index: true },
    notes: { type: String },
    occupation: { type: String },
    events: { type: [EventSchema], default: [] },
    attachments: { type: [String], default: [] },
  },
  { timestamps: true, minimize: false }
);

export default mongoose.model('Member', MemberSchema);
