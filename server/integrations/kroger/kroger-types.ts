/**
 * TypeScript interfaces for Kroger API responses.
 *
 * Derived from the official Kroger OpenAPI specs:
 * - Products API v1 (product.compact scope, client credentials)
 * - Location API v1 (client credentials)
 * - Cart API v1 (cart.basic:write scope, authorization code)
 * - Identity API v1 (profile.compact scope, authorization code)
 */

// ---------------------------------------------------------------------------
// Product types
// ---------------------------------------------------------------------------

export interface KrogerProductImage {
  id?: string;
  perspective: string;
  default?: boolean;
  sizes: KrogerProductImageSize[];
}

export interface KrogerProductImageSize {
  id?: string;
  size: string;
  url: string;
}

export interface KrogerAisleLocation {
  bayNumber: string;
  description: string;
  number: string;
  numberOfFacings: string;
  sequenceNumber: string;
  side: string;
  shelfNumber: string;
  shelfPositionInBay: string;
}

export interface KrogerItemInventory {
  stockLevel: 'HIGH' | 'LOW' | 'TEMPORARILY_OUT_OF_STOCK';
}

export interface KrogerItemFulfillment {
  curbside: boolean;
  delivery: boolean;
  instore: boolean;
  shiptohome: boolean;
}

export interface KrogerDateValue {
  value: string;
  timezone: string;
}

export interface KrogerItemPrice {
  regular: number;
  promo: number;
  regularPerUnitEstimate: number;
  promoPerUnitEstimate: number;
  expirationDate?: KrogerDateValue;
  effectiveDate?: KrogerDateValue;
}

export interface KrogerProductItem {
  itemId: string;
  inventory?: KrogerItemInventory;
  favorite: boolean;
  fulfillment: KrogerItemFulfillment;
  price: KrogerItemPrice;
  nationalPrice: KrogerItemPrice;
  size: string;
  soldBy: string;
}

export interface KrogerProductTemperature {
  indicator: string;
  heatSensitive: boolean;
}

export interface KrogerAllergen {
  levelOfContainmentName: string;
  name: string;
}

export interface KrogerSweeteningMethods {
  code: string;
  name: string;
}

export interface KrogerProductRestrictions {
  maximumOrderQuantity: number;
  minimumOrderQuantity: number;
  postalCode: string[];
  shippable: boolean;
  stateCodes: string[];
}

export interface KrogerServingSize {
  description: string;
  quantity: number;
  unitOfMeasure: {
    abbreviation: string;
    code: string;
    name: string;
  };
}

export interface KrogerNutrient {
  code: string;
  description: string;
  displayName: string;
  percentDailyIntake: number;
  quantity: number;
  precision: {
    code: string;
    name: string;
  };
  unitOfMeasure: {
    abbreviation: string;
    code: string;
    name: string;
  };
}

export interface KrogerNutritionInformation {
  ingredientStatement: string;
  dailyValueIntakeReference: string;
  servingSize: KrogerServingSize;
  nutrients: KrogerNutrient[];
  preparationState: {
    code: string;
    name: string;
  };
  servingsPerPackage: {
    description: string;
    value: number;
  };
  nutritionalRating: string;
}

export interface KrogerProductBoxedDimensions {
  depth: string;
  height: string;
  width: string;
  grossWeight: string;
  netWeight: string;
  averageWeightPerUnit: string;
}

export interface KrogerProduct {
  productId: string;
  productPageURI?: string;
  aliasProductIds?: string[];
  aisleLocations: KrogerAisleLocation[];
  brand: string;
  categories: string[];
  countryOrigin: string;
  description: string;
  alcohol?: boolean;
  alcoholProof?: number;
  ageRestriction?: boolean;
  snapEligible?: boolean;
  manufacturerDeclarations?: string[];
  sweeteningMethods?: KrogerSweeteningMethods;
  allergens?: KrogerAllergen[];
  allergensDescription?: string;
  certifiedForPassover?: boolean;
  hypoallergenic?: boolean;
  nonGmo?: boolean;
  nonGmoClaimName?: string;
  organicClaimName?: string;
  receiptDescription?: string;
  warnings?: string;
  retstrictions?: KrogerProductRestrictions;
  images: KrogerProductImage[];
  items: KrogerProductItem[];
  itemInformation?: KrogerProductBoxedDimensions;
  temperature: KrogerProductTemperature;
  upc: string;
  ratingsAndReviews?: {
    averageOverallRating: number;
    totalReviewCount: number;
  };
  nutritionInformation?: KrogerNutritionInformation;
}

