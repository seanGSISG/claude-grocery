import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { MealPlan, MealSlot, MealType } from '../../models/meal-plan.model.js';
import { DAY_NAMES, MEAL_TYPES } from '../../models/meal-plan.model.js';

export class MealPlanRepository {
  constructor(private db: Database.Database) {}

  getById(id: string): MealPlan | null {
    const row = this.db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.hydrate(row);
  }

  getCurrent(): MealPlan | null {
    const row = this.db.prepare(
      'SELECT * FROM meal_plans ORDER BY start_date DESC LIMIT 1'
    ).get() as any;
    if (!row) return null;
    return this.hydrate(row);
  }

  getAll(): MealPlan[] {
    const rows = this.db.prepare(
      'SELECT * FROM meal_plans ORDER BY start_date DESC'
    ).all() as any[];
    return rows.map(r => this.hydrate(r));
  }

  create(startDate: string, name?: string, householdId?: string): MealPlan {
    const id = uuidv4();
    const now = new Date().toISOString();

    // Calculate end date (6 days after start = Sunday)
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const endDate = end.toISOString().split('T')[0];

    const planName = name || `Week of ${startDate}`;

    this.db.prepare(`
      INSERT INTO meal_plans (id, name, start_date, end_date, household_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, planName, startDate, endDate, householdId || null, now, now);

    return this.getById(id)!;
  }

  setSlot(
    mealPlanId: string,
    dayIndex: number,
    mealType: MealType,
    data: {
      recipeId?: string;
      recipeName?: string;
      isLeftover?: boolean;
      leftoverSourceSlotId?: string;
      servings?: number;
      notes?: string;
    }
  ): MealSlot {
    // Upsert: delete existing slot then insert
    this.db.prepare(
      'DELETE FROM meal_slots WHERE meal_plan_id = ? AND day_index = ? AND meal_type = ?'
    ).run(mealPlanId, dayIndex, mealType);

    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO meal_slots (id, meal_plan_id, day_index, meal_type, recipe_id, recipe_name, is_leftover, leftover_source_slot_id, servings, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      mealPlanId,
      dayIndex,
      mealType,
      data.recipeId || null,
      data.recipeName || null,
      data.isLeftover ? 1 : 0,
      data.leftoverSourceSlotId || null,
      data.servings ?? 2,
      data.notes || null,
    );

    // Update meal plan timestamp
    this.db.prepare(
      "UPDATE meal_plans SET updated_at = datetime('now') WHERE id = ?"
    ).run(mealPlanId);

    return {
      id,
      mealPlanId,
      dayIndex,
      mealType,
      recipeId: data.recipeId || null,
      recipeName: data.recipeName || null,
      isLeftover: data.isLeftover || false,
      leftoverSourceSlotId: data.leftoverSourceSlotId || null,
      servings: data.servings ?? 2,
      notes: data.notes || null,
    };
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM meal_plans WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getSlotsForPlan(mealPlanId: string): MealSlot[] {
    const rows = this.db.prepare(
      'SELECT * FROM meal_slots WHERE meal_plan_id = ? ORDER BY day_index, meal_type'
    ).all(mealPlanId) as any[];

    return rows.map(r => ({
      id: r.id,
      mealPlanId: r.meal_plan_id,
      dayIndex: r.day_index,
      mealType: r.meal_type as MealType,
      recipeId: r.recipe_id,
      recipeName: r.recipe_name,
      isLeftover: r.is_leftover === 1,
      leftoverSourceSlotId: r.leftover_source_slot_id,
      servings: r.servings,
      notes: r.notes,
    }));
  }

  private hydrate(row: any): MealPlan {
    const slots = this.getSlotsForPlan(row.id);
    const startDate = new Date(row.start_date);

    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      const daySlots: Record<MealType, MealSlot | null> = {
        breakfast: null,
        lunch: null,
        dinner: null,
        snack: null,
      };

      for (const slot of slots) {
        if (slot.dayIndex === i) {
          daySlots[slot.mealType] = slot;
        }
      }

      return {
        dayIndex: i,
        date: dateStr,
        dayName: DAY_NAMES[i],
        slots: daySlots,
      };
    });

    return {
      id: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      householdId: row.household_id,
      days,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
