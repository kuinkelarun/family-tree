import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const treeSchema = z.object({
  title: z.string().min(1),
});

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const memberCreateSchema = z.object({
  tree: z.string().min(1),
  name: z.string().min(1),
  nickname: z.string().optional(),
  dob: z.string().optional(),
  // Semantic gender used for localization/pronouns. Defaults to 'unknown' if omitted.
  gender: z.enum(['male','female','nonbinary','unknown']).optional(),
  // Optional custom pronouns pattern: subject|object|possessive (e.g. he|him|his)
  pronounOverride: z.string().regex(/^[^|]+\|[^|]+\|[^|]+$/).optional(),
  // Support either a full URL (https://...) or a relative upload path (/uploads/filename)
  photo: z.union([
    z.string().url(),
    z.string().regex(/^\/uploads\//),
  ]).optional(),
  position: positionSchema.optional(),
  notes: z.string().optional(),
  location: z.string().optional(),
  occupation: z.string().optional(),
  events: z
    .array(
      z.object({
        date: z.string().optional(), // ISO date
        type: z.string(),
        description: z.string().optional(),
      })
    )
    .optional(),
  attachments: z.array(z.string()).optional(),
});

export const memberUpdateSchema = z.object({
  tree: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  nickname: z.string().optional(),
  dob: z.string().optional(),
  gender: z.enum(['male','female','nonbinary','unknown']).optional(),
  pronounOverride: z.string().regex(/^[^|]+\|[^|]+\|[^|]+$/).optional(),
  // Allow clearing photo by accepting empty string or null
  // and support either full URL or relative /uploads path when provided
  photo: z.union([
    z.string().url(),
    z.string().regex(/^\/uploads\//),
    z.literal(''),
    z.null(),
  ]).optional(),
  position: positionSchema.nullable().optional(), // ⬅ Allow null to clear position
  notes: z.string().optional(),
  location: z.string().optional(),
  occupation: z.string().optional(),
  events: z
    .array(
      z.object({
        date: z.string().optional(),
        type: z.string(),
        description: z.string().optional(),
      })
    )
    .optional(),
  attachments: z.array(z.string()).optional(),
});

export const relationshipSchema = z.object({
  fromMemberId: z.string().min(1),
  toMemberId: z.string().min(1),
  type: z.enum(['parent', 'child', 'spouse', 'sibling', 'custom']),
  label: z.string().optional(),
  // authored is implicit client-side; allow optional boolean for future bulk imports
  authored: z.boolean().optional(),
});

export const relationshipUpdateSchema = z.object({
  fromMemberId: z.string().min(1),
  toMemberId: z.string().min(1),
  type: z.enum(['parent', 'child', 'spouse', 'sibling', 'custom']), // current type to locate
  newType: z.enum(['parent', 'child', 'spouse', 'sibling', 'custom']).optional(),
  label: z.string().optional(), // new label (for custom or override)
  authored: z.boolean().optional(), // allow toggling authored in future if needed
});

export const relationshipDeleteSchema = z.object({
  fromMemberId: z.string().min(1),
  toMemberId: z.string().min(1),
  type: z.enum(['parent', 'child', 'spouse', 'sibling', 'custom']),
});
