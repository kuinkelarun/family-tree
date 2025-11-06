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
    // Authored indicates the direction was explicitly created by the user (source -> target).
    // This helps the client prefer the authored side when both reciprocal entries exist.
    authored: { type: Boolean, default: false },
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
    /**
     * gender: Semantic gender used for kinship localization and pronoun inference.
     * Allowed values:
     *  - 'male'      : masculine
     *  - 'female'    : feminine
     *  - 'nonbinary' : non-binary / gender diverse (uses they/them by default in English)
     *  - 'unknown'   : not specified yet (falls back to neutral kin terms)
     *
     * NOTE: We intentionally avoid storing cultural titles (e.g., 'दाइ', 'दिदी') directly here.
     * These will be derived later via age rank logic (#20) and side inference.
     *
     * SEO/Documentation rationale: Storing a normalized gender field allows generating
     * structured relationship labels (e.g., 'grandfather', 'grandmother', 'ससुरा', 'सासू')
     * which improves semantic clarity for multilingual family tree queries and search indexing.
     */
    gender: { type: String, enum: ['male','female','nonbinary','unknown'], default: 'unknown', index: true },
    /**
     * pronounOverride: Optional custom pronoun set stored as a compact string pattern.
     * Format (English example): "he|him|his" OR "she|her|her" OR "they|them|their".
     * If absent, pronouns are derived from `gender` using default language rules.
     * Future: Could store a locale map if we need per-language overrides.
     */
    pronounOverride: { type: String },
    notes: { type: String },
    occupation: { type: String },
    events: { type: [EventSchema], default: [] },
    attachments: { type: [String], default: [] },
  },
  { timestamps: true, minimize: false }
);

export default mongoose.model('Member', MemberSchema);
