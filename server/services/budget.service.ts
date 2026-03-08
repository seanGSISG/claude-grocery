import type { GroceryList, GroceryItem } from '../models/grocery-list.model.js';
import { log } from '../utils/logger.js';

/**
 * Interface for a Kroger API client (or similar grocery store API).
 * Implementations should handle authentication and rate limiting.
 */
export interface KrogerClient {
  searchProducts(query: string, locationId?: string): Promise<KrogerSearchResult[]>;
}

export interface KrogerSearchResult {
  productId: string;
  upc: string;
  description: string;
  brand: string;
  price: number | null;
  priceUnit: string | null;
  size: string | null;
  imageUrl: string | null;
}

export interface BudgetEstimate {
  groceryListId: string;
  items: BudgetItemEstimate[];
  totalEstimatedCost: number;
  itemsWithPrices: number;
  itemsWithoutPrices: number;
  confidence: 'high' | 'medium' | 'low';
  storeLocationId: string | null;
}

export interface BudgetItemEstimate {
  groceryItemId: string;
  name: string;
  quantity: number;
  unit: string;
  department: string;
  estimatedPrice: number | null;
  krogerProductId: string | null;
  krogerUpc: string | null;
  matchedProductName: string | null;
  priceSource: 'api' | 'estimate' | 'none';
}

/**
 * Average price estimates per department for items where API lookup fails.
 * These are rough Colorado-area estimates (2024-2025 prices).
 */
const DEPARTMENT_PRICE_ESTIMATES: Record<string, number> = {
  'Produce': 2.50,
  'Dairy': 3.50,
  'Meat & Seafood': 6.00,
  'Bakery': 3.50,
  'Frozen': 3.00,
  'Canned & Jarred': 1.75,
  'Dry Goods & Pasta': 2.00,
  'Snacks': 4.00,
  'Beverages': 3.50,
  'Condiments & Sauces': 3.00,
  'Spices & Seasonings': 4.50,
  'Baking': 3.00,
  'Deli': 5.00,
  'International': 3.00,
  'Other': 3.00,
};

/**
 * Service for estimating grocery budget from a grocery list.
 * When a Kroger client is available, it searches for actual prices.
 * Falls back to department-based estimates when no API is available.
 */
export class BudgetService {
  constructor(private krogerClient: KrogerClient | null = null) {}

  /**
   * Estimate the total budget for a grocery list.
   * @param groceryList - The grocery list to estimate.
   * @param storeLocationId - Optional Kroger location ID for store-specific pricing.
   * @returns Budget estimate with per-item breakdowns.
   */
  async estimate(
    groceryList: GroceryList,
    storeLocationId?: string,
  ): Promise<BudgetEstimate> {
    log('info', `Estimating budget for grocery list: ${groceryList.id} (${groceryList.items.length} items)`);

    const items: BudgetItemEstimate[] = [];
    let totalEstimatedCost = 0;
    let itemsWithPrices = 0;
    let itemsWithoutPrices = 0;

    for (const item of groceryList.items) {
      let estimate: BudgetItemEstimate;

      if (this.krogerClient) {
        estimate = await this.estimateWithApi(item, storeLocationId);
      } else {
        estimate = this.estimateWithoutApi(item);
      }

      items.push(estimate);

      if (estimate.estimatedPrice !== null) {
        totalEstimatedCost += estimate.estimatedPrice;
        itemsWithPrices++;
      } else {
        itemsWithoutPrices++;
      }
    }

    // Determine confidence level
    const priceRatio = groceryList.items.length > 0
      ? itemsWithPrices / groceryList.items.length
      : 0;

    let confidence: 'high' | 'medium' | 'low';
    if (this.krogerClient && priceRatio >= 0.8) {
      confidence = 'high';
    } else if (priceRatio >= 0.5) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    const result: BudgetEstimate = {
      groceryListId: groceryList.id,
      items,
      totalEstimatedCost: Math.round(totalEstimatedCost * 100) / 100,
      itemsWithPrices,
      itemsWithoutPrices,
      confidence,
      storeLocationId: storeLocationId || null,
    };

    log('info', `Budget estimate: $${result.totalEstimatedCost} (${confidence} confidence, ${itemsWithPrices}/${groceryList.items.length} items priced)`);

    return result;
  }

  /**
   * Estimate a single item's price using the Kroger API.
   */
  private async estimateWithApi(
    item: GroceryItem,
    storeLocationId?: string,
  ): Promise<BudgetItemEstimate> {
    try {
      const results = await this.krogerClient!.searchProducts(
        item.name,
        storeLocationId,
      );

      if (results.length > 0) {
        const best = results[0];
        const price = best.price !== null ? best.price : null;

        return {
          groceryItemId: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          department: item.department,
          estimatedPrice: price,
          krogerProductId: best.productId,
          krogerUpc: best.upc,
          matchedProductName: best.description,
          priceSource: price !== null ? 'api' : 'none',
        };
      }
    } catch (error) {
      log('warn', `Kroger API search failed for "${item.name}":`, error);
    }

    // Fall back to department estimate
    return this.estimateWithoutApi(item);
  }

  /**
   * Estimate a single item's price using department averages.
   */
  private estimateWithoutApi(item: GroceryItem): BudgetItemEstimate {
    const deptAvg = DEPARTMENT_PRICE_ESTIMATES[item.department] || DEPARTMENT_PRICE_ESTIMATES['Other'];

    // Scale price estimate roughly by quantity for count items
    // For weight/volume items, the department average is per-item
    let estimatedPrice = deptAvg;
    if (item.quantity > 1 && ['each', 'can', 'box', 'bag', 'package', 'loaf', 'bottle', 'jar'].includes(item.unit)) {
      estimatedPrice = deptAvg * item.quantity;
    }

    return {
      groceryItemId: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      department: item.department,
      estimatedPrice: Math.round(estimatedPrice * 100) / 100,
      krogerProductId: null,
      krogerUpc: null,
      matchedProductName: null,
      priceSource: 'estimate',
    };
  }
}
