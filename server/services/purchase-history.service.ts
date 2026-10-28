/**
 * Turns raw King Soopers purchase history into the two things the planner
 * needs: which items are staples, and which UPC to buy for a given item.
 *
 * Input is the JSON captured from kingsoopers.com (see docs/purchase-history.md).
 * Only DELIVERY and PICKUP receipts count as "baskets" -- fuel stops and
 * two-item in-store runs would otherwise drown out the weekly shop.
 */

export type PurchaseType = 'DELIVERY' | 'PICKUP' | 'IN_STORE' | 'FUEL';

export interface RawReceipt {
  date: string;
  type: PurchaseType | string;
  status?: string;
  storeId?: string;
  total?: string; // e.g. "USD 379.69"
  receiptKey: string;
  upcs: string[];
}

export interface RawHistory {
  capturedAt?: string;
  receiptCount?: number;
  receipts: RawReceipt[];
}

export interface UpcStat {
  upc: string;
  basketCount: number;
  basketTotal: number;
  frequency: number;
  firstSeen: string;
  lastSeen: string;
  medianGapDays: number | null;
  isStaple: boolean;
}

export interface HistorySummary {
  basketTotal: number;
  basketFirst: string | null;
  basketLast: string | null;
  medianBasketUsd: number | null;
  meanBasketUsd: number | null;
  stats: UpcStat[];
}

/** Baskets = the weekly shop. Everything else is noise for planning purposes. */
export const BASKET_TYPES: ReadonlySet<string> = new Set(['DELIVERY', 'PICKUP']);

/** A UPC in at least this share of baskets is treated as a staple. */
export const STAPLE_THRESHOLD = 0.6;

export function parseUsd(total: string | undefined): number | null {
  if (!total) return null;
  const match = total.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const DAY_MS = 86_400_000;

export function summarize(history: RawHistory, stapleThreshold = STAPLE_THRESHOLD): HistorySummary {
  const baskets = history.receipts
    .filter((r) => BASKET_TYPES.has(r.type))
    .sort((a, b) => a.date.localeCompare(b.date));

  const basketTotal = baskets.length;
  const totals = baskets.map((b) => parseUsd(b.total)).filter((n): n is number => n != null);

  // date list per upc, deduped within a basket
  const seen = new Map<string, string[]>();
  for (const basket of baskets) {
    for (const upc of new Set(basket.upcs)) {
      const dates = seen.get(upc) ?? [];
      dates.push(basket.date);
      seen.set(upc, dates);
    }
  }

  const stats: UpcStat[] = [];
  for (const [upc, dates] of seen) {
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i += 1) {
      const gap = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / DAY_MS;
      if (Number.isFinite(gap) && gap > 0) gaps.push(gap);
    }
    const frequency = basketTotal === 0 ? 0 : dates.length / basketTotal;
    stats.push({
      upc,
      basketCount: dates.length,
      basketTotal,
      frequency,
      firstSeen: dates[0],
      lastSeen: dates[dates.length - 1],
      medianGapDays: median(gaps),
      isStaple: frequency >= stapleThreshold,
    });
  }

  stats.sort((a, b) => b.basketCount - a.basketCount || a.upc.localeCompare(b.upc));

  return {
    basketTotal,
    basketFirst: baskets[0]?.date ?? null,
    basketLast: baskets[baskets.length - 1]?.date ?? null,
    medianBasketUsd: median(totals),
    meanBasketUsd: totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null,
    stats,
  };
}

/**
 * Items due for this week's order: staples, plus anything whose typical
 * repurchase gap has elapsed since it was last bought.
 */
export function dueThisWeek(stats: UpcStat[], asOf: Date = new Date()): UpcStat[] {
  return stats.filter((s) => {
    if (s.basketCount < 2) return false;
    if (s.isStaple) return true;
    if (s.medianGapDays == null) return false;
    const daysSince = (asOf.getTime() - Date.parse(s.lastSeen)) / DAY_MS;
    return daysSince >= s.medianGapDays;
  });
}
