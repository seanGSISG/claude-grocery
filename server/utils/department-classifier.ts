import type { Department } from '../models/ingredient.model.js';

// Maps canonical ingredient names (or prefixes) to store departments.
const DEPARTMENT_MAP: Record<string, Department> = {
  // Produce
  'garlic': 'Produce',
  'yellow_onion': 'Produce',
  'white_onion': 'Produce',
  'red_onion': 'Produce',
  'green_onion': 'Produce',
  'shallot': 'Produce',
  'leek': 'Produce',
  'bell_pepper': 'Produce',
  'red_bell_pepper': 'Produce',
  'green_bell_pepper': 'Produce',
  'jalapeno': 'Produce',
  'tomato': 'Produce',
  'cherry_tomato': 'Produce',
  'roma_tomato': 'Produce',
  'potato': 'Produce',
  'russet_potato': 'Produce',
  'sweet_potato': 'Produce',
  'carrot': 'Produce',
  'celery': 'Produce',
  'broccoli': 'Produce',
  'cauliflower': 'Produce',
  'zucchini': 'Produce',
  'squash': 'Produce',
  'butternut_squash': 'Produce',
  'spinach': 'Produce',
  'kale': 'Produce',
  'lettuce': 'Produce',
  'romaine_lettuce': 'Produce',
  'iceberg_lettuce': 'Produce',
  'cucumber': 'Produce',
  'corn': 'Produce',
  'mushroom': 'Produce',
  'cremini_mushroom': 'Produce',
  'asparagus': 'Produce',
  'cabbage': 'Produce',
  'brussels_sprouts': 'Produce',
  'eggplant': 'Produce',
  'green_beans': 'Produce',
  'peas': 'Produce',
  'avocado': 'Produce',
  'lemon': 'Produce',
  'lime': 'Produce',
  'banana': 'Produce',
  'apple': 'Produce',
  'orange': 'Produce',
  'strawberry': 'Produce',
  'blueberry': 'Produce',
  'mixed_berries': 'Produce',
  'fresh_basil': 'Produce',
  'fresh_cilantro': 'Produce',
  'fresh_parsley': 'Produce',
  'fresh_rosemary': 'Produce',
  'fresh_thyme': 'Produce',
  'fresh_dill': 'Produce',
  'fresh_mint': 'Produce',
  'fresh_ginger': 'Produce',

  // Meat & Seafood
  'chicken_breast': 'Meat & Seafood',
  'chicken_thigh': 'Meat & Seafood',
  'ground_chicken': 'Meat & Seafood',
  'whole_chicken': 'Meat & Seafood',
  'chicken_drumstick': 'Meat & Seafood',
  'chicken_wing': 'Meat & Seafood',
  'ground_turkey': 'Meat & Seafood',
  'turkey_breast': 'Meat & Seafood',
  'ground_beef': 'Meat & Seafood',
  'beef_stew_meat': 'Meat & Seafood',
  'sirloin_steak': 'Meat & Seafood',
  'ribeye_steak': 'Meat & Seafood',
  'chuck_roast': 'Meat & Seafood',
  'flank_steak': 'Meat & Seafood',
  'pork_chop': 'Meat & Seafood',
  'pork_tenderloin': 'Meat & Seafood',
  'ground_pork': 'Meat & Seafood',
  'bacon': 'Meat & Seafood',
  'sausage': 'Meat & Seafood',
  'italian_sausage': 'Meat & Seafood',
  'salmon': 'Meat & Seafood',
  'shrimp': 'Meat & Seafood',
  'tuna': 'Meat & Seafood',
  'cod': 'Meat & Seafood',
  'tilapia': 'Meat & Seafood',

  // Dairy
  'whole_milk': 'Dairy',
  '2_percent_milk': 'Dairy',
  'skim_milk': 'Dairy',
  'heavy_cream': 'Dairy',
  'half_and_half': 'Dairy',
  'sour_cream': 'Dairy',
  'cream_cheese': 'Dairy',
  'cheddar_cheese': 'Dairy',
  'mozzarella_cheese': 'Dairy',
  'parmesan_cheese': 'Dairy',
  'swiss_cheese': 'Dairy',
  'feta_cheese': 'Dairy',
  'goat_cheese': 'Dairy',
  'ricotta_cheese': 'Dairy',
  'greek_yogurt': 'Dairy',
  'yogurt': 'Dairy',
  'egg': 'Dairy',
  'butter': 'Dairy',

  // Canned & Jarred
  'black_beans_canned': 'Canned & Jarred',
  'kidney_beans_canned': 'Canned & Jarred',
  'chickpeas_canned': 'Canned & Jarred',
  'diced_tomatoes_canned': 'Canned & Jarred',
  'crushed_tomatoes_canned': 'Canned & Jarred',
  'tomato_sauce': 'Canned & Jarred',
  'tomato_paste': 'Canned & Jarred',
  'diced_tomatoes': 'Canned & Jarred',
  'coconut_milk': 'Canned & Jarred',
  'chicken_broth': 'Canned & Jarred',
  'vegetable_broth': 'Canned & Jarred',

  // Dry Goods & Pasta
  'white_rice': 'Dry Goods & Pasta',
  'brown_rice': 'Dry Goods & Pasta',
  'jasmine_rice': 'Dry Goods & Pasta',
  'basmati_rice': 'Dry Goods & Pasta',
  'rice': 'Dry Goods & Pasta',
  'quinoa': 'Dry Goods & Pasta',
  'couscous': 'Dry Goods & Pasta',
  'spaghetti': 'Dry Goods & Pasta',
  'penne': 'Dry Goods & Pasta',
  'fettuccine': 'Dry Goods & Pasta',
  'elbow_macaroni': 'Dry Goods & Pasta',
  'egg_noodles': 'Dry Goods & Pasta',
  'pasta': 'Dry Goods & Pasta',

  // Bakery
  'bread': 'Bakery',
  'tortilla': 'Bakery',
  'flour_tortilla': 'Bakery',
  'corn_tortilla': 'Bakery',
  'pita_bread': 'Bakery',
  'hamburger_bun': 'Bakery',
  'hot_dog_bun': 'Bakery',
  'bread_crumbs': 'Bakery',

  // Baking
  'all_purpose_flour': 'Baking',
  'baking_soda': 'Baking',
  'baking_powder': 'Baking',
  'vanilla_extract': 'Baking',
  'cornstarch': 'Baking',
  'granulated_sugar': 'Baking',
  'brown_sugar': 'Baking',

  // Condiments & Sauces
  'soy_sauce': 'Condiments & Sauces',
  'hot_sauce': 'Condiments & Sauces',
  'mustard': 'Condiments & Sauces',
  'ketchup': 'Condiments & Sauces',
  'mayonnaise': 'Condiments & Sauces',
  'worcestershire_sauce': 'Condiments & Sauces',
  'honey': 'Condiments & Sauces',

  // Spices & Seasonings
  'salt': 'Spices & Seasonings',
  'black_pepper': 'Spices & Seasonings',
  'garlic_powder': 'Spices & Seasonings',
  'onion_powder': 'Spices & Seasonings',
  'italian_seasoning': 'Spices & Seasonings',
  'chili_powder': 'Spices & Seasonings',
  'cumin': 'Spices & Seasonings',
  'paprika': 'Spices & Seasonings',
  'red_pepper_flakes': 'Spices & Seasonings',
  'bay_leaves': 'Spices & Seasonings',
  'oregano': 'Spices & Seasonings',
  'thyme': 'Spices & Seasonings',
  'cinnamon': 'Spices & Seasonings',

  // Oils
  'olive_oil': 'Condiments & Sauces',
  'vegetable_oil': 'Condiments & Sauces',
  'cooking_spray': 'Condiments & Sauces',
  'white_vinegar': 'Condiments & Sauces',
  'apple_cider_vinegar': 'Condiments & Sauces',
  'balsamic_vinegar': 'Condiments & Sauces',
  'lemon_juice': 'Condiments & Sauces',

  // Snacks & Nuts
  'almond': 'Snacks',
  'sliced_almond': 'Snacks',
  'walnut': 'Snacks',
  'pecan': 'Snacks',
  'peanut': 'Snacks',
  'pine_nut': 'Snacks',
  'sesame_seed': 'Snacks',
  'chia_seed': 'Snacks',
  'flax_seed': 'Snacks',
  'sunflower_seed': 'Snacks',

  // Frozen
  'frozen_corn': 'Frozen',
  'frozen_peas': 'Frozen',

  // Tofu
  'tofu': 'Produce',
  'firm_tofu': 'Produce',
  'extra_firm_tofu': 'Produce',
  'tempeh': 'Produce',
};

export function classifyDepartment(canonicalName: string): Department {
  // Direct lookup
  if (DEPARTMENT_MAP[canonicalName]) {
    return DEPARTMENT_MAP[canonicalName];
  }

  // Try prefix matching for compound names
  for (const [key, dept] of Object.entries(DEPARTMENT_MAP)) {
    if (canonicalName.startsWith(key) || canonicalName.endsWith(key)) {
      return dept;
    }
  }

  return 'Other';
}
