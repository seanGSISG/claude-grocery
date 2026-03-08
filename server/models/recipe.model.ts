import { z } from 'zod';

export const RecipeIngredientSchema = z.object({
  id: z.string(),
  recipeId: z.string(),
  name: z.string(),
  canonicalName: z.string(),
  quantity: z.number(),
  unit: z.string(),
  standardUnit: z.string(),
  standardQuantity: z.number(),
  notes: z.string().nullable().default(null),
  optional: z.boolean().default(false),
  department: z.string().default('Other'),
});

export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;

export const RecipeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().default(null),
  servings: z.number().int().min(1),
  prepTimeMinutes: z.number().nullable().default(null),
  cookTimeMinutes: z.number().nullable().default(null),
  totalTimeMinutes: z.number().nullable().default(null),
  ingredients: z.array(RecipeIngredientSchema).default([]),
  instructions: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  sourceUrl: z.string().nullable().default(null),
  cuisineType: z.string().nullable().default(null),
  dietaryFlags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Recipe = z.infer<typeof RecipeSchema>;

export const RecipeInputSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  servings: z.number().int().min(1),
  prepTimeMinutes: z.number().optional(),
  cookTimeMinutes: z.number().optional(),
  ingredients: z.array(z.object({
    name: z.string().describe('Ingredient name, e.g. "chicken breast"'),
    quantity: z.number().describe('Amount, e.g. 2'),
    unit: z.string().describe('Unit, e.g. "lb", "cup", "clove"'),
    notes: z.string().optional().describe('e.g. "diced", "boneless skinless"'),
    optional: z.boolean().optional(),
  })),
  instructions: z.array(z.string()).describe('Ordered list of instruction steps'),
  tags: z.array(z.string()).optional().describe('e.g. ["vegetarian", "quick", "mexican"]'),
  sourceUrl: z.string().optional(),
  cuisineType: z.string().optional(),
  dietaryFlags: z.array(z.string()).optional().describe('e.g. ["gluten-free", "dairy-free"]'),
});

export type RecipeInput = z.infer<typeof RecipeInputSchema>;
