/**
 * Picks what to cook on each cooking night and turns it into a shopping list.
 *
 * The classifier has already decided how much time each night has; this service
 * decides what fits, scales it for the household, and aggregates ingredients.
 */

import { FAMILY_PORTIONS, isAssumedPantry } from '../config/household.js';
import { getDisplayName, normalizeIngredientName } from '../utils/ingredient-normalizer.js';
import { capCount, cookedToRaw, isUnquantified, salvageAmount, juiceToFruit, mergeQuantities, toPackages } from '../utils/item-units.js';
import { classifyDepartment } from '../utils/department-classifier.js';
import type { Recipe } from '../models/recipe.model.js';
import type { NightKind, NightPlan } from './night-classifier.service.js';

/** Nights where food actually gets cooked at home. */
const COOKING_KINDS: ReadonlySet<NightKind> = new Set(['full', 'late', 'shifts', 'quick', 'slow-cooker']);

export interface PlannerOptions {
  /**
   * Extra portions cooked beyond the table, to cover weekday lunches.
   * Ty and Joslin prefer leftovers for lunch, so every cook makes two extra.
   */
  leftoverPortions?: number;
  /** Titles cooked in recent weeks, most recent first; avoided when possible. */
  recentTitles?: string[];
  /** Deterministic ordering for tests. */
  seed?: number;
}

export interface PlannedMeal {
  date: string;
  weekday: string;
  kind: NightKind;
  recipe: Recipe;
  /** Portions to cook: people at dinner plus leftovers. */
  portions: number;
  /** Multiplier applied to the recipe's own yield. */
  scale: number;
  fit: string;
}

export interface ShoppingItem {
  canonicalName: string;
  displayName: string;
  quantity: number;
  unit: string;
  department: string;
  /** Which meals need it (empty for staples and one-off requests). */
  forMeals: string[];
  /**
   * Where the line came from:
   *   recipe    - an ingredient of a planned meal
   *   staple    - bought most weeks, added from purchase history
   *   requested - you asked for it in Slack (later: the Alexa list)
   */
  source: 'recipe' | 'staple' | 'requested';
  /** The exact product bought before — skips the product search entirely. */
  upc?: string;
  /** Why it is on the list, for staples ("every ~7d, last bought 9d ago"). */
  note?: string;
}

export interface WeekPlan {
  weekStart: string;
  meals: PlannedMeal[];
  unplanned: NightPlan[];
  items: ShoppingItem[];
  warnings: string[];
}

/**
 * Things that are not dinner on their own. A corn salad is a fine side but a
 * poor Thursday, so it only earns a slot alongside a main, never instead of one.
 */
const NOT_A_MAIN = /\b(salad|dessert|cookie|cake|dip|sauce|dressing|smoothie|cocktail|side|snack|bread|muffin|frosting)\b/i;
const HAS_PROTEIN = /\b(chicken|beef|pork|steak|shrimp|salmon|fish|turkey|tofu|bean|lentil|egg)\b/i;

export function isMainDish(recipe: Recipe): boolean {
  const title = recipe.title.toLowerCase();
  const tags = recipe.tags.join(' ').toLowerCase();
  if (NOT_A_MAIN.test(title) || NOT_A_MAIN.test(tags)) {
    // "chicken salad" is dinner; "avocado corn salad" is not.
    return HAS_PROTEIN.test(title);
  }
  return true;
}

/** Slow-cooker nights need a recipe that cooks itself. */
function isHandsOff(recipe: Recipe): boolean {
  const haystack = `${recipe.title} ${recipe.tags.join(' ')}`.toLowerCase();
  return /crock|slow.?cook|instant pot|braise|stew|soup|chili/.test(haystack);
}

function activeMinutes(recipe: Recipe): number {
  if (recipe.prepTimeMinutes != null) return recipe.prepTimeMinutes;
  if (recipe.totalTimeMinutes != null) return recipe.totalTimeMinutes;
  return 45; // unknown: assume a normal weeknight cook
}

