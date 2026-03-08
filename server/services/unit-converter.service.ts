import { UNIT_MAP, DISPLAY_UNITS } from '../utils/unit-tables.js';
import type { UnitCategory } from '../utils/unit-tables.js';

export interface StandardizedMeasurement {
  quantity: number;
  unit: string;
  category: UnitCategory;
  baseQuantity: number; // in ml or g
}

/**
 * Convert a quantity + unit to a standard base unit (ml for volume, g for weight).
 * Count units pass through as-is.
 */
export function convertToStandardUnit(quantity: number, unit: string): { quantity: number; unit: string } {
  const normalizedUnit = unit.toLowerCase().trim();
  const unitInfo = UNIT_MAP[normalizedUnit];

  if (!unitInfo) {
    // Unknown unit — keep as-is
    return { quantity, unit: normalizedUnit || 'each' };
  }

  if (unitInfo.category === 'count') {
    // Count units: just normalize the unit name
    const baseQuantity = quantity * unitInfo.toBase;
    return { quantity: baseQuantity, unit: unitInfo.baseUnit };
  }

  // Volume or weight: convert to base (ml or g)
  const baseQuantity = quantity * unitInfo.toBase;
  return { quantity: baseQuantity, unit: unitInfo.baseUnit };
}

/**
 * Convert a base measurement (ml or g) back to a human-friendly display unit.
 * Picks the largest unit that produces a quantity >= 0.5.
 */
export function toDisplayUnit(baseQuantity: number, category: UnitCategory): { quantity: number; unit: string } {
  if (category === 'volume') {
    for (const { unit, minMl } of DISPLAY_UNITS.volume) {
      const unitInfo = UNIT_MAP[unit]!;
      const converted = baseQuantity / unitInfo.toBase;
      if (converted >= 0.5 || minMl === 0) {
        return { quantity: roundSmart(converted), unit };
      }
    }
  }

  if (category === 'weight') {
    for (const { unit, minG } of DISPLAY_UNITS.weight) {
      const unitInfo = UNIT_MAP[unit]!;
      const converted = baseQuantity / unitInfo.toBase;
      if (converted >= 0.5 || minG === 0) {
        return { quantity: roundSmart(converted), unit };
      }
    }
  }

  // Count or unknown — return as-is
  return { quantity: roundSmart(baseQuantity), unit: 'each' };
}

/**
 * Get the unit category for a given unit string.
 */
export function getUnitCategory(unit: string): UnitCategory {
  const info = UNIT_MAP[unit.toLowerCase().trim()];
  return info?.category ?? 'count';
}

/**
 * Check if two units are in the same category and can be aggregated.
 */
export function unitsAreCompatible(unit1: string, unit2: string): boolean {
  return getUnitCategory(unit1) === getUnitCategory(unit2);
}

/**
 * Round to sensible precision for grocery quantities.
 */
function roundSmart(value: number): number {
  if (value >= 10) return Math.round(value);
  if (value >= 1) return Math.round(value * 4) / 4; // Quarter precision
  return Math.round(value * 8) / 8; // Eighth precision
}
