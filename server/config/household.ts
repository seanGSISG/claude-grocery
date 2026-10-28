/**
 * Who lives here, who drives, and how calendar events map to people.
 *
 * The planner cares about one thing per night: is an adult home and free
 * between about 4:30 and 7 pm? Everything else (which child, which rink)
 * only matters because it answers that.
 */

export type PersonId = 'ty' | 'joslin' | 'camden' | 'eli' | 'ivy';

export interface Person {
  id: PersonId;
  name: string;
  isAdult: boolean;
  /** Needs an adult to drive them to events. */
  needsDriver: boolean;
  /** Adult-equivalent portions, used when scaling recipes. */
  portion: number;
}

export const HOUSEHOLD: Person[] = [
  { id: 'ty', name: 'Ty', isAdult: true, needsDriver: false, portion: 1 },
  { id: 'joslin', name: 'Joslin', isAdult: true, needsDriver: false, portion: 1 },
  { id: 'camden', name: 'Camden', isAdult: false, needsDriver: true, portion: 1 },
  { id: 'eli', name: 'Eli', isAdult: false, needsDriver: true, portion: 0.6 },
  { id: 'ivy', name: 'Ivy', isAdult: false, needsDriver: true, portion: 0.6 },
];

export interface EventRule {
  /** Matched against the event summary, case-insensitive. */
  match: RegExp;
  who: PersonId[];
  /**
   * Which adult it ties up. 'fixed' means that adult always goes (Ty coaches
   * Eli's team); 'any' means whichever parent is free drives; 'none' means no
   * adult is consumed beyond whoever is named in `who`.
   */
  driver: { kind: 'fixed'; person: PersonId } | { kind: 'any' } | { kind: 'none' };
  /** At the house: nobody leaves, so cooking is unaffected. */
  atHome?: boolean;
  label?: string;
}

export const EVENT_RULES: EventRule[] = [
  // Ty coaches Eli's 12U team, so he attends whether or not he is the driver.
  { match: /12U\s*A\s*Red/i, who: ['eli', 'ty'], driver: { kind: 'fixed', person: 'ty' }, label: 'Eli hockey (Ty coaches)' },
  { match: /14U\s*AA\s*Prospects/i, who: ['camden'], driver: { kind: 'any' }, label: 'Camden hockey' },
  { match: /Kings\s*2031/i, who: ['camden'], driver: { kind: 'any' }, label: 'Camden lacrosse' },
  { match: /Sweetlax|2034/i, who: ['eli'], driver: { kind: 'any' }, label: 'Eli lacrosse' },
  { match: /gymnastics/i, who: ['ivy'], driver: { kind: 'any' }, label: 'Ivy gymnastics' },
  { match: /Loonies|Tropics/i, who: ['ty'], driver: { kind: 'none' }, label: 'Ty hockey' },
  // Lessons happen at the house: an adult is home by definition.
  { match: /piano|guitar|lesson/i, who: ['camden', 'eli', 'ivy'], driver: { kind: 'none' }, atHome: true, label: 'Music lesson at home' },
];

/**
 * Dietary preferences, as stated: gluten is avoided where a swap is easy
 * (tamari for soy sauce, rice noodles, GF bread) but not treated as an
 * allergy. Lactose is kept light for Ty and Eli. Ivy eats mild.
 */
export const DIET = {
  gluten: 'prefer-free' as const, // not celiac: a wheat-containing sauce is not a blocker
  lactose: 'light' as const,
  heat: 'mild-with-heat-on-the-side' as const,
  schoolSnacks: { noNuts: true, noCandy: true },
};

/**
 * Things the kitchen always has. These never reach the shopping list from a
 * recipe — only an explicit "add paprika" puts one in the cart.
 *
 * Fresh herbs are deliberately absent: the normalizer maps "fresh basil" to
 * `fresh_basil`, which is bought, while `dried_basil` is assumed.
 */
