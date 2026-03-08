import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { PantryStaple } from '../../models/pantry.model.js';

export class PantryRepository {
  constructor(private db: Database.Database) {}

  getAll(): PantryStaple[] {
    const rows = this.db.prepare('SELECT * FROM pantry_staples ORDER BY category, name').all() as any[];
    return rows.map(this.hydrate);
  }

  getCanonicalNames(): Set<string> {
    const rows = this.db.prepare('SELECT canonical_name FROM pantry_staples').all() as any[];
    return new Set(rows.map(r => r.canonical_name));
  }

  add(items: Array<{ name: string; canonicalName: string; category?: string }>): PantryStaple[] {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO pantry_staples (id, name, canonical_name, category, is_default)
      VALUES (?, ?, ?, ?, 0)
    `);

    const added: PantryStaple[] = [];
    for (const item of items) {
      const id = uuidv4();
      const result = insert.run(id, item.name, item.canonicalName, item.category || 'other');
      if (result.changes > 0) {
        added.push({
          id,
          name: item.name,
          canonicalName: item.canonicalName,
          category: item.category || 'other',
          isDefault: false,
        });
      }
    }
    return added;
  }

  remove(canonicalNames: string[]): number {
    const placeholders = canonicalNames.map(() => '?').join(',');
    const result = this.db.prepare(
      `DELETE FROM pantry_staples WHERE canonical_name IN (${placeholders})`
    ).run(...canonicalNames);
    return result.changes;
  }

  resetDefaults(): void {
    this.db.prepare('DELETE FROM pantry_staples').run();
    // seed.ts will re-seed on next server start, or caller can trigger it
  }

  private hydrate(row: any): PantryStaple {
    return {
      id: row.id,
      name: row.name,
      canonicalName: row.canonical_name,
      category: row.category,
      isDefault: row.is_default === 1,
    };
  }
}
