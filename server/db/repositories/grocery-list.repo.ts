import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { GroceryList, GroceryItem } from '../../models/grocery-list.model.js';

export class GroceryListRepository {
  constructor(private db: Database.Database) {}

  getById(id: string): GroceryList | null {
    const row = this.db.prepare('SELECT * FROM grocery_lists WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.hydrate(row);
  }

  getCurrent(): GroceryList | null {
    const row = this.db.prepare(
      'SELECT * FROM grocery_lists ORDER BY created_at DESC LIMIT 1'
    ).get() as any;
    if (!row) return null;
    return this.hydrate(row);
  }

  create(mealPlanId: string, name: string, items: Omit<GroceryItem, 'id' | 'groceryListId'>[]): GroceryList {
    const id = uuidv4();
    const now = new Date().toISOString();

    const totalCost = items.reduce((sum, item) => sum + (item.estimatedPrice || 0), 0) || null;

    this.db.prepare(`
      INSERT INTO grocery_lists (id, meal_plan_id, name, total_estimated_cost, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, mealPlanId, name, totalCost, now, now);

    const insertItem = this.db.prepare(`
      INSERT INTO grocery_items (id, grocery_list_id, name, canonical_name, quantity, unit, department, aisle_location, estimated_price, kroger_product_id, kroger_upc, checked, source_recipe_ids, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      insertItem.run(
        uuidv4(),
        id,
        item.name,
        item.canonicalName,
        item.quantity,
        item.unit,
        item.department,
        item.aisleLocation || null,
        item.estimatedPrice || null,
        item.krogerProductId || null,
        item.krogerUpc || null,
        0,
        JSON.stringify(item.sourceRecipeIds || []),
        item.notes || null,
      );
    }

    return this.getById(id)!;
  }

  addItems(groceryListId: string, items: Array<{ name: string; quantity: number; unit: string; department?: string }>): void {
    const insert = this.db.prepare(`
      INSERT INTO grocery_items (id, grocery_list_id, name, canonical_name, quantity, unit, department, source_recipe_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, '[]')
    `);

    for (const item of items) {
      insert.run(uuidv4(), groceryListId, item.name, item.name.toLowerCase().replace(/\s+/g, '_'), item.quantity, item.unit, item.department || 'Other');
    }

    this.touchUpdatedAt(groceryListId);
  }

  removeItems(groceryListId: string, itemIds: string[]): number {
    const placeholders = itemIds.map(() => '?').join(',');
    const result = this.db.prepare(
      `DELETE FROM grocery_items WHERE id IN (${placeholders}) AND grocery_list_id = ?`
    ).run(...itemIds, groceryListId);

    this.touchUpdatedAt(groceryListId);
    return result.changes;
  }

  updateItem(itemId: string, updates: { quantity?: number; unit?: string; checked?: boolean }): void {
    const sets: string[] = [];
    const args: any[] = [];

    if (updates.quantity !== undefined) { sets.push('quantity = ?'); args.push(updates.quantity); }
    if (updates.unit !== undefined) { sets.push('unit = ?'); args.push(updates.unit); }
    if (updates.checked !== undefined) { sets.push('checked = ?'); args.push(updates.checked ? 1 : 0); }

    if (sets.length === 0) return;

    args.push(itemId);
    this.db.prepare(`UPDATE grocery_items SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM grocery_lists WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private touchUpdatedAt(id: string): void {
    this.db.prepare("UPDATE grocery_lists SET updated_at = datetime('now') WHERE id = ?").run(id);
  }

  private hydrate(row: any): GroceryList {
    const itemRows = this.db.prepare(
      'SELECT * FROM grocery_items WHERE grocery_list_id = ? ORDER BY department, name'
    ).all(row.id) as any[];

    const items: GroceryItem[] = itemRows.map(r => ({
      id: r.id,
      groceryListId: r.grocery_list_id,
      name: r.name,
      canonicalName: r.canonical_name,
      quantity: r.quantity,
      unit: r.unit,
      department: r.department,
      aisleLocation: r.aisle_location,
      estimatedPrice: r.estimated_price,
      krogerProductId: r.kroger_product_id,
      krogerUpc: r.kroger_upc,
      checked: r.checked === 1,
      sourceRecipeIds: JSON.parse(r.source_recipe_ids),
      notes: r.notes,
    }));

    return {
      id: row.id,
      mealPlanId: row.meal_plan_id,
      name: row.name,
      items,
      totalEstimatedCost: row.total_estimated_cost,
      storeId: row.store_id,
      storeName: row.store_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
