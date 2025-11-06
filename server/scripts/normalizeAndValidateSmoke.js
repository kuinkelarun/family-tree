import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Member from '../models/Member.js';
import FamilyTree from '../models/FamilyTree.js';
import User from '../models/User.js';
import { normalizeMemberRelationships, validateTreeRelationships } from '../utils/normalizeRelationships.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/family_tree';

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected');

    // Setup: create a small tree with asymmetric edges
    let user = await User.findOne({ email: 'normalize-test@example.com' });
    if (!user) user = await User.create({ email: 'normalize-test@example.com', password: 'test123456' });

    let tree = await FamilyTree.findOne({ owner: user._id, title: 'Normalize Test Tree' });
    if (!tree) tree = await FamilyTree.create({ owner: user._id, title: 'Normalize Test Tree', permissions: [{ user: user._id, access: 'owner' }] });

    const a = await Member.create({ tree: tree._id, name: 'A', relationships: [] });
    const b = await Member.create({ tree: tree._id, name: 'B', relationships: [] });

    // A -> parent B (but B does not have child A yet)
    a.relationships.push({ type: 'parent', relative: b._id });

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await a.save({ session });
        await normalizeMemberRelationships(session, a);
      });
    } finally {
      await session.endSession();
    }

    const freshA = await Member.findById(a._id).lean();
    const freshB = await Member.findById(b._id).lean();

    console.log('A relationships:', freshA.relationships);
    console.log('B relationships:', freshB.relationships);

    const report = await validateTreeRelationships(tree._id);
    console.log('Validation report:', JSON.stringify(report, null, 2));
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await mongoose.disconnect();
  }
}

run();
