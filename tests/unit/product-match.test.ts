import { describe, it, expect, vi } from 'vitest';
import { searchTerms, pickProduct, unitsToOrder, matchItem, summarizeMatches, headNoun, chooseByPreference, isOrganic } from '../../server/services/product-match.service.js';
import type { ShoppingItem } from '../../server/services/week-planner.service.js';

const item = (displayName: string, over: Partial<ShoppingItem> = {}): ShoppingItem => ({
  canonicalName: displayName.toLowerCase().replace(/ /g, '_'),
  displayName, quantity: 1, unit: 'each', department: 'Other', forMeals: ['A'],
  source: 'recipe', ...over,
} as ShoppingItem);

const product = (description: string, over: Record<string, unknown> = {}) => ({
  productId: '1', upc: '0001111000000', description, brand: 'Kroger', price: 3.99,
  promoPrice: null, size: '16 oz', aisle: null, imageUrl: null, inStock: true,
  fulfillment: null, ...over,
}) as never;

describe('search terms', () => {
  it('turns a snake_case canonical name into words', () => {
    expect(searchTerms(item('Full Fat Coconut Milk'))[0]).toBe('full fat coconut milk');
  });

  it('prefers chicken broth for an either/or line, and never searches the whole phrase', () => {
    const terms = searchTerms(item('Chicken Or Vegetable Broth'));
    expect(terms[0]).toBe('chicken broth');
    expect(terms).toEqual(['chicken broth', 'vegetable broth', 'broth']);
    expect(terms).not.toContain('chicken or vegetable broth');
  });

  it('attaches the noun to the first option however the line is worded', () => {
    // Left side already names a product, so it is searched as written.
    expect(searchTerms(item('Low Sodium Chicken Stock Or Broth'))).toEqual([
      'low sodium chicken stock', 'broth',
    ]);
    expect(searchTerms(item('Parsley Or Cilantro'))).toEqual(['parsley', 'cilantro']);
  });

  it('uses the words the store uses for butcher cuts', () => {
    expect(searchTerms(item('Boneless Boston Butt'))[0]).toBe('boneless pork shoulder roast');
    expect(searchTerms(item('Boneless Boston Butt'))).toContain('pork shoulder roast');
    expect(headNoun(item('Boneless Boston Butt'))).toBe('roast');
  });

  it('translates other names the household or a recipe might use', () => {
    expect(searchTerms(item('Scallions'))[0]).toBe('green onions');
    expect(searchTerms(item('Garbanzo Beans'))[0]).toBe('chickpeas beans');
  });

  it('expands lowsodium', () => {
    expect(searchTerms(item('Lowsodium Chicken Stock'))[0]).toBe('low sodium chicken stock');
  });

  it('drops preparation words on the second attempt', () => {
    const terms = searchTerms(item('Boneless Skinless Chicken Breasts'));
    expect(terms).toContain('chicken breasts');
  });

  it('falls back to the head noun', () => {
    expect(searchTerms(item('Boneless Skinless Chicken Breasts')).at(-1)).toBe('breasts');
    // A mangled either/or line still yields searchable options.
    expect(searchTerms(item('Finely Parsley And Cooked Pasta Or Rice'))).toEqual([
      'parsley pasta', 'rice',
    ]);
  });

  it('never emits a term Kroger would reject', () => {
    for (const term of searchTerms(item('A B C Very Long Ingredient Name With Many Words Indeed'))) {
      expect(term.length).toBeGreaterThanOrEqual(3);
      expect(term.split(' ').length).toBeLessThanOrEqual(8);
    }
  });
});

describe('the head noun', () => {
  it('is the thing being bought, not the qualifier', () => {
    expect(headNoun(item('Chicken Or Vegetable Broth'))).toBe('broth');
    expect(headNoun(item('Boneless Skinless Chicken Breasts'))).toBe('breasts');
    expect(headNoun(item('Full Fat Coconut Milk'))).toBe('milk');
  });
});

