/**
 * The other 80% of the order.
 *
 * Four dinners account for maybe 30 lines; a real basket is closer to 60, and
 * the rest is what the household buys on a rhythm — milk weekly, coffee every
 * three weeks, toilet paper when it runs out. Purchase history knows that
 * rhythm, so the planner reads it rather than asking every week.
 */

import { isRecipeOnly } from '../config/household.js';
import { classifyDepartment } from '../utils/department-classifier.js';
import { normalizeIngredientName } from '../utils/ingredient-normalizer.js';
import type { ShoppingItem } from './week-planner.service.js';

/** One row of purchase_upc_stats, as the planner needs it. */
export interface StapleRow {
  upc: string;
  description: string | null;
  size: string | null;
  frequency: number;
  basketCount: number;
  lastSeen: string;
  medianGapDays: number | null;
  avgQuantity: number | null;
  isStaple: boolean;
}

export interface StapleOptions {
  /** Treated as "today". */
  asOf?: Date;
  /** Buy an item when this share of its usual gap has elapsed. */
  dueFraction?: number;
  /** Ignore anything bought fewer times than this — one-offs are not staples. */
  minBaskets?: number;
  /** Safety valve: never add more than this many lines. */
  limit?: number;
}

const DAY_MS = 86_400_000;

export interface StapleDecision {
  row: StapleRow;
  due: boolean;
  reason: string;
  daysSince: number;
}

/**
 * Decide, for each historical item, whether this week's order should include it.
 *
 * An item is due when its usual gap has (nearly) elapsed. Weekly staples come
 * back every week; a three-week item only comes back in week three.
 */
export function decideStaples(rows: StapleRow[], options: StapleOptions = {}): StapleDecision[] {
  const asOf = options.asOf ?? new Date();
  const dueFraction = options.dueFraction ?? 0.8;
  const minBaskets = options.minBaskets ?? 3;

  const decisions: StapleDecision[] = [];

  for (const row of rows) {
    const daysSince = Math.round((asOf.getTime() - Date.parse(row.lastSeen)) / DAY_MS);

    // Onions come home most weeks, which is not the same as being needed.
    if (row.description && isRecipeOnly(row.description)) {
      decisions.push({ row, due: false, reason: 'only bought for a recipe, never on a rhythm', daysSince });
      continue;
    }

    if (row.basketCount < minBaskets) {
      decisions.push({ row, due: false, reason: 'bought too rarely to call a staple', daysSince });
      continue;
    }

    // No rhythm recorded: fall back to frequency, which is what a weekly item
    // looks like when the gaps are irregular.
    const gap = row.medianGapDays ?? (row.frequency >= 0.5 ? 7 : null);
    if (gap == null) {
      decisions.push({ row, due: false, reason: 'no repurchase rhythm', daysSince });
      continue;
    }

    const due = daysSince >= gap * dueFraction;
    decisions.push({
      row,
      due,
      reason: due
        ? `every ~${Math.round(gap)}d, last bought ${daysSince}d ago`
        : `not due for ${Math.round(gap - daysSince)}d`,
      daysSince,
    });
  }

  return decisions.sort((a, b) => b.row.frequency - a.row.frequency);
}

/**
 * Turn due rows into shopping lines, skipping anything the week's recipes
 * already cover — the planner should not buy chicken twice because a staple
 * row and a recipe both want it.
 */
export function stapleItems(
  decisions: StapleDecision[],
  existing: ShoppingItem[],
  options: StapleOptions = {}
): ShoppingItem[] {
  const limit = options.limit ?? 40;
  const covered = new Set(existing.map((i) => i.canonicalName));
  const items: ShoppingItem[] = [];

  for (const { row, due, reason } of decisions) {
    if (!due || items.length >= limit) continue;
    if (!row.description) continue; // unnamed UPC: nothing sensible to show

    const canonical = normalizeIngredientName(row.description);
    if (covered.has(canonical)) continue;
    covered.add(canonical);

    items.push({
      canonicalName: canonical,
      displayName: row.size ? `${row.description} (${row.size})` : row.description,
      quantity: Math.max(1, Math.round(row.avgQuantity ?? 1)),
      unit: 'each',
      department: classifyDepartment(canonical),
      forMeals: [],
      source: 'staple',
      upc: row.upc,
      note: reason,
    });
  }

  return items;
}
