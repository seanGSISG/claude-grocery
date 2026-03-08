import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { Recipe, RecipeInput, RecipeIngredient } from '../../models/recipe.model.js';
import { normalizeIngredientName } from '../../utils/ingredient-normalizer.js';
import { convertToStandardUnit } from '../../services/unit-converter.service.js';
import { classifyDepartment } from '../../utils/department-classifier.js';

export class RecipeRepository {
  constructor(private db: Database.Database) {}

  getById(id: string): Recipe | null {
    const row = this.db.prepare('SELECT * FROM recipes WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.hydrate(row);
  }

  search(params: {
    query?: string;
    tags?: string[];
    dietaryFlags?: string[];
    cuisineType?: string;
    maxPrepTimeMinutes?: number;
    limit?: number;
  }): Recipe[] {
    let sql = 'SELECT * FROM recipes WHERE 1=1';
    const args: any[] = [];

    if (params.query) {
      sql += ' AND (title LIKE ? OR description LIKE ?)';
      const q = `%${params.query}%`;
      args.push(q, q);
    }

    if (params.cuisineType) {
      sql += ' AND cuisine_type = ?';
      args.push(params.cuisineType);
    }

    if (params.maxPrepTimeMinutes) {
      sql += ' AND prep_time_minutes <= ?';
      args.push(params.maxPrepTimeMinutes);
    }

    if (params.tags && params.tags.length > 0) {
      for (const tag of params.tags) {
        sql += ' AND tags LIKE ?';
        args.push(`%"${tag}"%`);
      }
    }

    if (params.dietaryFlags && params.dietaryFlags.length > 0) {
      for (const flag of params.dietaryFlags) {
        sql += ' AND dietary_flags LIKE ?';
        args.push(`%"${flag}"%`);
      }
    }

    sql += ' ORDER BY updated_at DESC LIMIT ?';
    args.push(params.limit || 20);

    const rows = this.db.prepare(sql).all(...args) as any[];
    return rows.map(r => this.hydrate(r));
  }

  create(input: RecipeInput): Recipe {
    const id = uuidv4();
    const now = new Date().toISOString();
    const totalTime = (input.prepTimeMinutes || 0) + (input.cookTimeMinutes || 0) || null;

    this.db.prepare(`
      INSERT INTO recipes (id, title, description, servings, prep_time_minutes, cook_time_minutes, total_time_minutes, instructions, tags, source_url, cuisine_type, dietary_flags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.title,
      input.description || null,
      input.servings,
      input.prepTimeMinutes || null,
      input.cookTimeMinutes || null,
      totalTime,
      JSON.stringify(input.instructions),
      JSON.stringify(input.tags || []),
      input.sourceUrl || null,
      input.cuisineType || null,
      JSON.stringify(input.dietaryFlags || []),
      now,
      now,
    );

    // Insert ingredients
    const insertIngredient = this.db.prepare(`
      INSERT INTO recipe_ingredients (id, recipe_id, name, canonical_name, quantity, unit, standard_unit, standard_quantity, notes, optional, department)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const ing of input.ingredients) {
      const canonicalName = normalizeIngredientName(ing.name);
      const { quantity: stdQty, unit: stdUnit } = convertToStandardUnit(ing.quantity, ing.unit);
      const department = classifyDepartment(canonicalName);

      insertIngredient.run(
        uuidv4(),
        id,
        ing.name,
        canonicalName,
        ing.quantity,
        ing.unit,
        stdUnit,
        stdQty,
        ing.notes || null,
        ing.optional ? 1 : 0,
        department,
      );
    }

    return this.getById(id)!;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getIngredientsForRecipe(recipeId: string): RecipeIngredient[] {
    const rows = this.db.prepare(
      'SELECT * FROM recipe_ingredients WHERE recipe_id = ?'
    ).all(recipeId) as any[];

    return rows.map(r => ({
      id: r.id,
      recipeId: r.recipe_id,
      name: r.name,
      canonicalName: r.canonical_name,
      quantity: r.quantity,
      unit: r.unit,
      standardUnit: r.standard_unit,
      standardQuantity: r.standard_quantity,
      notes: r.notes,
      optional: r.optional === 1,
      department: r.department,
    }));
  }

  private hydrate(row: any): Recipe {
    const ingredients = this.getIngredientsForRecipe(row.id);

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      servings: row.servings,
      prepTimeMinutes: row.prep_time_minutes,
      cookTimeMinutes: row.cook_time_minutes,
      totalTimeMinutes: row.total_time_minutes,
      ingredients,
      instructions: JSON.parse(row.instructions),
      tags: JSON.parse(row.tags),
      sourceUrl: row.source_url,
      cuisineType: row.cuisine_type,
      dietaryFlags: JSON.parse(row.dietary_flags),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
