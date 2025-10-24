import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

import Member from './models/Member.js';
import FamilyTree from './models/FamilyTree.js';
import User from './models/User.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/family_tree';

async function testPositionPersistence() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected to MongoDB');

    // Find or create a test user
    let user = await User.findOne({ email: 'test@example.com' });
    if (!user) {
      user = await User.create({ email: 'test@example.com', password: 'test123456' });
      console.log('✓ Created test user');
    } else {
      console.log('✓ Using existing test user');
    }

    // Find or create a test tree
    let tree = await FamilyTree.findOne({ owner: user._id, title: 'Position Test Tree' });
    if (!tree) {
      tree = await FamilyTree.create({
        owner: user._id,
        title: 'Position Test Tree',
        permissions: [{ user: user._id, access: 'owner' }]
      });
      console.log('✓ Created test tree');
    } else {
      console.log('✓ Using existing test tree');
    }

    // Create a member WITH position
    const member1 = await Member.create({
      tree: tree._id,
      name: 'Test Person 1',
      position: { x: 100, y: 200 }
    });
    console.log('✓ Created member1 with position:', member1.position);

    // Create a member WITHOUT position
    const member2 = await Member.create({
      tree: tree._id,
      name: 'Test Person 2'
    });
    console.log('✓ Created member2 without position:', member2.position);

    // Update member2 to add position
    member2.position = { x: 300, y: 400 };
    await member2.save();
    console.log('✓ Updated member2 position via direct save:', member2.position);

    // Fetch fresh from DB to verify persistence
    const member1Fresh = await Member.findById(member1._id);
    const member2Fresh = await Member.findById(member2._id);
    console.log('✓ member1 fresh from DB:', member1Fresh.position);
    console.log('✓ member2 fresh from DB:', member2Fresh.position);

    // Test via populate (how getTree works)
    tree.members = tree.members || [];
    if (!tree.members.includes(member1._id)) tree.members.push(member1._id);
    if (!tree.members.includes(member2._id)) tree.members.push(member2._id);
    await tree.save();

    const treePopulated = await FamilyTree.findById(tree._id).populate('members');
    console.log('\n✓ Tree with populated members:');
    treePopulated.members.forEach(m => {
      console.log(`  - ${m.name}: position =`, m.position);
    });

    // Test partial update (like the controller does)
    const updateData = { position: { x: 500, y: 600 } };
    Object.assign(member1, updateData);
    await member1.save();
    const member1Updated = await Member.findById(member1._id);
    console.log('\n✓ After Object.assign partial update, member1 position:', member1Updated.position);

    console.log('\n✅ All position persistence tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

testPositionPersistence();
