import { z } from 'zod';
import { COLUMN_IDS, PRIORITIES } from './constants.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a valid id');

export const idParams = z.object({ id: objectId });

export const createTaskBody = z.object({
  title: z.string().trim().min(1, 'is required').max(120),
  description: z.string().max(2000).optional().default(''),
  priority: z.enum(PRIORITIES).optional().default('Medium'),
  columnId: z.enum(COLUMN_IDS).optional().default('todo'),
});

export const updateTaskBody = z
  .object({
    title: z.string().trim().min(1, 'is required').max(120).optional(),
    description: z.string().max(2000).optional(),
    priority: z.enum(PRIORITIES).optional(),
    version: z.number().int().nonnegative(),
  })
  .strict(); // columnId/orderIndex can only change through /move

export const moveTaskBody = z.object({
  toColumnId: z.enum(COLUMN_IDS),
  prevId: objectId.nullable().optional(),
  nextId: objectId.nullable().optional(),
  version: z.number().int().nonnegative(),
});

export const activityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
  before: objectId.optional(),
});
