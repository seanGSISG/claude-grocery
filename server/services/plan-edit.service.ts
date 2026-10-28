/**
 * Applying approved edits to a week plan.
 *
 * Every edit returns a new plan plus a line describing what changed, so the
 * agent can show a diff before anything reaches the cart.
 */

import { normalizeIngredientName } from '../utils/ingredient-normalizer.js';
import { classifyDepartment } from '../utils/department-classifier.js';
import type { EditOp } from './edit-parser.service.js';
import type { NightPlan } from './night-classifier.service.js';
import type { Recipe } from '../models/recipe.model.js';
import { aggregateIngredients, planWeek, type WeekPlan } from './week-planner.service.js';

export interface EditResult {
  week: NightPlan[];
  plan: WeekPlan;
  changes: string[];
  problems: string[];
}

/**
 * Every line the phrase could mean. "No cilantro" has to catch the cilantro
 * line AND the "cilantro or parsley" line: removing one and leaving the other
 * is worse than useless, because the cart still gets cilantro.
 */
function findItems(plan: WeekPlan, phrase: string) {
  const canonical = normalizeIngredientName(phrase);
  const word = phrase.toLowerCase().trim();

  const exact = plan.items.filter((i) => i.canonicalName === canonical);
  const related = plan.items.filter(
    (i) =>
      !exact.includes(i) &&
      (i.canonicalName.includes(canonical) ||
        canonical.includes(i.canonicalName) ||
        i.canonicalName.split('_').includes(word) ||
        i.displayName.toLowerCase().includes(word))
  );

  // Exact first, so single-line edits (set_qty) hit the obvious one, while a
  // removal still sweeps up the near misses behind it.
  return [...exact, ...related];
}

/** The single best match, for edits that change one line. */
function findItem(plan: WeekPlan, phrase: string) {
  return findItems(plan, phrase)[0];
}

/** Pick a replacement recipe for one night from a free-text request. */
function matchRecipe(recipes: Recipe[], request: string, exclude: string[]): Recipe | null {
  const words = request.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  let best: { recipe: Recipe; score: number } | null = null;

  for (const recipe of recipes) {
    if (exclude.includes(recipe.title)) continue;
    const haystack = `${recipe.title} ${recipe.tags.join(' ')} ${recipe.cuisineType ?? ''}`.toLowerCase();
    const score = words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { recipe, score };
  }

  return best?.recipe ?? null;
}

