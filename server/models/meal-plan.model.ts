import { z } from 'zod';

export const MealTypeEnum = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type MealType = z.infer<typeof MealTypeEnum>;

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MealSlotSchema = z.object({
  id: z.string(),
  mealPlanId: z.string(),
  dayIndex: z.number().int().min(0).max(6),
  mealType: MealTypeEnum,
  recipeId: z.string().nullable().default(null),
  recipeName: z.string().nullable().default(null),
  isLeftover: z.boolean().default(false),
  leftoverSourceSlotId: z.string().nullable().default(null),
  servings: z.number().default(2),
  notes: z.string().nullable().default(null),
});

export type MealSlot = z.infer<typeof MealSlotSchema>;

export const MealPlanDaySchema = z.object({
  dayIndex: z.number().int().min(0).max(6),
  date: z.string(),
  dayName: z.string(),
  slots: z.record(MealTypeEnum, MealSlotSchema.nullable()),
});

export type MealPlanDay = z.infer<typeof MealPlanDaySchema>;

export const MealPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  householdId: z.string().nullable().default(null),
  days: z.array(MealPlanDaySchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MealPlan = z.infer<typeof MealPlanSchema>;

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
