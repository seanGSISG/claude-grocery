import { describe, it, expect } from 'vitest';
import { normalizeIngredientName, getDisplayName } from '../../server/utils/ingredient-normalizer.js';

describe('normalizeIngredientName', () => {
  describe('exact synonym matches', () => {
    it('normalizes plurals to singular canonical form', () => {
      expect(normalizeIngredientName('chicken breasts')).toBe('chicken_breast');
      expect(normalizeIngredientName('tomatoes')).toBe('tomato');
      expect(normalizeIngredientName('eggs')).toBe('egg');
      expect(normalizeIngredientName('carrots')).toBe('carrot');
      expect(normalizeIngredientName('potatoes')).toBe('potato');
    });

    it('normalizes common aliases', () => {
      expect(normalizeIngredientName('scallion')).toBe('green_onion');
      expect(normalizeIngredientName('scallions')).toBe('green_onion');
      expect(normalizeIngredientName('garlic cloves')).toBe('garlic');
      expect(normalizeIngredientName('minced garlic')).toBe('garlic');
      expect(normalizeIngredientName('garbanzo beans')).toBe('chickpeas_canned');
    });

    it('normalizes dairy variants', () => {
      expect(normalizeIngredientName('shredded cheddar')).toBe('cheddar_cheese');
      expect(normalizeIngredientName('grated parmesan')).toBe('parmesan_cheese');
      expect(normalizeIngredientName('heavy whipping cream')).toBe('heavy_cream');
      expect(normalizeIngredientName('plain greek yogurt')).toBe('greek_yogurt');
      expect(normalizeIngredientName('large eggs')).toBe('egg');
    });

    it('normalizes meat descriptions', () => {
      expect(normalizeIngredientName('boneless skinless chicken breast')).toBe('chicken_breast');
      expect(normalizeIngredientName('lean ground beef')).toBe('ground_beef');
      expect(normalizeIngredientName('salmon fillet')).toBe('salmon');
      expect(normalizeIngredientName('salmon fillets')).toBe('salmon');
    });

    it('normalizes herbs to fresh versions', () => {
      expect(normalizeIngredientName('basil')).toBe('fresh_basil');
      expect(normalizeIngredientName('fresh basil')).toBe('fresh_basil');
      expect(normalizeIngredientName('cilantro')).toBe('fresh_cilantro');
      expect(normalizeIngredientName('ginger')).toBe('fresh_ginger');
      expect(normalizeIngredientName('ginger root')).toBe('fresh_ginger');
    });

    it('normalizes default onion to yellow onion', () => {
      expect(normalizeIngredientName('onion')).toBe('yellow_onion');
    });

    it('normalizes default milk to whole milk', () => {
      expect(normalizeIngredientName('milk')).toBe('whole_milk');
    });
  });

  describe('prefix stripping', () => {
    it('strips common prefixes and retries lookup', () => {
      expect(normalizeIngredientName('organic garlic')).toBe('garlic');
      expect(normalizeIngredientName('fresh spinach')).toBe('spinach');
      // "oregano" is not in the synonym map, so prefix stripping still falls through to snake_case
      expect(normalizeIngredientName('dried oregano')).toBe('dried_oregano');
      expect(normalizeIngredientName('frozen corn')).toBe('frozen_corn');
      expect(normalizeIngredientName('chopped onion')).toBe('yellow_onion');
    });
  });

  describe('input cleaning', () => {
    it('handles trailing punctuation', () => {
      expect(normalizeIngredientName('garlic,')).toBe('garlic');
      expect(normalizeIngredientName('onion;')).toBe('yellow_onion');
    });

    it('handles extra whitespace', () => {
      expect(normalizeIngredientName('  chicken   breast  ')).toBe('chicken_breast');
    });

    it('handles parenthetical notes', () => {
      expect(normalizeIngredientName('tomato (diced)')).toBe('tomato');
      expect(normalizeIngredientName('chicken breast (boneless)')).toBe('chicken_breast');
    });

    it('is case-insensitive', () => {
      expect(normalizeIngredientName('CHICKEN BREAST')).toBe('chicken_breast');
      expect(normalizeIngredientName('Scallions')).toBe('green_onion');
    });
  });

  describe('fallback: unknown ingredients', () => {
    it('converts unknown ingredients to snake_case', () => {
      expect(normalizeIngredientName('arugula')).toBe('arugula');
      expect(normalizeIngredientName('hoisin sauce')).toBe('hoisin_sauce');
      expect(normalizeIngredientName('fish sauce')).toBe('fish_sauce');
    });

    it('strips special characters from fallback', () => {
      expect(normalizeIngredientName("dijon mustard")).toBe('dijon_mustard');
    });
  });
});

describe('getDisplayName', () => {
  it('converts snake_case to Title Case', () => {
    expect(getDisplayName('chicken_breast')).toBe('Chicken Breast');
    expect(getDisplayName('green_onion')).toBe('Green Onion');
    expect(getDisplayName('fresh_basil')).toBe('Fresh Basil');
  });

  it('handles single-word names', () => {
    expect(getDisplayName('garlic')).toBe('Garlic');
    expect(getDisplayName('salmon')).toBe('Salmon');
  });
});
