import { describe, it, expect } from 'vitest';
import { planWeek, aggregateIngredients, isMainDish, proteinOf } from '../../server/services/week-planner.service.js';
import type { NightPlan } from '../../server/services/night-classifier.service.js';
import type { Recipe } from '../../server/models/recipe.model.js';

let seq = 0;
function recipe(title: string, over: Partial<Recipe> = {}): Recipe {
  seq += 1;
  return {
    id: `r${seq}`, title, description: null, servings: 4,
    prepTimeMinutes: 20, cookTimeMinutes: 20, totalTimeMinutes: 40,
    ingredients: [], instructions: [], tags: [], sourceUrl: null,
    cuisineType: null, dietaryFlags: [], createdAt: '', updatedAt: '',
    ...over,
  };
}

function ingredient(name: string, quantity: number, unit = 'g', over: Record<string, unknown> = {}) {
  return {
    id: 'i', recipeId: 'r', name, canonicalName: name.toLowerCase().replace(/ /g, '_'),
    quantity, unit, standardUnit: unit, standardQuantity: quantity,
    notes: null, optional: false, department: 'Other', ...over,
  };
}

const night = (date: string, weekday: string, kind: NightPlan['kind'], maxPrepMinutes: number): NightPlan => ({
  date, weekday, kind, maxPrepMinutes, reason: '', events: [], adultsOut: [], atTable: 4.2,
});

describe('dish classification', () => {
  it('treats a corn salad as a side, not a dinner', () => {
    expect(isMainDish(recipe('Avocado Corn Salad'))).toBe(false);
  });

  it('keeps a salad that has protein in it', () => {
    expect(isMainDish(recipe('Grilled Chicken Salad'))).toBe(true);
  });

  it('groups proteins so the week varies', () => {
    expect(proteinOf(recipe('Grilled Greek Lemon Chicken'))).toBe('poultry');
    expect(proteinOf(recipe('Homemade Mongolian Beef'))).toBe('beef');
    expect(proteinOf(recipe('Pesto Penne with Shrimp'))).toBe('seafood');
  });
});

describe('planning a week', () => {
  const library = [
    recipe('Crock-Pot Chicken Marsala', { prepTimeMinutes: 15, tags: ['crock pot'] }),
    recipe('Grilled Greek Lemon Chicken', { prepTimeMinutes: 25 }),
    recipe('Homemade Mongolian Beef', { prepTimeMinutes: 20 }),
    recipe('Avocado Corn Salad', { prepTimeMinutes: 10 }),
    recipe('Slow Cooker Korean Beef', { prepTimeMinutes: 10, tags: ['slow cooker'] }),
  ];

  it('only cooks on cooking nights', () => {
    const week = [
      night('2026-09-27', 'Sunday', 'full', 60),
      night('2026-09-28', 'Monday', 'eat-out', 0),
      night('2026-09-29', 'Tuesday', 'skip', 0),
      night('2026-09-30', 'Wednesday', 'leftovers', 10),
    ];
    const plan = planWeek('2026-09-27', week, library);
    expect(plan.meals).toHaveLength(1);
    expect(plan.unplanned).toHaveLength(3);
  });

  it('puts a hands-off recipe on a slow-cooker night', () => {
    const plan = planWeek('2026-09-27', [night('2026-09-27', 'Sunday', 'slow-cooker', 15)], library);
    expect(['Crock-Pot Chicken Marsala', 'Slow Cooker Korean Beef']).toContain(plan.meals[0].recipe.title);
  });

  it('never picks a 25-minute recipe for a night with nobody home', () => {
    const plan = planWeek('2026-09-27', [night('2026-09-27', 'Sunday', 'slow-cooker', 15)],
      [recipe('Grilled Greek Lemon Chicken', { prepTimeMinutes: 25 })]);
    expect(plan.meals).toHaveLength(0);
    expect(plan.warnings[0]).toContain('No recipe fits');
  });

  it('avoids the same protein two nights running', () => {
    const plan = planWeek('2026-09-27', [
      night('2026-09-27', 'Sunday', 'full', 60),
      night('2026-09-28', 'Monday', 'full', 60),
    ], library);
    expect(proteinOf(plan.meals[0].recipe)).not.toBe(proteinOf(plan.meals[1].recipe));
  });

  it('never repeats a recipe inside one week', () => {
    const plan = planWeek('2026-09-27', [
      night('2026-09-27', 'Sunday', 'full', 60),
      night('2026-09-28', 'Monday', 'full', 60),
      night('2026-09-29', 'Tuesday', 'full', 60),
    ], library);
    expect(new Set(plan.meals.map((m) => m.recipe.title)).size).toBe(plan.meals.length);
  });

  it('scales a 4-serving recipe up for the family plus lunches', () => {
    const plan = planWeek('2026-09-27', [night('2026-09-27', 'Sunday', 'full', 60)], library);
    expect(plan.meals[0].portions).toBeCloseTo(6.2); // 4.2 at the table + 2 lunches
    expect(plan.meals[0].scale).toBe(1.5);
  });

  it('avoids something cooked last week when an alternative exists', () => {
    const plan = planWeek('2026-09-27', [night('2026-09-27', 'Sunday', 'full', 60)], library, {
      recentTitles: ['Grilled Greek Lemon Chicken'],
    });
    expect(plan.meals[0].recipe.title).not.toBe('Grilled Greek Lemon Chicken');
  });
});

