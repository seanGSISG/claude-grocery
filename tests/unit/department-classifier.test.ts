import { describe, it, expect } from 'vitest';
import { classifyDepartment } from '../../server/utils/department-classifier.js';

describe('classifyDepartment', () => {
  describe('direct lookups', () => {
    it('classifies produce correctly', () => {
      expect(classifyDepartment('garlic')).toBe('Produce');
      expect(classifyDepartment('tomato')).toBe('Produce');
      expect(classifyDepartment('spinach')).toBe('Produce');
      expect(classifyDepartment('banana')).toBe('Produce');
      expect(classifyDepartment('avocado')).toBe('Produce');
      expect(classifyDepartment('fresh_basil')).toBe('Produce');
      expect(classifyDepartment('fresh_ginger')).toBe('Produce');
    });

    it('classifies meat & seafood correctly', () => {
      expect(classifyDepartment('chicken_breast')).toBe('Meat & Seafood');
      expect(classifyDepartment('ground_beef')).toBe('Meat & Seafood');
      expect(classifyDepartment('salmon')).toBe('Meat & Seafood');
      expect(classifyDepartment('bacon')).toBe('Meat & Seafood');
      expect(classifyDepartment('shrimp')).toBe('Meat & Seafood');
    });

    it('classifies dairy correctly', () => {
      expect(classifyDepartment('whole_milk')).toBe('Dairy');
      expect(classifyDepartment('cheddar_cheese')).toBe('Dairy');
      expect(classifyDepartment('egg')).toBe('Dairy');
      expect(classifyDepartment('greek_yogurt')).toBe('Dairy');
      expect(classifyDepartment('butter')).toBe('Dairy');
    });

    it('classifies canned & jarred correctly', () => {
      expect(classifyDepartment('black_beans_canned')).toBe('Canned & Jarred');
      expect(classifyDepartment('tomato_sauce')).toBe('Canned & Jarred');
      expect(classifyDepartment('coconut_milk')).toBe('Canned & Jarred');
      expect(classifyDepartment('chicken_broth')).toBe('Canned & Jarred');
    });

    it('classifies dry goods & pasta correctly', () => {
      expect(classifyDepartment('spaghetti')).toBe('Dry Goods & Pasta');
      expect(classifyDepartment('quinoa')).toBe('Dry Goods & Pasta');
      expect(classifyDepartment('white_rice')).toBe('Dry Goods & Pasta');
      expect(classifyDepartment('elbow_macaroni')).toBe('Dry Goods & Pasta');
    });

    it('classifies bakery correctly', () => {
      expect(classifyDepartment('bread')).toBe('Bakery');
      expect(classifyDepartment('tortilla')).toBe('Bakery');
      expect(classifyDepartment('pita_bread')).toBe('Bakery');
    });

    it('classifies baking correctly', () => {
      expect(classifyDepartment('all_purpose_flour')).toBe('Baking');
      expect(classifyDepartment('baking_soda')).toBe('Baking');
      expect(classifyDepartment('cornstarch')).toBe('Baking');
    });

    it('classifies condiments & sauces correctly', () => {
      expect(classifyDepartment('soy_sauce')).toBe('Condiments & Sauces');
      expect(classifyDepartment('olive_oil')).toBe('Condiments & Sauces');
      expect(classifyDepartment('honey')).toBe('Condiments & Sauces');
    });

    it('classifies spices & seasonings correctly', () => {
      expect(classifyDepartment('salt')).toBe('Spices & Seasonings');
      expect(classifyDepartment('cumin')).toBe('Spices & Seasonings');
      expect(classifyDepartment('paprika')).toBe('Spices & Seasonings');
    });

    it('classifies frozen correctly', () => {
      expect(classifyDepartment('frozen_corn')).toBe('Frozen');
      expect(classifyDepartment('frozen_peas')).toBe('Frozen');
    });

    it('classifies snacks (nuts/seeds) correctly', () => {
      expect(classifyDepartment('almond')).toBe('Snacks');
      expect(classifyDepartment('walnut')).toBe('Snacks');
      expect(classifyDepartment('chia_seed')).toBe('Snacks');
    });
  });

  describe('prefix/suffix matching', () => {
    it('matches by prefix for compound names', () => {
      // Names that start with a known key should match
      expect(classifyDepartment('garlic_sauce')).toBe('Produce');
    });

    it('matches by suffix for compound names', () => {
      // Names that end with a known key
      expect(classifyDepartment('dried_oregano')).toBe('Spices & Seasonings');
    });
  });

  describe('fallback to Other', () => {
    it('returns Other for completely unknown ingredients', () => {
      expect(classifyDepartment('dragon_fruit_puree')).toBe('Other');
      expect(classifyDepartment('truffle_oil_infused')).toBe('Other');
    });
  });
});
