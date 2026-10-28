import { describe, it, expect } from 'vitest';
import { toGrams, fromGrams, mergeQuantities, preferredUnit, dimensionOf, juiceToFruit, cookedToRaw, toPackages, toImperial, formatQuantity, formatAmount, countToOrder, isUnquantified, capCount, MAX_UNITS_PER_LINE, salvageAmount } from '../../server/utils/item-units.js';

describe('unit conversion', () => {
  it('knows which dimension a unit belongs to', () => {
    expect(dimensionOf('lb')).toBe('mass');
    expect(dimensionOf('cup')).toBe('volume');
    expect(dimensionOf('clove')).toBe('count');
  });

  it('converts mass units without needing to know the item', () => {
    expect(toGrams('anything', 1, 'lb')).toBeCloseTo(453.59);
    expect(toGrams('anything', 8, 'oz')).toBeCloseTo(226.8);
  });

  it('weighs countable produce', () => {
    expect(toGrams('garlic', 3, 'clove')).toBe(15);
    expect(toGrams('lime', 2, 'each')).toBe(134);
  });

  it('refuses a volume it cannot convert', () => {
    expect(toGrams('marsala_wine', 1, 'cup')).toBeNull();
  });

  it('uses density for herbs measured by volume', () => {
    expect(toGrams('cilantro', 1, 'cup')).toBeCloseTo(35.5, 1);
  });

  it('prefers counting for produce a recipe counts', () => {
    expect(preferredUnit('lime', ['each', 'g'])).toBe('each');
    expect(preferredUnit('ground_beef', ['g', 'lb'])).toBe('g');
  });

  it('round-trips grams back to the shown unit', () => {
    expect(fromGrams('garlic', 15, 'clove')).toBe(3);
  });
});

describe('merging one ingredient across recipes', () => {
  it('adds cloves and whole heads into one countable line', () => {
    expect(mergeQuantities('garlic', [
      { quantity: 3, unit: 'clove' },
      { quantity: 6, unit: 'each' },
    ])).toEqual({ quantity: 9, unit: 'each' });
  });

  it('adds a weight and a count', () => {
    const merged = mergeQuantities('lime', [
      { quantity: 1, unit: 'each' },
      { quantity: 134, unit: 'g' },
    ]);
    expect(merged).toEqual({ quantity: 3, unit: 'each' });
  });

  it('rounds countable items up, because you buy whole limes', () => {
    expect(mergeQuantities('lime', [
      { quantity: 1, unit: 'each' },
      { quantity: 20, unit: 'g' },
    ])).toEqual({ quantity: 2, unit: 'each' });
  });

  it('keeps a single measurement as it was given', () => {
    expect(mergeQuantities('ground_beef', [{ quantity: 680, unit: 'g' }])).toEqual({ quantity: 680, unit: 'g' });
  });

  it('adds two amounts in the same unit without needing a conversion', () => {
    expect(mergeQuantities('marsala_wine', [
      { quantity: 120, unit: 'ml' },
      { quantity: 60, unit: 'ml' },
    ])).toEqual({ quantity: 180, unit: 'ml' });
  });

  it('reconciles minced garlic by volume with whole cloves', () => {
    const merged = mergeQuantities('garlic', [
      { quantity: 10, unit: 'ml' },   // ~2 tsp minced
      { quantity: 3, unit: 'clove' },
    ]);
    expect(merged).toEqual({ quantity: 5, unit: 'each' }); // 9g + 15g, bought whole
  });

  it('gives up rather than guess when units cannot be reconciled', () => {
    expect(mergeQuantities('marsala_wine', [
      { quantity: 1, unit: 'cup' },
      { quantity: 1, unit: 'each' },
    ])).toBeNull();
  });

  it('sums masses expressed in different units', () => {
    const merged = mergeQuantities('ground_beef', [
      { quantity: 1, unit: 'lb' },
      { quantity: 8, unit: 'oz' },
    ]);
    expect(merged!.unit).toBe('g');
    expect(merged!.quantity).toBeCloseTo(680.4, 1);
  });
});

