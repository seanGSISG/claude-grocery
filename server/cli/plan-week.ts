/**
 * Dry-run the whole weekly loop: calendars -> nights -> recipes -> cart.
 *
 *   npm run plan:week -- --events data/week-events.json
 *   op run --env-file=.env.op -- npm run plan:week -- --prices
 *
 * --prices looks every ingredient up at the store in KROGER_LOCATION_ID and
 * estimates the basket against the budget. Nothing is added to the cart here.
 */

import { readFileSync } from 'node:fs';
import { initDatabase } from '../db/connection.js';
import { runMigrations } from '../db/schema.js';
import { RecipeRepository } from '../db/repositories/recipe.repo.js';
import { KrogerAuth } from '../integrations/kroger/kroger-auth.js';
import { KrogerClient } from '../integrations/kroger/kroger-client.js';
import {
  classifyWeek,
  applyCookQuota,
  assignLeftovers,
  mergeFeeds,
  type CalendarFeed,
} from '../services/night-classifier.service.js';
import { planWeek } from '../services/week-planner.service.js';
import { matchItem, summarizeMatches } from '../services/product-match.service.js';
import { FAMILY_PORTIONS } from '../config/household.js';
import { formatAmount } from '../utils/item-units.js';

const SOFT_MAX = Number(process.env.WEEKLY_BUDGET_SOFT ?? 425);
const HARD_MAX = Number(process.env.WEEKLY_BUDGET_HARD ?? 500);

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1] ?? fallback;
}

/** Sunday of the coming week, unless one is given. */
function defaultWeekStart(): string {
  const now = new Date();
  const days = (7 - now.getDay()) % 7 || 7;
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

async function main(): Promise<void> {
  const weekStart = arg('--week', defaultWeekStart())!;
  const eventsFile = arg('--events', 'data/week-events.json')!;
  const withPrices = process.argv.includes('--prices');

  const feeds = JSON.parse(readFileSync(eventsFile, 'utf8')) as CalendarFeed[];
  const db = initDatabase();
  runMigrations(db);
  const recipes = new RecipeRepository(db).search({ limit: 200 });

  if (recipes.length === 0) {
    console.error('No recipes in the library. Run: npm run recipes:import');
    process.exit(1);
  }

  const nights = applyCookQuota(assignLeftovers(classifyWeek(weekStart, mergeFeeds(feeds))));
  const plan = planWeek(weekStart, nights, recipes);

  console.log(`\nWeek of ${weekStart} — cooking for ${FAMILY_PORTIONS} at the table plus leftovers\n`);
  for (const night of nights) {
    const meal = plan.meals.find((m) => m.date === night.date);
    const label = meal
      ? `${meal.recipe.title}  (x${meal.scale}, ${meal.fit})`
      : night.kind === 'leftovers'
        ? 'leftovers'
        : night.kind === 'eat-out' || night.kind === 'skip'
          ? `— ${night.reason}`
          : '(nothing fits)';
    console.log(`  ${night.weekday.padEnd(10)} ${night.kind.padEnd(12)} ${label}`);
  }

  console.log(`\nShopping list — ${plan.items.length} lines from ${plan.meals.length} meals\n`);
  let department = '';
  for (const item of plan.items) {
    if (item.department !== department) {
      department = item.department;
      console.log(`  ${department}`);
    }
    console.log(`    ${formatAmount(item.quantity, item.unit).padEnd(12)} ${item.displayName}`);
  }

  if (plan.warnings.length) {
    console.log('\nWarnings:');
    for (const warning of plan.warnings) console.log(`  ! ${warning}`);
  }

  if (!withPrices) {
    console.log('\nRe-run with --prices to price it at your store.\n');
    return;
  }

  const clientId = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;
  const locationId = process.env.KROGER_LOCATION_ID;
  if (!clientId || !clientSecret) {
    console.error('--prices needs KROGER_CLIENT_ID / KROGER_CLIENT_SECRET (op run --env-file=.env.op -- ...)');
    process.exit(1);
  }

  const client = new KrogerClient(new KrogerAuth(clientId, clientSecret));
  const matches = [];
  for (const item of plan.items) {
    matches.push(
      await matchItem(item, async (term) => {
        const results = await client.searchProducts({ term, locationId, limit: 5 });
        await new Promise((r) => setTimeout(r, 60));
        return results;
      })
    );
  }
  const report = summarizeMatches(matches);

  console.log('\nMatched products\n');
  for (const match of report.matches) {
    if (!match.product) continue;
    const price = (match.product.promoPrice ?? match.product.price ?? 0) * match.quantity;
    const flag = match.confidence === 'broadened' ? ` (searched "${match.term}")` : '';
    console.log(
      `  ${money(price).padStart(7)}  ${match.quantity} × ${match.product.description}` +
        `${match.product.size ? ` (${match.product.size})` : ''}${flag}`
    );
  }

  console.log(`\nDinner ingredients: ${money(report.total)} across ${report.matches.length - report.unmatched.length} products`);
  if (report.unmatched.length > 0) {
    console.log(`\nNot found at this store (${report.unmatched.length}):`);
    for (const miss of report.unmatched) console.log(`  - ${miss.item.displayName}`);
  }
  if (report.broadened.length > 0) {
    console.log(`\nMatched on a looser search (${report.broadened.length}) — worth checking.`);
  }
  console.log(
    `\nBudget: ${money(SOFT_MAX)} soft, ${money(HARD_MAX)} hard. This is dinners only — ` +
      'breakfasts, lunches, snacks and staples are added by the history pass.\n'
  );
}

main().catch((error: unknown) => {
  console.error('\nPlanning failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
