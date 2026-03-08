import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HouseholdRepository } from '../db/repositories/household.repo.js';
import type { PantryRepository } from '../db/repositories/pantry.repo.js';
import type { MealPlanRepository } from '../db/repositories/meal-plan.repo.js';
import type { RecipeRepository } from '../db/repositories/recipe.repo.js';
import type { GroceryListRepository } from '../db/repositories/grocery-list.repo.js';
import { registerHouseholdResources } from './household.resources.js';
import { registerPantryResources } from './pantry.resources.js';
import { registerMealPlanResources } from './meal-plan.resources.js';
import { registerGroceryListResources } from './grocery-list.resources.js';
import { log } from '../utils/logger.js';

export interface AppContext {
  householdRepo: HouseholdRepository;
  pantryRepo: PantryRepository;
  recipeRepo: RecipeRepository;
  mealPlanRepo: MealPlanRepository;
  groceryListRepo: GroceryListRepository;
}

export function registerAllResources(server: McpServer, ctx: AppContext): void {
  log('info', 'Registering MCP resources...');

  registerHouseholdResources(server, ctx.householdRepo);
  registerPantryResources(server, ctx.pantryRepo);
  registerMealPlanResources(server, ctx.mealPlanRepo, ctx.recipeRepo);
  registerGroceryListResources(server, ctx.groceryListRepo);

  log('info', 'All MCP resources registered');
}
