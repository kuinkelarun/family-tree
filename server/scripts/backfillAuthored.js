import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import Member from '../models/Member.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env similar to server startup
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', 'family-tree-only.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/family_tree';

function sortedKey(a, b) {
  const A = String(a);
  const B = String(b);
  return A < B ? `${A}|${B}` : `${B}|${A}`;
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to Mongo');

  const cursor = Member.find({}).cursor();

  // Collect all relationships grouped by pair
  const pairMap = new Map();
  let totalRels = 0;

  for await (const m of cursor) {
    for (let i = 0; i < (m.relationships || []).length; i++) {
      const r = m.relationships[i];
      if (!r || !r.relative) continue;
      totalRels++;
      const key = sortedKey(m._id, r.relative);
      if (!pairMap.has(key)) pairMap.set(key, []);
      pairMap.get(key).push({ member: m, rel: r, idx: i });
    }
  }

  let authoredSet = 0;
  let pairsSeen = 0;

  for (const [key, arr] of pairMap) {
    pairsSeen++;
    if (arr.length === 1) {
      // Single-sided relationship: set authored if it has a label
      const { member, rel, idx } = arr[0];
      if (!rel.authored && rel.label) {
        member.relationships[idx].authored = true;
        await member.save();
        authoredSet++;
      }
      continue;
    }

    // Two-sided typical case
    // Prefer the side which has a label (creation side) to be authored=true
    const withLabel = arr.filter(x => !!x.rel.label);
    if (withLabel.length === 1) {
      const { member, rel, idx } = withLabel[0];
      if (!rel.authored) {
        member.relationships[idx].authored = true;
        await member.save();
        authoredSet++;
      }
      // Ensure the other side is explicitly false (not required, but keeps data clean)
      const other = arr.find(x => x !== withLabel[0]);
      if (other && other.rel.authored) {
        other.member.relationships[other.idx].authored = false;
        await other.member.save();
      }
      continue;
    }

    // Ambiguous (both have label or neither has label): skip to avoid guessing
    // User can re-save/update one side to establish authored direction.
  }

  console.log(`Processed ${pairsSeen} pairs, ${totalRels} relationship entries. Authored set on ${authoredSet} entries.`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('Backfill failed:', e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
