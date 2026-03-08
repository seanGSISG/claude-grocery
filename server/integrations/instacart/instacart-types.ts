/**
 * TypeScript types for the Instacart Developer Platform (IDP) API.
 * Reference: https://docs.instacart.com/developer_platform/
 */

// --- Request types ---

export interface InstacartLineItem {
  /** Display name of the product, e.g. "Organic Bananas". */
  name: string;
  /** Quantity desired (optional, defaults to 1 on Instacart's side). */
  quantity?: number;
  /** Unit for the quantity, e.g. "lb", "oz", "each". */
  unit?: string;
  /** Optional brand filter to narrow search results. */
  brandFilters?: string[];
}

export interface InstacartCreateListRequest {
  title: string;
  line_items: {
    name: string;
    quantity?: number;
    unit?: string;
    brand_filters?: string[];
  }[];
  image_url?: string;
  link_type: 'shopping_list';
}

export interface InstacartCreateRecipeRequest {
  title: string;
  image_url?: string;
  link_type: 'recipe';
  ingredients: {
    name: string;
    quantity?: number;
    unit?: string;
    brand_filters?: string[];
  }[];
  instructions: string[];
  recipe_url?: string;
}

// --- Response types ---

export interface InstacartProductsLinkResponse {
  products_link_url: string;
}

export interface InstacartRetailer {
  retailerKey: string;
  name: string;
  logoUrl: string;
}

export interface InstacartRetailersResponse {
  retailers: InstacartRetailer[];
}
