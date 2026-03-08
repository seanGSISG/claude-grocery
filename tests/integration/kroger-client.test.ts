import { describe, it, expect, beforeAll } from 'vitest';
import { KrogerAuth } from '../../server/integrations/kroger/kroger-auth.js';
import { KrogerClient } from '../../server/integrations/kroger/kroger-client.js';

const KROGER_CLIENT_ID = process.env.KROGER_CLIENT_ID;
const KROGER_CLIENT_SECRET = process.env.KROGER_CLIENT_SECRET;

const hasCredentials = Boolean(KROGER_CLIENT_ID && KROGER_CLIENT_SECRET);

describe.skipIf(!hasCredentials)('KrogerClient (live API)', () => {
  let auth: KrogerAuth;
  let client: KrogerClient;

  beforeAll(() => {
    auth = new KrogerAuth(KROGER_CLIENT_ID!, KROGER_CLIENT_SECRET!);
    client = new KrogerClient(auth);
  });

  describe('searchLocations', () => {
    it('finds King Soopers stores near Denver (80202)', async () => {
      const stores = await client.searchLocations({
        zipCode: '80202',
        chain: 'KingSoopers',
        limit: 3,
      });

      expect(stores.length).toBeGreaterThan(0);
      expect(stores[0]).toHaveProperty('locationId');
      expect(stores[0]).toHaveProperty('name');
      expect(stores[0]).toHaveProperty('address');
      expect(stores[0].name).toContain('King Soopers');
    });

    it('finds stores by lat/long', async () => {
      const stores = await client.searchLocations({
        lat: 39.7392,
        lon: -104.9903,
        limit: 2,
      });

      expect(stores.length).toBeGreaterThan(0);
    });
  });

  describe('searchProducts', () => {
    let locationId: string;

    beforeAll(async () => {
      const stores = await client.searchLocations({
        zipCode: '80202',
        chain: 'KingSoopers',
        limit: 1,
      });
      locationId = stores[0].locationId;
    });

    it('searches for chicken breast', async () => {
      const products = await client.searchProducts({
        term: 'chicken breast',
        locationId,
        limit: 5,
      });

      expect(products.length).toBeGreaterThan(0);
      expect(products[0]).toHaveProperty('productId');
      expect(products[0]).toHaveProperty('description');
      expect(products[0]).toHaveProperty('brand');
      expect(products[0]).toHaveProperty('upc');
    });

    it('returns price data when locationId is provided', async () => {
      const products = await client.searchProducts({
        term: 'milk',
        locationId,
        limit: 3,
      });

      expect(products.length).toBeGreaterThan(0);
      // At least some products should have prices
      const withPrices = products.filter((p) => p.price !== null);
      expect(withPrices.length).toBeGreaterThan(0);
    });

    it('supports fulfillment filter', async () => {
      const products = await client.searchProducts({
        term: 'bread',
        locationId,
        fulfillment: 'ais', // in-store
        limit: 3,
      });

      expect(products.length).toBeGreaterThan(0);
    });
  });

  describe('listChains', () => {
    it('returns a list of Kroger-family chains', async () => {
      const chains = await client.listChains();

      expect(chains.length).toBeGreaterThan(0);

      // Should include King Soopers (API returns uppercase, no space)
      const kingSoopers = chains.find((c) =>
        c.name.toUpperCase().includes('KING') && c.name.toUpperCase().includes('SOOPERS')
      );
      expect(kingSoopers).toBeDefined();
    });
  });

  describe('listDepartments', () => {
    it('returns a list of store departments', async () => {
      const departments = await client.listDepartments();

      expect(departments.length).toBeGreaterThan(0);
      expect(departments[0]).toHaveProperty('departmentId');
      expect(departments[0]).toHaveProperty('name');
    });
  });

  describe('getLocationDetails', () => {
    it('returns details for a known location', async () => {
      const stores = await client.searchLocations({
        zipCode: '80202',
        chain: 'KingSoopers',
        limit: 1,
      });

      const locationId = stores[0].locationId;
      const details = await client.getLocationDetails(locationId);

      expect(details).not.toBeNull();
      expect(details!.locationId).toBe(locationId);
      expect(details!.address).toBeDefined();
    });
  });
});

describe.skipIf(hasCredentials)('KrogerClient (no credentials)', () => {
  it('skips live API tests when credentials are not set', () => {
    expect(true).toBe(true);
  });
});
