// Smoke test for severity overrides
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import FamilyTree from '../models/FamilyTree.js';
import Member from '../models/Member.js';
import { loadTreeGraph, validateProposedRelationship } from '../utils/relationshipRules.js';

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

    // Override cycle rule to warn
    tree.validationConfig = tree.validationConfig || {};
    tree.validationConfig.severities = new Map([['no-cycle','warn']]);
    await tree.save();
    const graph2 = await loadTreeGraph(tree._id);
  const raw = tree.validationConfig?.severities;
  const sev = raw instanceof Map ? Object.fromEntries(raw.entries()) : (raw && typeof raw === 'object' ? { ...raw } : {});
  const overridden = validateProposedRelationship(graph2, String(B._id), String(A._id), 'parent', { mode: 'create', severityOverrides: sev });
    console.log('Overridden (no-cycle -> warn):', overridden);

    // Disable grandparent rule (simulate ancestor distance >=2). Add C as parent of B then test B parent A again.
    const C = await Member.create({ tree: tree._id, name: 'C', relationships: [] });
    B.relationships.push({ type: 'parent', relative: C._id });
    await B.save();
    const graph3 = await loadTreeGraph(tree._id);
    tree.validationConfig.severities.set('no-grandparent-as-parent','off');
    await tree.save();
  const raw2 = tree.validationConfig?.severities;
  const sev2 = raw2 instanceof Map ? Object.fromEntries(raw2.entries()) : (raw2 && typeof raw2 === 'object' ? { ...raw2 } : {});
  const withOff = validateProposedRelationship(graph3, String(C._id), String(A._id), 'parent', { mode: 'create', severityOverrides: sev2 });
    console.log('With no-grandparent-as-parent off:', withOff);
  } catch (e) {
    console.error('Severity smoke failed', e);
  } finally {
    await mongoose.disconnect();
  }
}

run();
