/**
 * Instacart Developer Platform API client.
 *
 * Provides helpers for creating shopping list links, recipe pages,
 * and retrieving nearby retailers.
 *
 * Docs: https://docs.instacart.com/developer_platform/
 */

import { log } from '../../utils/logger.js';
import type {
  InstacartLineItem,
  InstacartProductsLinkResponse,
  InstacartRetailer,
  InstacartRetailersResponse,
  InstacartCreateListRequest,
  InstacartCreateRecipeRequest,
} from './instacart-types.js';

const DEFAULT_BASE_URL = 'https://connect.instacart.com';

export class InstacartClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl: string = DEFAULT_BASE_URL) {
    if (!apiKey) {
      throw new Error('InstacartClient requires an apiKey');
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, ''); // strip trailing slashes
  }

  // ---------------------------------------------------------------------------
  // Shopping list
  // ---------------------------------------------------------------------------

  /**
   * Create a hosted Instacart shopping list link.
   *
   * @returns The Instacart-hosted URL where the user can shop the list.
   */
  async createShoppingList(
    title: string,
    items: InstacartLineItem[],
    imageUrl?: string
  ): Promise<string> {
    if (!items.length) {
      throw new Error('Shopping list must contain at least one item');
    }

    const body: InstacartCreateListRequest = {
      title,
      link_type: 'shopping_list',
      line_items: items.map(toApiLineItem),
      ...(imageUrl ? { image_url: imageUrl } : {}),
    };

    const data = await this.post<InstacartProductsLinkResponse>(
      '/idp/v1/products/products_link',
      body
    );

    log('info', `Instacart shopping list created: ${data.products_link_url}`);
    return data.products_link_url;
  }

  // ---------------------------------------------------------------------------
  // Recipe page
  // ---------------------------------------------------------------------------

  /**
   * Create a hosted Instacart recipe page link.
   *
   * @returns The Instacart-hosted URL for the recipe.
   */
  async createRecipePage(
    title: string,
    ingredients: InstacartLineItem[],
    instructions: string[],
    imageUrl?: string,
    recipeUrl?: string
  ): Promise<string> {
    if (!ingredients.length) {
      throw new Error('Recipe must contain at least one ingredient');
    }
    if (!instructions.length) {
      throw new Error('Recipe must contain at least one instruction');
    }

    const body: InstacartCreateRecipeRequest = {
      title,
      link_type: 'recipe',
      ingredients: ingredients.map(toApiLineItem),
      instructions,
      ...(imageUrl ? { image_url: imageUrl } : {}),
      ...(recipeUrl ? { recipe_url: recipeUrl } : {}),
    };

    const data = await this.post<InstacartProductsLinkResponse>(
      '/idp/v1/products/recipe',
      body
    );

    log('info', `Instacart recipe page created: ${data.products_link_url}`);
    return data.products_link_url;
  }

  // ---------------------------------------------------------------------------
  // Retailers
  // ---------------------------------------------------------------------------

  /**
   * Retrieve nearby Instacart retailers for a given ZIP code.
   */
  async getNearbyRetailers(zipCode: string): Promise<InstacartRetailer[]> {
    const params = new URLSearchParams({ zip_code: zipCode });
    const url = `/idp/v1/retailers/nearby?${params.toString()}`;

    const data = await this.get<InstacartRetailersResponse>(url);
    return data.retailers;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    log('debug', `Instacart POST ${url}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const message = `Instacart API error (${response.status}): ${errorBody}`;
        log('error', message);
        throw new Error(message);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Instacart API error')) {
        throw error;
      }
      log('error', 'Instacart request failed', error);
      throw new Error(`Instacart request to ${path} failed: ${String(error)}`);
    }
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    log('debug', `Instacart GET ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const message = `Instacart API error (${response.status}): ${errorBody}`;
        log('error', message);
        throw new Error(message);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Instacart API error')) {
        throw error;
      }
      log('error', 'Instacart request failed', error);
      throw new Error(`Instacart request to ${path} failed: ${String(error)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function toApiLineItem(item: InstacartLineItem): {
  name: string;
  quantity?: number;
  unit?: string;
  brand_filters?: string[];
} {
  return {
    name: item.name,
    ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
    ...(item.unit ? { unit: item.unit } : {}),
    ...(item.brandFilters?.length ? { brand_filters: item.brandFilters } : {}),
  };
}
