import type { RecipeInput } from '../models/recipe.model.js';
import { log } from '../utils/logger.js';

/**
 * Parsed ingredient from a JSON-LD recipe.
 * Recipe sites use freeform text for ingredients, so we parse what we can.
 */
interface ParsedIngredient {
  name: string;
  quantity: number;
  unit: string;
  notes?: string;
}

/**
 * Intermediate structure from JSON-LD recipe schema.
 */
interface JsonLdRecipe {
  '@type': string | string[];
  name?: string;
  description?: string;
  recipeIngredient?: string[];
  recipeInstructions?: Array<string | { '@type': string; text?: string; name?: string }>;
  recipeYield?: string | string[] | number;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  image?: string | string[] | { url?: string };
  recipeCategory?: string | string[];
  recipeCuisine?: string | string[];
  keywords?: string | string[];
  suitableForDiet?: string | string[];
}

/**
 * Parse an ISO 8601 duration string (e.g., "PT30M", "PT1H15M") to minutes.
 */
function parseDuration(iso: string | undefined): number | null {
  if (!iso) return null;

  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return null;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 60 + minutes + (seconds > 0 ? 1 : 0);
}

/**
 * Parse a recipeYield value to a number of servings.
 */
function parseServings(yield_: string | string[] | number | undefined): number {
  if (yield_ === undefined || yield_ === null) return 4; // default

  if (typeof yield_ === 'number') return yield_;

  const text = Array.isArray(yield_) ? yield_[0] : yield_;
  if (!text) return 4;

  // Try to extract a number from strings like "4 servings", "6", "Makes 8 portions"
  const match = text.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);

  return 4;
}

/**
 * Common unit abbreviations and their canonical forms.
 */
const UNIT_PATTERNS: Array<{ pattern: RegExp; unit: string }> = [
  { pattern: /\btablespoons?\b/i, unit: 'tbsp' },
  { pattern: /\btbsp\.?\b/i, unit: 'tbsp' },
  { pattern: /\bteaspoons?\b/i, unit: 'tsp' },
  { pattern: /\btsp\.?\b/i, unit: 'tsp' },
  { pattern: /\bcups?\b/i, unit: 'cup' },
  { pattern: /\bounces?\b/i, unit: 'oz' },
  { pattern: /\boz\.?\b/i, unit: 'oz' },
  { pattern: /\bpounds?\b/i, unit: 'lb' },
  { pattern: /\blbs?\.?\b/i, unit: 'lb' },
  { pattern: /\bquarts?\b/i, unit: 'quart' },
  { pattern: /\bqt\.?\b/i, unit: 'quart' },
  { pattern: /\bpints?\b/i, unit: 'pint' },
  { pattern: /\bpt\.?\b/i, unit: 'pint' },
  { pattern: /\bgallons?\b/i, unit: 'gallon' },
  { pattern: /\bgal\.?\b/i, unit: 'gallon' },
  { pattern: /\bcloves?\b/i, unit: 'clove' },
  { pattern: /\bstalks?\b/i, unit: 'stalk' },
  { pattern: /\bsprigs?\b/i, unit: 'sprig' },
  { pattern: /\bslices?\b/i, unit: 'slice' },
  { pattern: /\bcans?\b/i, unit: 'can' },
  { pattern: /\bpackages?\b/i, unit: 'package' },
  { pattern: /\bbunch(?:es)?\b/i, unit: 'bunch' },
  { pattern: /\bheads?\b/i, unit: 'head' },
  { pattern: /\bwhole\b/i, unit: 'whole' },
  { pattern: /\bpieces?\b/i, unit: 'piece' },
  { pattern: /\bliters?\b/i, unit: 'liter' },
  { pattern: /\bmilliliters?\b/i, unit: 'ml' },
  { pattern: /\bml\b/i, unit: 'ml' },
  { pattern: /\bgrams?\b/i, unit: 'g' },
  { pattern: /\bkilograms?\b/i, unit: 'kg' },
  { pattern: /\bkg\b/i, unit: 'kg' },
];

