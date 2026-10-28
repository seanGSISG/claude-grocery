/**
 * The bookkeeping behind "wrong: boston butt".
 *
 * Finding the line someone means, and folding the replacement back into the
 * pending week, is the fiddly part of the feature and the part most likely to
 * quietly do the wrong thing — so it lives here as plain functions rather than
 * inside the Slack wiring, where nothing could reach it.
 */

import { normalizeIngredientName } from '../utils/ingredient-normalizer.js';
import type { LineMatch, PendingWeek } from '../slack/app.js';

/**
 * The line someone means when they say "wrong: boston butt".
 *
 * They may name the ingredient as the list writes it, a word from it, or the
 * product that came back instead — all three have to land on the same line.
 * Exact matches win, so a vague phrase never beats a precise one.
 */
export function findLine(matches: LineMatch[], phrase: string): LineMatch | undefined {
  const want = phrase.toLowerCase().trim();
  if (!want) return undefined;
  const canonical = normalizeIngredientName(phrase);

  return (
    matches.find((l) => l.canonicalName === canonical) ??
    matches.find((l) => l.displayName.toLowerCase() === want) ??
    matches.find(
      (l) =>
        l.displayName.toLowerCase().includes(want) ||
        (canonical.length > 2 && l.canonicalName.includes(canonical))
    ) ??
    matches.find((l) => (l.matched ?? '').toLowerCase().includes(want))
  );
}

export interface Replacement {
  pending: PendingWeek;
  message: string;
}

/**
 * Swap one line's product for its replacement.
 *
 * Only the reported line is re-priced: re-matching all forty lines to correct
 * one of them would cost a minute of API calls and change nothing else, so the
 * week's estimate is adjusted by the difference instead.
 */
export function applyReplacement(
  current: PendingWeek,
  line: LineMatch,
  redone: LineMatch
): Replacement {
  const matches = (current.matches ?? []).map((l) => (l === line ? redone : l));

  const previous = current.summary.estimatedTotal;
  const estimatedTotal =
    previous == null
      ? previous
      : Math.max(0, Math.round((previous - (line.lineTotal ?? 0) + (redone.lineTotal ?? 0)) * 100) / 100);

  const outcome = redone.matched
    ? `${line.displayName}: ${redone.matched} instead${redone.loose ? ' (still a loose match)' : ''}.`
    : `${line.displayName}: nothing else matched, so add it yourself.`;

  return {
    pending: { ...current, matches, summary: { ...current.summary, estimatedTotal } },
    message: `${outcome} Won't buy ${line.matched ?? 'that'} for it again.`,
  };
}
