import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../utils/logger.js';

interface PantryItem {
  name: string;
  canonicalName: string;
  category: string;
}

const DEFAULT_PANTRY_STAPLES: PantryItem[] = [
  // Oils & Fats
  { name: 'Olive oil', canonicalName: 'olive_oil', category: 'oil_fat' },
  { name: 'Vegetable oil', canonicalName: 'vegetable_oil', category: 'oil_fat' },
  { name: 'Cooking spray', canonicalName: 'cooking_spray', category: 'oil_fat' },
  { name: 'Butter', canonicalName: 'butter', category: 'oil_fat' },

  // Vinegar & Acid
  { name: 'White vinegar', canonicalName: 'white_vinegar', category: 'vinegar_acid' },
  { name: 'Apple cider vinegar', canonicalName: 'apple_cider_vinegar', category: 'vinegar_acid' },
  { name: 'Balsamic vinegar', canonicalName: 'balsamic_vinegar', category: 'vinegar_acid' },
  { name: 'Lemon juice', canonicalName: 'lemon_juice', category: 'vinegar_acid' },

  // Seasonings
  { name: 'Salt', canonicalName: 'salt', category: 'seasoning' },
  { name: 'Black pepper', canonicalName: 'black_pepper', category: 'seasoning' },
  { name: 'Garlic powder', canonicalName: 'garlic_powder', category: 'seasoning' },
  { name: 'Onion powder', canonicalName: 'onion_powder', category: 'seasoning' },
  { name: 'Italian seasoning', canonicalName: 'italian_seasoning', category: 'seasoning' },
  { name: 'Chili powder', canonicalName: 'chili_powder', category: 'seasoning' },
  { name: 'Cumin', canonicalName: 'cumin', category: 'seasoning' },
  { name: 'Paprika', canonicalName: 'paprika', category: 'seasoning' },
  { name: 'Red pepper flakes', canonicalName: 'red_pepper_flakes', category: 'seasoning' },
  { name: 'Bay leaves', canonicalName: 'bay_leaves', category: 'seasoning' },
  { name: 'Oregano', canonicalName: 'oregano', category: 'seasoning' },
  { name: 'Thyme', canonicalName: 'thyme', category: 'seasoning' },
  { name: 'Cinnamon', canonicalName: 'cinnamon', category: 'seasoning' },

  // Condiments
  { name: 'Soy sauce', canonicalName: 'soy_sauce', category: 'condiment' },
  { name: 'Hot sauce', canonicalName: 'hot_sauce', category: 'condiment' },
  { name: 'Mustard', canonicalName: 'mustard', category: 'condiment' },
  { name: 'Ketchup', canonicalName: 'ketchup', category: 'condiment' },
  { name: 'Mayonnaise', canonicalName: 'mayonnaise', category: 'condiment' },
  { name: 'Worcestershire sauce', canonicalName: 'worcestershire_sauce', category: 'condiment' },

  // Baking
  { name: 'All-purpose flour', canonicalName: 'all_purpose_flour', category: 'baking' },
  { name: 'Baking soda', canonicalName: 'baking_soda', category: 'baking' },
  { name: 'Baking powder', canonicalName: 'baking_powder', category: 'baking' },
  { name: 'Vanilla extract', canonicalName: 'vanilla_extract', category: 'baking' },
  { name: 'Cornstarch', canonicalName: 'cornstarch', category: 'baking' },

  // Sweeteners
  { name: 'Granulated sugar', canonicalName: 'granulated_sugar', category: 'sweetener' },
  { name: 'Brown sugar', canonicalName: 'brown_sugar', category: 'sweetener' },
  { name: 'Honey', canonicalName: 'honey', category: 'sweetener' },

  // Grains
  { name: 'Rice', canonicalName: 'rice', category: 'grain' },
  { name: 'Pasta', canonicalName: 'pasta', category: 'grain' },
  { name: 'Bread crumbs', canonicalName: 'bread_crumbs', category: 'grain' },

  // Canned/Jarred basics
  { name: 'Chicken broth', canonicalName: 'chicken_broth', category: 'other' },
  { name: 'Vegetable broth', canonicalName: 'vegetable_broth', category: 'other' },
  { name: 'Tomato paste', canonicalName: 'tomato_paste', category: 'other' },
  { name: 'Diced tomatoes', canonicalName: 'diced_tomatoes', category: 'other' },
];

export function seedDefaults(db: Database.Database): void {
  const count = db.prepare('SELECT COUNT(*) as count FROM pantry_staples').get() as { count: number };

  if (count.count > 0) {
    log('info', `Pantry staples already seeded (${count.count} items)`);
    return;
  }

  log('info', 'Seeding default pantry staples...');

  const insert = db.prepare(
    'INSERT INTO pantry_staples (id, name, canonical_name, category, is_default) VALUES (?, ?, ?, ?, 1)'
  );

  const insertMany = db.transaction((items: PantryItem[]) => {
    for (const item of items) {
      insert.run(uuidv4(), item.name, item.canonicalName, item.category);
    }
  });

  insertMany(DEFAULT_PANTRY_STAPLES);
  log('info', `Seeded ${DEFAULT_PANTRY_STAPLES.length} default pantry staples`);
}
