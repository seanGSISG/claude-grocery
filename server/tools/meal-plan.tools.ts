import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MealPlanRepository } from '../db/repositories/meal-plan.repo.js';
import type { RecipeRepository } from '../db/repositories/recipe.repo.js';
import type { HouseholdRepository } from '../db/repositories/household.repo.js';
import { log } from '../utils/logger.js';

interface MealPlanToolsContext {
  mealPlanRepo: MealPlanRepository;
  recipeRepo: RecipeRepository;
  householdRepo: HouseholdRepository;
}

export function registerMealPlanTools(server: McpServer, ctx: MealPlanToolsContext): void {
  // --- create_meal_plan ---
  server.registerTool(
    'create_meal_plan',
    {
      description:
        'Create a new weekly meal plan. Provide a Monday start date (YYYY-MM-DD format). ' +
        'The plan spans 7 days (Monday-Sunday). After creating, use set_meal_slot to assign ' +
        'recipes to specific days and meal types.',
      inputSchema: {
        startDate: z.string().describe('Monday start date in YYYY-MM-DD format, e.g. "2026-03-09"'),
        name: z.string().optional().describe('Optional name for the plan, e.g. "Spring Week 1"'),
      },
    },
    async ({ startDate, name }) => {
      try {
        const household = ctx.householdRepo.get();
        const plan = ctx.mealPlanRepo.create(startDate, name, household?.id);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ status: 'created', mealPlan: plan }),
            },
          ],
        };
      } catch (error) {
        log('error', 'create_meal_plan failed', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: String(error) }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- set_meal_slot ---
  server.registerTool(
    'set_meal_slot',
    {
      description:
        'Assign a recipe to a specific day and meal type in a meal plan. Use dayIndex 0-6 ' +
        '(Monday=0, Sunday=6). You can reference a saved recipe by ID, or provide a recipeName ' +
        'for a quick placeholder. Mark meals as leftovers with isLeftover=true.',
      inputSchema: {
        mealPlanId: z.string().describe('ID of the meal plan'),
        dayIndex: z.number().int().min(0).max(6).describe('Day index: 0=Monday, 1=Tuesday, ..., 6=Sunday'),
        mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).describe('Type of meal'),
        recipeId: z.string().optional().describe('ID of a saved recipe to assign'),
        recipeName: z.string().optional().describe('Recipe name (if no saved recipe, e.g. "Leftover pasta")'),
        isLeftover: z.boolean().optional().describe('Whether this meal uses leftovers from another meal'),
        leftoverSourceSlotId: z.string().optional().describe('ID of the original meal slot if this is a leftover'),
        servings: z.number().optional().describe('Number of servings for this meal'),
        notes: z.string().optional().describe('Any notes for this meal slot'),
      },
    },
    async ({ mealPlanId, dayIndex, mealType, recipeId, recipeName, isLeftover, leftoverSourceSlotId, servings, notes }) => {
      try {
        // Validate meal plan exists
        const plan = ctx.mealPlanRepo.getById(mealPlanId);
        if (!plan) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: `Meal plan not found: ${mealPlanId}` }),
              },
            ],
            isError: true,
          };
        }

        // If recipeId provided, look up the recipe name
        let resolvedRecipeName = recipeName;
        if (recipeId) {
          const recipe = ctx.recipeRepo.getById(recipeId);
          if (!recipe) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({ error: `Recipe not found: ${recipeId}` }),
                },
              ],
              isError: true,
            };
          }
          resolvedRecipeName = resolvedRecipeName || recipe.title;
        }

        const slot = ctx.mealPlanRepo.setSlot(mealPlanId, dayIndex, mealType, {
          recipeId,
          recipeName: resolvedRecipeName,
          isLeftover,
          leftoverSourceSlotId,
          servings,
          notes,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ status: 'slot_set', slot }),
            },
          ],
        };
      } catch (error) {
        log('error', 'set_meal_slot failed', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: String(error) }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- get_meal_plan ---
  server.registerTool(
    'get_meal_plan',
    {
      description:
        'Retrieve a meal plan by ID, or get the most recent plan if no ID is provided. ' +
        'Returns the full 7-day plan with all assigned meal slots.',
      inputSchema: {
        mealPlanId: z.string().optional().describe('Specific meal plan ID (omit to get the most recent plan)'),
      },
    },
    async ({ mealPlanId }) => {
      try {
        const plan = mealPlanId
          ? ctx.mealPlanRepo.getById(mealPlanId)
          : ctx.mealPlanRepo.getCurrent();

        if (!plan) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  status: 'not_found',
                  message: mealPlanId
                    ? `No meal plan found with ID: ${mealPlanId}`
                    : 'No meal plans exist yet. Use create_meal_plan to create one.',
                }),
              },
            ],
          };
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(plan) }],
        };
      } catch (error) {
        log('error', 'get_meal_plan failed', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: String(error) }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- delete_meal_plan ---
  server.registerTool(
    'delete_meal_plan',
    {
      description: 'Delete a meal plan and all its meal slots by ID.',
      inputSchema: {
        mealPlanId: z.string().describe('ID of the meal plan to delete'),
      },
    },
    async ({ mealPlanId }) => {
      try {
        const deleted = ctx.mealPlanRepo.delete(mealPlanId);
        if (!deleted) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: `Meal plan not found: ${mealPlanId}` }),
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ status: 'deleted', mealPlanId }),
            },
          ],
        };
      } catch (error) {
        log('error', 'delete_meal_plan failed', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: String(error) }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
