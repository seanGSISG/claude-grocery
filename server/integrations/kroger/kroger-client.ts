/**
 * Kroger API client for product search, store location lookup, cart, and identity.
 *
 * Products and Locations endpoints use a client-credentials bearer token.
 * Cart and Identity endpoints require a customer-level bearer token obtained
 * via the Authorization Code flow.
 *
 * Docs: https://developer.kroger.com/documentation/api
 */

import { log } from '../../utils/logger.js';
import type { KrogerAuth } from './kroger-auth.js';
import type {
  KrogerProduct,
  KrogerProductSearchResponse,
  KrogerProductDetailResponse,
  KrogerLocation,
  KrogerLocationSearchResponse,
  KrogerLocationDetailResponse,
  KrogerChain,
  KrogerChainsResponse,
  KrogerChainDetailResponse,
  KrogerDepartment,
  KrogerDepartmentsResponse,
  KrogerDepartmentDetailResponse,
  KrogerCartItem,
  KrogerCartAddRequest,
  KrogerIdentityProfile,
} from './kroger-types.js';

const BASE_URL = 'https://api.kroger.com/v1';

// ---------------------------------------------------------------------------
// Search parameter interfaces
// ---------------------------------------------------------------------------

export interface ProductSearchParams {
  /** Search term (min 3 chars, max 8 words). */
  term?: string;
  /** Kroger location ID (8 chars) -- required for price/availability/aisle data. */
  locationId?: string;
  /** Product ID (13 chars) to search by specific product. */
  productId?: string;
  /** Brand name (case-sensitive, pipe-separated for multiple). */
  brand?: string;
  /** Fulfillment filter: ais (in-store), csp (curbside), dth (delivery), sth (ship-to-home). */
  fulfillment?: 'ais' | 'csp' | 'dth' | 'sth';
  /** Start offset for pagination (1-250). */
  start?: number;
  /** Results limit (1-50, default 10). */
  limit?: number;
}

export interface LocationSearchParams {
  /** Zip code to search near. */
  zipCode?: string;
  /** Comma-separated latitude,longitude string. */
  latLong?: string;
  /** Latitude (use with lon). */
  lat?: number;
  /** Longitude (use with lat). */
  lon?: number;
  /** Search radius in miles (1-100, default 10). */
  radiusInMiles?: number;
  /** Results limit (1-200, default 10). */
  limit?: number;
  /** Filter by chain name. */
  chain?: string;
  /** Filter by department ID. */
  department?: string;
  /** Filter by specific location ID. */
  locationId?: string;
}

