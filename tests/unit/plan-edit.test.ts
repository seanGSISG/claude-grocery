import { describe, it, expect } from 'vitest';
import { applyEdits } from '../../server/services/plan-edit.service.js';
import { parseReply } from '../../server/services/edit-parser.service.js';
import { planWeek } from '../../server/services/week-planner.service.js';
import type { NightPlan } from '../../server/services/night-classifier.service.js';
import type { Recipe } from '../../server/models/recipe.model.js';

let seq = 0;
function recipe(title: string, ingredients: Array<[string, number, string]>, over: Partial<Recipe> = {}): Recipe {
  seq += 1;
  return {
    id: `r${seq}`, title, description: null, servings: 4, prepTimeMinutes: 20,
    cookTimeMinutes: 20, totalTimeMinutes: 40,
    ingredients: ingredients.map(([name, quantity, unit], i) => ({
      id: `i${i}`, recipeId: `r${seq}`, name,
      canonicalName: name.toLowerCase().replace(/ /g, '_'),
      quantity, unit, standardUnit: unit, standardQuantity: quantity,
      notes: null, optional: false, department: 'Other',
    })),
    instructions: [], tags: [], sourceUrl: null, cuisineType: null,
    dietaryFlags: [], createdAt: '', updatedAt: '', ...over,
  };
}

const library = [
  recipe('Grilled Greek Lemon Chicken', [['Chicken Breast', 900, 'g'], ['Lemon', 2, 'each']]),
  recipe('Taco Baked Potatoes', [['Ground Beef', 680, 'g'], ['Salsa', 1, 'each']], { tags: ['tacos', 'mexican'] }),
  recipe('Crock-Pot Chicken Marsala', [['Chicken Thigh', 900, 'g']], { tags: ['crock pot'] }),
];

const week: NightPlan[] = [
  { date: '2026-09-27', weekday: 'Sunday', kind: 'full', maxPrepMinutes: 60, reason: '', events: [], adultsOut: [], atTable: 4.2 },
  { date: '2026-09-28', weekday: 'Monday', kind: 'full', maxPrepMinutes: 60, reason: '', events: [], adultsOut: [], atTable: 4.2 },
];

const basePlan = () => planWeek('2026-09-27', week, library);

describe('editing the list', () => {
  it('removes an item by name', () => {
    const plan = basePlan();
    const result = applyEdits(week, plan, parseReply('no salsa').ops, library);
    expect(result.plan.items.some((i) => i.canonicalName === 'salsa')).toBe(false);
    expect(result.changes[0]).toContain('removed');
  });

  it('removes every line the phrase could mean', () => {
    const plan = basePlan();
    plan.items.push(
      { canonicalName: 'cilantro_or_parsley', displayName: 'Cilantro Or Parsley', quantity: 40, unit: 'ml', department: 'Produce', forMeals: ['x'], source: 'recipe' },
      { canonicalName: 'fresh_cilantro', displayName: 'Fresh Cilantro', quantity: 1, unit: 'each', department: 'Produce', forMeals: ['x'], source: 'recipe' },
    );
    const result = applyEdits(week, plan, parseReply('no cilantro').ops, library);
    expect(result.plan.items.filter((i) => i.canonicalName.includes('cilantro'))).toHaveLength(0);
    expect(result.changes[0]).toContain('Cilantro Or Parsley');
  });

  it('says so when the item is not on the list', () => {
    const result = applyEdits(week, basePlan(), parseReply('drop the anchovies').ops, library);
    expect(result.problems[0]).toContain('not on the list');
    expect(result.changes).toHaveLength(0);
  });

  it('adds an item that was not there', () => {
    const result = applyEdits(week, basePlan(), parseReply('add 2 avocados').ops, library);
    const added = result.plan.items.find((i) => i.displayName === 'avocados');
    expect(added?.quantity).toBe(2);
  });

  it('adds to an existing line rather than duplicating it', () => {
    const plan = basePlan();
    const before = plan.items.find((i) => i.canonicalName === 'salsa')!.quantity;
    const result = applyEdits(week, plan, parseReply('add 3 salsa').ops, library);
    const after = result.plan.items.filter((i) => i.canonicalName === 'salsa');
    expect(after).toHaveLength(1);
    expect(after[0].quantity).toBe(before + 3);
  });

  it('sets a quantity outright', () => {
    const result = applyEdits(week, basePlan(), parseReply('make it 5 salsa').ops, library);
    expect(result.plan.items.find((i) => i.canonicalName === 'salsa')!.quantity).toBe(5);
  });
});

