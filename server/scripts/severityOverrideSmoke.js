// Smoke test for severity overrides
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import FamilyTree from '../models/FamilyTree.js';
import Member from '../models/Member.js';
import { loadTreeGraph, validateProposedRelationship } from '../utils/relationshipRules.js';
import AdminConfig from '../models/AdminConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/family_tree';

async function run() {
  await mongoose.connect(MONGO_URI);
  try {
    const tree = await FamilyTree.create({ owner: new mongoose.Types.ObjectId(), title: 'Severity Test' });
    // Create ancestor chain: A -> parent B; propose B -> parent A (cycle)
    const A = await Member.create({ tree: tree._id, name: 'A', relationships: [] });
    const B = await Member.create({ tree: tree._id, name: 'B', relationships: [] });
    A.relationships.push({ type: 'parent', relative: B._id });
    await A.save();

    const graph = await loadTreeGraph(tree._id);
    // Baseline validation (should error on cycle)
    const base = validateProposedRelationship(graph, String(B._id), String(A._id), 'parent', { mode: 'create' });
    console.log('Baseline:', base);

    // Apply a global override to make no-cycle -> warn for the purpose of this smoke test
    await AdminConfig.deleteMany({ key: 'globalValidationSeverities' });
    await AdminConfig.create({ key: 'globalValidationSeverities', value: { 'no-cycle': 'warn' } });
    const cfg2 = await AdminConfig.findOne({ key: 'globalValidationSeverities' }).lean();
    const gv = (cfg2 && cfg2.value && typeof cfg2.value === 'object') ? cfg2.value : {};
    const graph2 = await loadTreeGraph(tree._id);
    const overridden = validateProposedRelationship(graph2, String(B._id), String(A._id), 'parent', { mode: 'create', severityOverrides: gv });
    console.log('Overridden by global (no-cycle -> warn):', overridden);

    // Disable grandparent rule (simulate ancestor distance >=2). Add C as parent of B then test B parent A again.
    const C = await Member.create({ tree: tree._id, name: 'C', relationships: [] });
    B.relationships.push({ type: 'parent', relative: C._id });
    await B.save();
    const graph3 = await loadTreeGraph(tree._id);
    // Update global config to disable no-grandparent-as-parent
    const cfg3 = await AdminConfig.findOne({ key: 'globalValidationSeverities' });
    cfg3.value = { ...(cfg3.value || {}), 'no-grandparent-as-parent': 'off' };
    await cfg3.save();
    const gv2 = (cfg3 && cfg3.value && typeof cfg3.value === 'object') ? cfg3.value : {};
    const withOff = validateProposedRelationship(graph3, String(C._id), String(A._id), 'parent', { mode: 'create', severityOverrides: gv2 });
    console.log('With global no-grandparent-as-parent off:', withOff);
  } catch (e) {
    console.error('Severity smoke failed', e);
  } finally {
    await mongoose.disconnect();
  }
}

run();
