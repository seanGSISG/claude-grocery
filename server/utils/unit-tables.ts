// Unit conversion tables for grocery list aggregation.
// All volumes stored in ml, all weights in grams.

export type UnitCategory = 'volume' | 'weight' | 'count';

export interface UnitInfo {
  category: UnitCategory;
  toBase: number; // Multiplier to convert to base unit (ml for volume, g for weight, 1 for count)
  baseUnit: string;
}

export const UNIT_MAP: Record<string, UnitInfo> = {
  // Volume (base: ml)
  'tsp': { category: 'volume', toBase: 4.929, baseUnit: 'ml' },
  'teaspoon': { category: 'volume', toBase: 4.929, baseUnit: 'ml' },
  'teaspoons': { category: 'volume', toBase: 4.929, baseUnit: 'ml' },
  'tbsp': { category: 'volume', toBase: 14.787, baseUnit: 'ml' },
  'tablespoon': { category: 'volume', toBase: 14.787, baseUnit: 'ml' },
  'tablespoons': { category: 'volume', toBase: 14.787, baseUnit: 'ml' },
  'fl oz': { category: 'volume', toBase: 29.574, baseUnit: 'ml' },
  'fluid ounce': { category: 'volume', toBase: 29.574, baseUnit: 'ml' },
  'fluid ounces': { category: 'volume', toBase: 29.574, baseUnit: 'ml' },
  'cup': { category: 'volume', toBase: 236.588, baseUnit: 'ml' },
  'cups': { category: 'volume', toBase: 236.588, baseUnit: 'ml' },
  'c': { category: 'volume', toBase: 236.588, baseUnit: 'ml' },
  'pint': { category: 'volume', toBase: 473.176, baseUnit: 'ml' },
  'pints': { category: 'volume', toBase: 473.176, baseUnit: 'ml' },
  'pt': { category: 'volume', toBase: 473.176, baseUnit: 'ml' },
  'quart': { category: 'volume', toBase: 946.353, baseUnit: 'ml' },
  'quarts': { category: 'volume', toBase: 946.353, baseUnit: 'ml' },
  'qt': { category: 'volume', toBase: 946.353, baseUnit: 'ml' },
  'gallon': { category: 'volume', toBase: 3785.41, baseUnit: 'ml' },
  'gallons': { category: 'volume', toBase: 3785.41, baseUnit: 'ml' },
  'gal': { category: 'volume', toBase: 3785.41, baseUnit: 'ml' },
  'ml': { category: 'volume', toBase: 1, baseUnit: 'ml' },
  'milliliter': { category: 'volume', toBase: 1, baseUnit: 'ml' },
  'milliliters': { category: 'volume', toBase: 1, baseUnit: 'ml' },
  'l': { category: 'volume', toBase: 1000, baseUnit: 'ml' },
  'liter': { category: 'volume', toBase: 1000, baseUnit: 'ml' },
  'liters': { category: 'volume', toBase: 1000, baseUnit: 'ml' },

  // Weight (base: grams)
  'oz': { category: 'weight', toBase: 28.3495, baseUnit: 'g' },
  'ounce': { category: 'weight', toBase: 28.3495, baseUnit: 'g' },
  'ounces': { category: 'weight', toBase: 28.3495, baseUnit: 'g' },
  'lb': { category: 'weight', toBase: 453.592, baseUnit: 'g' },
  'lbs': { category: 'weight', toBase: 453.592, baseUnit: 'g' },
  'pound': { category: 'weight', toBase: 453.592, baseUnit: 'g' },
  'pounds': { category: 'weight', toBase: 453.592, baseUnit: 'g' },
  'g': { category: 'weight', toBase: 1, baseUnit: 'g' },
  'gram': { category: 'weight', toBase: 1, baseUnit: 'g' },
  'grams': { category: 'weight', toBase: 1, baseUnit: 'g' },
  'kg': { category: 'weight', toBase: 1000, baseUnit: 'g' },
  'kilogram': { category: 'weight', toBase: 1000, baseUnit: 'g' },
  'kilograms': { category: 'weight', toBase: 1000, baseUnit: 'g' },

  // Count (base: each)
  'each': { category: 'count', toBase: 1, baseUnit: 'each' },
  'whole': { category: 'count', toBase: 1, baseUnit: 'each' },
  'piece': { category: 'count', toBase: 1, baseUnit: 'each' },
  'pieces': { category: 'count', toBase: 1, baseUnit: 'each' },
  'clove': { category: 'count', toBase: 1, baseUnit: 'clove' },
  'cloves': { category: 'count', toBase: 1, baseUnit: 'clove' },
  'head': { category: 'count', toBase: 1, baseUnit: 'head' },
  'heads': { category: 'count', toBase: 1, baseUnit: 'head' },
  'bunch': { category: 'count', toBase: 1, baseUnit: 'bunch' },
  'bunches': { category: 'count', toBase: 1, baseUnit: 'bunch' },
  'stalk': { category: 'count', toBase: 1, baseUnit: 'stalk' },
  'stalks': { category: 'count', toBase: 1, baseUnit: 'stalk' },
  'sprig': { category: 'count', toBase: 1, baseUnit: 'sprig' },
  'sprigs': { category: 'count', toBase: 1, baseUnit: 'sprig' },
  'slice': { category: 'count', toBase: 1, baseUnit: 'slice' },
  'slices': { category: 'count', toBase: 1, baseUnit: 'slice' },
  'can': { category: 'count', toBase: 1, baseUnit: 'can' },
  'cans': { category: 'count', toBase: 1, baseUnit: 'can' },
  'jar': { category: 'count', toBase: 1, baseUnit: 'jar' },
  'jars': { category: 'count', toBase: 1, baseUnit: 'jar' },
  'package': { category: 'count', toBase: 1, baseUnit: 'package' },
  'packages': { category: 'count', toBase: 1, baseUnit: 'package' },
  'bag': { category: 'count', toBase: 1, baseUnit: 'bag' },
  'bags': { category: 'count', toBase: 1, baseUnit: 'bag' },
  'box': { category: 'count', toBase: 1, baseUnit: 'box' },
  'boxes': { category: 'count', toBase: 1, baseUnit: 'box' },
  'bottle': { category: 'count', toBase: 1, baseUnit: 'bottle' },
  'bottles': { category: 'count', toBase: 1, baseUnit: 'bottle' },
  'loaf': { category: 'count', toBase: 1, baseUnit: 'loaf' },
  'loaves': { category: 'count', toBase: 1, baseUnit: 'loaf' },
  'dozen': { category: 'count', toBase: 12, baseUnit: 'each' },
  'pinch': { category: 'count', toBase: 1, baseUnit: 'pinch' },
  'dash': { category: 'count', toBase: 1, baseUnit: 'dash' },
};

// Human-friendly output units by category + preferred display thresholds
export const DISPLAY_UNITS = {
  volume: [
    { unit: 'gallon', minMl: 3785.41 },
    { unit: 'quart', minMl: 946.353 },
    { unit: 'cup', minMl: 236.588 },
    { unit: 'tbsp', minMl: 14.787 },
    { unit: 'tsp', minMl: 0 },
  ],
  weight: [
    { unit: 'lb', minG: 453.592 },
    { unit: 'oz', minG: 0 },
  ],
};
