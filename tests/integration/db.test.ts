import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../server/db/schema.js';
import { seedDefaults } from '../../server/db/seed.js';
import { HouseholdRepository } from '../../server/db/repositories/household.repo.js';
import { PantryRepository } from '../../server/db/repositories/pantry.repo.js';
import { RecipeRepository } from '../../server/db/repositories/recipe.repo.js';
import { MealPlanRepository } from '../../server/db/repositories/meal-plan.repo.js';

describe('Database integration', () => {
  let db: Database.Database;

  beforeAll(() => {
    // Use in-memory DB for tests
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    seedDefaults(db);
  });

  afterAll(() => {
    db.close();
  });

  describe('schema creation', () => {
    it('creates all expected tables', () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name);

      // Schema uses plural table names
      expect(tableNames).toContain('households');
      expect(tableNames).toContain('household_members');
      expect(tableNames).toContain('pantry_staples');
      expect(tableNames).toContain('recipes');
      expect(tableNames).toContain('recipe_ingredients');
      expect(tableNames).toContain('meal_plans');
      expect(tableNames).toContain('meal_slots');
      expect(tableNames).toContain('grocery_lists');
      expect(tableNames).toContain('grocery_items');
    });
  });

  describe('seed defaults', () => {
    it('seeds pantry staples', () => {
      const count = db.prepare('SELECT COUNT(*) as count FROM pantry_staples').get() as { count: number };
      expect(count.count).toBeGreaterThan(0);
    });

    it('seeds at least 40 staples', () => {
      const count = db.prepare('SELECT COUNT(*) as count FROM pantry_staples').get() as { count: number };
      expect(count.count).toBeGreaterThanOrEqual(40);
    });
  });

  describe('HouseholdRepository', () => {
    let repo: HouseholdRepository;

    beforeAll(() => {
      repo = new HouseholdRepository(db);
    });

    it('upserts and retrieves a household', () => {
      const household = repo.upsert({
        zipCode: '80202',
        weeklyBudget: 150,
      });

      expect(household).toBeDefined();
      expect(household.id).toBeDefined();
      expect(household.zipCode).toBe('80202');

      const retrieved = repo.get();
      expect(retrieved).toBeDefined();
      expect(retrieved!.zipCode).toBe('80202');
    });

    it('updates an existing household', () => {
      const updated = repo.upsert({
        zipCode: '80210',
        weeklyBudget: 200,
      });

      expect(updated.zipCode).toBe('80210');

      const retrieved = repo.get();
      expect(retrieved!.zipCode).toBe('80210');
    });
  });

  describe('PantryRepository', () => {
    let repo: PantryRepository;

    beforeAll(() => {
      repo = new PantryRepository(db);
    });

    it('lists default pantry staples', () => {
      const staples = repo.getAll();
      expect(staples.length).toBeGreaterThan(0);
    });

    it('gets canonical names as a Set', () => {
      const names = repo.getCanonicalNames();
      expect(names).toBeInstanceOf(Set);
      expect(names.size).toBeGreaterThan(0);
    });

    it('adds custom staples', () => {
      const before = repo.getAll().length;
      repo.add([{ name: 'Truffle Oil', canonicalName: 'truffle_oil', category: 'Condiments & Sauces' }]);
      const after = repo.getAll().length;
      expect(after).toBe(before + 1);
    });

    it('removes staples', () => {
      const before = repo.getAll().length;
      repo.remove(['truffle_oil']);
      const after = repo.getAll().length;
      expect(after).toBe(before - 1);
    });
  });

  describe('RecipeRepository', () => {
    let repo: RecipeRepository;

    beforeAll(() => {
      repo = new RecipeRepository(db);
    });

    it('creates and retrieves a recipe', () => {
      const recipe = repo.create({
        title: 'Test Chicken Stir Fry',
        servings: 4,
        ingredients: [
          { name: 'chicken breast', quantity: 1, unit: 'lb' },
          { name: 'soy sauce', quantity: 2, unit: 'tbsp' },
          { name: 'garlic', quantity: 3, unit: 'cloves' },
        ],
        instructions: ['Cut chicken', 'Stir fry with garlic', 'Add soy sauce'],
        tags: ['dinner', 'asian'],
        dietaryFlags: [],
      });

      expect(recipe).toBeDefined();
      expect(recipe.id).toBeDefined();
      expect(recipe.title).toBe('Test Chicken Stir Fry');

      const retrieved = repo.getById(recipe.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.ingredients).toHaveLength(3);
      expect(retrieved!.instructions).toHaveLength(3);
    });

    it('searches recipes by query', () => {
      repo.create({
        title: 'Vegetarian Pasta Primavera',
        servings: 4,
        ingredients: [
          { name: 'penne', quantity: 1, unit: 'lb' },
          { name: 'bell pepper', quantity: 2, unit: 'each' },
        ],
        instructions: ['Cook pasta', 'Sauté veggies'],
        tags: ['dinner', 'vegetarian'],
        dietaryFlags: ['vegetarian'],
      });

      const results = repo.search({ query: 'pasta' });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.title.includes('Pasta'))).toBe(true);
    });

    it('searches recipes by tag', () => {
      const results = repo.search({ tags: ['asian'] });
      expect(results.length).toBeGreaterThan(0);
    });

    it('searches recipes by dietary flag', () => {
      const results = repo.search({ dietaryFlags: ['vegetarian'] });
      expect(results.length).toBeGreaterThan(0);
    });

    it('deletes a recipe', () => {
      const recipe = repo.create({
        title: 'Delete Me Recipe',
        servings: 2,
        ingredients: [{ name: 'test', quantity: 1, unit: 'each' }],
        instructions: ['test step'],
        tags: [],
        dietaryFlags: [],
      });

      expect(repo.getById(recipe.id)).toBeDefined();
      repo.delete(recipe.id);
      expect(repo.getById(recipe.id)).toBeNull();
    });
  });

  describe('MealPlanRepository', () => {
    let repo: MealPlanRepository;
    let recipeRepo: RecipeRepository;

    beforeAll(() => {
      repo = new MealPlanRepository(db);
      recipeRepo = new RecipeRepository(db);
    });

    it('creates a meal plan and adds slots', () => {
      // MealPlan.create(startDate, name?, householdId?)
      const plan = repo.create('2026-03-09', 'Test Week');

      expect(plan).toBeDefined();
      expect(plan.id).toBeDefined();
      expect(plan.name).toBe('Test Week');
      expect(plan.startDate).toBe('2026-03-09');
      // 7 days in the plan
      expect(plan.days).toHaveLength(7);

      // Create a recipe to assign
      const recipe = recipeRepo.create({
        title: 'Meal Plan Test Recipe',
        servings: 4,
        ingredients: [{ name: 'test', quantity: 1, unit: 'each' }],
        instructions: ['test'],
        tags: [],
        dietaryFlags: [],
      });

      // setSlot(mealPlanId, dayIndex, mealType, data)
      repo.setSlot(plan.id, 0, 'dinner', {
        recipeId: recipe.id,
        servings: 4,
        isLeftover: false,
      });

      const retrieved = repo.getById(plan.id);
      expect(retrieved).toBeDefined();
      // Access via days[0].slots.dinner
      const dinnerSlot = retrieved!.days[0].slots.dinner;
      expect(dinnerSlot).not.toBeNull();
      expect(dinnerSlot!.mealType).toBe('dinner');
      expect(dinnerSlot!.recipeId).toBe(recipe.id);
      expect(dinnerSlot!.servings).toBe(4);
    });

    it('gets the current/most recent plan', () => {
      const current = repo.getCurrent();
      expect(current).toBeDefined();
    });

    it('lists all plans', () => {
      const plans = repo.getAll();
      expect(plans.length).toBeGreaterThan(0);
    });

    it('deletes a plan', () => {
      const plan = repo.create('2026-04-01', 'Temp Plan');
      expect(repo.getById(plan.id)).toBeDefined();

      repo.delete(plan.id);
      expect(repo.getById(plan.id)).toBeNull();
    });
  });
});
