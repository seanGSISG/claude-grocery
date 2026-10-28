import type Database from 'better-sqlite3';
import type { StapleRow } from '../../services/staples.service.js';

/** Reads the staple candidates the history import wrote. */
export class StaplesRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Every UPC bought often enough to have a rhythm, named by the receipt
   * capture or the Products API. Unnamed rows are useless on a shopping list.
   */
  candidates(minBaskets = 3): StapleRow[] {
    const rows = this.db
      .prepare(
        `SELECT upc, description, size, frequency, basket_count, last_seen,
                median_gap_days, avg_quantity, is_staple
           FROM purchase_upc_stats
          WHERE basket_count >= ? AND description IS NOT NULL
          ORDER BY frequency DESC`
      )
      .all(minBaskets) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      upc: String(row.upc),
      description: (row.description as string | null) ?? null,
      size: (row.size as string | null) ?? null,
      frequency: Number(row.frequency ?? 0),
      basketCount: Number(row.basket_count ?? 0),
      lastSeen: String(row.last_seen),
      medianGapDays: row.median_gap_days == null ? null : Number(row.median_gap_days),
      avgQuantity: row.avg_quantity == null ? null : Number(row.avg_quantity),
      isStaple: Number(row.is_staple ?? 0) === 1,
    }));
  }
}