describe('juice becomes fruit', () => {
  it('turns a couple of tablespoons of lime juice into one lime', () => {
    expect(juiceToFruit('lime_juice', 30, 'ml')).toMatchObject({ canonical: 'lime', quantity: 1, unit: 'each' });
    expect(juiceToFruit('lime_juice', 2, 'tbsp')).toMatchObject({ canonical: 'lime', quantity: 1 });
  });

  it('rounds up, because half a lime is not a purchase', () => {
    expect(juiceToFruit('lime_juice', 50, 'ml')?.quantity).toBe(2);
  });

  it('knows a lemon gives more juice than a lime', () => {
    expect(juiceToFruit('lemon_juice', 90, 'ml')?.quantity).toBe(2);
    expect(juiceToFruit('lime_juice', 90, 'ml')?.quantity).toBe(3);
  });

  it('keeps the bottle when a recipe wants a lot', () => {
    expect(juiceToFruit('lime_juice', 2, 'cup')).toBeNull();
    expect(juiceToFruit('lemon_juice', 300, 'ml')).toBeNull();
  });

  it('passes a counted juice straight through as fruit', () => {
    expect(juiceToFruit('lime_juice', 2, 'each')).toMatchObject({ canonical: 'lime', quantity: 2 });
  });

  it('leaves other juices alone', () => {
    expect(juiceToFruit('apple_juice', 100, 'ml')).toBeNull();
  });
});

describe('cooked protein becomes raw', () => {
  it('buys raw chicken for a cooked-chicken line, allowing for cooking loss', () => {
    const raw = cookedToRaw('cooked_chicken', 500, 'g', 'Grilled Greek Lemon Chicken');
    expect(raw).toMatchObject({ canonical: 'chicken_breast', unit: 'g' });
    expect(raw!.quantity).toBe(700); // 500g cooked needs 700g raw
  });

  it('buys thighs for anything that simmers or shreds', () => {
    expect(cookedToRaw('cooked_chicken', 500, 'g', 'Easy Thai Chicken Curry Soup')?.canonical).toBe('chicken_thigh');
    expect(cookedToRaw('cooked_chicken', 500, 'g', 'Crock-Pot Chicken Marsala')?.canonical).toBe('chicken_thigh');
    expect(cookedToRaw('shredded_cooked_chicken', 500, 'g', '')?.canonical).toBe('chicken_thigh');
  });

  it('buys the lean cut for grilled and skewered dishes', () => {
    expect(cookedToRaw('cooked_chicken', 500, 'g', 'Lemony Marinated Chicken Skewers')?.canonical).toBe('chicken_breast');
    expect(cookedToRaw('cooked_pork', 500, 'g', 'Grilled Vietnamese Pork Steaks')?.canonical).toBe('pork_loin');
    expect(cookedToRaw('cooked_pork', 500, 'g', 'Slow Cooker Pulled Pork')?.canonical).toBe('pork_shoulder');
  });

  it('handles shredded chicken measured by volume', () => {
    const raw = cookedToRaw('cooked_chicken', 473, 'ml'); // 2 cups shredded
    expect(raw!.canonical).toBe('chicken_breast');
    expect(raw!.quantity).toBeGreaterThan(300);
    expect(raw!.quantity).toBeLessThan(500);
  });

  it('converts a whole rotisserie chicken to raw weight', () => {
    const raw = cookedToRaw('rotisserie_chicken', 1, 'each');
    expect(raw!.quantity).toBe(980);
  });

  it('leaves brats, sausage and bacon alone', () => {
    expect(cookedToRaw('cooked_sausage', 400, 'g')).toBeNull();
    expect(cookedToRaw('precooked_bratwurst', 6, 'each')).toBeNull();
    expect(cookedToRaw('cooked_bacon', 200, 'g')).toBeNull();
    expect(cookedToRaw('smoked_kielbasa', 1, 'each')).toBeNull();
  });

  it('ignores anything that was not pre-cooked to begin with', () => {
    expect(cookedToRaw('chicken_breast', 900, 'g')).toBeNull();
    expect(cookedToRaw('ground_beef', 680, 'g')).toBeNull();
  });

  it('covers the other proteins a recipe might shortcut', () => {
    expect(cookedToRaw('cooked_turkey', 300, 'g')?.canonical).toBe('turkey_breast');
    expect(cookedToRaw('cooked_shrimp', 300, 'g')?.canonical).toBe('shrimp');
  });
});