/**
 * Unicode fraction map.
 */
const UNICODE_FRACTIONS: Record<string, number> = {
  '\u00BC': 0.25, // 1/4
  '\u00BD': 0.5,  // 1/2
  '\u00BE': 0.75, // 3/4
  '\u2150': 1/7,  // 1/7
  '\u2151': 1/9,  // 1/9
  '\u2152': 0.1,  // 1/10
  '\u2153': 1/3,  // 1/3
  '\u2154': 2/3,  // 2/3
  '\u2155': 0.2,  // 1/5
  '\u2156': 2/5,  // 2/5
  '\u2157': 3/5,  // 3/5
  '\u2158': 4/5,  // 4/5
  '\u2159': 1/6,  // 1/6
  '\u215A': 5/6,  // 5/6
  '\u215B': 0.125, // 1/8
  '\u215C': 0.375, // 3/8
  '\u215D': 0.625, // 5/8
  '\u215E': 0.875, // 7/8
};

/**
 * Parse a quantity string that may contain fractions, unicode, or ranges.
 * Examples: "1", "1/2", "1 1/2", "2-3", "1\u00BD"
 */
function parseQuantity(text: string): number {
  let cleaned = text.trim();
  if (!cleaned) return 1;

  // Replace unicode fractions
  for (const [char, value] of Object.entries(UNICODE_FRACTIONS)) {
    if (cleaned.includes(char)) {
      // Handle "1\u00BD" -> 1 + 0.5 = 1.5
      const before = cleaned.substring(0, cleaned.indexOf(char)).trim();
      const wholeNumber = before ? parseFloat(before) : 0;
      cleaned = String(wholeNumber + value);
      break;
    }
  }

  // Handle ranges like "2-3" -> take the lower value
  if (cleaned.includes('-')) {
    const parts = cleaned.split('-');
    return parseQuantity(parts[0]);
  }

  // Handle "to" ranges like "2 to 3" -> take the lower
  if (cleaned.includes(' to ')) {
    const parts = cleaned.split(' to ');
    return parseQuantity(parts[0]);
  }

  // Handle mixed numbers like "1 1/2"
  const mixedMatch = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    return parseInt(mixedMatch[1], 10) + parseInt(mixedMatch[2], 10) / parseInt(mixedMatch[3], 10);
  }

  // Handle simple fractions like "1/2"
  const fractionMatch = cleaned.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    return parseInt(fractionMatch[1], 10) / parseInt(fractionMatch[2], 10);
  }

  // Handle decimal or integer
  const num = parseFloat(cleaned);
  return isNaN(num) ? 1 : num;
}

/**
 * Parse a freeform ingredient string like "1 1/2 cups all-purpose flour, sifted".
 */
function parseIngredientString(text: string): ParsedIngredient {
  let remaining = text.trim();

  // Extract quantity from the beginning
  // Match patterns like: "1", "1/2", "1 1/2", "1\u00BD", "2-3"
  const qtyPattern = /^([\d\s\/\u00BC-\u00BE\u2150-\u215E]+(?:\s*-\s*[\d\s\/\u00BC-\u00BE\u2150-\u215E]+)?)\s*/;
  const qtyMatch = remaining.match(qtyPattern);

  let quantity = 1;
  if (qtyMatch) {
    quantity = parseQuantity(qtyMatch[1]);
    remaining = remaining.substring(qtyMatch[0].length).trim();
  }

  // Extract unit
  let unit = 'each';
  for (const { pattern, unit: unitName } of UNIT_PATTERNS) {
    const unitMatch = remaining.match(new RegExp(`^(${pattern.source})\\s*(?:of\\s+)?`, 'i'));
    if (unitMatch) {
      unit = unitName;
      remaining = remaining.substring(unitMatch[0].length).trim();
      break;
    }
  }

  // Separate notes from the ingredient name
  // Notes are typically after a comma: "chicken breast, boneless skinless"
  let name = remaining;
  let notes: string | undefined;

  const commaIndex = remaining.indexOf(',');
  if (commaIndex > 0) {
    name = remaining.substring(0, commaIndex).trim();
    notes = remaining.substring(commaIndex + 1).trim();
  }

  // Clean up parenthetical notes
  const parenMatch = name.match(/^(.*?)\s*\((.+?)\)\s*$/);
  if (parenMatch) {
    name = parenMatch[1].trim();
    notes = notes ? `${parenMatch[2]}; ${notes}` : parenMatch[2];
  }

  // Remove leading articles
  name = name.replace(/^(a |an |the )/i, '').trim();

  return {
    name: name || text,
    quantity,
    unit,
    notes,
  };
}

