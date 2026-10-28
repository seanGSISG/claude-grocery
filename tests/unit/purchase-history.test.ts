import { describe, it, expect } from 'vitest';
import {
  summarize,
  dueThisWeek,
  parseUsd,
  type RawHistory,
} from '../../server/services/purchase-history.service.js';

function receipt(date: string, type: string, upcs: string[], total = 'USD 100.00') {
  return { date, type, receiptKey: `${type}-${date}`, upcs, total };
}

const history: RawHistory = {
  receipts: [
    receipt('2026-09-01', 'DELIVERY', ['milk', 'eggs', 'salmon'], 'USD 200.00'),
    receipt('2026-09-08', 'DELIVERY', ['milk', 'eggs'], 'USD 300.00'),
    receipt('2026-09-15', 'PICKUP', ['milk', 'eggs', 'rice'], 'USD 400.00'),
    receipt('2026-09-16', 'FUEL', ['gas'], 'USD 80.00'),
    receipt('2026-09-17', 'IN_STORE', ['gum'], 'USD 2.00'),
  ],
};

describe('purchase history', () => {
  it('parses dollar totals and ignores the currency prefix', () => {
    expect(parseUsd('USD 379.69')).toBe(379.69);
    expect(parseUsd(undefined)).toBeNull();
  });

  it('counts only delivery and pickup receipts as baskets', () => {
    const s = summarize(history);
    expect(s.basketTotal).toBe(3);
    expect(s.basketFirst).toBe('2026-09-01');
    expect(s.basketLast).toBe('2026-09-15');
    expect(s.stats.find((x) => x.upc === 'gas')).toBeUndefined();
    expect(s.stats.find((x) => x.upc === 'gum')).toBeUndefined();
  });

  it('marks items in >=60% of baskets as staples', () => {
    const s = summarize(history);
    expect(s.stats.find((x) => x.upc === 'milk')).toMatchObject({ basketCount: 3, isStaple: true });
    expect(s.stats.find((x) => x.upc === 'salmon')).toMatchObject({ basketCount: 1, isStaple: false });
  });

  it('uses basket totals, not fuel stops, for the median', () => {
    const s = summarize(history);
    expect(s.medianBasketUsd).toBe(300);
    expect(s.meanBasketUsd).toBe(300);
  });

  it('computes the median repurchase gap', () => {
    const s = summarize(history);
    expect(s.stats.find((x) => x.upc === 'milk')?.medianGapDays).toBe(7);
    expect(s.stats.find((x) => x.upc === 'salmon')?.medianGapDays).toBeNull();
  });

  it('counts an item once per basket even if it appears twice', () => {
    const s = summarize({ receipts: [receipt('2026-09-01', 'DELIVERY', ['milk', 'milk'])] });
    expect(s.stats.find((x) => x.upc === 'milk')?.basketCount).toBe(1);
  });

  it('flags items whose usual gap has elapsed', () => {
    const s = summarize(history);
    const due = dueThisWeek(s.stats, new Date('2026-09-23')).map((x) => x.upc);
    expect(due).toContain('milk'); // staple
    expect(due).not.toContain('salmon'); // bought once, no rhythm
  });

  it('does not flag an item bought yesterday on a 7-day rhythm', () => {
    const s = summarize(history);
    const due = dueThisWeek(s.stats, new Date('2026-09-16')).map((x) => x.upc);
    expect(due).toContain('milk'); // staples always come back
    expect(s.stats.find((x) => x.upc === 'rice')?.isStaple).toBe(false);
    expect(due).not.toContain('rice');
  });
});
