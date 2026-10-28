/**
 * Reconciling recipe units with how things are actually sold.
 *
 * Recipes measure garlic in cloves, onions in halves and green onions in cups.
 * King Soopers sells heads, onions and bunches. Without a bridge, one
 * ingredient becomes three shopping lines ("3 clove garlic", "6 each garlic",
 * "1 large clove garlic") and the cart gets it wrong in both directions.
 */

export type Unit = string;

/** Grams per single unit, for items a recipe counts but a store weighs. */
const COUNT_WEIGHT_G: Record<string, Partial<Record<Unit, number>>> = {
  garlic: { each: 5, clove: 5, head: 45 },
  onion: { each: 150, clove: 150 },
  yellow_onion: { each: 150 },
  red_onion: { each: 150 },
  green_onion: { each: 15, bunch: 100 },
  scallion: { each: 15, bunch: 100 },
  shallot: { each: 30 },
  lime: { each: 67 },
  lemon: { each: 84 },
  avocado: { each: 200 },
  tomato: { each: 120 },
  cherry_tomato: { each: 17 },
  potato: { each: 170 },
  russet_potato: { each: 200 },
  cucumber: { each: 120 },
  persian_cucumber: { each: 60 },
  carrot: { each: 61 },
  bell_pepper: { each: 120 },
  jalapeno: { each: 14 },
  ginger: { each: 30 },
  celery: { each: 40, stalk: 40, bunch: 400 },
  corn: { each: 90, ear: 90 },
  egg: { each: 50 },
  chicken_breast: { each: 170 },
  chicken_thigh: { each: 110 },
};

/** Volume units, in millilitres. */
const VOLUME_ML: Record<Unit, number> = {
  ml: 1, milliliter: 1, milliliters: 1,
  l: 1000, liter: 1000, liters: 1000,
  tsp: 4.929, teaspoon: 4.929, teaspoons: 4.929,
  tbsp: 14.787, tablespoon: 14.787, tablespoons: 14.787,
  cup: 236.588, cups: 236.588,
  'fl oz': 29.574, floz: 29.574,
  pint: 473.176, quart: 946.353, gallon: 3785.41,
};

/** Mass units, in grams. */
const MASS_G: Record<Unit, number> = {
  g: 1, gram: 1, grams: 1,
  kg: 1000, kilogram: 1000,
  oz: 28.35, ounce: 28.35, ounces: 28.35,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
};

/** Rough density for produce measured by the cup in one recipe and by weight in another. */
const DENSITY_G_PER_ML: Record<string, number> = {
  green_onion: 0.4, scallion: 0.4, cilantro: 0.15, basil: 0.1, parsley: 0.15,
  mushroom: 0.3, baby_bella_mushroom: 0.3, spinach: 0.25, peanut: 0.6,
  // Aromatics a recipe may give as "2 tsp minced" or "3 cloves".
  garlic: 0.9, ginger: 0.9, shallot: 0.9, onion: 0.9,
  lime_juice: 1, lemon_juice: 1, broth: 1, water: 1,
};

export type Dimension = 'mass' | 'volume' | 'count';

export function dimensionOf(unit: Unit): Dimension {
  const u = unit.toLowerCase().trim();
  if (MASS_G[u]) return 'mass';
  if (VOLUME_ML[u]) return 'volume';
  return 'count';
}

/** Convert a quantity to grams when the item and unit allow it. */
export function toGrams(canonical: string, quantity: number, unit: Unit): number | null {
  const u = unit.toLowerCase().trim();
  if (MASS_G[u]) return quantity * MASS_G[u];

  if (VOLUME_ML[u]) {
    const density = DENSITY_G_PER_ML[canonical];
    return density == null ? null : quantity * VOLUME_ML[u] * density;
  }

  const perUnit = COUNT_WEIGHT_G[canonical]?.[u] ?? COUNT_WEIGHT_G[canonical]?.each;
  return perUnit == null ? null : quantity * perUnit;
}

/**
 * How this item should appear on the shopping list: countable produce is
 * easier to buy as "3 limes" than "201 g lime".
 */
export function preferredUnit(canonical: string, seen: Unit[]): Unit {
  if (COUNT_WEIGHT_G[canonical] && seen.some((u) => dimensionOf(u) === 'count')) return 'each';
  if (seen.some((u) => dimensionOf(u) === 'mass')) return 'g';
  return seen[0] ?? 'each';
}

