// Smoke test: global + per-tree severities applied during validation flows
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import FamilyTree from '../models/FamilyTree.js';
import Member from '../models/Member.js';
import AdminConfig from '../models/AdminConfig.js';
import { loadTreeGraph, validateProposedRelationship } from '../utils/relationshipRules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/family_tree';

async function run() {
  await mongoose.connect(MONGO_URI);
  try {
    console.log('Connected to', MONGO_URI);

    // Clear AdminConfig key if exists
    await AdminConfig.deleteMany({ key: 'globalValidationSeverities' });

    // Seed a global severity that turns no-cycle from 'error'->'warn'
    await AdminConfig.create({ key: 'globalValidationSeverities', value: { 'no-cycle': 'warn' } });
    console.log('Seeded AdminConfig globalValidationSeverities -> { no-cycle: warn }');

    // Create a test tree and simple two-member relationship that would trigger a cycle
    const ownerId = new mongoose.Types.ObjectId();
    const tree = await FamilyTree.create({ owner: ownerId, title: 'GlobalSeverityTest' });
    const A = await Member.create({ tree: tree._id, name: 'A', relationships: [] });
    const B = await Member.create({ tree: tree._id, name: 'B', relationships: [] });

    // A -> parent B
    A.relationships.push({ type: 'parent', relative: B._id });
    await A.save();

    const graph = await loadTreeGraph(tree._id);

    // Validate B -> parent A (would create a cycle). With default metadata, no-cycle is 'error'.
    const baseline = validateProposedRelationship(graph, String(B._id), String(A._id), 'parent', { mode: 'create' });
    console.log('Baseline validation (no global/per-tree overrides):', baseline.ok ? 'ok' : 'not ok', baseline);

    // Now test with global severities applied by reading AdminConfig and merging
    const cfg = await AdminConfig.findOne({ key: 'globalValidationSeverities' }).lean();
    const globalSev = (cfg && cfg.value && typeof cfg.value === 'object') ? cfg.value : {};
    console.log('Global severities from DB:', globalSev);

    const combined = { ...globalSev }; // no per-tree overrides
    const withGlobal = validateProposedRelationship(graph, String(B._id), String(A._id), 'parent', { mode: 'create', severityOverrides: combined });
    console.log('Validation with global severities applied:', withGlobal.ok ? 'ok' : 'not ok', withGlobal);

  // Per-tree overrides are no longer supported in this deployment (global-only severities).
  console.log('Per-tree overrides are removed; only global severities are applied.');

  } catch (e) {
    console.error('globalSeverityFlowSmoke failed', e);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

run();
