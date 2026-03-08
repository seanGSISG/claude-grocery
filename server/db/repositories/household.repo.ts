import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { Household, HouseholdMember } from '../../models/household.model.js';
import { SERVING_MULTIPLIERS } from '../../models/household.model.js';

export class HouseholdRepository {
  constructor(private db: Database.Database) {}

  get(): Household | null {
    const row = this.db.prepare('SELECT * FROM households LIMIT 1').get() as any;
    if (!row) return null;
    return this.hydrate(row);
  }

  getById(id: string): Household | null {
    const row = this.db.prepare('SELECT * FROM households WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.hydrate(row);
  }

  upsert(data: Partial<Household> & { zipCode: string }): Household {
    const existing = this.get();
    const now = new Date().toISOString();

    if (existing) {
      this.db.prepare(`
        UPDATE households SET
          name = COALESCE(?, name),
          default_diet = COALESCE(?, default_diet),
          budget_weekly = ?,
          preferred_store_id = ?,
          preferred_store_chain = ?,
          zip_code = COALESCE(?, zip_code),
          updated_at = ?
        WHERE id = ?
      `).run(
        data.name ?? null,
        data.defaultDiet ?? null,
        data.budgetWeekly ?? existing.budgetWeekly,
        data.preferredStoreId ?? existing.preferredStoreId,
        data.preferredStoreChain ?? existing.preferredStoreChain,
        data.zipCode ?? null,
        now,
        existing.id,
      );

      if (data.members) {
        this.replaceMembers(existing.id, data.members);
      }

      return this.getById(existing.id)!;
    }

    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO households (id, name, default_diet, budget_weekly, preferred_store_id, preferred_store_chain, zip_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name || 'My Household',
      data.defaultDiet || 'omnivore',
      data.budgetWeekly ?? null,
      data.preferredStoreId ?? null,
      data.preferredStoreChain ?? null,
      data.zipCode,
      now,
      now,
    );

    if (data.members) {
      this.replaceMembers(id, data.members);
    }

    return this.getById(id)!;
  }

  private replaceMembers(householdId: string, members: Partial<HouseholdMember>[]): void {
    this.db.prepare('DELETE FROM household_members WHERE household_id = ?').run(householdId);

    const insert = this.db.prepare(`
      INSERT INTO household_members (id, household_id, name, type, serving_multiplier, allergies, dietary_restrictions, disliked_ingredients)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const m of members) {
      const type = m.type || 'adult';
      insert.run(
        m.id || uuidv4(),
        householdId,
        m.name || 'Member',
        type,
        m.servingMultiplier ?? SERVING_MULTIPLIERS[type] ?? 1.0,
        JSON.stringify(m.allergies || []),
        JSON.stringify(m.dietaryRestrictions || []),
        JSON.stringify(m.dislikedIngredients || []),
      );
    }
  }

  private hydrate(row: any): Household {
    const members = this.db.prepare(
      'SELECT * FROM household_members WHERE household_id = ?'
    ).all(row.id) as any[];

    return {
      id: row.id,
      name: row.name,
      members: members.map(m => ({
        id: m.id,
        name: m.name,
        type: m.type,
        servingMultiplier: m.serving_multiplier,
        allergies: JSON.parse(m.allergies),
        dietaryRestrictions: JSON.parse(m.dietary_restrictions),
        dislikedIngredients: JSON.parse(m.disliked_ingredients),
      })),
      defaultDiet: row.default_diet,
      budgetWeekly: row.budget_weekly,
      preferredStoreId: row.preferred_store_id,
      preferredStoreChain: row.preferred_store_chain,
      zipCode: row.zip_code,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
