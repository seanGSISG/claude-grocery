import { v4 as uuidv4 } from 'uuid';
import type { MealPlanRepository } from '../db/repositories/meal-plan.repo.js';
import type { RecipeRepository } from '../db/repositories/recipe.repo.js';
import type { PantryRepository } from '../db/repositories/pantry.repo.js';
import type { GroceryListRepository } from '../db/repositories/grocery-list.repo.js';
import type { GroceryList, GroceryItem } from '../models/grocery-list.model.js';
import type { MealSlot } from '../models/meal-plan.model.js';
import type { RecipeIngredient } from '../models/recipe.model.js';
import type { AggregatedIngredient } from '../models/ingredient.model.js';
import { normalizeIngredientName, getDisplayName } from '../utils/ingredient-normalizer.js';
import { convertToStandardUnit, toDisplayUnit, getUnitCategory } from './unit-converter.service.js';
import { classifyDepartment } from '../utils/department-classifier.js';
import { log } from '../utils/logger.js';

/**
 * Represents a scaled ingredient from a single recipe slot, before aggregation.
 */
interface ScaledIngredient {
  canonicalName: string;
  displayName: string;
  standardQuantity: number;
  standardUnit: string;
  category: 'volume' | 'weight' | 'count';
  sourceRecipeId: string;
  notes: string | null;
}

/**
 * Aggregation key: canonical name + standard unit.
 * Ingredients with the same canonical name but different unit categories
 * (e.g., garlic in "cloves" vs "tsp") are kept as separate items.
 */
function aggregationKey(canonicalName: string, standardUnit: string): string {
  return `${canonicalName}::${standardUnit}`;
}

/**
 * Generate a grocery list from a meal plan.
 *
 * Algorithm:
 * 1. Load the meal plan and all its non-leftover slots with recipe IDs.
 * 2. For each slot, load the recipe and its ingredients.
 * 3. Scale each ingredient by (slot.servings / recipe.servings).
 * 4. Normalize ingredient names and convert units to standard base units.
 * 5. Aggregate by (canonicalName, standardUnit) -- sum quantities.
 * 6. Convert back to display units.
 * 7. Exclude pantry staples.
 * 8. Classify departments.
 * 9. Sort by department then name.
 * 10. Save as GroceryList.
 */
export class GroceryListService {
  constructor(
    private mealPlanRepo: MealPlanRepository,
    private recipeRepo: RecipeRepository,
    private pantryRepo: PantryRepository,
    private groceryListRepo: GroceryListRepository,
  ) {}