/** Convert grams back into the unit the list will show. */
export function fromGrams(canonical: string, grams: number, unit: Unit): number | null {
  const u = unit.toLowerCase().trim();
  if (MASS_G[u]) return grams / MASS_G[u];
  const perUnit = COUNT_WEIGHT_G[canonical]?.[u] ?? COUNT_WEIGHT_G[canonical]?.each;
  if (perUnit != null) return grams / perUnit;
  if (VOLUME_ML[u] && DENSITY_G_PER_ML[canonical]) {
    return grams / (VOLUME_ML[u] * DENSITY_G_PER_ML[canonical]);
  }
  return null;
}

/**
 * Merge quantities of one ingredient expressed in different units.
 * Returns null when the units cannot be reconciled, so the caller can keep the
 * lines separate rather than inventing a number.
 */
export function mergeQuantities(
  canonical: string,
  parts: Array<{ quantity: number; unit: Unit }>
): { quantity: number; unit: Unit } | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return { ...parts[0] };

  // Same unit throughout: just add them, no conversion table needed.
  const units = new Set(parts.map((p) => p.unit.toLowerCase().trim()));
  if (units.size === 1) {
    const total = parts.reduce((sum, p) => sum + p.quantity, 0);
    return { quantity: Math.round(total * 100) / 100, unit: parts[0].unit };
  }

  let grams = 0;
  for (const part of parts) {
    const g = toGrams(canonical, part.quantity, part.unit);
    if (g == null) return null;
    grams += g;
  }

  const unit = preferredUnit(canonical, parts.map((p) => p.unit));
  const quantity = fromGrams(canonical, grams, unit);
  if (quantity == null) return null;

  // Countable things are bought whole.
  return { quantity: unit === 'each' ? Math.ceil(quantity - 0.05) : Math.round(quantity * 10) / 10, unit };
}


// ---------------------------------------------------------------------------
// Juice -> whole fruit
// ---------------------------------------------------------------------------

/** Millilitres of juice a single fruit gives, and what to buy instead. */
const JUICE_FROM_FRUIT: Record<string, { fruit: string; mlPerFruit: number }> = {
  lime_juice: { fruit: 'lime', mlPerFruit: 30 },      // ~2 tbsp
  lemon_juice: { fruit: 'lemon', mlPerFruit: 45 },    // ~3 tbsp
  orange_juice_fresh: { fruit: 'orange', mlPerFruit: 60 },
};

/**
 * Past this much, buying fruit stops making sense: a cup of lime juice is
 * eight limes to squeeze, and the bottle is the right answer.
 */
export const JUICE_BOTTLE_THRESHOLD_ML = 240;

export interface FruitSubstitution {
  canonical: string;
  quantity: number;
  unit: Unit;
  /** Fruit the juice came from, for the note on the list. */
  from: string;
}

/**
 * Convert a juice line into whole fruit, unless the recipe wants so much that
 * a bottle is more sensible. Returns null when no substitution applies.
 */
export function juiceToFruit(canonical: string, quantity: number, unit: Unit): FruitSubstitution | null {
  // Match on the ending, so "freshly_squeezed_lemon_juice" counts as lemon
  // juice however the name was normalised when it was stored.
  const key = Object.keys(JUICE_FROM_FRUIT).find(
    (k) => canonical === k || canonical.endsWith(`_${k}`)
  );
  const rule = key ? JUICE_FROM_FRUIT[key] : undefined;
  if (!rule) return null;

  const u = unit.toLowerCase().trim();
  // Already counted ("juice of 2 limes"): treat the count as fruit.
  if (dimensionOf(u) === 'count') {
    return { canonical: rule.fruit, quantity: Math.max(1, Math.ceil(quantity - 0.05)), unit: 'each', from: canonical };
  }

  const ml = VOLUME_ML[u] ? quantity * VOLUME_ML[u] : null;
  if (ml == null || ml > JUICE_BOTTLE_THRESHOLD_ML) return null;

  return {
    canonical: rule.fruit,
    quantity: Math.max(1, Math.ceil(ml / rule.mlPerFruit - 0.05)),
    unit: 'each',
    from: canonical,
  };
}


