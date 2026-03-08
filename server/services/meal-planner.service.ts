/**
 * Meal-planning helper utilities.
 *
 * Provides convenience functions for computing household-level
 * serving sizes, dietary restrictions, and allergy sets.
 */

import type { Household } from '../models/household.model.js';

/**
 * Calculate the effective total servings for a household.
 *
 * Sums each member's `servingMultiplier` (e.g. adult = 1.0, child = 0.5,
 * toddler = 0.25). Falls back to 2 if the household has no members.
 */
export function getEffectiveServings(household: Household): number {
  if (!household.members || household.members.length === 0) {
    return 2;
  }

  const total = household.members.reduce(
    (sum, member) => sum + (member.servingMultiplier ?? 1.0),
    0,
  );

  // Ensure at least 1 serving even if multipliers are tiny
  return Math.max(total, 1);
}

/**
 * Collect all unique dietary restrictions across every household member.
 *
 * Returns a de-duplicated, sorted array (e.g. ["gluten-free", "vegetarian"]).
 */
export function getAllDietaryRestrictions(household: Household): string[] {
  if (!household.members || household.members.length === 0) {
    return [];
  }

  const restrictionSet = new Set<string>();

  for (const member of household.members) {
    if (member.dietaryRestrictions) {
      for (const restriction of member.dietaryRestrictions) {
        restrictionSet.add(restriction.toLowerCase().trim());
      }
    }
  }

  return Array.from(restrictionSet).sort();
}

/**
 * Collect all unique allergies across every household member.
 *
 * Returns a de-duplicated, sorted array (e.g. ["dairy", "peanuts", "shellfish"]).
 */
export function getAllAllergies(household: Household): string[] {
  if (!household.members || household.members.length === 0) {
    return [];
  }

  const allergySet = new Set<string>();

  for (const member of household.members) {
    if (member.allergies) {
      for (const allergy of member.allergies) {
        allergySet.add(allergy.toLowerCase().trim());
      }
    }
  }

  return Array.from(allergySet).sort();
}