/** Simplified product result returned by convenience helpers. */
export interface ProductResult {
  productId: string;
  upc: string;
  description: string;
  brand: string;
  price: number | null;
  promoPrice: number | null;
  size: string | null;
  aisle: string | null;
  imageUrl: string | null;
  inStock: boolean | null;
  fulfillment: {
    inStore: boolean;
    curbside: boolean;
    delivery: boolean;
    shipToHome: boolean;
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
   * Search for products using official /v1/products endpoint.
   * At least one of term, productId, or brand must be provided.
   */
  async searchProducts(params: ProductSearchParams): Promise<ProductResult[]> {
    const query = new URLSearchParams();

    if (params.term) query.set('filter.term', params.term);
    if (params.locationId) query.set('filter.locationId', params.locationId);
    if (params.productId) query.set('filter.productId', params.productId);
    if (params.brand) query.set('filter.brand', params.brand);
    if (params.fulfillment) query.set('filter.fulfillment', params.fulfillment);
    if (params.start != null) query.set('filter.start', String(params.start));
    if (params.limit != null) query.set('filter.limit', String(params.limit));

    const url = `${BASE_URL}/products?${query.toString()}`;
    const data = await this.authenticatedGet<KrogerProductSearchResponse>(url);

    return data.data.map(toProductResult);
  }

  /**
   * Get full product details by ID.
   * Include locationId for price, availability, and aisle data.
   */
  async getProductDetails(
    productId: string,
    locationId?: string
  ): Promise<ProductResult | null> {
    const query = new URLSearchParams();
    if (locationId) query.set('filter.locationId', locationId);

    const qs = query.toString();
    const url = `${BASE_URL}/products/${encodeURIComponent(productId)}${qs ? `?${qs}` : ''}`;

    try {
      const data = await this.authenticatedGet<KrogerProductDetailResponse>(url);
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
   * Search for store locations using official /v1/locations endpoint.
   * At least one location filter should be provided (zipCode, latLong, lat+lon, or locationId).
   */
  async searchLocations(params: LocationSearchParams): Promise<KrogerLocation[]> {
    const query = new URLSearchParams();

    if (params.zipCode) query.set('filter.zipCode.near', params.zipCode);
    if (params.latLong) query.set('filter.latLong.near', params.latLong);
    if (params.lat != null) query.set('filter.lat.near', String(params.lat));
    if (params.lon != null) query.set('filter.lon.near', String(params.lon));
    if (params.radiusInMiles != null) query.set('filter.radiusInMiles', String(params.radiusInMiles));
    if (params.limit != null) query.set('filter.limit', String(params.limit));
    if (params.chain) query.set('filter.chain', params.chain);
    if (params.department) query.set('filter.department', params.department);
    if (params.locationId) query.set('filter.locationId', params.locationId);

    const url = `${BASE_URL}/locations?${query.toString()}`;
    const data = await this.authenticatedGet<KrogerLocationSearchResponse>(url);

    return data.data;
  }

  /**
   * Get details for a specific location by its ID.
   */
  async getLocationDetails(locationId: string): Promise<KrogerLocation | null> {
    const url = `${BASE_URL}/locations/${encodeURIComponent(locationId)}`;

    try {
      const data = await this.authenticatedGet<KrogerLocationDetailResponse>(url);
      return data.data;
    } catch (error) {
      log('warn', `Location not found: ${locationId}`, error);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Chains
  // ---------------------------------------------------------------------------

  /**
   * List all Kroger-family chains.
   */
  async listChains(): Promise<KrogerChain[]> {
    const url = `${BASE_URL}/chains`;
    const data = await this.authenticatedGet<KrogerChainsResponse>(url);
    return data.data;
  }

  /**
   * Get details for a specific chain by name.
   */
  async getChainDetails(name: string): Promise<KrogerChain | null> {
    const url = `${BASE_URL}/chains/${encodeURIComponent(name)}`;

    try {
      const data = await this.authenticatedGet<KrogerChainDetailResponse>(url);
      return data.data;
    } catch (error) {
      log('warn', `Chain not found: ${name}`, error);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Departments
  // ---------------------------------------------------------------------------

  /**
   * List all departments.
   */
  async listDepartments(): Promise<KrogerDepartment[]> {
    const url = `${BASE_URL}/departments`;
    const data = await this.authenticatedGet<KrogerDepartmentsResponse>(url);
    return data.data;
  }

  // ---------------------------------------------------------------------------
  // Cart (requires customer token from Authorization Code flow)
  // ---------------------------------------------------------------------------

  /**
   * Add items to an authenticated customer's cart.
   *
   * @param items - Array of cart items (upc, quantity, optional modality).
   * @param customerToken - A customer-level access token (authorization code grant).
   * @returns true on success (204 response).
   */
  async addToCart(items: KrogerCartItem[], customerToken: string): Promise<boolean> {
    const url = `${BASE_URL}/cart/add`;
    const requestBody: KrogerCartAddRequest = { items };

    log('debug', `Kroger Cart API: adding ${items.length} item(s)`);

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const message = `Kroger Cart API error (${response.status}): ${errorBody}`;
      log('error', message);
      throw new Error(message);
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Identity (requires customer token from Authorization Code flow)
  // ---------------------------------------------------------------------------

  /**
   * Get the profile ID of an authenticated customer.
   *
   * @param customerToken - A customer-level access token with profile.compact scope.
   * @returns The identity profile containing the customer's profile ID.
   */
  async getProfile(customerToken: string): Promise<KrogerIdentityProfile> {
    const url = `${BASE_URL}/identity/profile`;

    log('debug', 'Kroger Identity API: fetching profile');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const message = `Kroger Identity API error (${response.status}): ${errorBody}`;
      log('error', message);
      throw new Error(message);
    }

    return response.json() as Promise<KrogerIdentityProfile>;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Generic authenticated GET request using client-credentials token.
   */
  private async authenticatedGet<T>(url: string): Promise<T> {
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
    promoPrice: firstItem?.price?.promo ?? null,
    size: firstItem?.size ?? null,
    aisle,
    imageUrl,
    inStock: firstItem?.inventory?.stockLevel
      ? firstItem.inventory.stockLevel !== 'TEMPORARILY_OUT_OF_STOCK'
      : null,
    fulfillment: firstItem?.fulfillment
      ? {
          inStore: firstItem.fulfillment.instore,
          curbside: firstItem.fulfillment.curbside,
          delivery: firstItem.fulfillment.delivery,
          shipToHome: firstItem.fulfillment.shiptohome,
        }
      : null,
  };
}
