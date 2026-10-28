/**
 * Wires the planner, the Kroger cart and the Slack bot together and runs it.
 *
 *   op run --env-file=.env.op -- npm run slack:dev
 */

import { readFileSync } from 'node:fs';
import { initDatabase } from '../db/connection.js';
import { runMigrations } from '../db/schema.js';
import { RecipeRepository } from '../db/repositories/recipe.repo.js';
import { StaplesRepository } from '../db/repositories/staples.repo.js';
import { FeedbackRepository } from '../db/repositories/feedback.repo.js';
import { KrogerAuth } from '../integrations/kroger/kroger-auth.js';
import { KrogerClient } from '../integrations/kroger/kroger-client.js';
import { KrogerTokenStore } from '../integrations/kroger/token-store.js';
import {
  applyCookQuota,
  assignLeftovers,
  classifyWeek,
  mergeFeeds,
  type CalendarFeed,
} from '../services/night-classifier.service.js';
import { planWeek, type ShoppingItem } from '../services/week-planner.service.js';
import { applyEdits } from '../services/plan-edit.service.js';
import { matchItem, summarizeMatches, type ProductMatch } from '../services/product-match.service.js';
import { decideStaples, stapleItems } from '../services/staples.service.js';
import { applyReplacement, findLine } from '../services/match-feedback.service.js';
import { createSlackApp, type CartLine, type LineMatch, type PendingWeek } from './app.js';
import { log } from '../utils/logger.js';
import { nextSunday } from '../utils/week.js';

const EVENTS_FILE = process.env.CALENDAR_EVENTS_FILE ?? 'data/week-events.json';
const SOFT_MAX = Number(process.env.WEEKLY_BUDGET_SOFT ?? 425);
const HARD_MAX = Number(process.env.WEEKLY_BUDGET_HARD ?? 500);


