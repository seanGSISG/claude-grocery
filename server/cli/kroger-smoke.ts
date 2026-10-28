/**
 * End-to-end check of the Kroger integration.
 *
 *   npm run kroger:smoke -- --zip 80126            # stores + product search only
 *   npm run kroger:smoke -- --zip 80126 --add      # also adds one item to the real cart
 *
 * The --add run is the one that answers the open question in the plan: whether
 * `cart.basic:write` works on the public tier for this app. It adds a single
 * cheap item, which you then remove in the King Soopers app (the API cannot).
 */

import { KrogerAuth } from '../integrations/kroger/kroger-auth.js';
import { KrogerClient } from '../integrations/kroger/kroger-client.js';
import { KrogerTokenStore } from '../integrations/kroger/token-store.js';

interface Args {
  zip: string;
  term: string;
  add: boolean;
  locationId?: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    zip: get('--zip') || process.env.ZIP_CODE || '80126',
    term: get('--term') || 'bananas',
    add: argv.includes('--add'),
    locationId: get('--location') || process.env.KROGER_LOCATION_ID,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const clientId = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Missing KROGER_CLIENT_ID / KROGER_CLIENT_SECRET. Try: op run --env-file=.env.op -- npm run kroger:smoke');
    process.exit(1);
  }

  const auth = new KrogerAuth(clientId, clientSecret);
  const client = new KrogerClient(auth);

  // --- 1. Locations: client-credentials token --------------------------------
  let locationId = args.locationId;
  if (!locationId) {
    const stores = await client.searchLocations({ zipCode: args.zip, chain: 'KINGSOOPERS', limit: 5 });
    if (stores.length === 0) {
      console.error(`No King Soopers stores near ${args.zip}`);
      process.exit(1);
    }
    console.log(`\nKing Soopers near ${args.zip}:`);
    for (const store of stores) {
      console.log(`  ${store.locationId}  ${store.name} -- ${store.address.addressLine1}, ${store.address.city}`);
    }
    locationId = stores[0].locationId;
    console.log(`\nUsing locationId ${locationId} (set KROGER_LOCATION_ID to pin your delivery store).`);
  }

  // --- 2. Products: price + availability at that store -----------------------
  const products = await client.searchProducts({ term: args.term, locationId, limit: 5 });
  if (products.length === 0) {
    console.error(`No products matched "${args.term}" at ${locationId}`);
    process.exit(1);
  }

  console.log(`\nTop matches for "${args.term}":`);
  for (const p of products) {
    const price = p.promoPrice ?? p.price;
    console.log(
      `  ${p.upc}  ${p.brand ? `${p.brand} ` : ''}${p.description}` +
        `${price != null ? ` -- $${price.toFixed(2)}` : ' -- no price'}${p.size ? ` (${p.size})` : ''}` +
        `${p.inStock === false ? ' [out of stock]' : ''}`
    );
  }

  if (!args.add) {
    console.log('\nRead-only checks passed. Re-run with --add to test the Cart API.\n');
    return;
  }

  // --- 3. Cart: customer token from the authorization code grant -------------
  const store = new KrogerTokenStore(auth);
  const customerToken = await store.getAccessToken();
  const item = products.find((p) => p.inStock !== false) ?? products[0];

  console.log(`\nAdding 1 x ${item.description} (${item.upc}) to your cart...`);
  await client.addToCart([{ upc: item.upc, quantity: 1, modality: 'DELIVERY' }], customerToken);

  console.log('Cart API accepted the item -- cart.basic:write works on this tier.');
  console.log('Check the King Soopers app and remove it there (the API cannot remove items).\n');
}

main().catch((error: unknown) => {
  console.error('\nSmoke test failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