// ---------------------------------------------------------------------------
// Pre-cooked protein -> raw protein
// ---------------------------------------------------------------------------

/**
 * Recipes often call for "cooked chicken" or "rotisserie chicken" as a
 * shortcut. This household cooks its own protein, so those lines buy raw meat
 * instead — with the weight adjusted, since meat loses about 30% cooking.
 *
 * Cured and pre-cooked sausage is the exception: brats, bacon and kielbasa are
 * sold that way and nobody is curing their own.
 */
const ALREADY_COOKED_IS_FINE =
  /\b(sausage|bratwurst|brat|brats|hot_?dog|frank|bacon|ham|pepperoni|salami|chorizo|kielbasa|prosciutto|deli|lunch_?meat|andouille|smoked)\b/;

const COOKED_PREFIX = /^(cooked|precooked|pre_cooked|rotisserie|shredded_cooked|leftover)_/;

/**
 * Dishes that simmer, shred or sit in a slow cooker want thighs and shoulder:
 * they hold up for hours and taste better for it. Anything grilled, skewered
 * or stir-fried wants the lean cut.
 */
const LOW_AND_SLOW = /\b(soup|stew|curry|brais|crock|slow.?cook|shred|pulled|chili|carnitas|barbacoa|ragu|casserole|pot pie|bake)/i;

/** What to buy raw, per protein mentioned, given how it will be cooked. */
const RAW_FOR: Array<{ match: RegExp; lean: [string, string]; slow: [string, string] }> = [
  { match: /chicken/, lean: ['chicken_breast', 'chicken breast'], slow: ['chicken_thigh', 'chicken thighs'] },
  { match: /turkey/, lean: ['turkey_breast', 'turkey breast'], slow: ['turkey_thigh', 'turkey thighs'] },
  { match: /beef|steak/, lean: ['beef', 'beef'], slow: ['beef_chuck_roast', 'beef chuck roast'] },
  { match: /pork/, lean: ['pork_loin', 'pork loin'], slow: ['pork_shoulder', 'pork shoulder'] },
  { match: /shrimp/, lean: ['shrimp', 'shrimp'], slow: ['shrimp', 'shrimp'] },
];

/** Raw weight needed for a given cooked weight. */
export const COOKING_LOSS_FACTOR = 1.4;

/** Grams per millilitre of shredded cooked meat. */
const SHREDDED_DENSITY = 0.59;

/** A whole rotisserie chicken is about this much cooked meat. */
const WHOLE_BIRD_COOKED_G = 700;

export interface RawSubstitution {
  canonical: string;
  quantity: number;
  unit: Unit;
  display: string;
  from: string;
}

/**
 * @param context - the dish this ingredient belongs to (title and tags), which
 *   decides breast versus thigh.
 */
export function cookedToRaw(
  canonical: string,
  quantity: number,
  unit: Unit,
  context = ''
): RawSubstitution | null {
  if (ALREADY_COOKED_IS_FINE.test(canonical)) return null;
  if (!COOKED_PREFIX.test(canonical) && !/(^|_)(cooked|rotisserie)(_|$)/.test(canonical)) return null;

  const target = RAW_FOR.find((r) => r.match.test(canonical));
  if (!target) return null;

  // A shredded-chicken line is itself a hint, even when the title says nothing.
  const slow = LOW_AND_SLOW.test(context) || /shred|pulled/.test(canonical);
  const [rawCanonical, rawDisplay] = slow ? target.slow : target.lean;

  const u = unit.toLowerCase().trim();
  let cookedGrams: number | null = null;

  if (dimensionOf(u) === 'mass') cookedGrams = toGrams('any', quantity, u);
  else if (dimensionOf(u) === 'volume') {
    const ml = quantity * (u === 'ml' ? 1 : (toGrams('water', quantity, u) ?? 0) / quantity || 1);
    cookedGrams = ml * SHREDDED_DENSITY;
  } else cookedGrams = quantity * WHOLE_BIRD_COOKED_G;

  if (cookedGrams == null || cookedGrams <= 0) return null;

  return {
    canonical: rawCanonical,
    quantity: Math.round(cookedGrams * COOKING_LOSS_FACTOR),
    unit: 'g',
    display: rawDisplay,
    from: canonical,
  };
}


