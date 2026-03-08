import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MealPlanRepository } from '../db/repositories/meal-plan.repo.js';
import type { RecipeRepository } from '../db/repositories/recipe.repo.js';
import { DAY_NAMES } from '../models/meal-plan.model.js';
import { log } from '../utils/logger.js';

export function registerMealPlanResources(
  server: McpServer,
  mealPlanRepo: MealPlanRepository,
  recipeRepo: RecipeRepository,
): void {
  server.resource(
    'current-meal-plan',
    'grocery://meal-plan/current',
    {
      description: 'The most recent weekly meal plan showing all scheduled meals, recipes, servings, and leftovers for each day.',
      mimeType: 'application/json',
    },
    async (uri) => {
      log('debug', 'Reading current meal plan resource');

      const plan = mealPlanRepo.getCurrent();

      if (!plan) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              status: 'no_plan',
              message: 'No meal plan exists yet. Use the plan-week prompt or set-meal-slot tool to create one.',
            }, null, 2),
          }],
        };
      }

      // Enrich each slot with recipe details where available
      const enrichedDays = plan.days.map(day => {
        const enrichedSlots: Record<string, unknown> = {};

        for (const [mealType, slot] of Object.entries(day.slots)) {
          if (!slot) {
            enrichedSlots[mealType] = null;
            continue;
          }

          let recipeDetails: {
            title: string;
            servings: number;
            prepTimeMinutes: number | null;
            cookTimeMinutes: number | null;
            tags: string[];
          } | null = null;

          if (slot.recipeId) {
            const recipe = recipeRepo.getById(slot.recipeId);
            if (recipe) {
              recipeDetails = {
                title: recipe.title,
                servings: recipe.servings,
                prepTimeMinutes: recipe.prepTimeMinutes,
                cookTimeMinutes: recipe.cookTimeMinutes,
                tags: recipe.tags,
              };
            }
          }

          enrichedSlots[mealType] = {
            recipeName: slot.recipeName,
            servings: slot.servings,
            isLeftover: slot.isLeftover,
            notes: slot.notes,
            recipeDetails,
          };
        }

        return {
          dayIndex: day.dayIndex,
          date: day.date,
          dayName: day.dayName,
          meals: enrichedSlots,
        };
      });

      // Compute summary stats
      const allSlots = plan.days.flatMap(d => Object.values(d.slots).filter(Boolean));
      const filledSlots = allSlots.length;
      const leftoverSlots = allSlots.filter(s => s!.isLeftover).length;
      const uniqueRecipeIds = new Set(allSlots.map(s => s!.recipeId).filter(Boolean));

      const result = {
        id: plan.id,
        name: plan.name,
        startDate: plan.startDate,
        endDate: plan.endDate,
        days: enrichedDays,
        summary: {
          totalSlotsFilled: filledSlots,
          leftoverMeals: leftoverSlots,
          uniqueRecipes: uniqueRecipeIds.size,
          totalPossibleSlots: 28, // 7 days x 4 meal types
        },
      };

      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );
}
