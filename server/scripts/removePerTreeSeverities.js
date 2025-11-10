// Migration script: remove per-tree validationConfig.severities from FamilyTree documents
// Usage (PowerShell):
// $env:MONGO_URI='mongodb://localhost:27017/family_tree'; node ./scripts/removePerTreeSeverities.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import FamilyTree from '../models/FamilyTree.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/family_tree';

async function run() {
  console.log('[migration] connecting to', MONGO_URI);
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    // Show count of trees with validationConfig.severities present
    const count = await FamilyTree.countDocuments({ 'validationConfig.severities': { $exists: true } });
    console.log(`[migration] FamilyTree documents with validationConfig.severities: ${count}`);
    if (count === 0) {
      console.log('[migration] nothing to do. Exiting.');
      return;
    }
    // Safety: require explicit confirmation environment variable to proceed in CI/non-interactive runs
    if (!process.env.MIGRATION_CONFIRM) {
      console.log('[migration] MIGRATION_CONFIRM env var not set. To perform the destructive migration, re-run with MIGRATION_CONFIRM=1 environment variable.');
      console.log('Example (PowerShell): $env:MIGRATION_CONFIRM=1; $env:MONGO_URI="yourUri"; node ./scripts/removePerTreeSeverities.js');
      return;
    }

    console.log('[migration] Removing validationConfig.severities from all FamilyTree documents...');
    const res = await FamilyTree.updateMany({ 'validationConfig.severities': { $exists: true } }, { $unset: { 'validationConfig.severities': '' } });
    console.log('[migration] updateMany result:', res);
    console.log('[migration] done.');
  } catch (e) {
    console.error('[migration] error', e);
  } finally {
    await mongoose.disconnect();
  }
}

run();
