import { z } from 'zod';

export const HouseholdMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['adult', 'child', 'toddler']),
  servingMultiplier: z.number().default(1.0),
  allergies: z.array(z.string()).default([]),
  dietaryRestrictions: z.array(z.string()).default([]),
  dislikedIngredients: z.array(z.string()).default([]),
});

export type HouseholdMember = z.infer<typeof HouseholdMemberSchema>;

export const HouseholdSchema = z.object({
  id: z.string(),
  name: z.string(),
  members: z.array(HouseholdMemberSchema).default([]),
  defaultDiet: z.string().default('omnivore'),
  budgetWeekly: z.number().nullable().default(null),
  preferredStoreId: z.string().nullable().default(null),
  preferredStoreChain: z.string().nullable().default(null),
  zipCode: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Household = z.infer<typeof HouseholdSchema>;

export const SERVING_MULTIPLIERS: Record<string, number> = {
  adult: 1.0,
  child: 0.5,
  toddler: 0.25,
};
