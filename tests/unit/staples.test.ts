import { describe, it, expect } from 'vitest';
import { decideStaples, stapleItems, type StapleRow } from '../../server/services/staples.service.js';
import { normalizeIngredientName } from '../../server/utils/ingredient-normalizer.js';
import type { ShoppingItem } from '../../server/services/week-planner.service.js';

const ASOF = new Date('2026-10-03');

const row = (over: Partial<StapleRow> = {}): StapleRow => ({
  upc: '0001111000000', description: 'Simple Truth Organic 2% Milk', size: '1 gal',
  frequency: 0.57, basketCount: 43, lastSeen: '2026-09-26', medianGapDays: 7,
  avgQuantity: 1, isStaple: false, ...over,
});

describe('things a recipe buys, not a rhythm', () => {
  // Every name below is one that actually appears in the household's history.
  const raw = [
    'Jumbo Yellow Onions',
    'White Onions',
    'Green Onions',
    'Broccoli Crowns',
    'Kroger® 93/7 Ground Beef Tray 3 LB',
    'Choice Beef Chuck Roast',
    'Simple Truth Natural Chicken Breasts',
    'Simple Truth® Natural Boneless and Skinless Fresh Chicken Thighs',
  ];

  const prepared = [
    'Applegate All Natural Gluten-Free Frozen Chicken Nuggets',
    'Applegate All Natural Gluten-Free Frozen Breaded Chicken Breast Tenders',
    'Tyson Frozen Chicken Nuggets',
    'Kroger® Reduced Sodium Chicken Broth',
    'Maruchan® Chicken Flavor Ramen Noodle Soup',
    'Ruffles® Sour Cream and Onion Potato Chips',
  ];

  it('never puts fresh produce or raw meat on the list by rhythm', () => {
    for (const description of raw) {
      const [decision] = decideStaples([row({ description, isStaple: true })], { asOf: ASOF });
      expect(decision.due, description).toBe(false);
      expect(decision.reason).toContain('only bought for a recipe');
    }
  });

  it('keeps the prepared and pantry versions of the same words', () => {
    for (const description of prepared) {
      const [decision] = decideStaples([row({ description })], { asOf: ASOF });
      expect(decision.due, description).toBe(true);
    }
  });

  it('leaves them out of the shopping list entirely', () => {
    const rows = [row({ upc: 'a', description: 'Jumbo Yellow Onions' }), row({ upc: 'b' })];
    const items = stapleItems(decideStaples(rows, { asOf: ASOF }), []);
    expect(items.map((i) => i.displayName).join(' ')).not.toContain('Onion');
    expect(items).toHaveLength(1);
  });
});

describe('deciding what is due', () => {
  it('buys a weekly item a week later', () => {
    const [d] = decideStaples([row()], { asOf: ASOF });
    expect(d.due).toBe(true);
    expect(d.reason).toContain('every ~7d');
  });

  it('does not buy a three-week item in week one', () => {
    const [d] = decideStaples([row({ medianGapDays: 21, lastSeen: '2026-09-28' })], { asOf: ASOF });
    expect(d.due).toBe(false);
    expect(d.reason).toContain('not due');
  });

  it('buys slightly early rather than running out', () => {
    // 6 days into a 7-day rhythm: 0.8 of the gap has passed.
    const [d] = decideStaples([row({ lastSeen: '2026-09-27' })], { asOf: ASOF });
    expect(d.due).toBe(true);
  });

  it('ignores something bought twice ever', () => {
    const [d] = decideStaples([row({ basketCount: 2 })], { asOf: ASOF });
    expect(d.due).toBe(false);
    expect(d.reason).toContain('too rarely');
  });

  it('treats a frequent item with no recorded gap as weekly', () => {
    const [d] = decideStaples([row({ medianGapDays: null, frequency: 0.7 })], { asOf: ASOF });
    expect(d.due).toBe(true);
  });

  it('skips an infrequent item with no recorded gap', () => {
    const [d] = decideStaples([row({ medianGapDays: null, frequency: 0.2 })], { asOf: ASOF });
    expect(d.due).toBe(false);
    expect(d.reason).toContain('no repurchase rhythm');
  });
});

describe('turning them into lines', () => {
  const decisions = (rows: StapleRow[]) => decideStaples(rows, { asOf: ASOF });

  it('carries the UPC you actually buy', () => {
    const [item] = stapleItems(decisions([row()]), []);
    expect(item.upc).toBe('0001111000000');
    expect(item.source).toBe('staple');
    expect(item.displayName).toBe('Simple Truth Organic 2% Milk (1 gal)');
  });

  it('explains itself', () => {
    const [item] = stapleItems(decisions([row()]), []);
    expect(item.note).toContain('last bought');
  });

  it('does not buy what a recipe already covers', () => {
    const existing: ShoppingItem[] = [{
      canonicalName: normalizeIngredientName('Simple Truth Organic 2% Milk'),
      displayName: 'Milk', quantity: 1,
      unit: 'each', department: 'Dairy', forMeals: ['A'], source: 'recipe',
    }];
    expect(stapleItems(decisions([row()]), existing)).toHaveLength(0);
  });

  it('skips an unnamed UPC rather than listing a barcode', () => {
    expect(stapleItems(decisions([row({ description: null })]), [])).toHaveLength(0);
  });

  it('orders the usual number of units', () => {
    const [item] = stapleItems(decisions([row({ avgQuantity: 3.8 })]), []);
    expect(item.quantity).toBe(4);
  });

  it('never returns more than the limit', () => {
    // Distinct product names: two rows that normalise to the same thing would
    // collapse into one line, which is a different behaviour (tested below).
    const many = Array.from({ length: 60 }, (_, i) => row({ upc: `upc${i}`, description: `Product ${String.fromCharCode(65 + (i % 26))}${i}x` }));
    expect(stapleItems(decisions(many), [], { limit: 10 })).toHaveLength(10);
  });

  it('does not list the same product twice', () => {
    const items = stapleItems(decisions([row({ upc: 'a' }), row({ upc: 'b' })]), []);
    expect(items).toHaveLength(1);
  });
});
