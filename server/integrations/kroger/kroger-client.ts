/**
 * Kroger API client for product search and store location lookup.
 *
 * All endpoints require a bearer token obtained via KrogerAuth.
 * Docs: https://developer.kroger.com/documentation/api
 */

import { log } from '../../utils/logger.js';
import type { KrogerAuth } from './kroger-auth.js';
import type {
  KrogerProduct,
  KrogerProductSearchResponse,
  KrogerLocation,
  KrogerLocationSearchResponse,
} from './kroger-types.js';

const BASE_URL = 'https://api.kroger.com/v1';

/** Default chain for Colorado users. */
const DEFAULT_CHAIN = 'KingSoopers';

export interface ProductSearchOptions {
  term: string;
  locationId: string;
  limit?: number;
  fulfillment?: 'ais' | 'csp' | 'dth' | 'sth'; // in-store, curbside, delivery, ship-to-home
}

export interface LocationSearchOptions {
  zipCode: string;
  radiusMiles?: number;
  chain?: string;
  limit?: number;
}

/** Simplified product result returned by convenience helpers. */
export interface ProductResult {
  productId: string;
  upc: string;
  description: string;
  brand: string;
  price: number | null;
  size: string | null;
  aisle: string | null;
  imageUrl: string | null;
  fulfillment: {
    inStore: boolean;
    curbside: boolean;
    delivery: boolean;
  } | null;
}

export class KrogerClient {
  private readonly auth: KrogerAuth;

  constructor(auth: KrogerAuth) {
    this.auth = auth;
  }

  // ---------------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------------

  /**
   * Search for products at a specific location.
   */
  async searchProducts(
    term: string,
    locationId: string,
    limit: number = 10,
    fulfillment?: 'ais' | 'csp' | 'dth' | 'sth'
  ): Promise<ProductResult[]> {
    const params = new URLSearchParams({
      'filter.term': term,
      'filter.locationId': locationId,
      'filter.limit': String(limit),
    });

    if (fulfillment) {
      params.set('filter.fulfillment', fulfillment);
    }

    const url = `${BASE_URL}/products?${params.toString()}`;
    const data = await this.request<KrogerProductSearchResponse>(url);

    return data.data.map(toProductResult);
  }

  /**
   * Get full product details by ID (scoped to a location for pricing).
   */
  async getProductDetails(
    productId: string,
    locationId: string
  ): Promise<ProductResult | null> {
    const params = new URLSearchParams({
      'filter.locationId': locationId,
    });

    const url = `${BASE_URL}/products/${encodeURIComponent(productId)}?${params.toString()}`;

    try {
      const data = await this.request<{ data: KrogerProduct }>(url);
      return toProductResult(data.data);
    } catch (error) {
      log('warn', `Product not found: ${productId}`, error);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Locations
  // ---------------------------------------------------------------------------

  /**
   * Search for store locations near a ZIP code.
   */
  async searchLocations(
    zipCode: string,
    radiusMiles: number = 10,
    chain: string = DEFAULT_CHAIN,
    limit: number = 5
  ): Promise<KrogerLocation[]> {
    const params = new URLSearchParams({
      'filter.zipCode.near': zipCode,
      'filter.radiusInMiles': String(radiusMiles),
      'filter.chain': chain,
      'filter.limit': String(limit),
    });

    const url = `${BASE_URL}/locations?${params.toString()}`;
    const data = await this.request<KrogerLocationSearchResponse>(url);

    return data.data;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Generic authenticated GET request.
   */
  private async request<T>(url: string): Promise<T> {
    const token = await this.auth.getClientToken();

    log('debug', `Kroger API request: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const message = `Kroger API error (${response.status}): ${errorBody}`;
      log('error', message);
      throw new Error(message);
    }

    return response.json() as Promise<T>;
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function toProductResult(product: KrogerProduct): ProductResult {
  const firstItem = product.items?.[0] ?? null;

  // Extract the best image URL (prefer "large" or "medium" front-facing)
  let imageUrl: string | null = null;
  const frontImage = product.images?.find((img) => img.perspective === 'front');
  if (frontImage?.sizes?.length) {
    const preferred = frontImage.sizes.find((s) => s.size === 'large')
      ?? frontImage.sizes.find((s) => s.size === 'medium')
      ?? frontImage.sizes[0];
    imageUrl = preferred?.url ?? null;
  }

  // Build aisle string from aisleLocations
  let aisle: string | null = null;
  if (product.aisleLocations?.length) {
    const loc = product.aisleLocations[0];
    aisle = loc.description
      ? `${loc.description} (Aisle ${loc.number})`
      : `Aisle ${loc.number}`;
  }

  return {
    productId: product.productId,
    upc: product.upc,
    description: product.description,
    brand: product.brand,
    price: firstItem?.price?.regular ?? null,
    size: firstItem?.size ?? null,
    aisle,
    imageUrl,
    fulfillment: firstItem?.fulfillment
      ? {
          inStore: firstItem.fulfillment.inStore,
          curbside: firstItem.fulfillment.curbside,
          delivery: firstItem.fulfillment.delivery,
        }
      : null,
  };
}