describe('editing the meals', () => {
  it('swaps a night for a requested dish', () => {
    const result = applyEdits(week, basePlan(), parseReply('swap monday for greek chicken').ops, library);
    const monday = result.plan.meals.find((m) => m.date === '2026-09-28');
    expect(monday?.recipe.title).toBe('Grilled Greek Lemon Chicken');
    expect(result.changes[0]).toContain('→ Grilled Greek Lemon Chicken');
  });

  it('says so when that night already has what you asked for', () => {
    const result = applyEdits(week, basePlan(), parseReply('swap monday for tacos').ops, library);
    expect(result.changes[0]).toContain('already Taco Baked Potatoes');
  });

  it('rebuilds the shopping list after a swap', () => {
    const result = applyEdits(week, basePlan(), parseReply('swap monday for greek chicken').ops, library);
    expect(result.plan.items.some((i) => i.canonicalName === 'lemon')).toBe(true);
    expect(result.plan.items.some((i) => i.canonicalName === 'ground_beef')).toBe(false);
  });

  it('asks for the recipe when nothing matches', () => {
    const result = applyEdits(week, basePlan(), parseReply('swap monday for sushi').ops, library);
    expect(result.problems[0]).toContain('add the recipe');
  });

  it('drops the meal when a night is skipped', () => {
    const result = applyEdits(week, basePlan(), parseReply('skip monday').ops, library);
    expect(result.plan.meals.some((m) => m.date === '2026-09-28')).toBe(false);
    expect(result.week.find((n) => n.date === '2026-09-28')!.kind).toBe('eat-out');
  });

  it('keeps manual item edits when a meal change rebuilds the list', () => {
    const result = applyEdits(week, basePlan(), parseReply('swap monday for greek chicken, add 2 avocados').ops, library);
    expect(result.plan.items.find((i) => i.displayName === 'avocados')?.quantity).toBe(2);
    expect(result.plan.items.some((i) => i.canonicalName === 'lemon')).toBe(true);
  });
});

describe('a meal change must not take the rest of the order with it', () => {
  const withStaples = () => {
    const plan = basePlan();
    plan.items.push(
      { canonicalName: 'milk', displayName: 'Milk', quantity: 1, unit: 'each', department: 'Dairy', forMeals: [], source: 'staple' },
      { canonicalName: 'toilet_paper', displayName: 'Toilet Paper', quantity: 1, unit: 'each', department: 'Other', forMeals: [], source: 'staple' },
      { canonicalName: 'birthday_candles', displayName: 'Birthday Candles', quantity: 1, unit: 'each', department: 'Other', forMeals: [], source: 'requested' },
    );
    return plan;
  };

  it('keeps every staple when a night is swapped', () => {
    const result = applyEdits(week, withStaples(), parseReply('swap monday for greek chicken').ops, library);
    const names = result.plan.items.map((i) => i.displayName);
    expect(names).toContain('Milk');
    expect(names).toContain('Toilet Paper');
    expect(names).toContain('Birthday Candles');
  });

  it('keeps every staple when a night is skipped', () => {
    const result = applyEdits(week, withStaples(), parseReply('skip monday').ops, library);
    expect(result.plan.items.filter((i) => i.source === 'staple')).toHaveLength(2);
    expect(result.plan.items.filter((i) => i.source === 'requested')).toHaveLength(1);
  });

  it('still rebuilds the recipe lines themselves', () => {
    const before = withStaples().items.filter((i) => i.source === 'recipe').map((i) => i.canonicalName);
    const result = applyEdits(week, withStaples(), parseReply('swap monday for greek chicken').ops, library);
    const after = result.plan.items.filter((i) => i.source === 'recipe').map((i) => i.canonicalName);
    expect(after).not.toEqual(before);
  });

  it('does not order two of something added in the same message as a swap', () => {
    const result = applyEdits(week, withStaples(), parseReply('swap monday for greek chicken, add 2 avocados').ops, library);
    expect(result.plan.items.filter((i) => i.displayName === 'avocados')).toHaveLength(1);
    expect(result.plan.items.find((i) => i.displayName === 'avocados')?.quantity).toBe(2);
  });

  it('does not let a removal come back when the recipe lines are rebuilt', () => {
    const plan = withStaples();
    const result = applyEdits(week, plan, parseReply('swap monday for greek chicken, no lemon').ops, library);
    expect(result.plan.items.some((i) => i.canonicalName.includes('lemon'))).toBe(false);
  });
});