describe('picking a product', () => {
  it('prefers something in stock', () => {
    const picked = pickProduct([product('Out', { inStock: false }), product('In')]);
    expect((picked as { description: string }).description).toBe('In');
  });

  it('will not take butter for a boston butt', () => {
    // "butt" is a substring of "butter"; whole words only.
    expect(pickProduct([product('Kerrygold Irish Grass-Fed Unsalted Butter Sticks')], 'butt')).toBeNull();
    expect(pickProduct([product('Fresh Limeade')], 'lime')).toBeNull();
  });

  it('rejects a soup when the line asked for broth', () => {
    const results = [product('Progresso Traditional Chicken Rice with Vegetables Soup')];
    expect(pickProduct(results, 'broth')).toBeNull();
  });

  it('accepts the plural or singular of the noun', () => {
    expect(pickProduct([product('Kroger Chicken Broth 32 oz')], 'broth')).not.toBeNull();
    expect(pickProduct([product('Fresh Limes')], 'lime')).not.toBeNull();
    expect(pickProduct([product('Fresh Lime')], 'limes')).not.toBeNull();
  });

  it('returns null when there is nothing', () => {
    expect(pickProduct([])).toBeNull();
  });
});

describe('organic preference', () => {
  const organic = (price: number) => product('Simple Truth Organic Bananas', { price, brand: 'Simple Truth Organic' });
  const conventional = (price: number) => product('Fresh Bananas', { price, brand: 'Kroger' });

  it('takes organic when the premium is small', () => {
    const picked = chooseByPreference([conventional(1.0), organic(1.29)]);
    expect(isOrganic(picked!)).toBe(true);
  });

  it('skips organic when it costs a third more', () => {
    const picked = chooseByPreference([conventional(3.0), organic(4.5)]);
    expect(isOrganic(picked!)).toBe(false);
  });

  it('skips organic when the premium is over $2 even at a small percentage', () => {
    const picked = chooseByPreference([conventional(20), organic(22.5)]);
    expect(isOrganic(picked!)).toBe(false);
  });

  it('takes organic when nothing conventional is on the shelf', () => {
    expect(isOrganic(chooseByPreference([organic(9)])!)).toBe(true);
  });

  it('takes organic when neither has a price', () => {
    const picked = chooseByPreference([
      product('Fresh Bananas', { price: null, promoPrice: null }),
      product('Organic Bananas', { price: null, promoPrice: null, brand: 'Simple Truth Organic' }),
    ]);
    expect(isOrganic(picked!)).toBe(true);
  });

  it('compares the promo price, not the shelf price', () => {
    const picked = chooseByPreference([conventional(3.0), organic(5.0)]);
    expect(isOrganic(picked!)).toBe(false);
    const onSale = chooseByPreference([
      conventional(3.0),
      product('Simple Truth Organic Bananas', { price: 5.0, promoPrice: 3.5, brand: 'Simple Truth Organic' }),
    ]);
    expect(isOrganic(onSale!)).toBe(true);
  });

  it('prefers something in stock over an organic one that is not', () => {
    const picked = chooseByPreference([
      product('Simple Truth Organic Bananas', { price: 1.2, inStock: false, brand: 'Simple Truth Organic' }),
      product('Simple Truth Organic Bananas Bag', { price: 1.25, inStock: true, brand: 'Simple Truth Organic' }),
    ]);
    expect((picked as unknown as { description: string }).description).toContain('Bag');
  });
});

describe('quantities', () => {
  it('orders countable lines as counted, rounded up', () => {
    expect(unitsToOrder(item('Lime', { quantity: 2.5, unit: 'each' }))).toBe(3);
  });

  it('orders the counted number of bunches', () => {
    expect(unitsToOrder(item('Green Onion', { quantity: 2, unit: 'bunch' }))).toBe(2);
  });

  it('orders one package for a weighed line', () => {
    expect(unitsToOrder(item('Ground Beef', { quantity: 680, unit: 'g' }))).toBe(1);
  });

  it('never orders zero', () => {
    expect(unitsToOrder(item('Salsa', { quantity: 0.38, unit: 'each' }))).toBe(1);
  });
});