describe('pieces become packs', () => {
  it('buys one bunch for a dozen green onions', () => {
    expect(toPackages('green_onion', 11, 'each')).toMatchObject({ quantity: 1, unit: 'bunch', pieces: 11 });
    expect(toPackages('green_onion', 4, 'each')?.quantity).toBe(1);
  });

  it('buys two bunches when a week needs twenty', () => {
    expect(toPackages('green_onion', 20, 'each')?.quantity).toBe(2);
    expect(toPackages('green_onion', 26, 'each')?.quantity).toBe(3);
  });

  it('tolerates a stalk or two over, since bunches vary', () => {
    // A bunch holds 10-12; 13 stalks is one bunch plus a rounding error.
    expect(toPackages('green_onion', 13, 'each')?.quantity).toBe(1);
  });

  it('treats a head of garlic as ten cloves', () => {
    expect(toPackages('garlic', 9, 'each')).toMatchObject({ quantity: 1, unit: 'head' });
    expect(toPackages('garlic', 14, 'each')?.quantity).toBe(2);
  });

  it('leaves weights and volumes alone', () => {
    expect(toPackages('green_onion', 200, 'g')).toBeNull();
    expect(toPackages('cilantro', 60, 'ml')).toBeNull();
  });

  it('does not repack something already counted in packs', () => {
    expect(toPackages('green_onion', 2, 'bunch')).toBeNull();
  });

  it('ignores produce sold by the piece', () => {
    expect(toPackages('lime', 4, 'each')).toBeNull();
    expect(toPackages('avocado', 3, 'each')).toBeNull();
  });
});

describe('names stored by an older normaliser', () => {
  it('still converts juice written the long way', () => {
    expect(juiceToFruit('freshly_squeezed_lemon_juice', 45, 'ml')).toMatchObject({ canonical: 'lemon', quantity: 1 });
    expect(juiceToFruit('fresh_lime_juice', 60, 'ml')).toMatchObject({ canonical: 'lime', quantity: 2 });
  });

  it('still converts cooked protein written the long way', () => {
    expect(cookedToRaw('shredded_cooked_chicken', 400, 'g', 'soup')?.canonical).toBe('chicken_thigh');
  });

  it('does not mistake an unrelated juice for one it converts', () => {
    expect(juiceToFruit('pineapple_juice', 100, 'ml')).toBeNull();
  });
});

describe('US units', () => {
  it('turns grams into ounces, and bigger grams into pounds', () => {
    expect(toImperial(200, 'g')).toMatchObject({ unit: 'oz' });
    expect(toImperial(680, 'g').unit).toBe('lb');
    expect(toImperial(680, 'g').quantity).toBeCloseTo(1.5, 1);
    expect(toImperial(1.5, 'kg').quantity).toBeCloseTo(3.31, 1);
  });

  it('picks the spoon, cup or quart a person would say', () => {
    expect(toImperial(5, 'ml').unit).toBe('tsp');
    expect(toImperial(30, 'ml').unit).toBe('tbsp');
    expect(toImperial(250, 'ml').unit).toBe('cup');
    expect(toImperial(1, 'l').unit).toBe('quart');
    expect(toImperial(4, 'l').unit).toBe('gallon');
  });

  it('leaves a tablespoon a tablespoon and six of them six', () => {
    expect(toImperial(1, 'tbsp')).toMatchObject({ unit: 'tbsp' });
    expect(formatAmount(1, 'tbsp')).toBe('1 tbsp');
    expect(formatAmount(6, 'tbsp')).toBe('6 tbsp');
    expect(formatAmount(2, 'tsp')).toBe('2 tsp');
  });

  it('tidies awkward imperial amounts upward', () => {
    expect(formatAmount(16, 'oz')).toBe('1 lb');
    expect(formatAmount(12, 'fl oz')).toBe('1 1/2 cups');
    expect(formatAmount(32, 'fl oz')).toBe('1 quart');
  });

  it('writes fractions a kitchen uses, never decimals', () => {
    expect(formatQuantity(1.5)).toBe('1 1/2');
    expect(formatQuantity(0.75)).toBe('3/4');
    expect(formatQuantity(0.33)).toBe('1/3');
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(0.98)).toBe('1');
    expect(formatQuantity(12.4)).toBe('12');
    // A real but tiny amount is an eighth, not nothing.
    expect(formatQuantity(0.02)).toBe('1/8');
  });

  it('shows countable things as whole things, the way the cart will', () => {
    expect(formatAmount(2, 'each')).toBe('2');
    expect(formatAmount(0.38, 'each')).toBe('1');
    expect(formatAmount(1, 'bunch')).toBe('1 bunch');
    expect(formatAmount(2, 'bunch')).toBe('2 bunches');
    expect(countToOrder(12.0000001)).toBe(12);
  });

  it('pluralises only what needs it', () => {
    expect(formatAmount(3, 'cup')).toBe('3 cups');
    expect(formatAmount(1, 'cup')).toBe('1 cup');
    expect(formatAmount(2, 'lb')).toBe('2 lb');
  });
});

