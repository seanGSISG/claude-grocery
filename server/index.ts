/**
 * Claude Grocery MCP Server -- main entry point.
 *
 * Initializes the SQLite database, creates repository and API-client
 * instances, registers all MCP tools/resources/prompts, and connects
 * to the host via stdio transport.
 */

import type Database from 'better-sqlite3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initDatabase } from './db/connection.js';
import { runMigrations } from './db/schema.js';
import { seedDefaults } from './db/seed.js';
import { HouseholdRepository } from './db/repositories/household.repo.js';
import { PantryRepository } from './db/repositories/pantry.repo.js';
import { RecipeRepository } from './db/repositories/recipe.repo.js';
import { MealPlanRepository } from './db/repositories/meal-plan.repo.js';
import { GroceryListRepository } from './db/repositories/grocery-list.repo.js';
import { KrogerAuth } from './integrations/kroger/kroger-auth.js';
import { KrogerClient } from './integrations/kroger/kroger-client.js';
import { InstacartClient } from './integrations/instacart/instacart-client.js';
import { WalmartLinks } from './integrations/walmart/walmart-links.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllPrompts } from './prompts/index.js';
import { log } from './utils/logger.js';

// ---------------------------------------------------------------------------
// AppContext -- shared across all tool/resource/prompt handlers
// ---------------------------------------------------------------------------

export interface AppContext {
  db: Database.Database;
  householdRepo: HouseholdRepository;
  pantryRepo: PantryRepository;
  recipeRepo: RecipeRepository;
  mealPlanRepo: MealPlanRepository;
  groceryListRepo: GroceryListRepository;
  krogerAuth: KrogerAuth | null;
  krogerClient: KrogerClient | null;
  instacartClient: InstacartClient | null;
  walmartLinks: WalmartLinks;
  zipCode: string;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log('info', 'Claude Grocery MCP server starting...');

  // --- 1. Database -----------------------------------------------------------
  const db = initDatabase();
  runMigrations(db);
  seedDefaults(db);

  // --- 2. Repositories -------------------------------------------------------
  const householdRepo = new HouseholdRepository(db);
  const pantryRepo = new PantryRepository(db);
  const recipeRepo = new RecipeRepository(db);
  const mealPlanRepo = new MealPlanRepository(db);
  const groceryListRepo = new GroceryListRepository(db);

  // --- 3. API clients (conditional on env vars) ------------------------------
  let krogerAuth: KrogerAuth | null = null;
  let krogerClient: KrogerClient | null = null;
  const krogerClientId = process.env.KROGER_CLIENT_ID;
  const krogerClientSecret = process.env.KROGER_CLIENT_SECRET;

  if (krogerClientId && krogerClientSecret) {
    krogerAuth = new KrogerAuth(krogerClientId, krogerClientSecret);
    krogerClient = new KrogerClient(krogerAuth);
    log('info', 'Kroger (King Soopers) integration enabled');
  } else {
    log('info', 'Kroger integration disabled (KROGER_CLIENT_ID / KROGER_CLIENT_SECRET not set)');
  }

  let instacartClient: InstacartClient | null = null;
  const instacartApiKey = process.env.INSTACART_API_KEY;

  if (instacartApiKey) {
    instacartClient = new InstacartClient(instacartApiKey);
    log('info', 'Instacart (Safeway) integration enabled');
  } else {
    log('info', 'Instacart integration disabled (INSTACART_API_KEY not set)');
  }

  const walmartAffiliateId = process.env.WALMART_AFFILIATE_ID;
  const walmartLinks = new WalmartLinks(walmartAffiliateId);
  log('info', 'Walmart link generation enabled');

  // --- 4. Context object -----------------------------------------------------
  const zipCode = process.env.ZIP_CODE || '80202'; // default: downtown Denver

  const ctx: AppContext = {
    db,
    householdRepo,
    pantryRepo,
    recipeRepo,
    mealPlanRepo,
    groceryListRepo,
    krogerAuth,
    krogerClient,
    instacartClient,
    walmartLinks,
    zipCode,
  };

  // --- 5. MCP server ---------------------------------------------------------
  const server = new McpServer(
    { name: 'claude-grocery', version: '1.0.0' },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
  );

  // --- 6. Register tools, resources, and prompts -----------------------------
  registerAllTools(server, ctx);
  registerAllResources(server, ctx);
  registerAllPrompts(server);

  // --- 7. Connect via stdio --------------------------------------------------
  const transport = new StdioServerTransport();
  await server.connect(transport);

  log('info', 'Claude Grocery MCP server connected and ready');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((error) => {
  log('error', 'Fatal error during server startup', error);
  process.exit(1);
});
