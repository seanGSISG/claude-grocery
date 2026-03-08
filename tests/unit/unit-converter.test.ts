import { describe, it, expect } from 'vitest';
import {
  convertToStandardUnit,
  toDisplayUnit,
  getUnitCategory,
  unitsAreCompatible,
} from '../../server/services/unit-converter.service.js';

describe('convertToStandardUnit', () => {
  describe('volume conversions to ml', () => {
    it('converts teaspoons to ml', () => {
      const result = convertToStandardUnit(1, 'tsp');
      expect(result.unit).toBe('ml');
      expect(result.quantity).toBeCloseTo(4.929, 2);
    });

    it('converts tablespoons to ml', () => {
      const result = convertToStandardUnit(1, 'tbsp');
      expect(result.unit).toBe('ml');
      expect(result.quantity).toBeCloseTo(14.787, 2);
    });

    it('converts cups to ml', () => {
      const result = convertToStandardUnit(1, 'cup');
      expect(result.unit).toBe('ml');
      expect(result.quantity).toBeCloseTo(236.588, 1);
    });

    it('converts cups (plural) to ml', () => {
      const result = convertToStandardUnit(2, 'cups');
      expect(result.unit).toBe('ml');
      expect(result.quantity).toBeCloseTo(473.176, 1);
    });

    it('converts quarts to ml', () => {
      const result = convertToStandardUnit(1, 'quart');
      expect(result.unit).toBe('ml');
      expect(result.quantity).toBeCloseTo(946.353, 1);
    });

    it('converts gallons to ml', () => {
      const result = convertToStandardUnit(1, 'gallon');
      expect(result.unit).toBe('ml');
      expect(result.quantity).toBeCloseTo(3785.41, 0);
    });

    it('keeps ml as ml', () => {
      const result = convertToStandardUnit(250, 'ml');
      expect(result.unit).toBe('ml');
      expect(result.quantity).toBe(250);
    });

    it('converts liters to ml', () => {
      const result = convertToStandardUnit(1, 'liter');
      expect(result.unit).toBe('ml');
      expect(result.quantity).toBe(1000);
    });
  });

  describe('weight conversions to g', () => {
    it('converts ounces to grams', () => {
      const result = convertToStandardUnit(1, 'oz');
      expect(result.unit).toBe('g');
      expect(result.quantity).toBeCloseTo(28.3495, 2);
    });

    it('converts pounds to grams', () => {
      const result = convertToStandardUnit(1, 'lb');
      expect(result.unit).toBe('g');
      expect(result.quantity).toBeCloseTo(453.592, 1);
    });

    it('converts lbs (abbrev) to grams', () => {
      const result = convertToStandardUnit(2, 'lbs');
      expect(result.unit).toBe('g');
      expect(result.quantity).toBeCloseTo(907.184, 1);
    });

    it('keeps grams as grams', () => {
      const result = convertToStandardUnit(500, 'g');
      expect(result.unit).toBe('g');
      expect(result.quantity).toBe(500);
    });

    it('converts kilograms to grams', () => {
      const result = convertToStandardUnit(1, 'kg');
      expect(result.unit).toBe('g');
      expect(result.quantity).toBe(1000);
    });
  });

  describe('count units', () => {
    it('passes through "each" as count', () => {
      const result = convertToStandardUnit(3, 'each');
      expect(result.unit).toBe('each');
      expect(result.quantity).toBe(3);
    });

    it('normalizes "clove" to "clove" base', () => {
      const result = convertToStandardUnit(4, 'cloves');
      expect(result.unit).toBe('clove');
      expect(result.quantity).toBe(4);
    });

    it('converts dozen to individual count', () => {
      const result = convertToStandardUnit(1, 'dozen');
      expect(result.unit).toBe('each');
      expect(result.quantity).toBe(12);
    });

    it('handles can/cans', () => {
      const result = convertToStandardUnit(2, 'cans');
      expect(result.unit).toBe('can');
      expect(result.quantity).toBe(2);
    });
  });

  describe('unknown units', () => {
    it('returns unknown units as-is preserving the original unit name', () => {
      const result = convertToStandardUnit(1, 'splash');
      expect(result.unit).toBe('splash');
      expect(result.quantity).toBe(1);
    });

    it('handles empty unit string by defaulting to each', () => {
      const result = convertToStandardUnit(1, '');
      expect(result.unit).toBe('each');
      expect(result.quantity).toBe(1);
    });
  });
});

describe('toDisplayUnit', () => {
  it('converts ml to cups when >= 0.5 cups', () => {
    const result = toDisplayUnit(236.588, 'volume'); // 1 cup in ml
    expect(result.unit).toBe('cup');
    expect(result.quantity).toBe(1);
  });

  it('converts ml to tbsp when < 0.5 cups', () => {
    const result = toDisplayUnit(44.361, 'volume'); // 3 tbsp
    expect(result.unit).toBe('tbsp');
    expect(result.quantity).toBe(3);
  });

  it('converts ml to tsp for small amounts', () => {
    const result = toDisplayUnit(4.929, 'volume'); // 1 tsp
    expect(result.unit).toBe('tsp');
    expect(result.quantity).toBe(1);
  });

  it('converts ml to quarts for large volumes', () => {
    const result = toDisplayUnit(946.353, 'volume'); // 1 quart
    expect(result.unit).toBe('quart');
    expect(result.quantity).toBe(1);
  });

  it('converts g to lb when >= 0.5 lb', () => {
    const result = toDisplayUnit(453.592, 'weight'); // 1 lb
    expect(result.unit).toBe('lb');
    expect(result.quantity).toBe(1);
  });

  it('converts g to oz for smaller weights', () => {
    const result = toDisplayUnit(56.699, 'weight'); // 2 oz
    expect(result.unit).toBe('oz');
    expect(result.quantity).toBe(2);
  });

  it('handles count as-is', () => {
    const result = toDisplayUnit(5, 'count');
    expect(result.unit).toBe('each');
    expect(result.quantity).toBe(5);
  });
});

describe('getUnitCategory', () => {
  it('identifies volume units', () => {
    expect(getUnitCategory('cup')).toBe('volume');
    expect(getUnitCategory('tsp')).toBe('volume');
    expect(getUnitCategory('tbsp')).toBe('volume');
    expect(getUnitCategory('ml')).toBe('volume');
  });

  it('identifies weight units', () => {
    expect(getUnitCategory('oz')).toBe('weight');
    expect(getUnitCategory('lb')).toBe('weight');
    expect(getUnitCategory('g')).toBe('weight');
    expect(getUnitCategory('kg')).toBe('weight');
  });

  it('identifies count units', () => {
    expect(getUnitCategory('each')).toBe('count');
    expect(getUnitCategory('clove')).toBe('count');
    expect(getUnitCategory('can')).toBe('count');
  });

  it('returns count for unknown units', () => {
    expect(getUnitCategory('splash')).toBe('count');
    expect(getUnitCategory('unknown')).toBe('count');
  });
});

describe('unitsAreCompatible', () => {
  it('returns true for same category', () => {
    expect(unitsAreCompatible('cup', 'tbsp')).toBe(true);
    expect(unitsAreCompatible('oz', 'lb')).toBe(true);
    expect(unitsAreCompatible('each', 'piece')).toBe(true);
  });

  it('returns false for different categories', () => {
    expect(unitsAreCompatible('cup', 'oz')).toBe(false);
    expect(unitsAreCompatible('lb', 'tsp')).toBe(false);
    expect(unitsAreCompatible('each', 'cup')).toBe(false);
  });
});