/**
 * Extract recipe instructions from JSON-LD.
 * Instructions can be strings or HowToStep objects.
 */
function extractInstructions(
  instructions: JsonLdRecipe['recipeInstructions'] | undefined,
): string[] {
  if (!instructions || !Array.isArray(instructions)) return [];

  const steps: string[] = [];

  for (const item of instructions) {
    if (typeof item === 'string') {
      // Plain text step -- may contain HTML
      const cleaned = stripHtml(item).trim();
      if (cleaned) steps.push(cleaned);
    } else if (item && typeof item === 'object') {
      // HowToStep or HowToSection
      if (item.text) {
        const cleaned = stripHtml(item.text).trim();
        if (cleaned) steps.push(cleaned);
      } else if (item.name) {
        const cleaned = stripHtml(item.name).trim();
        if (cleaned) steps.push(cleaned);
      }
    }
  }

  return steps;
}

/**
 * Extract keywords/tags from JSON-LD recipe.
 */
function extractTags(recipe: JsonLdRecipe): string[] {
  const tags: string[] = [];

  if (recipe.recipeCategory) {
    const cats = Array.isArray(recipe.recipeCategory) ? recipe.recipeCategory : [recipe.recipeCategory];
    tags.push(...cats.map(c => c.toLowerCase().trim()));
  }

  if (recipe.keywords) {
    if (typeof recipe.keywords === 'string') {
      tags.push(...recipe.keywords.split(',').map(k => k.toLowerCase().trim()).filter(Boolean));
    } else if (Array.isArray(recipe.keywords)) {
      tags.push(...recipe.keywords.map(k => k.toLowerCase().trim()));
    }
  }

  // Deduplicate
  return [...new Set(tags)];
}

/**
 * Extract dietary flags from JSON-LD.
 */
function extractDietaryFlags(recipe: JsonLdRecipe): string[] {
  if (!recipe.suitableForDiet) return [];

  const diets = Array.isArray(recipe.suitableForDiet) ? recipe.suitableForDiet : [recipe.suitableForDiet];

  return diets.map(d => {
    // Schema.org uses URLs like "https://schema.org/GlutenFreeDiet"
    const match = d.match(/([A-Za-z]+)Diet$/);
    if (match) {
      // Convert "GlutenFree" to "gluten-free"
      return match[1].replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
    }
    return d.toLowerCase().trim();
  }).filter(Boolean);
}

/**
 * Strip HTML tags from a string.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a JSON-LD object is a Recipe type.
 */
function isRecipeType(obj: any): obj is JsonLdRecipe {
  if (!obj || typeof obj !== 'object') return false;

  const type = obj['@type'];
  if (typeof type === 'string') return type === 'Recipe';
  if (Array.isArray(type)) return type.includes('Recipe');

  return false;
}

/**
 * Find Recipe objects in a JSON-LD payload, which may be a single object,
 * an array, or a @graph containing multiple objects.
 */
function findRecipesInJsonLd(data: any): JsonLdRecipe[] {
  const recipes: JsonLdRecipe[] = [];

  if (Array.isArray(data)) {
    for (const item of data) {
      recipes.push(...findRecipesInJsonLd(item));
    }
  } else if (data && typeof data === 'object') {
    if (isRecipeType(data)) {
      recipes.push(data);
    }
    if (data['@graph'] && Array.isArray(data['@graph'])) {
      for (const item of data['@graph']) {
        if (isRecipeType(item)) {
          recipes.push(item);
        }
      }
    }
  }

  return recipes;
}