/** Rough protein family, so the week does not serve chicken four times. */
export function proteinOf(recipe: Recipe): string {
  const haystack = `${recipe.title} ${recipe.ingredients.map((i) => i.canonicalName).join(' ')}`.toLowerCase();
  if (/shrimp|prawn|salmon|fish|cod|tuna/.test(haystack)) return 'seafood';
  if (/beef|steak|ground chuck/.test(haystack)) return 'beef';
  if (/pork|bacon|sausage|ham/.test(haystack)) return 'pork';
  if (/chicken|turkey/.test(haystack)) return 'poultry';
  if (/bean|lentil|tofu|chickpea/.test(haystack)) return 'vegetarian';
  return 'other';
}

interface Scored {
  recipe: Recipe;
  score: number;
  fit: string;
}

function candidatesFor(night: NightPlan, recipes: Recipe[], recent: string[]): Scored[] {
  const scored: Scored[] = [];

  for (const recipe of recipes) {
    if (!isMainDish(recipe)) continue;
    const active = activeMinutes(recipe);
    const handsOff = isHandsOff(recipe);
    let score = 0;
    let fit = '';

    if (night.kind === 'slow-cooker') {
      if (!handsOff) continue; // nobody is home to cook it
      score += 40;
      fit = 'cooks while everyone is out';
    } else if (active > night.maxPrepMinutes) {
      // Hands-off recipes still work on a tight night: the oven does the waiting.
      if (!handsOff) continue;
      score += 10;
      fit = `${active} min, mostly unattended`;
    } else {
      score += 30 - active / 5;
      fit = `${active} min hands-on`;
    }

    if (night.kind === 'shifts') {
      // Food that survives an hour in a warm dish beats something plated fresh.
      if (handsOff || /bake|casserole|soup|curry|stew|roast/.test(recipe.title.toLowerCase())) {
        score += 8;
        fit += ', holds well for late eaters';
      }
    }

    const lastCooked = recent.indexOf(recipe.title);
    if (lastCooked === 0) score -= 30;
    else if (lastCooked > 0) score -= 15 - lastCooked;

    scored.push({ recipe, score, fit });
  }

  return scored.sort((a, b) => b.score - a.score || a.recipe.title.localeCompare(b.recipe.title));
}

export function planWeek(
  weekStart: string,
  week: NightPlan[],
  recipes: Recipe[],
  options: PlannerOptions = {}
): WeekPlan {
  const leftovers = options.leftoverPortions ?? 2;
  const recent = options.recentTitles ?? [];
  const warnings: string[] = [];

  const meals: PlannedMeal[] = [];
  const unplanned: NightPlan[] = [];
  const usedTitles = new Set<string>();
  const usedProteins: string[] = [];

  for (const night of week) {
    if (!COOKING_KINDS.has(night.kind)) {
      unplanned.push(night);
      continue;
    }

    const options_ = candidatesFor(night, recipes, recent).filter((c) => !usedTitles.has(c.recipe.title));
    if (options_.length === 0) {
      warnings.push(`No recipe fits ${night.weekday} (${night.kind}, ${night.maxPrepMinutes} min)`);
      unplanned.push(night);
      continue;
    }

    // Avoid the same protein two nights running.
    const lastProtein = usedProteins[usedProteins.length - 1];
    const pick =
      options_.find((c) => proteinOf(c.recipe) !== lastProtein) ?? options_[0];

    const portions = FAMILY_PORTIONS + leftovers;
    const scale = Math.round((portions / Math.max(1, pick.recipe.servings)) * 4) / 4;

    meals.push({
      date: night.date,
      weekday: night.weekday,
      kind: night.kind,
      recipe: pick.recipe,
      portions,
      scale,
      fit: pick.fit,
    });
    usedTitles.add(pick.recipe.title);
    usedProteins.push(proteinOf(pick.recipe));
  }

  return { weekStart, meals, unplanned, items: aggregateIngredients(meals, warnings), warnings };
}

