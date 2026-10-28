/**
 * Import captured King Soopers purchase history into SQLite.
 *
 *   npm run history:import -- --file data/ks-purchase-history.json
 *   npm run history:import -- --details data/ks-purchase-details.json
 *   op run --env-file=.env.op -- npm run history:import -- --resolve
 *
 * --resolve additionally looks every UPC up in the Kroger Products API to fill
 * in brand, description, size and current price (needs client credentials and,
 * for prices, KROGER_LOCATION_ID).
 */

import { readFileSync } from 'node:fs';
import { initDatabase } from '../db/connection.js';
import { runMigrations } from '../db/schema.js';
import { KrogerAuth } from '../integrations/kroger/kroger-auth.js';
import { KrogerClient } from '../integrations/kroger/kroger-client.js';
import { summarize, parseUsd, type RawHistory } from '../services/purchase-history.service.js';
import {
  parseCapture,
  detailStats,
  type DetailsCapture,
} from '../services/receipt-details.service.js';

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1] ?? fallback;
}

async function main(): Promise<void> {
  const file = arg('--file', 'data/ks-purchase-history.json')!;
  const resolve = process.argv.includes('--resolve');
  const limit = Number(arg('--resolve-limit', '250'));

  // --details may be repeated: captures from several passes merge.
  const detailsFiles = process.argv.reduce<string[]>((acc, a, i) => {
    if (a === '--details' && process.argv[i + 1]) acc.push(process.argv[i + 1]);
    return acc;
  }, []);
  const history = JSON.parse(readFileSync(file, 'utf8')) as RawHistory;
  const summary = summarize(history);

  const db = initDatabase();
  runMigrations(db);

  const insertReceipt = db.prepare(
    `INSERT INTO purchase_receipts (receipt_key, purchased_at, purchase_type, store_id, total_usd, status)
     VALUES (@receiptKey, @date, @type, @storeId, @total, @status)
     ON CONFLICT(receipt_key) DO UPDATE SET
       purchased_at = excluded.purchased_at,
       total_usd = excluded.total_usd,
       status = excluded.status`
  );
  const insertItem = db.prepare(
    'INSERT OR IGNORE INTO purchase_items (receipt_key, upc) VALUES (?, ?)'
  );
  const insertStat = db.prepare(
    `INSERT INTO purchase_upc_stats
       (upc, basket_count, basket_total, frequency, first_seen, last_seen, median_gap_days, is_staple)
     VALUES (@upc, @basketCount, @basketTotal, @frequency, @firstSeen, @lastSeen, @medianGapDays, @isStaple)
     ON CONFLICT(upc) DO UPDATE SET
       basket_count = excluded.basket_count,
       basket_total = excluded.basket_total,
       frequency = excluded.frequency,
       first_seen = excluded.first_seen,
       last_seen = excluded.last_seen,
       median_gap_days = excluded.median_gap_days,
       is_staple = excluded.is_staple`
  );

  const load = db.transaction(() => {
    for (const receipt of history.receipts) {
      insertReceipt.run({
        receiptKey: receipt.receiptKey,
        date: receipt.date,
        type: receipt.type,
        storeId: receipt.storeId ?? null,
        total: parseUsd(receipt.total),
        status: receipt.status ?? null,
      });
      for (const upc of new Set(receipt.upcs)) insertItem.run(receipt.receiptKey, upc);
    }
    for (const stat of summary.stats) {
      insertStat.run({ ...stat, isStaple: stat.isStaple ? 1 : 0 });
    }
  });
  load();

  // Receipt details: quantities, prices and product names, where captured.
  let detailLines = 0;
  if (detailsFiles.length > 0) {
    const merged: Record<string, unknown> = {};
    for (const path of detailsFiles) {
      const capture = JSON.parse(readFileSync(path, 'utf8')) as DetailsCapture;
      Object.assign(merged, capture.details ?? {});
    }
    const receipts = parseCapture({ details: merged });
    const upcStats = detailStats(receipts);

    const updateItem = db.prepare(
      `UPDATE purchase_items
          SET quantity = ?, unit_price = ?, total_paid = ?, savings = ?, description = ?, size = ?
        WHERE receipt_key = ? AND upc = ?`
    );
    const updateStat = db.prepare(
      `UPDATE purchase_upc_stats
          SET description = COALESCE(?, description),
              size = COALESCE(?, size),
              last_price = COALESCE(?, last_price),
              avg_quantity = ?,
              resolved_at = datetime('now')
        WHERE upc = ?`
    );

    const loadDetails = db.transaction(() => {
      for (const receipt of receipts) {
        for (const line of receipt.lines) {
          updateItem.run(
            line.quantity,
            line.unitPricePaid,
            line.totalPricePaid,
            line.savings,
            line.description,
            line.size,
            receipt.receiptKey,
            line.upc
          );
          detailLines += 1;
        }
      }
      for (const stat of upcStats) {
        updateStat.run(stat.description, stat.size, stat.lastUnitPrice, stat.avgQuantity, stat.upc);
      }
    });
    loadDetails();

    console.log(`\nDetails: ${receipts.length} receipts, ${detailLines} lines, ${upcStats.length} UPCs named.`);
  }

  const staples = summary.stats.filter((s) => s.isStaple);
  console.log(`\nImported ${history.receipts.length} receipts (${summary.basketTotal} baskets, ${summary.basketFirst} to ${summary.basketLast}).`);
  console.log(`Distinct UPCs: ${summary.stats.length}. Staples (>=60% of baskets): ${staples.length}.`);
  if (summary.medianBasketUsd != null) {
    console.log(`Basket total: median $${summary.medianBasketUsd.toFixed(2)}, mean $${summary.meanBasketUsd!.toFixed(2)}.`);
  }

  if (!resolve) {
    if (detailsFiles.length === 0) console.log('\nAdd --details data/ks-purchase-details.json for quantities and names.');
    console.log('Re-run with --resolve to look up anything the capture did not name.\n');
    return;
  }

  const clientId = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('--resolve needs KROGER_CLIENT_ID / KROGER_CLIENT_SECRET (op run --env-file=.env.op -- ...)');
    process.exit(1);
  }

  const client = new KrogerClient(new KrogerAuth(clientId, clientSecret));
  const locationId = process.env.KROGER_LOCATION_ID;
  const update = db.prepare(
    `UPDATE purchase_upc_stats
        SET description = ?, brand = ?, size = ?, last_price = ?, resolved_at = datetime('now')
      WHERE upc = ?`
  );

  const todo = summary.stats.slice(0, limit);
  let resolved = 0;
  let missing = 0;

  for (const stat of todo) {
    try {
      const product = await client.getProductDetails(stat.upc, locationId);
      if (!product) {
        missing += 1;
        continue;
      }
      update.run(
        product.description ?? null,
        product.brand ?? null,
        product.size ?? null,
        product.promoPrice ?? product.price ?? null,
        stat.upc
      );
      resolved += 1;
    } catch (error) {
      missing += 1;
      console.error(`  ${stat.upc}: ${error instanceof Error ? error.message : error}`);
    }
    // Products API allows 10k calls/day; stay polite anyway.
    await new Promise((r) => setTimeout(r, 60));
  }

  console.log(`\nResolved ${resolved} of ${todo.length} UPCs (${missing} unresolved).`);
  const top = db.prepare(
    `SELECT upc, basket_count, frequency, brand, description, size, last_price
       FROM purchase_upc_stats
      WHERE description IS NOT NULL
      ORDER BY basket_count DESC LIMIT 25`
  ).all() as Array<Record<string, unknown>>;

  console.log('\nMost-bought items:');
  for (const row of top) {
    const pct = Math.round(Number(row.frequency) * 100);
    const price = row.last_price != null ? ` $${Number(row.last_price).toFixed(2)}` : '';
    console.log(`  ${String(pct).padStart(3)}%  ${row.brand ?? ''} ${row.description ?? ''}${row.size ? ` (${row.size})` : ''}${price}`);
  }
  console.log('');
}

main().catch((error: unknown) => {
  console.error('\nImport failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
