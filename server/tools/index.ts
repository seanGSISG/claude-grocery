/**
 * Tool registration aggregator.
 *
 * Collects all tool modules and registers them with the MCP server.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../index.js';

import { GroceryListService } from '../services/grocery-list.service.js';
import { registerHouseholdTools } from './household.tools.js';
import { registerPantryTools } from './pantry.tools.js';
import { registerRecipeTools } from './recipe.tools.js';
import { registerMealPlanTools } from './meal-plan.tools.js';
import { registerGroceryListTools } from './grocery-list.tools.js';
import { registerGroceryOrderTools } from './grocery-order.tools.js';
import { registerStoreTools } from './store.tools.js';
import { registerBudgetTools } from './budget.tools.js';
import { log } from '../utils/logger.js';

/**
 * Register all MCP tools on the server.
 *
 * @param server - The MCP server instance
 * @param ctx - Application context with database, repositories, and API clients
 */
export function registerAllTools(server: McpServer, ctx: AppContext): void {
  log('info', 'Registering MCP tools...');

  // Build the grocery list service from repositories
  const groceryListService = new GroceryListService(
    ctx.mealPlanRepo,
    ctx.recipeRepo,
    ctx.pantryRepo,
    ctx.groceryListRepo,
  );

  registerHouseholdTools(server, {
    householdRepo: ctx.householdRepo,
  });

  registerPantryTools(server, {
    pantryRepo: ctx.pantryRepo,
  });

  registerRecipeTools(server, {
    recipeRepo: ctx.recipeRepo,
  });

  registerMealPlanTools(server, {
    mealPlanRepo: ctx.mealPlanRepo,
    recipeRepo: ctx.recipeRepo,
    householdRepo: ctx.householdRepo,
  });

  registerGroceryListTools(server, {
    groceryListRepo: ctx.groceryListRepo,
    mealPlanRepo: ctx.mealPlanRepo,
    groceryListService,
  });

  registerGroceryOrderTools(server, {
    groceryListRepo: ctx.groceryListRepo,
    krogerClient: ctx.krogerClient,
    instacartClient: ctx.instacartClient,
    walmartLinks: ctx.walmartLinks,
  });

  registerStoreTools(server, {
    householdRepo: ctx.householdRepo,
    krogerClient: ctx.krogerClient,
  });

  registerBudgetTools(server, {
    groceryListRepo: ctx.groceryListRepo,
    householdRepo: ctx.householdRepo,
  });

  log('info', 'All MCP tools registered');
}