// ---------------------------------------------------------------------------
// Counted pieces -> what the store sells
// ---------------------------------------------------------------------------

/**
 * Produce a recipe counts one piece at a time but the store sells by the
 * bundle. Eleven green onions is one bunch, not eleven bunches — and that
 * distinction is the difference between a garnish and a wheelbarrow.
 */
const SOLD_IN_PACKS: Record<string, { piecesPerPack: number; packUnit: string; maxPacks?: number }> = {
  green_onion: { piecesPerPack: 12, packUnit: 'bunch' },
  scallion: { piecesPerPack: 12, packUnit: 'bunch' },
  cilantro: { piecesPerPack: 1, packUnit: 'bunch', maxPacks: 2 },
  fresh_cilantro: { piecesPerPack: 1, packUnit: 'bunch', maxPacks: 2 },
  parsley: { piecesPerPack: 1, packUnit: 'bunch', maxPacks: 2 },
  fresh_parsley: { piecesPerPack: 1, packUnit: 'bunch', maxPacks: 2 },
  fresh_basil: { piecesPerPack: 1, packUnit: 'bunch', maxPacks: 2 },
  fresh_thyme: { piecesPerPack: 1, packUnit: 'bunch', maxPacks: 2 },
  fresh_mint: { piecesPerPack: 1, packUnit: 'bunch', maxPacks: 2 },
  mint: { piecesPerPack: 1, packUnit: 'bunch', maxPacks: 2 },
  fresh_dill: { piecesPerPack: 1, packUnit: 'bunch', maxPacks: 2 },
  dill: { piecesPerPack: 1, packUnit: 'bunch', maxPacks: 2 },
  fresh_rosemary: { piecesPerPack: 1, packUnit: 'bunch', maxPacks: 2 },
  fresh_sage: { piecesPerPack: 1, packUnit: 'bunch', maxPacks: 2 },
  fresh_oregano: { piecesPerPack: 1, packUnit: 'bunch', maxPacks: 2 },
  // Persian and mini cucumbers are sold by the bag, six or so at a time — a
  // recipe asking for five of them wants one bag, not five cucumbers.
  persian_cucumber: { piecesPerPack: 6, packUnit: 'pack' },
  mini_cucumber: { piecesPerPack: 6, packUnit: 'pack' },
  celery: { piecesPerPack: 10, packUnit: 'bunch' },
  garlic: { piecesPerPack: 10, packUnit: 'head' },
  asparagus: { piecesPerPack: 20, packUnit: 'bunch' },
  radish: { piecesPerPack: 8, packUnit: 'bunch' },
};

export interface PackQuantity {
  quantity: number;
  unit: string;
  /** What the pieces added up to, for the note on the list. */
  pieces: number;
}

/**
 * Convert counted pieces into packs to buy. Returns null when the item is not
 * sold that way, or when the line is already measured by weight or volume.
 */
export function toPackages(canonical: string, quantity: number, unit: Unit): PackQuantity | null {
  // The normaliser leaves some names plural ("persian_cucumbers"), and a pack
  // rule that only matches the singular silently does nothing.
  const pack =
    SOLD_IN_PACKS[canonical] ??
    (canonical.endsWith('s') ? SOLD_IN_PACKS[canonical.slice(0, -1)] : undefined);
  if (!pack) return null;
  if (dimensionOf(unit) !== 'count') return null;
  if (unit.toLowerCase() === pack.packUnit) return null; // already in packs

  // Bunches are not counted precisely — a "bunch of 12" green onions is 10 to
  // 12 — so allow a little overrun before buying another one.
  const packs = Math.max(1, Math.ceil(quantity / pack.piecesPerPack - 0.15));
  // Herbs are the exception to buying what the arithmetic says: three recipes
  // each garnishing with cilantro do not need three bunches, they need one that
  // gets used up. Two is the ceiling, so nothing rots in the drawer.
  const capped = pack.maxPacks ? Math.min(packs, pack.maxPacks) : packs;
  return { quantity: capped, unit: pack.packUnit, pieces: quantity };
}

// ---------------------------------------------------------------------------
// Amounts the recipe never really gave
// ---------------------------------------------------------------------------

