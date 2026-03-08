import { z } from 'zod';

export const IngredientInputSchema = z.object({
  name: z.string().describe('Ingredient name, e.g. "chicken breast"'),
  quantity: z.number().describe('Amount, e.g. 2'),
  unit: z.string().describe('Unit, e.g. "lb", "cup", "clove"'),
  notes: z.string().optional().describe('Prep notes, e.g. "diced", "boneless skinless"'),
  optional: z.boolean().optional().default(false),
});

export type IngredientInput = z.infer<typeof IngredientInputSchema>;

export interface AggregatedIngredient {
  canonicalName: string;
  displayName: string;
  totalQuantity: number;
  unit: string;
  department: string;
  sourceRecipeIds: string[];
  notes: string[];
}

export const DEPARTMENTS = [
  'Produce',
  'Dairy',
  'Meat & Seafood',
  'Bakery',
  'Frozen',
  'Canned & Jarred',
  'Dry Goods & Pasta',
  'Snacks',
  'Beverages',
  'Condiments & Sauces',
  'Spices & Seasonings',
  'Baking',
  'Deli',
  'International',
  'Other',
] as const;

export type Department = typeof DEPARTMENTS[number];
