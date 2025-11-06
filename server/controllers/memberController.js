import mongoose from 'mongoose';
import Member from '../models/Member.js';
import FamilyTree from '../models/FamilyTree.js';
import { memberCreateSchema, memberUpdateSchema } from '../utils/validate.js';
import { normalizeMemberRelationships } from '../utils/normalizeRelationships.js';

export async function createMember(req, res) {
  try {
    const parsed = memberCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const data = parsed.data;
    const tree = await FamilyTree.findById(data.tree);
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    if (!(tree.owner.equals(req.user.id) || tree.permissions.some((p) => p.user.equals(req.user.id) && p.access !== 'viewer')))
      return res.status(403).json({ error: 'Forbidden' });
    const session = await mongoose.startSession();
    let created;
    await session.withTransaction(async () => {
      const member = await Member.create([data], { session });
      created = member[0];
      if (!Array.isArray(tree.members)) tree.members = [];
      tree.members.push(created._id);
      await tree.save({ session });
      // Ensure inverse parent/child edges
      await normalizeMemberRelationships(session, created);
    });
    await session.endSession();
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function updateMember(req, res) {
  try {
    console.log('[updateMember] RAW req.body:', JSON.stringify(req.body, null, 2));
    const parsed = memberUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      console.log('[updateMember] Validation failed:', parsed.error.flatten());
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    console.log('[updateMember] PARSED data:', JSON.stringify(parsed.data, null, 2));
    console.log('[updateMember] Position in parsed:', parsed.data.position);
    const member = await Member.findById(req.params.id);
    if (!member) return res.status(404).json({ error: 'Not found' });
    console.log('[updateMember] Member BEFORE update:', { name: member.name, position: member.position });
    const tree = await FamilyTree.findById(member.tree);
    if (!(tree.owner.equals(req.user.id) || tree.permissions.some((p) => p.user.equals(req.user.id) && p.access !== 'viewer')))
      return res.status(403).json({ error: 'Forbidden' });
    
    // Handle position updates (including clearing with null)
    if ('position' in parsed.data) {
      if (parsed.data.position === null) {
        // Explicitly clear position (move to pool)
        member.position = undefined;
        console.log('[updateMember] Clearing position (move to pool)');
      } else if (parsed.data.position) {
        // Set new position
        member.position = parsed.data.position;
        console.log('[updateMember] Setting position:', member.position);
      }
    }
    
    // Apply other fields
    const { position, photo, ...otherData } = parsed.data;
    // Handle photo clearing or update explicitly
    if (parsed.data.hasOwnProperty('photo')) {
      if (photo === '' || photo === null) {
        member.photo = undefined;
      } else if (typeof photo === 'string') {
        member.photo = photo;
      }
    }
    Object.assign(member, otherData);

    // Save and normalize inside a transaction
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await member.save({ session });
      await normalizeMemberRelationships(session, member);
    });
    await session.endSession();
    console.log('[updateMember] Member AFTER save:', { name: member.name, position: member.position });
    
    // Verify it's actually in the database
    const fresh = await Member.findById(req.params.id).lean();
    console.log('[updateMember] Fresh from DB:', { name: fresh.name, position: fresh.position });
    
    res.json(member);
  } catch (e) {
    console.error('[updateMember] Error:', e);
    res.status(500).json({ error: e.message });
  }
}

export async function deleteMember(req, res) {
  try {
    const member = await Member.findById(req.params.id);
    if (!member) return res.status(404).json({ error: 'Not found' });
    const tree = await FamilyTree.findById(member.tree);
    if (!(tree.owner.equals(req.user.id) || tree.permissions.some((p) => p.user.equals(req.user.id) && p.access !== 'viewer')))
      return res.status(403).json({ error: 'Forbidden' });
    await member.deleteOne();
  tree.members = (tree.members || []).filter((m) => !m.equals(member._id));
    await tree.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
