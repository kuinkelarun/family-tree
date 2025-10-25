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
  dob: z.string().optional(),
  photo: z.string().url().optional(),
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
  dob: z.string().optional(),
  photo: z.string().url().optional(),
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
});

export const relationshipUpdateSchema = z.object({
  fromMemberId: z.string().min(1),
  toMemberId: z.string().min(1),
  type: z.enum(['parent', 'child', 'spouse', 'sibling', 'custom']), // current type to locate
  newType: z.enum(['parent', 'child', 'spouse', 'sibling', 'custom']).optional(),
  label: z.string().optional(), // new label (for custom or override)
});

export const relationshipDeleteSchema = z.object({
  fromMemberId: z.string().min(1),
  toMemberId: z.string().min(1),
  type: z.enum(['parent', 'child', 'spouse', 'sibling', 'custom']),
});
