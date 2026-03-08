// Maps common ingredient name variations to canonical forms.
// Canonical names use snake_case: "chicken_breast", "green_onion", etc.

const SYNONYM_MAP: Record<string, string> = {
  // Poultry
  'chicken breast': 'chicken_breast',
  'chicken breasts': 'chicken_breast',
  'boneless skinless chicken breast': 'chicken_breast',
  'chicken thigh': 'chicken_thigh',
  'chicken thighs': 'chicken_thigh',
  'boneless chicken thighs': 'chicken_thigh',
  'ground chicken': 'ground_chicken',
  'whole chicken': 'whole_chicken',
  'chicken drumstick': 'chicken_drumstick',
  'chicken drumsticks': 'chicken_drumstick',
  'chicken wing': 'chicken_wing',
  'chicken wings': 'chicken_wing',
  'ground turkey': 'ground_turkey',
  'turkey breast': 'turkey_breast',

  // Beef
  'ground beef': 'ground_beef',
  'lean ground beef': 'ground_beef',
  'beef stew meat': 'beef_stew_meat',
  'stew meat': 'beef_stew_meat',
  'sirloin steak': 'sirloin_steak',
  'sirloin': 'sirloin_steak',
  'ribeye': 'ribeye_steak',
  'ribeye steak': 'ribeye_steak',
  'chuck roast': 'chuck_roast',
  'flank steak': 'flank_steak',

  // Pork
  'pork chop': 'pork_chop',
  'pork chops': 'pork_chop',
  'pork tenderloin': 'pork_tenderloin',
  'ground pork': 'ground_pork',
  'bacon': 'bacon',
  'sausage': 'sausage',
  'italian sausage': 'italian_sausage',

  // Seafood
  'salmon fillet': 'salmon',
  'salmon fillets': 'salmon',
  'salmon': 'salmon',
  'shrimp': 'shrimp',
  'large shrimp': 'shrimp',
  'tuna': 'tuna',
  'cod': 'cod',
  'tilapia': 'tilapia',

  // Alliums
  'garlic': 'garlic',
  'garlic clove': 'garlic',
  'garlic cloves': 'garlic',
  'minced garlic': 'garlic',
  'onion': 'yellow_onion',
  'yellow onion': 'yellow_onion',
  'white onion': 'white_onion',
  'red onion': 'red_onion',
  'green onion': 'green_onion',
  'green onions': 'green_onion',
  'scallion': 'green_onion',
  'scallions': 'green_onion',
  'shallot': 'shallot',
  'shallots': 'shallot',
  'leek': 'leek',
  'leeks': 'leek',

  // Vegetables
  'bell pepper': 'bell_pepper',
  'bell peppers': 'bell_pepper',
  'red bell pepper': 'red_bell_pepper',
  'green bell pepper': 'green_bell_pepper',
  'jalapeno': 'jalapeno',
  'jalapeno pepper': 'jalapeno',
  'tomato': 'tomato',
  'tomatoes': 'tomato',
  'cherry tomato': 'cherry_tomato',
  'cherry tomatoes': 'cherry_tomato',
  'roma tomato': 'roma_tomato',
  'potato': 'potato',
  'potatoes': 'potato',
  'russet potato': 'russet_potato',
  'sweet potato': 'sweet_potato',
  'sweet potatoes': 'sweet_potato',
  'carrot': 'carrot',
  'carrots': 'carrot',
  'celery': 'celery',
  'celery stalk': 'celery',
  'celery stalks': 'celery',
  'broccoli': 'broccoli',
  'broccoli florets': 'broccoli',
  'cauliflower': 'cauliflower',
  'zucchini': 'zucchini',
  'squash': 'squash',
  'butternut squash': 'butternut_squash',
  'spinach': 'spinach',
  'baby spinach': 'spinach',
  'kale': 'kale',
  'lettuce': 'lettuce',
  'romaine': 'romaine_lettuce',
  'romaine lettuce': 'romaine_lettuce',
  'iceberg lettuce': 'iceberg_lettuce',
  'cucumber': 'cucumber',
  'corn': 'corn',
  'corn on the cob': 'corn',
  'frozen corn': 'frozen_corn',
  'peas': 'peas',
  'frozen peas': 'frozen_peas',
  'green beans': 'green_beans',
  'mushroom': 'mushroom',
  'mushrooms': 'mushroom',
  'cremini mushrooms': 'cremini_mushroom',
  'button mushrooms': 'mushroom',
  'asparagus': 'asparagus',
  'cabbage': 'cabbage',
  'brussels sprouts': 'brussels_sprouts',
  'eggplant': 'eggplant',

  // Herbs (fresh)
  'fresh basil': 'fresh_basil',
  'basil': 'fresh_basil',
  'fresh cilantro': 'fresh_cilantro',
  'cilantro': 'fresh_cilantro',
  'fresh parsley': 'fresh_parsley',
  'parsley': 'fresh_parsley',
  'fresh rosemary': 'fresh_rosemary',
  'rosemary': 'fresh_rosemary',
  'fresh thyme': 'fresh_thyme',
  'fresh dill': 'fresh_dill',
  'dill': 'fresh_dill',
  'fresh mint': 'fresh_mint',
  'mint': 'fresh_mint',
  'ginger': 'fresh_ginger',
  'fresh ginger': 'fresh_ginger',
  'ginger root': 'fresh_ginger',

  // Fruits
  'lemon': 'lemon',
  'lemons': 'lemon',
  'lime': 'lime',
  'limes': 'lime',
  'avocado': 'avocado',
  'avocados': 'avocado',
  'banana': 'banana',
  'bananas': 'banana',
  'apple': 'apple',
  'apples': 'apple',
  'orange': 'orange',
  'oranges': 'orange',
  'berries': 'mixed_berries',
  'strawberry': 'strawberry',
  'strawberries': 'strawberry',
  'blueberry': 'blueberry',
  'blueberries': 'blueberry',

  // Dairy
  'milk': 'whole_milk',
  'whole milk': 'whole_milk',
  '2% milk': '2_percent_milk',
  'skim milk': 'skim_milk',
  'heavy cream': 'heavy_cream',
  'heavy whipping cream': 'heavy_cream',
  'half and half': 'half_and_half',
  'sour cream': 'sour_cream',
  'cream cheese': 'cream_cheese',
  'cheddar cheese': 'cheddar_cheese',
  'cheddar': 'cheddar_cheese',
  'shredded cheddar': 'cheddar_cheese',
  'mozzarella': 'mozzarella_cheese',
  'mozzarella cheese': 'mozzarella_cheese',
  'shredded mozzarella': 'mozzarella_cheese',
  'parmesan': 'parmesan_cheese',
  'parmesan cheese': 'parmesan_cheese',
  'grated parmesan': 'parmesan_cheese',
  'swiss cheese': 'swiss_cheese',
  'feta': 'feta_cheese',
  'feta cheese': 'feta_cheese',
  'goat cheese': 'goat_cheese',
  'ricotta': 'ricotta_cheese',
  'ricotta cheese': 'ricotta_cheese',
  'greek yogurt': 'greek_yogurt',
  'plain greek yogurt': 'greek_yogurt',
  'yogurt': 'yogurt',
  'egg': 'egg',
  'eggs': 'egg',
  'large egg': 'egg',
  'large eggs': 'egg',

  // Canned goods
  'canned black beans': 'black_beans_canned',
  'black beans': 'black_beans_canned',
  'canned kidney beans': 'kidney_beans_canned',
  'kidney beans': 'kidney_beans_canned',
  'chickpeas': 'chickpeas_canned',
  'canned chickpeas': 'chickpeas_canned',
  'garbanzo beans': 'chickpeas_canned',
  'canned diced tomatoes': 'diced_tomatoes_canned',
  'crushed tomatoes': 'crushed_tomatoes_canned',
  'canned crushed tomatoes': 'crushed_tomatoes_canned',
  'tomato sauce': 'tomato_sauce',
  'coconut milk': 'coconut_milk',
  'canned coconut milk': 'coconut_milk',

  // Grains & Pasta
  'white rice': 'white_rice',
  'brown rice': 'brown_rice',
  'jasmine rice': 'jasmine_rice',
  'basmati rice': 'basmati_rice',
  'quinoa': 'quinoa',
  'couscous': 'couscous',
  'spaghetti': 'spaghetti',
  'penne': 'penne',
  'fettuccine': 'fettuccine',
  'elbow macaroni': 'elbow_macaroni',
  'macaroni': 'elbow_macaroni',
  'egg noodles': 'egg_noodles',
  'bread': 'bread',
  'tortilla': 'tortilla',
  'tortillas': 'tortilla',
  'flour tortilla': 'flour_tortilla',
  'flour tortillas': 'flour_tortilla',
  'corn tortilla': 'corn_tortilla',
  'corn tortillas': 'corn_tortilla',
  'pita bread': 'pita_bread',
  'hamburger buns': 'hamburger_bun',
  'hot dog buns': 'hot_dog_bun',

  // Nuts & Seeds
  'almond': 'almond',
  'almonds': 'almond',
  'sliced almonds': 'sliced_almond',
  'walnut': 'walnut',
  'walnuts': 'walnut',
  'pecan': 'pecan',
  'pecans': 'pecan',
  'peanut': 'peanut',
  'peanuts': 'peanut',
  'pine nuts': 'pine_nut',
  'sesame seeds': 'sesame_seed',
  'chia seeds': 'chia_seed',
  'flax seeds': 'flax_seed',
  'sunflower seeds': 'sunflower_seed',

  // Tofu & Plant Proteins
  'tofu': 'tofu',
  'firm tofu': 'firm_tofu',
  'extra firm tofu': 'extra_firm_tofu',
  'tempeh': 'tempeh',
};

export function normalizeIngredientName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .trim()
    .replace(/[,;]+$/, '')          // Remove trailing punctuation
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/\(.*?\)/g, '')        // Remove parenthetical notes
    .trim();

  // Check synonym map
  if (SYNONYM_MAP[cleaned]) {
    return SYNONYM_MAP[cleaned];
  }

  // Try without common prefixes
  const withoutPrefixes = cleaned
    .replace(/^(fresh|dried|frozen|canned|organic|large|medium|small|whole|ground|minced|chopped|diced|sliced|crushed|grated|shredded)\s+/, '');

  if (SYNONYM_MAP[withoutPrefixes]) {
    return SYNONYM_MAP[withoutPrefixes];
  }

  // Default: convert to snake_case
  return cleaned.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export function getDisplayName(canonicalName: string): string {
  return canonicalName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