async function main(): Promise<void> {
  const db = initDatabase();
  runMigrations(db);
  const recipeRepo = new RecipeRepository(db);
  const staplesRepo = new StaplesRepository(db);
  const feedbackRepo = new FeedbackRepository(db);

  // Products the household has reported as wrong, by ingredient. Loaded once
  // and added to in-process, so a report takes effect on the very next match.
  const rejected = feedbackRepo.rejectedUpcs();

  const clientId = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;
  const locationId = process.env.KROGER_LOCATION_ID;
  const auth = clientId && clientSecret ? new KrogerAuth(clientId, clientSecret) : null;
  const kroger = auth ? new KrogerClient(auth) : null;
  const tokens = auth ? new KrogerTokenStore(auth) : null;

  /**
   * Match every line to a product at the store. Lines that match nothing are
   * reported rather than dropped: a missing ingredient is the user's decision,
   * not the agent's silent one.
   */
  async function matchOne(item: ShoppingItem): Promise<ProductMatch> {
    const match = await matchItem(
      item,
      async (term) => {
        const results = await kroger!.searchProducts({ term, locationId, limit: 5 });
        await new Promise((r) => setTimeout(r, 60));
        return results;
      },
      {
        // Staples know the exact product bought last time.
        lookup: async (upc) => kroger!.getProductDetails(upc, locationId),
        avoid: rejected.get(item.canonicalName),
      }
    );

    // Log every line, so the terminal shows what the cart will actually hold.
    const outcome = match.product
      ? `${match.quantity} × ${match.product.description}` +
        (match.confidence === 'broadened' ? `  [searched "${match.term}"]` : '')
      : 'NOT FOUND';
    log('info', `  ${match.item.displayName.padEnd(34)} → ${outcome}`);
    return match;
  }

  async function matchList(plan: PendingWeek['plan']): Promise<ProductMatch[]> {
    if (!kroger) return [];
    const matches: ProductMatch[] = [];
    for (const item of plan.items) matches.push(await matchOne(item));
    return matches;
  }

  /** Exactly what would be sent to Kroger for this match run. */
  function toCartLines(matches: ProductMatch[]): CartLine[] {
    return matches
      .filter((m) => m.product)
      .map((m) => ({ upc: m.product!.upc, quantity: m.quantity, displayName: m.item.displayName }));
  }

  /** What Slack shows per line, plus what a bad-match report needs to act. */
  function toLineMatches(matches: ProductMatch[]): LineMatch[] {
    return matches.map((m) => ({
      canonicalName: m.item.canonicalName,
      displayName: m.item.displayName,
      matched: m.product ? `${m.quantity} × ${m.product.description}` : null,
      upc: m.product?.upc,
      term: m.term,
      loose: m.confidence === 'broadened',
      lineTotal: m.product ? (m.product.promoPrice ?? m.product.price ?? 0) * m.quantity : 0,
    }));
  }

  /**
   * Planner warnings plus what this match run found.
   *
   * Recomputed from scratch every time: appending to the previous round left
   * three stale "not found" lines on screen after two edits, and only the first
   * three warnings are ever shown, so the current one was the one pushed out.
   */
  const MATCH_WARNING = /^(?:\d+ not found at the store|Loose matches):/;

  function warningsFor(plan: PendingWeek['plan'], report: ReturnType<typeof summarizeMatches>): string[] {
    const warnings = plan.warnings.filter((w) => !MATCH_WARNING.test(w));

    if (report.unmatched.length > 0) {
      warnings.push(
        `${report.unmatched.length} not found at the store: ${report.unmatched.map((m) => m.item.displayName).join(', ')}`
      );
    }
    if (report.broadened.length > 0) {
      // Name them: a count tells you there is a problem but not where.
      const shown = report.broadened
        .slice(0, 4)
        .map((m) => `${m.item.displayName} → ${m.product!.description}`)
        .join('; ');
      const more = report.broadened.length > 4 ? ` (+${report.broadened.length - 4} more)` : '';
      warnings.push(`Loose matches: ${shown}${more}`);
    }
    return warnings;
  }

  async function buildPlan(weekStart = nextSunday()): Promise<PendingWeek> {
    const feeds = JSON.parse(readFileSync(EVENTS_FILE, 'utf8')) as CalendarFeed[];
    const week = applyCookQuota(assignLeftovers(classifyWeek(weekStart, mergeFeeds(feeds))));
    const planned = planWeek(weekStart, week, recipeRepo.search({ limit: 200 }));

    // Everything the household buys on a rhythm, due this week.
    const due = decideStaples(staplesRepo.candidates(), { asOf: new Date(weekStart) });
    const staples = stapleItems(due, planned.items);
    const plan = { ...planned, items: [...planned.items, ...staples] };

    const report = summarizeMatches(await matchList(plan));

    return {
      week,
      plan: { ...plan, warnings: warningsFor(plan, report) },
      matches: toLineMatches(report.matches),
      priced: toCartLines(report.matches),
      summary: {
        weekStart,
        cookingNights: plan.meals.length,
        estimatedTotal: kroger ? report.total : undefined,
        softMax: SOFT_MAX,
        hardMax: HARD_MAX,
      },
    };
  }

  const slack = createSlackApp({
    budget: { softMax: SOFT_MAX, hardMax: HARD_MAX },
    async previousOrder(weekStart) {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS lines, COALESCE(SUM(quantity), 0) AS units, MAX(added_at) AS lastAt
             FROM cart_ledger WHERE week_start = ?`
        )
        .get(weekStart) as { lines: number; units: number; lastAt: string | null };
      return row.lines > 0 ? { lines: row.lines, units: row.units, lastAt: row.lastAt ?? 'earlier' } : null;
    },
    buildPlan,
    async applyEdits(current, ops) {
      const recipes = recipeRepo.search({ limit: 200 });
      const { week, plan, changes, problems } = applyEdits(current.week, current.plan, ops, recipes);
      const report = summarizeMatches(await matchList(plan));
      return {
        week,
        plan: { ...plan, warnings: warningsFor(plan, report) },
        matches: toLineMatches(report.matches),
        priced: toCartLines(report.matches),
        changes,
        problems,
        summary: {
          ...current.summary,
          cookingNights: plan.meals.length,
          estimatedTotal: kroger ? report.total : undefined,
        },
      };
    },
    /**
     * "Wrong: boston butt" — remember never to buy that product for that
     * ingredient again, then re-match the one line and report what replaced it.
     * The rest of the week is left alone: re-pricing 40 lines to fix one is a
     * minute of API calls for no gain.
     */
    async reportMatch(current, report, reportedBy) {
      const line = findLine(current.matches ?? [], report.item);
      if (!line) {
        return {
          pending: current,
          message: (current.matches ?? []).length === 0
            ? 'Nothing on this list has been matched to a product yet, so there is nothing to reject.'
            : `I can't find "${report.item}" on the list — name it the way the list does.`,
        };
      }

      feedbackRepo.record({
        canonicalName: line.canonicalName,
        displayName: line.displayName,
        rejectedUpc: line.upc ?? null,
        rejectedDescription: line.matched ?? null,
        searchTerm: line.term ?? null,
        note: report.note ?? null,
        reportedBy: reportedBy ?? null,
        weekStart: current.summary.weekStart,
      });

      if (line.upc) {
        const set = rejected.get(line.canonicalName) ?? new Set<string>();
        set.add(line.upc);
        rejected.set(line.canonicalName, set);
      }

      const item = current.plan.items.find(
        (i) => i.canonicalName === line.canonicalName && i.displayName === line.displayName
      );
      if (!item || !kroger) {
        return {
          pending: current,
          message: `Noted — never ${line.matched ?? 'that product'} for ${line.displayName} again.`,
        };
      }

      return applyReplacement(current, line, toLineMatches([await matchOne(item)])[0]);
    },
    async fillCart(approved) {
      if (!kroger || !tokens) return 'Kroger is not configured, so nothing was added.';

      // The basket that was approved, not a fresh one. Re-matching here used to
      // send different products than the ones shown, at prices nothing had
      // checked against the cap, and quietly dropped any line whose search
      // happened to fail the second time.
      const found = approved.priced ?? toCartLines(await matchList(approved.plan));
      if (found.length === 0) return 'No products matched — nothing added to the cart.';

      const customerToken = await tokens.getAccessToken();
      await kroger.addToCart(
        found.map((line) => ({ upc: line.upc, quantity: line.quantity, modality: 'DELIVERY' as const })),
        customerToken
      );

      // Remember what went in: the Cart API cannot read the cart back.
      // The Cart API cannot be read back, so this table is the only record of
       // what was sent. A second add has to accumulate, or a double order looks
       // like a single one forever.
      const insert = db.prepare(
        `INSERT INTO cart_ledger (week_start, upc, quantity, added_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(week_start, upc) DO UPDATE SET
           quantity = quantity + excluded.quantity,
           added_at = datetime('now')`
      );
      const record = db.transaction(() => {
        for (const line of found) insert.run(approved.summary.weekStart, line.upc, line.quantity);
      });
      record();

      const shown = approved.matches ?? [];
      const missing = shown.filter((m) => !m.matched);
      const loose = shown.filter((m) => m.loose && m.matched);

      // Lines and units, because they differ and the difference has already
      // cost an afternoon: 67 lines reads as 91 items in the King Soopers cart.
      const units = found.reduce((sum, line) => sum + line.quantity, 0);
      const lines = [
        `Added ${found.length} of ${shown.length || found.length} lines to your King Soopers cart ` +
          `— *${units} items* once quantities are counted, which is the number the cart will show.`,
      ];
      if (missing.length > 0) {
        lines.push(`*Not found, add these yourself:* ${missing.map((m) => m.displayName).join(', ')}`);
      }
      if (loose.length > 0) {
        lines.push(`_Matched loosely:_ ${loose.map((m) => `${m.displayName} → ${m.matched}`).join('; ')}`);
      }
      return lines.join('\n');
    },
  });

  await slack.app.start();
  log('info', 'Slack bot running (socket mode). DM it "plan" to start.');

  if (process.argv.includes('--push')) {
    await slack.pushWeeklyPlan(process.env.SLACK_CHANNEL);
  }
}

main().catch((error: unknown) => {
  console.error('Slack bot failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
