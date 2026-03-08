import { z } from 'zod';

export const GroceryItemSchema = z.object({
  id: z.string(),
  groceryListId: z.string(),
  name: z.string(),
  canonicalName: z.string(),
  quantity: z.number(),
  unit: z.string(),
  department: z.string(),
  aisleLocation: z.string().nullable().default(null),
  estimatedPrice: z.number().nullable().default(null),
  krogerProductId: z.string().nullable().default(null),
  krogerUpc: z.string().nullable().default(null),
  checked: z.boolean().default(false),
  sourceRecipeIds: z.array(z.string()).default([]),
  notes: z.string().nullable().default(null),
});

export type GroceryItem = z.infer<typeof GroceryItemSchema>;

export const GroceryListSchema = z.object({
  id: z.string(),
  mealPlanId: z.string(),
  name: z.string(),
  items: z.array(GroceryItemSchema).default([]),
  totalEstimatedCost: z.number().nullable().default(null),
  storeId: z.string().nullable().default(null),
  storeName: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type GroceryList = z.infer<typeof GroceryListSchema>;