describe('amounts the recipe never gave', () => {
  // Every string here is a real line from Ty's recipe library that reached a
  // real cart as six bunches of cilantro or six limes.
  it('spots a quantity the parser had to invent', () => {
    expect(isUnquantified('Handful fresh cilantro', 1, 'each')).toBe(true);
    expect(isUnquantified('Lime wedges', 1, 'each')).toBe(true);
    expect(isUnquantified('Cilantro, for garnish', 1, 'each')).toBe(true);
    expect(isUnquantified('a pinch of saffron', 1, 'each')).toBe(true);
    expect(isUnquantified('Parsley sprigs', 1, 'each')).toBe(true);
  });

  it('leaves a real amount alone', () => {
    expect(isUnquantified('Persian cucumbers', 5, 'each')).toBe(false);
    expect(isUnquantified('limes', 3, 'each')).toBe(false);
    expect(isUnquantified('cilantro', 0.25, 'cup')).toBe(false);
    // One onion is one onion, stated plainly.
    expect(isUnquantified('yellow onion', 1, 'each')).toBe(false);
  });

  it('caps a count that can only be a bug, and leaves weights alone', () => {
    expect(capCount(16, 'each')).toBe(MAX_UNITS_PER_LINE);
    expect(capCount(6, 'each')).toBe(6);
    expect(capCount(2000, 'g')).toBe(2000);
    expect(capCount(3, 'bunch')).toBe(3);
  });

  it('buys a bag of Persian cucumbers, not five cucumbers', () => {
    expect(toPackages('persian_cucumber', 5, 'each')).toMatchObject({ quantity: 1, unit: 'pack' });
    expect(toPackages('persian_cucumber', 15, 'each')).toMatchObject({ quantity: 3, unit: 'pack' });
  });

  it('buys one bunch of any fresh herb', () => {
    for (const herb of ['cilantro', 'fresh_mint', 'fresh_dill', 'parsley', 'fresh_oregano']) {
      expect(toPackages(herb, 1, 'each'), herb).toMatchObject({ quantity: 1, unit: 'bunch' });
    }
  });
});

describe('amounts the importer mangled', () => {
  // Every line here is stored in Ty's database exactly as written, with the
  // unit lost — which is how four tablespoons of curry paste became four jars.
  it('reads the unit back out of the line', () => {
    expect(salvageAmount('heaping tablespoons Thai red curry paste', 4, 'each'))
      .toEqual({ quantity: 4, unit: 'tablespoons' });
    expect(salvageAmount('c. roasted salted peanuts', 1.25, 'each'))
      .toEqual({ quantity: 1.25, unit: 'cup' });
  });

  it('puts back a decimal the importer tore off the quantity', () => {
    expect(salvageAmount('.5 ounces uncooked rice noodles', 3, 'each'))
      .toEqual({ quantity: 3.5, unit: 'ounces' });
  });

  it('leaves a line that already has a real unit exactly as it is', () => {
    expect(salvageAmount('2 cups chicken broth', 2, 'cup')).toEqual({ quantity: 2, unit: 'cup' });
    expect(salvageAmount('680 g ground beef', 680, 'g')).toEqual({ quantity: 680, unit: 'g' });
  });

  it('does not invent a unit for something genuinely counted', () => {
    expect(salvageAmount('Persian cucumbers', 5, 'each')).toEqual({ quantity: 5, unit: 'each' });
    expect(salvageAmount('yellow onion', 1, 'each')).toEqual({ quantity: 1, unit: 'each' });
    // "3 cloves garlic" is already counted; cloves must not become a volume.
    expect(salvageAmount('cloves garlic', 3, 'each')).toEqual({ quantity: 3, unit: 'each' });
  });
});