/**
 * Service for parsing recipes from URLs.
 * Fetches the HTML page, extracts JSON-LD structured data,
 * and converts it to a RecipeInput.
 */
export class RecipeParserService {
  /**
   * Parse a recipe from a URL by fetching the page and extracting JSON-LD data.
   * @param url - The URL of the recipe page.
   * @returns A RecipeInput ready to be saved, or null if no recipe found.
   */
  async parseFromUrl(url: string): Promise<RecipeInput | null> {
    log('info', `Parsing recipe from URL: ${url}`);

    let html: string;
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Claude-Grocery/1.0 Recipe Parser',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      if (!response.ok) {
        log('error', `Failed to fetch URL: ${response.status} ${response.statusText}`);
        return null;
      }

      html = await response.text();
    } catch (error) {
      log('error', `Failed to fetch recipe URL: ${url}`, error);
      return null;
    }

    // Extract JSON-LD blocks
    const jsonLdBlocks = this.extractJsonLdBlocks(html);

    if (jsonLdBlocks.length === 0) {
      log('warn', 'No JSON-LD blocks found in page');
      return null;
    }

    // Find Recipe objects in JSON-LD
    for (const block of jsonLdBlocks) {
      try {
        const data = JSON.parse(block);
        const recipes = findRecipesInJsonLd(data);

        if (recipes.length > 0) {
          const recipe = recipes[0]; // Take the first recipe found
          return this.convertToRecipeInput(recipe, url);
        }
      } catch (error) {
        log('debug', 'Failed to parse JSON-LD block', error);
        continue;
      }
    }

    log('warn', 'No Recipe schema found in JSON-LD blocks');
    return null;
  }

  /**
   * Extract all <script type="application/ld+json"> blocks from HTML.
   */
  private extractJsonLdBlocks(html: string): string[] {
    const blocks: string[] = [];
    const pattern = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const content = match[1].trim();
      if (content) {
        blocks.push(content);
      }
    }

    return blocks;
  }

  /**
   * Convert a JSON-LD Recipe object to our RecipeInput format.
   */
  private convertToRecipeInput(jsonLd: JsonLdRecipe, sourceUrl: string): RecipeInput {
    const title = jsonLd.name || 'Untitled Recipe';
    const description = jsonLd.description ? stripHtml(jsonLd.description) : undefined;

    // Parse ingredients
    const ingredients: RecipeInput['ingredients'] = [];
    if (jsonLd.recipeIngredient) {
      for (const raw of jsonLd.recipeIngredient) {
        const parsed = parseIngredientString(stripHtml(raw));
        ingredients.push({
          name: parsed.name,
          quantity: parsed.quantity,
          unit: parsed.unit,
          notes: parsed.notes,
        });
      }
    }

    // Parse instructions
    const instructions = extractInstructions(jsonLd.recipeInstructions);

    // Parse servings
    const servings = parseServings(jsonLd.recipeYield);

    // Parse times
    const prepTimeMinutes = parseDuration(jsonLd.prepTime) ?? undefined;
    const cookTimeMinutes = parseDuration(jsonLd.cookTime) ?? undefined;

    // Parse tags and dietary flags
    const tags = extractTags(jsonLd);
    const dietaryFlags = extractDietaryFlags(jsonLd);

    // Parse cuisine type
    let cuisineType: string | undefined;
    if (jsonLd.recipeCuisine) {
      cuisineType = Array.isArray(jsonLd.recipeCuisine)
        ? jsonLd.recipeCuisine[0]
        : jsonLd.recipeCuisine;
    }

    const recipeInput: RecipeInput = {
      title,
      description,
      servings,
      prepTimeMinutes,
      cookTimeMinutes,
      ingredients,
      instructions,
      tags,
      sourceUrl,
      cuisineType,
      dietaryFlags,
    };

    log('info', `Parsed recipe: "${title}" (${servings} servings, ${ingredients.length} ingredients, ${instructions.length} steps)`);

    return recipeInput;
  }
}