export function applyEdits(
  week: NightPlan[],
  plan: WeekPlan,
  ops: EditOp[],
  recipes: Recipe[]
): EditResult {
  let nextWeek = [...week];
  let nextPlan: WeekPlan = { ...plan, items: [...plan.items], meals: [...plan.meals] };
  const changes: string[] = [];
  const problems: string[] = [];

  for (const op of ops) {
    switch (op.op) {
      case 'skip_night': {
        const night = nextWeek.find((n) => n.weekday === op.day);
        if (!night) { problems.push(`No ${op.day} in this week`); break; }
        nextWeek = nextWeek.map((n) =>
          n.date === night.date ? { ...n, kind: 'eat-out' as const, maxPrepMinutes: 0, reason: 'you said to skip it' } : n
        );
        const dropped = nextPlan.meals.find((m) => m.date === night.date);
        nextPlan.meals = nextPlan.meals.filter((m) => m.date !== night.date);
        changes.push(dropped ? `${op.day}: dropped ${dropped.recipe.title}` : `${op.day}: no dinner`);
        break;
      }

      case 'swap_meal': {
        const night = op.day
          ? nextWeek.find((n) => n.weekday === op.day)
          : nextWeek.find((n) => nextPlan.meals.some((m) => m.date === n.date));
        if (!night) { problems.push(`No ${op.day ?? 'night'} to change`); break; }

        const current = nextPlan.meals.find((m) => m.date === night.date);
        // Exclude what the other nights are cooking, but not this night's own
        // meal: "swap monday for tacos" must still match when Monday already
        // holds a taco recipe the planner chose.
        const otherNights = nextPlan.meals.filter((m) => m.date !== night.date).map((m) => m.recipe.title);
        const replacement = matchRecipe(recipes, op.request, otherNights);
        if (!replacement) {
          problems.push(`Nothing in the library matches "${op.request}" — add the recipe and I'll use it`);
          break;
        }

        if (current && replacement.title === current.recipe.title) {
          changes.push(`${night.weekday}: already ${current.recipe.title}`);
          break;
        }

        const portions = current?.portions ?? 6.2;
        const meal = {
          date: night.date,
          weekday: night.weekday,
          kind: night.kind,
          recipe: replacement,
          portions,
          scale: Math.round((portions / Math.max(1, replacement.servings)) * 4) / 4,
          fit: 'you asked for it',
        };
        nextPlan.meals = [...nextPlan.meals.filter((m) => m.date !== night.date), meal].sort((a, b) =>
          a.date.localeCompare(b.date)
        );
        changes.push(
          current
            ? `${night.weekday}: ${current.recipe.title} → ${replacement.title}`
            : `${night.weekday}: added ${replacement.title}`
        );
        break;
      }

      case 'remove_item': {
        const matches = findItems(nextPlan, op.item);
        if (matches.length === 0) { problems.push(`"${op.item}" is not on the list`); break; }
        nextPlan.items = nextPlan.items.filter((i) => !matches.includes(i));
        changes.push(`removed ${matches.map((m) => m.displayName).join(', ')}`);
        break;
      }

      case 'set_qty': {
        const item = findItem(nextPlan, op.item);
        if (!item) { problems.push(`"${op.item}" is not on the list`); break; }
        nextPlan.items = nextPlan.items.map((i) =>
          i === item ? { ...i, quantity: op.quantity } : i
        );
        changes.push(`${item.displayName}: ${item.quantity} → ${op.quantity} ${item.unit}`);
        break;
      }

      case 'add_item': {
        const canonical = normalizeIngredientName(op.item);
        const existing = findItem(nextPlan, op.item);
        if (existing) {
          nextPlan.items = nextPlan.items.map((i) =>
            i === existing ? { ...i, quantity: i.quantity + (op.quantity ?? 1) } : i
          );
          changes.push(`${existing.displayName}: ${existing.quantity} → ${existing.quantity + (op.quantity ?? 1)}`);
          break;
        }
        nextPlan.items = [
          ...nextPlan.items,
          {
            canonicalName: canonical,
            displayName: op.item,
            quantity: op.quantity ?? 1,
            unit: 'each',
            department: classifyDepartment(canonical),
            forMeals: [],
            source: 'requested',
          },
        ];
        changes.push(`added ${op.quantity ?? 1} ${op.item}`);
        break;
      }

      default:
        break;
    }
  }

  // A meal change rewrites the ingredient lines it contributed; manual item
  // edits are re-applied on top so they are not silently undone.
  if (ops.some((op) => op.op === 'swap_meal' || op.op === 'skip_night')) {
    // Removals and quantity changes are re-applied because the recipe lines were
    // regenerated and would otherwise come back ("swap wed for tacos, no
    // cilantro" must not put cilantro back). Additions are not: they survive in
    // `keep` below, and applying them twice would order two of everything.
    const manual = ops.filter((op) => op.op === 'remove_item' || op.op === 'set_qty');
    // Only the recipe lines are rebuilt. Staples and anything anyone asked for
    // have nothing to do with which recipe Wednesday got, and dropping them
    // would quietly remove most of the order.
    const keep = nextPlan.items.filter((item) => item.source !== 'recipe');
    const rebuilt: WeekPlan = {
      ...nextPlan,
      items: [...aggregateIngredients(nextPlan.meals, []), ...keep],
      warnings: nextPlan.warnings,
    };
    nextPlan = manual.length > 0 ? applyEdits(nextWeek, rebuilt, manual, recipes).plan : rebuilt;
  }

  return { week: nextWeek, plan: nextPlan, changes, problems };
}

/** Re-plan from scratch, keeping nights the user explicitly changed. */
export function replan(
  weekStart: string,
  week: NightPlan[],
  recipes: Recipe[],
  keep: Map<string, Recipe>
): WeekPlan {
  const plan = planWeek(weekStart, week, recipes);
  if (keep.size === 0) return plan;

  const meals = plan.meals.map((meal) => {
    const pinned = keep.get(meal.date);
    if (!pinned) return meal;
    return {
      ...meal,
      recipe: pinned,
      scale: Math.round((meal.portions / Math.max(1, pinned.servings)) * 4) / 4,
      fit: 'you asked for it',
    };
  });

  return { ...plan, meals, items: aggregateIngredients(meals, []) };
}