describe('shopping list', () => {
  const meal = (title: string, ingredients: ReturnType<typeof ingredient>[], scale = 1) => ({
    date: '2026-09-27', weekday: 'Sunday', kind: 'full' as const,
    recipe: recipe(title, { ingredients }), portions: 6.2, scale, fit: '',
  });

  it('sums the same ingredient across meals', () => {
    const items = aggregateIngredients([
      meal('A', [ingredient('Ground Beef', 450)]),
      meal('B', [ingredient('Ground Beef', 300)]),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(750);
    expect(items[0].forMeals).toEqual(['A', 'B']);
  });

  it('applies the scale factor to quantities', () => {
    const items = aggregateIngredients([meal('A', [ingredient('Ground Beef', 400)], 1.5)]);
    expect(items[0].quantity).toBe(600);
  });

  it('leaves out salt, pepper, oil and water', () => {
    const items = aggregateIngredients([meal('A', [
      ingredient('Kosher Salt', 5), ingredient('Olive Oil', 30),
      ingredient('Water', 500), ingredient('Ground Beef', 400),
    ])]);
    expect(items.map((i) => i.canonicalName)).toEqual(['ground_beef']);
  });

  it('skips optional ingredients', () => {
    const items = aggregateIngredients([meal('A', [
      ingredient('Ground Beef', 400), ingredient('Fresh Basil', 10, 'g', { optional: true }),
    ])]);
    expect(items).toHaveLength(1);
  });

  it('flags an ingredient with no quantity', () => {
    const warnings: string[] = [];
    aggregateIngredients([meal('A', [ingredient('Salsa', 0, 'each')])], warnings);
    expect(warnings[0]).toContain('no quantity');
  });
});

describe('juice lines', () => {
  const meal = (ingredients: ReturnType<typeof ingredient>[]) => ({
    date: '2026-09-27', weekday: 'Sunday', kind: 'full' as const,
    recipe: recipe('A', { ingredients }), portions: 6.2, scale: 1, fit: '',
  });

  it('buys limes instead of lime juice, merging with limes already needed', () => {
    const items = aggregateIngredients([meal([
      ingredient('Lime Juice', 60, 'ml', { canonicalName: 'lime_juice' }),
      ingredient('Lime', 2, 'each', { canonicalName: 'lime' }),
    ])]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ canonicalName: 'lime', quantity: 4, unit: 'each' });
  });

  it('still buys bottled juice when the recipe wants a lot', () => {
    const items = aggregateIngredients([meal([
      ingredient('Lemon Juice', 500, 'ml', { canonicalName: 'lemon_juice' }),
    ])]);
    expect(items[0].canonicalName).toBe('lemon_juice');
  });
});

describe('assumed pantry', () => {
  const meal = (ingredients: ReturnType<typeof ingredient>[]) => ({
    date: '2026-09-27', weekday: 'Sunday', kind: 'full' as const,
    recipe: recipe('A', { ingredients }), portions: 6.2, scale: 1, fit: '',
  });

  it('leaves out salt, pepper and the spice rack', () => {
    const items = aggregateIngredients([meal([
      ingredient('Kosher Salt', 5), ingredient('Black Pepper', 2),
      ingredient('Paprika', 5), ingredient('Cumin', 3), ingredient('Turmeric', 2),
      ingredient('Cayenne Pepper', 1), ingredient('Garlic Powder', 4),
      ingredient('Ground Beef', 400),
    ])]);
    expect(items.map((i) => i.canonicalName)).toEqual(['ground_beef']);
  });

  it('treats anything dried or ground as spice-rack, but not ground meat', () => {
    const items = aggregateIngredients([meal([
      ingredient('Dried Oregano', 5), ingredient('Ground Cinnamon', 2),
      ingredient('Ground Turkey', 500),
    ])]);
    expect(items.map((i) => i.canonicalName)).toEqual(['ground_turkey']);
  });

  it('still buys fresh herbs', () => {
    const items = aggregateIngredients([meal([
      ingredient('Fresh Cilantro', 1, 'each', { canonicalName: 'fresh_cilantro' }),
      ingredient('Dried Basil', 3, 'g', { canonicalName: 'dried_basil' }),
    ])]);
    expect(items.map((i) => i.canonicalName)).toEqual(['fresh_cilantro']);
  });

  it('leaves out oil, flour and sugar', () => {
    const items = aggregateIngredients([meal([
      ingredient('Olive Oil', 30), ingredient('All Purpose Flour', 100),
      ingredient('Dark Brown Sugar', 20), ingredient('Cornstarch', 10),
      ingredient('Chicken Thigh', 900),
    ])]);
    expect(items.map((i) => i.canonicalName)).toEqual(['chicken_thigh']);
  });
});