/** Sum every meal's ingredients into one list, scaled and de-duplicated. */
export function aggregateIngredients(meals: PlannedMeal[], warnings: string[] = []): ShoppingItem[] {
  // Collect every mention of an ingredient first, then reconcile units once.
  const byName = new Map<
    string,
    { display: string; department: string; meals: string[]; parts: Array<{ quantity: number; unit: string }> }
  >();

  for (const meal of meals) {
    for (const ingredient of meal.recipe.ingredients) {
      if (ingredient.optional) continue;
      // Normalise from the raw name every time: a name stored by an older
      // version of the normaliser would otherwise keep its old shape forever,
      // and every rule downstream keys off this string.
      let canonical = normalizeIngredientName(ingredient.name) || ingredient.canonicalName;
      if (isAssumedPantry(canonical)) continue; // salt, spices, oil, water

      // The importer drops a unit it cannot read, leaving "4 heaping tablespoons
      // of curry paste" as four jars. Read it back out of the line first.
      const salvaged = salvageAmount(
        ingredient.name,
        ingredient.standardQuantity || ingredient.quantity || 0,
        ingredient.standardUnit || ingredient.unit || 'each'
      );
      let unit = salvaged.unit;
      const stated = salvaged.quantity;
      // An amount the recipe never gave must not grow with the household.
      const guessed = isUnquantified(ingredient.name, stated, unit);
      let quantity = guessed ? 1 : stated * meal.scale;

      // Two tablespoons of lime juice is one lime, and a lime is what the store
      // sells. Big volumes stay as juice: nobody squeezes a cup of it.
      const fruit = juiceToFruit(canonical, quantity, unit);
      if (fruit) {
        canonical = fruit.canonical;
        quantity = fruit.quantity;
        unit = fruit.unit;
      }

      // The household cooks its own protein: "cooked chicken" buys raw chicken,
      // scaled up for what cooking takes out. Brats and bacon are left alone.
      const raw = cookedToRaw(canonical, quantity, unit, `${meal.recipe.title} ${meal.recipe.tags.join(' ')}`);
      if (raw) {
        canonical = raw.canonical;
        quantity = raw.quantity;
        unit = raw.unit;
      }
      if (quantity <= 0) {
        warnings.push(`${meal.recipe.title}: "${ingredient.name}" has no quantity`);
      }

      const entry = byName.get(canonical) ?? {
        display: getDisplayName(canonical) || ingredient.name,
        department: ingredient.department || classifyDepartment(canonical),
        meals: [],
        parts: [],
      };
      entry.parts.push({ quantity, unit });
      if (!entry.meals.includes(meal.recipe.title)) entry.meals.push(meal.recipe.title);
      byName.set(canonical, entry);
    }
  }

  const items: ShoppingItem[] = [];
  for (const [canonical, entry] of byName) {
    const merged = mergeQuantities(canonical, entry.parts);

    if (merged) {
      // Buy what the store sells: 11 green onions is one bunch.
      const packs = toPackages(canonical, merged.quantity, merged.unit);
      const wanted = packs ? packs.quantity : merged.quantity;
      const unitOut = packs ? packs.unit : merged.unit;

      // Backstop for a unit bug nobody has thought of yet. Sixteen cucumbers
      // reached a real cart; the number was wrong, not the week.
      const capped = capCount(wanted, unitOut);
      if (capped < wanted) {
        warnings.push(
          `${entry.display}: ${Math.round(wanted)} ${unitOut} looked wrong, so I capped it at ${capped} — say *make it N ${entry.display}* if you really want more`
        );
      }

      items.push({
        canonicalName: canonical,
        displayName: entry.display,
        quantity: capped,
        unit: unitOut,
        department: entry.department,
        forMeals: entry.meals,
        source: 'recipe',
        note: packs && packs.pieces > packs.quantity ? `${packs.pieces} stalks` : undefined,
      });
      continue;
    }

    // Units that cannot be reconciled (a cup of X in one recipe, a can in
    // another) stay as separate lines; guessing here would misorder the cart.
    warnings.push(
      `${entry.display}: mixed units (${entry.parts.map((p) => p.unit).join(', ')}) — listed separately`
    );
    const byUnit = new Map<string, number>();
    for (const part of entry.parts) byUnit.set(part.unit, (byUnit.get(part.unit) ?? 0) + part.quantity);
    for (const [unit, quantity] of byUnit) {
      items.push({
        canonicalName: canonical,
        displayName: entry.display,
        quantity,
        unit,
        department: entry.department,
        forMeals: entry.meals,
        source: 'recipe',
      });
    }
  }

  return items.sort(
    (a, b) => a.department.localeCompare(b.department) || a.canonicalName.localeCompare(b.canonicalName)
  );
}
