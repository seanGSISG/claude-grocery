# Claude Grocery - Weekly Meal Planner

An MCP (Model Context Protocol) server for Claude Desktop that provides AI-powered weekly meal planning, smart grocery list generation, and native ordering integration with Colorado grocery stores.

**Built for Colorado** - integrates with King Soopers (Kroger API), Safeway (Instacart), and Walmart.

## Features

- **Weekly Meal Planning** - Create 7-day meal plans with breakfast, lunch, dinner, and snack slots
- **Smart Grocery Lists** - Automatically aggregates ingredients across recipes with deduplication, unit normalization, and pantry staple exclusion
- **Recipe Management** - Save recipes manually or import from any URL with Schema.org JSON-LD markup
- **Store Integration** - Search King Soopers products with real-time pricing, create Instacart shopping lists for Safeway, generate Walmart search links
- **Household Profiles** - Track members, dietary restrictions, allergies, serving sizes, and weekly budgets
- **Pantry Staples** - Pre-loaded with 42 common pantry items; fully customizable
- **Budget Estimation** - Cost estimates powered by Kroger product pricing

## MCP Tools (17)

| Tool | Description |
|------|-------------|
| `create_meal_plan` | Create an empty 7-day meal plan |
| `set_meal_slot` | Assign a recipe to a specific day and meal |
| `get_meal_plan` | Retrieve a meal plan by ID or get the most recent |
| `delete_meal_plan` | Delete a meal plan and all its slots |
| `save_recipe` | Save a structured recipe with ingredients and instructions |
| `import_recipe_from_url` | Extract a recipe from a URL via JSON-LD |
| `search_recipes` | Search saved recipes by keyword, tags, or dietary flags |
| `generate_grocery_list` | Aggregate ingredients from a meal plan into a shopping list |
| `modify_grocery_list` | Add, remove, or update items on a grocery list |
| `search_kroger_products` | Search King Soopers products with pricing |
| `add_to_kroger_cart` | Add items to a Kroger cart (requires partner tier) |
| `create_instacart_list` | Create an Instacart shopping list and get a checkout URL |
| `generate_walmart_links` | Generate Walmart.com search URLs for each grocery item |
| `find_nearby_stores` | Find nearby King Soopers locations by ZIP code |
| `manage_pantry` | List, add, remove, or reset pantry staples |
| `manage_household` | Get or update your household profile |
| `estimate_budget` | Estimate the cost of a grocery list |

## MCP Resources (4)

| URI | Description |
|-----|-------------|
| `grocery://household/profile` | Current household profile |
| `grocery://pantry/staples` | Pantry staple items |
| `grocery://meal-plan/current` | Current week's meal plan |
| `grocery://grocery-list/current` | Most recent grocery list |

## MCP Prompts (4)

| Prompt | Description |
|--------|-------------|
| `/plan-week` | Full 7-day meal planning workflow with optional theme |
| `/grocery-run` | Generate a grocery list and order from your preferred store |
| `/quick-meal` | Get a quick meal suggestion with optional constraints |
| `/whats-for-dinner` | Check tonight's planned dinner and recipe |

## Prerequisites

- [Node.js](https://nodejs.org/) v20 or later
- [Claude Desktop](https://claude.ai/download) with MCP extension support

## Setup

### 1. Clone and install

```bash
git clone https://github.com/seanGSISG/claude-grocery.git
cd claude-grocery
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials (see [API Keys](#api-keys) below).

### 3. Build

```bash
npm run build
```

### 4. Run

**As an MCP server (for Claude Desktop):**
```bash
npm start
```

**With the MCP Inspector (for development):**
```bash
npm run inspect:dev
```

## API Keys

### Kroger API (King Soopers) - Recommended

1. Register at [developer.kroger.com](https://developer.kroger.com)
2. Create an application to get your Client ID and Client Secret
3. Add them to your `.env` file

This enables: product search with pricing and aisle info, store location finder, and budget estimation.

### Instacart Developer Platform (Safeway) - Optional

1. Apply at [Instacart Developer Platform](https://www.instacart.com/company/business/developers)
2. Once approved, add your API key to `.env`

This enables: creating shoppable Instacart lists with a direct checkout link for Safeway and other supported retailers.

### Walmart - No API Key Needed

Walmart integration uses deep links (search URLs) - no credentials required.

## Grocery List Algorithm

The core of the plugin is the 8-step grocery list generation engine:

1. **Collect** - Load all recipes from meal plan slots, scale by servings
2. **Normalize Names** - Map ingredient names to canonical forms (~500 synonyms)
3. **Normalize Units** - Convert to standard units (volume in ml, weight in grams)
4. **Aggregate** - Group by canonical name + unit, sum quantities across recipes
5. **Exclude Pantry** - Remove items matching your pantry staples list
6. **Classify** - Assign store departments (Produce, Dairy, Meat, etc.)
7. **Enrich** - Optionally query Kroger API for aisle locations and pricing
8. **Sort** - By department, then aisle, then alphabetical

## Project Structure

```
claude-grocery/
  manifest.json          # Desktop Extension manifest
  package.json
  tsconfig.json
  server/
    index.ts             # Entry point (McpServer + StdioServerTransport)
    tools/               # 17 MCP tool definitions
    resources/           # 4 MCP resource handlers
    prompts/             # 4 slash command prompts
    db/
      connection.ts      # SQLite connection (better-sqlite3, WAL mode)
      schema.ts          # CREATE TABLE statements + migrations
      seed.ts            # Default pantry staples (42 items)
      repositories/      # Data access layer (6 repos)
    services/
      grocery-list.service.ts   # Core aggregation algorithm
      recipe-parser.service.ts  # JSON-LD extraction from URLs
      unit-converter.service.ts # Volume/weight/count conversions
      budget.service.ts         # Cost estimation
      meal-planner.service.ts   # Meal plan helpers
    integrations/
      kroger/             # OAuth 2.0 + product/location/cart APIs
      instacart/          # Shopping list creation
      walmart/            # Deep link generation
    models/               # TypeScript interfaces + Zod schemas
    utils/
      ingredient-normalizer.ts  # ~500 synonym mappings
      unit-tables.ts            # Conversion factors
      department-classifier.ts  # Ingredient -> department
      logger.ts                 # console.error-based logging
  tests/
    unit/                 # 65 unit tests
    integration/          # 27 integration tests
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with Kroger live API tests (requires .env credentials)
npm test
```

The test suite includes 92 tests across 6 files:

- **Unit tests** - ingredient normalizer, unit converter, department classifier, recipe parser
- **Integration tests** - SQLite database (schema, CRUD, repositories), Kroger API (live, skipped without credentials)

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript |
| Runtime | Node.js |
| MCP SDK | `@modelcontextprotocol/sdk` |
| Database | SQLite via `better-sqlite3` |
| Schema Validation | Zod |
| Test Framework | Vitest |
| Package Manager | npm |

## License

MIT
