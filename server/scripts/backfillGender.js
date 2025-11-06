#!/usr/bin/env node
// Backfill missing gender field on existing members.
// Sets gender to 'unknown' where it is null/undefined or not one of the allowed enums.
// Usage (PowerShell): node server/scripts/backfillGender.js

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Member from '../models/Member.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load env similar to server.js
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../family-tree-only.env') });
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/family_tree';
const allowed = new Set(['male','female','nonbinary','unknown']);

async function run() {
  console.log('[backfillGender] Connecting to', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  const filter = { $or: [ { gender: { $exists: false } }, { gender: null }, { gender: { $nin: [...allowed] } } ] };
  const toUpdate = await Member.find(filter).select('_id gender name').lean();
  if (!toUpdate.length) {
    console.log('[backfillGender] No members require backfill.');
    await mongoose.disconnect();
    return;
  }
  console.log(`[backfillGender] Found ${toUpdate.length} members needing gender backfill.`);
  const bulk = Member.collection.initializeUnorderedBulkOp();
  toUpdate.forEach(m => {
    bulk.find({ _id: m._id }).update({ $set: { gender: 'unknown' } });
  });
  const res = await bulk.execute();
  console.log('[backfillGender] Bulk update result:', res);
  await mongoose.disconnect();
  console.log('[backfillGender] Done.');
}

run().catch(err => {
  console.error('[backfillGender] Error:', err);
  process.exit(1);
});