export const PANTRY_ALWAYS_HAVE = new Set([
  // Seasoning
  'salt', 'kosher_salt', 'sea_salt', 'table_salt', 'salt_pepper', 'salt_and_pepper',
  'pepper', 'black_pepper', 'freshly_ground_black_pepper', 'ground_black_pepper',
  'white_pepper', 'pepper_to_taste', 'salt_to_taste',
  // Spice rack
  'paprika', 'smoked_paprika', 'cumin', 'turmeric', 'cayenne', 'cayenne_pepper',
  'chili_powder', 'curry_powder', 'coriander', 'cinnamon', 'nutmeg', 'allspice',
  'cloves', 'cardamom', 'garlic_powder', 'onion_powder', 'mustard_powder',
  'red_pepper_flakes', 'crushed_red_pepper', 'italian_seasoning', 'bay_leaf', 'bay_leaves',
  'sesame_seeds', 'vanilla_extract',
  // Staples
  'water', 'ice', 'cooking_spray',
  'olive_oil', 'extra_virgin_olive_oil', 'extravirgin_olive_oil', 'vegetable_oil',
  'canola_oil', 'sesame_oil',
  'sugar', 'granulated_sugar', 'brown_sugar', 'dark_brown_sugar',
  'flour', 'all_purpose_flour', 'baking_powder', 'baking_soda', 'cornstarch',
]);

/**
 * Anything dried or ground is a spice-rack item by default, so a recipe calling
 * for dried oregano or ground ginger does not add a jar to the order.
 */
const PANTRY_PREFIXES = [/^dried_/, /^ground_(?!beef|pork|turkey|chicken|lamb|sausage)/];

export function isAssumedPantry(canonical: string): boolean {
  if (PANTRY_ALWAYS_HAVE.has(canonical)) return true;
  return PANTRY_PREFIXES.some((pattern) => pattern.test(canonical));
}

/**
 * Fresh produce and raw meat are bought for a particular dish, in the cut and
 * amount that dish needs. Purchase history shows them coming home most weeks,
 * which makes them look like staples, but "we usually have onions by now" is not
 * a reason to buy onions: either a recipe calls for them this week or nothing
 * does. So they are never added on a rhythm — only by a recipe, or because
 * someone asked for them.
 *
 * Anything prepared, frozen or shelf-stable is a different thing entirely, even
 * when its name contains one of these words: frozen chicken nuggets, chicken
 * broth, and sour cream and onion chips all run out and get replaced on a
 * rhythm, so they stay staples.
 */
const RECIPE_ONLY = [
  /\bonions?\b/i,
  /\bbroccoli(ni)?\b/i,
  /\bground\s+(beef|chuck|sirloin|round)\b/i,
  /\bchuck\b/i,
  /\bchicken\b/i,
];

const PREPARED_OR_PANTRY =
  /\b(frozen|breaded|nugget|patt(y|ies)|jerky|snack|deli|lunch\s?meat|rotisserie|sausage|brat|bacon|canned|broth|stock|bouillon|soup|ramen|gravy|sauce|salsa|dip|dressing|powder|salt|seasoning|seasoned|flavou?r(ed)?|mix|chips?|crackers?|rings?|bagels?|pizza|burrito|taquito|pot\s?pie|noodle)\b/i;

/**
 * Whether a purchase-history row describes something only a recipe should buy.
 * Takes the product description, since that is what history records — canonical
 * names work too.
 */
export function isRecipeOnly(description: string): boolean {
  const text = description.replace(/_/g, ' ');
  if (PREPARED_OR_PANTRY.test(text)) return false;
  return RECIPE_ONLY.some((pattern) => pattern.test(text));
}

/**
 * Organic is preferred, but not at any price. Pick the organic version when it
 * costs no more than a third extra and no more than $2 extra outright —
 * organic bananas at +30c, yes; organic berries at double, no.
 */
export const ORGANIC = {
  prefer: true,
  maxPremiumFraction: 0.35,
  maxPremiumUsd: 2,
};

export const ADULTS: PersonId[] = HOUSEHOLD.filter((p) => p.isAdult).map((p) => p.id);

/** Adult-equivalent portions for a full family dinner. */
export const FAMILY_PORTIONS = HOUSEHOLD.reduce((sum, p) => sum + p.portion, 0);

export function ruleFor(summary: string): EventRule | null {
  return EVENT_RULES.find((rule) => rule.match.test(summary)) ?? null;
}