/**
 * "Handful fresh cilantro", "Lime wedges", "Cilantro, for garnish".
 *
 * The parser has to store something, so it stores 1 each — a number the recipe
 * never gave. Scaling that by 3 for a bigger household is how one handful of
 * cilantro became six bunches and a garnish of lime wedges became six limes.
 * A garnish is a garnish whoever is eating: buy one and move on.
 */
const UNQUANTIFIED =
  /\b(?:handful|pinch|dash|splash|drizzle|sprinkle|garnish|to taste|as needed|for serving|to serve|optional|few|couple|some)\b/i;

/** Serving shapes that carry no count of their own: "lime wedges", "sprigs". */
const SERVING_SHAPE = /\b(?:wedges?|sprigs?|leaves|slices?|strips?|to taste|for garnish|for serving)\b/i;

/**
 * Amounts the importer mangled, read back out of the line it left behind.
 *
 * The recipe parser stops at the first word it does not recognise, so
 * "4 heaping tablespoons Thai red curry paste" was stored as 4 *each* — four
 * jars of curry paste — and "3.5 ounces uncooked rice noodles" as 3 each, the
 * ".5 ounces" left stranded in the name. Both are recoverable from the text
 * without re-importing anything, which matters because the recipes are already
 * in the database.
 */
const MEASURE_IN_NAME =
  /^[^a-z0-9]*(?:\d[\d\s./-]*)?\s*(?:heaping|generous|scant|rounded|level|packed|large|small)?\s*\b(c|cups?|tbsps?|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|milliliters?|l|liters?|pints?|quarts?|gallons?|cloves?|sticks?)\b\.?/i;

/** A decimal the importer tore off the front of the quantity: ".5 ounces …". */
const STRANDED_DECIMAL = /^\s*(\.\d+)/;

export function salvageAmount(
  rawName: string,
  quantity: number,
  unit: Unit
): { quantity: number; unit: Unit } {
  // Only ever rescues a bare count; a line that already carries a real unit is
  // left exactly as the importer read it.
  if (dimensionOf(unit) !== 'count' || unit.toLowerCase() !== 'each') return { quantity, unit };

  let recovered = quantity;
  let text = rawName;

  const stranded = text.match(STRANDED_DECIMAL);
  if (stranded && Number.isInteger(quantity)) {
    recovered = Number(`${quantity}${stranded[1]}`);
    text = text.slice(stranded[0].length);
  }

  const measure = text.match(MEASURE_IN_NAME);
  if (!measure) return { quantity: recovered, unit };

  const found = measure[1].toLowerCase().replace(/\.$/, '');
  const normalized = found === 'c' ? 'cup' : found;
  // Only a weight or a volume is worth adopting. "3 cloves garlic" is already
  // a count, and swapping one count word for another gains nothing.
  if (dimensionOf(normalized) === 'count') return { quantity: recovered, unit };
  return { quantity: recovered, unit: normalized };
}

/**
 * Nobody in this house needs sixteen cucumbers.
 *
 * The backstop for a unit bug nobody has thought of yet: past this many of one
 * counted thing, the number is far more likely to be wrong than the week to be
 * unusual. The line is capped and the cap is reported, so it shows up in Slack
 * instead of in the cart.
 */
export const MAX_UNITS_PER_LINE = 12;

export function capCount(quantity: number, unit: Unit): number {
  return dimensionOf(unit) === 'count' ? Math.min(quantity, MAX_UNITS_PER_LINE) : quantity;
}

export function isUnquantified(rawName: string, quantity: number, unit: Unit): boolean {
  // Only ever applies to a bare count of one — a real "2 cups cilantro" stands.
  if (dimensionOf(unit) !== 'count' || quantity > 1) return false;
  return UNQUANTIFIED.test(rawName) || SERVING_SHAPE.test(rawName);
}

// ---------------------------------------------------------------------------
// Showing amounts in US units
// ---------------------------------------------------------------------------

/**
 * The list is read in a US kitchen and shopped in a US store, so nothing metric
 * reaches the page. Recipes state grams and millilitres, and merging keeps
 * grams internally; the conversion happens at the moment of display.
 *
 * The unit chosen is the one a person would say out loud: ounces below
 * three-quarters of a pound, teaspoons below a tablespoon, cups past about six
 * tablespoons, quarts past a litre. Imperial input runs through the same ladder,
 * so "12 fl oz" tidies up to "1 1/2 cups" and "16 oz" to "1 lb".
 */