// ---------------------------------------------------------------------------
// Location types
// ---------------------------------------------------------------------------

export interface KrogerLocationAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  county: string;
  state: string;
  zipCode: string;
}

export interface KrogerGeolocation {
  latLng: string;
  latitude: number;
  longitude: number;
}

export interface KrogerDayHours {
  open: string;
  close: string;
  open24: boolean;
}

export interface KrogerDepartmentHours {
  Open24: boolean;
  monday: KrogerDayHours;
  tuesday: KrogerDayHours;
  wednesday: KrogerDayHours;
  thursday: KrogerDayHours;
  friday: KrogerDayHours;
  saturday: KrogerDayHours;
  sunday: KrogerDayHours;
}

export interface KrogerLocationDepartment {
  departmentId: string;
  name: string;
  phone: string;
  hours: KrogerDepartmentHours;
}

export interface KrogerLocationHours {
  Open24: boolean;
  gmtOffset: string;
  timezone: string;
  monday: KrogerDayHours;
  tuesday: KrogerDayHours;
  wednesday: KrogerDayHours;
  thursday: KrogerDayHours;
  friday: KrogerDayHours;
  saturday: KrogerDayHours;
  sunday: KrogerDayHours;
}

export interface KrogerLocation {
  locationId: string;
  storeNumber?: string;
  divisionNumber?: string;
  chain: string;
  address: KrogerLocationAddress;
  geolocation: KrogerGeolocation;
  name: string;
  phone: string;
  departments: KrogerLocationDepartment[];
  hours: KrogerLocationHours;
}

// ---------------------------------------------------------------------------
// Chain types (from /v1/chains)
// ---------------------------------------------------------------------------

export interface KrogerChainModalityCapabilities {
  delivery: boolean;
  instore: boolean;
  curbside: boolean;
  shiptohome: boolean;
}

export interface KrogerChain {
  name: string;
  divisionNumbers: string[];
  domain: string;
  friendlyBannerName: string;
  defaultTitle: string;
  titleExtension: string;
  appleAppId: string;
  googleAppId: string;
  themeColor: string;
  description: string;
  modalityCapabilities: KrogerChainModalityCapabilities;
}

// ---------------------------------------------------------------------------
// Department types (from /v1/departments)
// ---------------------------------------------------------------------------

export interface KrogerDepartment {
  departmentId: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Cart types (PUT /v1/cart/add)
// ---------------------------------------------------------------------------

export type KrogerCartModality = 'DELIVERY' | 'PICKUP';

export interface KrogerCartItem {
  /** UPC of the item, must be 13 characters. */
  upc: string;
  /** Quantity of the item (integer). */
  quantity: number;
  /** Modality: DELIVERY or PICKUP. Defaults to PICKUP. */
  modality?: KrogerCartModality;
}

export interface KrogerCartAddRequest {
  items: KrogerCartItem[];
}

// ---------------------------------------------------------------------------
// Identity types (GET /v1/identity/profile)
// ---------------------------------------------------------------------------

export interface KrogerIdentityProfile {
  data: {
    id: string;
  };
  meta?: KrogerMeta;
}

// ---------------------------------------------------------------------------
// API response wrappers
// ---------------------------------------------------------------------------

export interface KrogerPagination {
  start: number;
  limit: number;
  total: number;
}

export interface KrogerMeta {
  pagination?: KrogerPagination;
  warnings?: string[];
}

export interface KrogerProductSearchResponse {
  data: KrogerProduct[];
  meta: KrogerMeta;
}

export interface KrogerProductDetailResponse {
  data: KrogerProduct;
  meta?: Record<string, never>;
}

export interface KrogerLocationSearchResponse {
  data: KrogerLocation[];
  meta: KrogerMeta;
}

export interface KrogerLocationDetailResponse {
  data: KrogerLocation;
  meta: KrogerMeta;
}

export interface KrogerChainsResponse {
  data: KrogerChain[];
  meta: KrogerMeta;
}

export interface KrogerChainDetailResponse {
  data: KrogerChain;
  meta?: Record<string, never>;
}

export interface KrogerDepartmentsResponse {
  data: KrogerDepartment[];
  meta: KrogerMeta;
}

export interface KrogerDepartmentDetailResponse {
  data: KrogerDepartment;
  meta?: Record<string, never>;
}

// ---------------------------------------------------------------------------
// Auth / token types
// ---------------------------------------------------------------------------

export interface KrogerTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
}
