/**
 * TypeScript interfaces for Kroger API responses.
 * Reference: https://developer.kroger.com/documentation/api
 */

// --- Product types ---

export interface KrogerProductImage {
  perspective: string;
  featured: boolean;
  sizes: {
    size: string;
    url: string;
  }[];
}

export interface KrogerAisleLocation {
  bayNumber: string;
  description: string;
  number: string;
  numberOfFacings: number;
  sequenceNumber: string;
  side: string;
  shelfNumber: string;
  shelfPositionInBay: string;
}

export interface KrogerItemFulfillment {
  curbside: boolean;
  delivery: boolean;
  inStore: boolean;
  shipToHome: boolean;
}

export interface KrogerItemPrice {
  regular: number;
  promo: number;
  regularPerUnitEstimate: number;
  promoPerUnitEstimate: number;
}

export interface KrogerProductItem {
  itemId: string;
  favorite: boolean;
  fulfillment: KrogerItemFulfillment;
  price: KrogerItemPrice;
  nationalPrice: KrogerItemPrice;
  size: string;
  soldBy: string;
}

export interface KrogerProduct {
  productId: string;
  upc: string;
  description: string;
  brand: string;
  categories: string[];
  countryOrigin: string;
  images: KrogerProductImage[];
  items: KrogerProductItem[];
  aisleLocations: KrogerAisleLocation[];
  temperature: {
    indicator: string;
    heatSensitive: boolean;
  };
}

// --- Location types ---

export interface KrogerLocationAddress {
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
}

export interface KrogerGeolocation {
  latitude: number;
  longitude: number;
  latLng: string;
}

export interface KrogerDepartment {
  departmentId: string;
  name: string;
  phone: string;
  hours: {
    timezone: string;
    open24: boolean;
    monday: KrogerDayHours;
    tuesday: KrogerDayHours;
    wednesday: KrogerDayHours;
    thursday: KrogerDayHours;
    friday: KrogerDayHours;
    saturday: KrogerDayHours;
    sunday: KrogerDayHours;
  };
}

export interface KrogerDayHours {
  open: string;
  close: string;
  open24: boolean;
}

export interface KrogerLocationHours {
  timezone: string;
  open24: boolean;
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
  chain: string;
  address: KrogerLocationAddress;
  geolocation: KrogerGeolocation;
  name: string;
  phone: string;
  departments: KrogerDepartment[];
  hours: KrogerLocationHours;
}

// --- API response wrappers ---

export interface KrogerPagination {
  start: number;
  limit: number;
  total: number;
}

export interface KrogerMeta {
  pagination: KrogerPagination;
  warnings?: string[];
}

export interface KrogerProductSearchResponse {
  data: KrogerProduct[];
  meta: KrogerMeta;
}

export interface KrogerLocationSearchResponse {
  data: KrogerLocation[];
  meta: KrogerMeta;
}

// --- Auth types ---

export interface KrogerTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}