const IMPERIAL_LADDER: Array<{ maxMl: number; unit: Unit }> = [
  // 1 tbsp is 14.787 ml, so the teaspoon band stops just short of it.
  { maxMl: 14, unit: 'tsp' },
  // Six tablespoons is still said in tablespoons; seven is half a cup.
  { maxMl: 90, unit: 'tbsp' },
  // A quart is 946 ml: at exactly a quart, say quart rather than four cups.
  { maxMl: 946, unit: 'cup' },
  { maxMl: 3785, unit: 'quart' },
  { maxMl: Infinity, unit: 'gallon' },
];

/** Three-quarters of a pound: past this, ounces stop being the natural unit. */
const OUNCES_UNTIL_G = 340;

export function toImperial(quantity: number, unit: Unit): { quantity: number; unit: Unit } {
  const u = unit.toLowerCase().trim();

  if (MASS_G[u]) {
    const grams = quantity * MASS_G[u];
    return grams >= OUNCES_UNTIL_G
      ? { quantity: grams / MASS_G.lb, unit: 'lb' }
      : { quantity: grams / MASS_G.oz, unit: 'oz' };
  }

  if (VOLUME_ML[u]) {
    const ml = quantity * VOLUME_ML[u];
    const band = IMPERIAL_LADDER.find((b) => ml < b.maxMl) ?? IMPERIAL_LADDER[IMPERIAL_LADDER.length - 1];
    return { quantity: ml / VOLUME_ML[band.unit], unit: band.unit };
  }

  return { quantity, unit };
}

/** The fractions a kitchen uses; anything else rounds to the nearest of them. */
const EIGHTHS: Array<[value: number, label: string]> = [
  [0, ''], [1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [1 / 2, '1/2'],
  [2 / 3, '2/3'], [3 / 4, '3/4'], [7 / 8, '7/8'], [1, ''],
];

/** "1 1/2", "3/4", "12" — never "1.4732 cups". */
export function formatQuantity(value: number): string {
  if (value >= 10) return String(Math.round(value));

  const whole = Math.floor(value + 1e-9);
  const fraction = value - whole;
  let nearest = EIGHTHS[0];
  for (const step of EIGHTHS) {
    if (Math.abs(fraction - step[0]) < Math.abs(fraction - nearest[0])) nearest = step;
  }

  const carried = nearest[0] === 1 ? whole + 1 : whole;
  const label = nearest[0] === 1 ? '' : nearest[1];

  // A real but tiny amount is an eighth, never nothing.
  if (carried === 0 && !label) return value > 0 ? '1/8' : '0';
  return label ? `${carried || ''} ${label}`.trim() : String(carried);
}

/**
 * Countable things are bought whole, so the list shows what the cart will hold.
 * The 0.05 slack keeps 12.0000001 stalks of green onion at one bunch.
 */
export function countToOrder(quantity: number): number {
  return Math.max(1, Math.ceil(quantity - 0.05));
}

const PLURALS: Record<string, string> = {
  cup: 'cups', quart: 'quarts', gallon: 'gallons', pint: 'pints',
  bunch: 'bunches', head: 'heads', clove: 'cloves', pack: 'packs',
  can: 'cans', jar: 'jars', bag: 'bags', box: 'boxes', bottle: 'bottles',
  stalk: 'stalks', sprig: 'sprigs', slice: 'slices', piece: 'pieces',
};

function plural(unit: Unit, quantity: number): Unit {
  return quantity > 1 ? PLURALS[unit] ?? unit : unit;
}

/** One amount, ready to print: "1 1/2 lb", "3 cups", "2 bunches", "4". */
export function formatAmount(quantity: number, unit: Unit): string {
  if (dimensionOf(unit) === 'count') {
    const whole = countToOrder(quantity);
    const u = unit.toLowerCase().trim();
    return u === 'each' ? String(whole) : `${whole} ${plural(u, whole)}`;
  }

  const converted = toImperial(quantity, unit);
  // Pluralise on what is printed, not on the raw float: 32 fl oz divides into
  // 1.0000158 quarts, and "1 quarts" reads like a bug because it is one.
  const shown = Math.round(converted.quantity * 8) / 8;
  return `${formatQuantity(converted.quantity)} ${plural(converted.unit, shown)}`;
}
