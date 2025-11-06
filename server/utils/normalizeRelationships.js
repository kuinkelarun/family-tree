// Utilities to enforce bidirectional parent/child relationships and basic data hygiene.
// Ensures: if A lists B as parent, B lists A as child; if A lists B as child, B lists A as parent.
// Skips duplicates and preserves existing custom labels.

import mongoose from 'mongoose';
import Member from '../models/Member.js';

/**
 * Normalize a member's relationships and persist inverse edges.
 * Should be called inside a transaction for write operations.
 * @param {mongoose.ClientSession} session
 * @param {Member} memberDoc - Mongoose document (already fetched) whose relationships were modified.
 * @returns {Promise<{updated: number, inversesAdded: Array<{from: string, to: string, type: string}>}>}
 */
export async function normalizeMemberRelationships(session, memberDoc) {
  if (!memberDoc) return { updated: 0, inversesAdded: [] };
  const inversesAdded = [];
  const memberId = String(memberDoc._id);

  // Collect intended inverse operations
  for (const rel of memberDoc.relationships || []) {
    const targetId = String(rel.relative);
    if (!targetId) continue;
    if (rel.type === 'parent') {
      // Ensure target has child -> memberId
      await ensureInverse(session, targetId, memberId, 'child', inversesAdded);
    } else if (rel.type === 'child') {
      await ensureInverse(session, targetId, memberId, 'parent', inversesAdded);
    }
  }

  return { updated: inversesAdded.length, inversesAdded };
}

async function ensureInverse(session, sourceId, relativeId, inverseType, inversesAdded) {
  const doc = await Member.findById(sourceId).session(session);
  if (!doc) return; // dangling reference; could optionally flag
  const exists = (doc.relationships || []).some(r => String(r.relative) === relativeId && r.type === inverseType);
  if (exists) return;
  doc.relationships.push({ relative: relativeId, type: inverseType });
  await doc.save({ session });
  inversesAdded.push({ from: sourceId, to: relativeId, type: inverseType });
}

/**
 * Scan entire tree for basic relationship conflicts.
 * - Dangling references (relative points to missing member)
 * - Parent/child asymmetry (missing inverse)
 * - Cycles along strict parent chains (A ancestor of itself)
 * @param {string} treeId
 * @returns {Promise<{summary: object, issues: Array<object>}>}
 */
export async function validateTreeRelationships(treeId) {
  const members = await Member.find({ tree: treeId }).select('_id relationships').lean();
  const index = new Map(members.map(m => [String(m._id), m]));
  const issues = [];

  // Detect dangling refs & asymmetry
  for (const m of members) {
    const mid = String(m._id);
    for (const r of m.relationships || []) {
      const rid = String(r.relative);
      if (!index.has(rid)) {
        issues.push({ type: 'dangling-reference', member: mid, relative: rid, relType: r.type });
        continue;
      }
      if (r.type === 'parent') {
        // Expect child inverse
        const relDoc = index.get(rid);
        const inverseExists = (relDoc.relationships || []).some(x => String(x.relative) === mid && x.type === 'child');
        if (!inverseExists) issues.push({ type: 'missing-inverse', member: mid, relative: rid, expected: 'child' });
      } else if (r.type === 'child') {
        const relDoc = index.get(rid);
        const inverseExists = (relDoc.relationships || []).some(x => String(x.relative) === mid && x.type === 'parent');
        if (!inverseExists) issues.push({ type: 'missing-inverse', member: mid, relative: rid, expected: 'parent' });
      }
    }
  }

  // Cycle detection: DFS up parent chains
  const parentsOf = new Map();
  for (const m of members) parentsOf.set(String(m._id), new Set());
  for (const m of members) {
    const mid = String(m._id);
    for (const r of m.relationships || []) if (r.type === 'parent') parentsOf.get(mid).add(String(r.relative));
  }

  for (const m of members) {
    const start = String(m._id);
    const stack = [[start, new Set([start])]];
    while (stack.length) {
      const [cur, pathSet] = stack.pop();
      for (const p of parentsOf.get(cur) || []) {
        if (pathSet.has(p)) {
          issues.push({ type: 'cycle', member: start, via: Array.from(pathSet), backTo: p });
          continue;
        }
        const nextSet = new Set(pathSet); nextSet.add(p);
        stack.push([p, nextSet]);
      }
    }
  }

  return { summary: { members: members.length, issueCount: issues.length }, issues };
}
