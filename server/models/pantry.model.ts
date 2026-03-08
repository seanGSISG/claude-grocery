import { z } from 'zod';

export const PantryStapleSchema = z.object({
  id: z.string(),
  name: z.string(),
  canonicalName: z.string(),
  category: z.string(),
  isDefault: z.boolean().default(true),
});

export type PantryStaple = z.infer<typeof PantryStapleSchema>;

export const PANTRY_CATEGORIES = [
  'oil_fat',
  'vinegar_acid',
  'seasoning',
  'spice',
  'condiment',
  'baking',
  'grain',
  'sweetener',
  'dairy_basic',
  'other',
] as const;