describe('matching', () => {
  it('records when organic was passed over on price', async () => {
    const search = vi.fn().mockResolvedValue([
      product('Fresh Strawberries', { price: 3.0 }),
      product('Simple Truth Organic Strawberries', { price: 6.5, brand: 'Simple Truth Organic' }),
    ]);
    const match = await matchItem(item('Strawberries'), search);
    expect(match.organicSkipped).toMatchObject({ premium: 3.5 });
  });

  it('reports a direct hit', async () => {
    const search = vi.fn().mockResolvedValue([product('Coconut Milk')]);
    const match = await matchItem(item('Full Fat Coconut Milk'), search);
    expect(match.confidence).toBe('direct');
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('broadens until something matches and says so', async () => {
    const search = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([product('Chicken Breast')]);
    const match = await matchItem(item('Boneless Skinless Chicken Breasts'), search);
    expect(match.confidence).toBe('broadened');
    expect(match.product).not.toBeNull();
  });

  it('will not take a soup for a broth, and keeps looking', async () => {
    const search = vi.fn()
      .mockResolvedValueOnce([product('Progresso Chicken Rice with Vegetables Soup')])
      .mockResolvedValueOnce([product('Kroger Vegetable Broth 32 oz')]);
    const match = await matchItem(item('Chicken Or Vegetable Broth'), search);
    expect((match.product as unknown as { description: string }).description).toContain('Broth');
    expect(search).toHaveBeenCalledWith('chicken broth');
  });

  it('gives up cleanly rather than dropping the line', async () => {
    const match = await matchItem(item('Marsala Wine'), vi.fn().mockResolvedValue([]));
    expect(match.confidence).toBe('none');
    expect(match.product).toBeNull();
  });

  it('survives a search that throws', async () => {
    const search = vi.fn().mockRejectedValueOnce(new Error('429')).mockResolvedValue([product('Salsa')]);
    const match = await matchItem(item('Salsa'), search);
    expect(match.product).not.toBeNull();
  });
});

describe('products reported as wrong', () => {
  it('never picks a rejected product again, even when it is the only good name', async () => {
    const search = vi.fn().mockResolvedValue([
      product('Kerrygold Unsalted Butter Sticks', { upc: 'BAD' }),
      product('Kroger Salted Butter', { upc: 'GOOD' }),
    ]);
    const match = await matchItem(item('Butter'), search, { avoid: new Set(['BAD']) });
    expect((match.product as unknown as { upc: string }).upc).toBe('GOOD');
  });

  it('comes back empty rather than buying the rejected product again', async () => {
    const search = vi.fn().mockResolvedValue([product('Hawaiian Punch Lemon Berry', { upc: 'BAD' })]);
    const match = await matchItem(item('Lemon Juice'), search, { avoid: new Set(['BAD']) });
    expect(match.product).toBeNull();
    expect(match.confidence).toBe('none');
  });

  it('ignores a remembered staple UPC once it has been rejected', async () => {
    const lookup = vi.fn().mockResolvedValue(product('Last Time\'s Milk', { upc: 'BAD' }));
    const search = vi.fn().mockResolvedValue([product('Simple Truth Organic Milk', { upc: 'GOOD' })]);
    const match = await matchItem(item('Milk', { upc: 'BAD' }), search, {
      lookup,
      avoid: new Set(['BAD']),
    });
    expect(lookup).not.toHaveBeenCalled();
    expect((match.product as unknown as { upc: string }).upc).toBe('GOOD');
  });

  it('still uses a remembered UPC that nobody has complained about', async () => {
    const lookup = vi.fn().mockResolvedValue(product('Canyon Bakehouse Bread', { upc: 'OK' }));
    const match = await matchItem(item('Bread', { upc: 'OK' }), vi.fn(), {
      lookup,
      avoid: new Set(['SOMETHING ELSE']),
    });
    expect(match.term).toBe('OK');
    expect(match.confidence).toBe('direct');
  });

  it('does not credit organic it was told never to buy', async () => {
    const search = vi.fn().mockResolvedValue([
      product('Store Brand Berries', { upc: 'GOOD', price: 3 }),
      product('Organic Berries', { upc: 'BAD', price: 9, brand: 'Simple Truth Organic' }),
    ]);
    const match = await matchItem(item('Berries'), search, { avoid: new Set(['BAD']) });
    expect(match.organicSkipped).toBeUndefined();
  });

  it('pickProduct filters the rejected one out directly', () => {
    const results = [product('Bad Broth', { upc: 'BAD' }), product('Good Broth', { upc: 'GOOD' })];
    expect(pickProduct(results, 'broth', new Set(['BAD']))).toMatchObject({ upc: 'GOOD' });
    expect(pickProduct(results, 'broth', new Set(['BAD', 'GOOD']))).toBeNull();
  });
});

describe('the report', () => {
  it('totals by quantity and separates the problems', async () => {
    const matches = [
      { item: item('Lime', { quantity: 3 }), product: product('Lime', { price: 0.67 }), term: 'lime', confidence: 'direct' as const, quantity: 3 },
      { item: item('Marsala Wine'), product: null, term: 'marsala wine', confidence: 'none' as const, quantity: 1 },
      { item: item('Chicken'), product: product('Chicken', { price: 8 }), term: 'chicken', confidence: 'broadened' as const, quantity: 1 },
    ];
    const report = summarizeMatches(matches);
    expect(report.total).toBeCloseTo(10.01);
    expect(report.unmatched).toHaveLength(1);
    expect(report.broadened).toHaveLength(1);
  });
});