  /**
   * Generate a grocery list for the given meal plan.
   * @param mealPlanId - The meal plan to generate from.
   * @param name - Optional name for the grocery list.
   * @returns The saved GroceryList.
   */
  generate(mealPlanId: string, name?: string): GroceryList {
    log('info', `Generating grocery list for meal plan: ${mealPlanId}`);

    // Step 1: Load the meal plan
    const mealPlan = this.mealPlanRepo.getById(mealPlanId);
    if (!mealPlan) {
      throw new Error(`Meal plan not found: ${mealPlanId}`);
    }

    // Step 2: Collect all non-leftover slots that have a recipeId
    const activeSlots: MealSlot[] = [];
    for (const day of mealPlan.days) {
      for (const slot of Object.values(day.slots)) {
        if (slot && !slot.isLeftover && slot.recipeId) {
          activeSlots.push(slot);
        }
      }
    }

    log('info', `Found ${activeSlots.length} active meal slots with recipes`);

    if (activeSlots.length === 0) {
      log('warn', 'No active slots with recipes found. Creating empty grocery list.');
      return this.groceryListRepo.create(
        mealPlanId,
        name || `Grocery List - ${mealPlan.name}`,
        [],
      );
    }

    // Step 3-4: Scale and normalize ingredients from each slot
    const scaledIngredients: ScaledIngredient[] = [];

    for (const slot of activeSlots) {
      const recipe = this.recipeRepo.getById(slot.recipeId!);
      if (!recipe) {
        log('warn', `Recipe not found for slot: ${slot.recipeId}. Skipping.`);
        continue;
      }

      const scaleFactor = slot.servings / recipe.servings;

      for (const ingredient of recipe.ingredients) {
        // Skip optional ingredients
        if (ingredient.optional) {
          continue;
        }

        // Scale the quantity
        const scaledQuantity = ingredient.quantity * scaleFactor;

        // Normalize ingredient name (re-normalize in case data was entered differently)
        const canonicalName = ingredient.canonicalName || normalizeIngredientName(ingredient.name);

        // Convert to standard unit
        const { quantity: stdQty, unit: stdUnit } = convertToStandardUnit(scaledQuantity, ingredient.unit);
        const category = getUnitCategory(ingredient.unit);

        scaledIngredients.push({
          canonicalName,
          displayName: ingredient.name,
          standardQuantity: stdQty,
          standardUnit: stdUnit,
          category,
          sourceRecipeId: recipe.id,
          notes: ingredient.notes,
        });
      }
    }

    log('info', `Scaled ${scaledIngredients.length} ingredient entries from recipes`);

    // Step 5: Aggregate by (canonicalName, standardUnit)
    const aggregated = new Map<string, AggregatedIngredient & { standardUnit: string; category: 'volume' | 'weight' | 'count' }>();

    for (const item of scaledIngredients) {
      const key = aggregationKey(item.canonicalName, item.standardUnit);

      if (aggregated.has(key)) {
        const existing = aggregated.get(key)!;
        existing.totalQuantity += item.standardQuantity;
        if (!existing.sourceRecipeIds.includes(item.sourceRecipeId)) {
          existing.sourceRecipeIds.push(item.sourceRecipeId);
        }
        if (item.notes && !existing.notes.includes(item.notes)) {
          existing.notes.push(item.notes);
        }
      } else {
        aggregated.set(key, {
          canonicalName: item.canonicalName,
          displayName: item.displayName,
          totalQuantity: item.standardQuantity,
          unit: item.standardUnit,
          standardUnit: item.standardUnit,
          category: item.category,
          department: '',
          sourceRecipeIds: [item.sourceRecipeId],
          notes: item.notes ? [item.notes] : [],
        });
      }
    }

    log('info', `Aggregated into ${aggregated.size} unique ingredient entries`);

    // Step 6-7: Exclude pantry staples
    const pantryStaples = this.pantryRepo.getCanonicalNames();
    const filteredItems: typeof aggregated extends Map<string, infer V> ? V[] : never = [];

    for (const [_key, item] of aggregated) {
      if (pantryStaples.has(item.canonicalName)) {
        log('debug', `Excluding pantry staple: ${item.canonicalName}`);
        continue;
      }
      filteredItems.push(item);
    }

    log('info', `After pantry exclusion: ${filteredItems.length} items (removed ${aggregated.size - filteredItems.length} pantry staples)`);

    // Step 8-9: Convert to display units, classify departments, and build GroceryItem list
    const groceryItems: Omit<GroceryItem, 'id' | 'groceryListId'>[] = filteredItems
      .map(item => {
        // Convert from base units back to display units
        const { quantity: displayQty, unit: displayUnit } = toDisplayUnit(item.totalQuantity, item.category);

        // Classify department
        const department = classifyDepartment(item.canonicalName);

        // Build display name
        const displayName = getDisplayName(item.canonicalName);

        return {
          name: displayName,
          canonicalName: item.canonicalName,
          quantity: displayQty,
          unit: displayUnit,
          department,
          aisleLocation: null,
          estimatedPrice: null,
          krogerProductId: null,
          krogerUpc: null,
          checked: false,
          sourceRecipeIds: item.sourceRecipeIds,
          notes: item.notes.length > 0 ? item.notes.join('; ') : null,
        };
      })
      // Sort by department, then by name within each department
      .sort((a, b) => {
        const deptCompare = a.department.localeCompare(b.department);
        if (deptCompare !== 0) return deptCompare;
        return a.name.localeCompare(b.name);
      });

    // Step 10: Save
    const listName = name || `Grocery List - ${mealPlan.name}`;
    const groceryList = this.groceryListRepo.create(mealPlanId, listName, groceryItems);

    log('info', `Grocery list created: ${groceryList.id} with ${groceryList.items.length} items`);

    return groceryList;
  }
}
