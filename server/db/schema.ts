import type Database from 'better-sqlite3';
import { log } from '../utils/logger.js';

const SCHEMA_VERSION = 1;

const CREATE_TABLES = `
  -- Schema version tracking
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Household profile
  CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    default_diet TEXT NOT NULL DEFAULT 'omnivore',
    budget_weekly REAL,
    preferred_store_id TEXT,
    preferred_store_chain TEXT,
    zip_code TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Household members
  CREATE TABLE IF NOT EXISTS household_members (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('adult', 'child', 'toddler')),
    serving_multiplier REAL NOT NULL DEFAULT 1.0,
    allergies TEXT NOT NULL DEFAULT '[]',
    dietary_restrictions TEXT NOT NULL DEFAULT '[]',
    disliked_ingredients TEXT NOT NULL DEFAULT '[]'
  );

  -- Recipes
  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    servings INTEGER NOT NULL DEFAULT 4,
    prep_time_minutes INTEGER,
    cook_time_minutes INTEGER,
    total_time_minutes INTEGER,
    instructions TEXT NOT NULL DEFAULT '[]',
    tags TEXT NOT NULL DEFAULT '[]',
    source_url TEXT,
    cuisine_type TEXT,
    dietary_flags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Recipe ingredients
  CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    standard_unit TEXT NOT NULL,
    standard_quantity REAL NOT NULL,
    notes TEXT,
    optional INTEGER NOT NULL DEFAULT 0,
    department TEXT NOT NULL DEFAULT 'Other'
  );

  CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe
    ON recipe_ingredients(recipe_id);

  -- Meal plans
  CREATE TABLE IF NOT EXISTS meal_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    household_id TEXT REFERENCES households(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Meal slots
  CREATE TABLE IF NOT EXISTS meal_slots (
    id TEXT PRIMARY KEY,
    meal_plan_id TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
    day_index INTEGER NOT NULL CHECK (day_index >= 0 AND day_index <= 6),
    meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
    recipe_id TEXT REFERENCES recipes(id),
    recipe_name TEXT,
    is_leftover INTEGER NOT NULL DEFAULT 0,
    leftover_source_slot_id TEXT REFERENCES meal_slots(id),
    servings REAL NOT NULL DEFAULT 2,
    notes TEXT,
    UNIQUE(meal_plan_id, day_index, meal_type)
  );

  CREATE INDEX IF NOT EXISTS idx_meal_slots_plan
    ON meal_slots(meal_plan_id);

  -- Grocery lists
  CREATE TABLE IF NOT EXISTS grocery_lists (
    id TEXT PRIMARY KEY,
    meal_plan_id TEXT NOT NULL REFERENCES meal_plans(id),
    name TEXT NOT NULL,
    total_estimated_cost REAL,
    store_id TEXT,
    store_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Grocery list items
  CREATE TABLE IF NOT EXISTS grocery_items (
    id TEXT PRIMARY KEY,
    grocery_list_id TEXT NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT 'Other',
    aisle_location TEXT,
    estimated_price REAL,
    kroger_product_id TEXT,
    kroger_upc TEXT,
    checked INTEGER NOT NULL DEFAULT 0,
    source_recipe_ids TEXT NOT NULL DEFAULT '[]',
    notes TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_grocery_items_list
    ON grocery_items(grocery_list_id);

  -- Pantry staples
  CREATE TABLE IF NOT EXISTS pantry_staples (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    canonical_name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL DEFAULT 'other',
    is_default INTEGER NOT NULL DEFAULT 1
  );
`;

export function runMigrations(db: Database.Database): void {
  log('info', 'Running database migrations...');

  // Create tables
  db.exec(CREATE_TABLES);

  // Check current version
  const versionRow = db.prepare(
    'SELECT MAX(version) as version FROM schema_version'
  ).get() as { version: number | null } | undefined;

  const currentVersion = versionRow?.version ?? 0;

  if (currentVersion < SCHEMA_VERSION) {
    db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
    log('info', `Database schema updated to version ${SCHEMA_VERSION}`);
  } else {
    log('info', `Database schema is up to date (version ${currentVersion})`);
  }
}
