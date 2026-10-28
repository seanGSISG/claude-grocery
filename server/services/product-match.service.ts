/**
 * Turning a shopping line into a real King Soopers product.
 *
 * Recipe-derived names are a poor search query: they are snake_case, carry
 * preparation words, and sometimes offer a choice ("chicken or vegetable
 * broth"). Searching them verbatim returns nothing, and a silently dropped line
 * is worse than a rough match — the cart just quietly lacks dinner.
 *
 * So each line gets a ladder of queries, broadening until something matches,
 * and every result carries how it was found.
 */

import { ORGANIC } from '../config/household.js';
import { countToOrder, dimensionOf } from '../utils/item-units.js';
import type { ProductResult } from '../integrations/kroger/kroger-client.js';
import type { ShoppingItem } from './week-planner.service.js';

export type MatchConfidence = 'direct' | 'broadened' | 'none';

export interface ProductMatch {
  item: ShoppingItem;
  product: ProductResult | null;
  /** The query that found it. */
  term: string;
  confidence: MatchConfidence;
  /** Units to order, once the product's own size is taken into account. */
  quantity: number;
  /** Set when a cheaper conventional product was chosen over the organic one. */
  organicSkipped?: { organic: string; premium: number };
}

/**
 * Butcher and recipe names for things the store labels differently. Searching
 * the store's own words beats hoping the search engine knows the cut.
 */
const PRODUCT_ALIASES: Array<[RegExp, string]> = [
  [/\bboston butt\b|\bpork butt\b/, 'pork shoulder roast'],
  [/\bpicnic (roast|shoulder)\b/, 'pork shoulder roast'],
  [/\bchuck roast\b/, 'beef chuck roast'],
  [/\bskirt steak\b/, 'beef skirt steak'],
  [/\bscallions?\b/, 'green onions'],
  // A Persian cucumber is a small one sold by the bag; broadening to plain
  // "cucumber" finds a single English cucumber, which is a different vegetable
  // as far as the recipe is concerned.
  [/\bpersian cucumbers?\b/, 'mini cucumbers'],
  [/\bcoriander leaves\b/, 'cilantro'],
  [/\bcourgette\b/, 'zucchini'],
  [/\baubergine\b/, 'eggplant'],
  [/\bgarbanzo\b/, 'chickpeas'],
  [/\bconfectioners sugar\b/, 'powdered sugar'],
];

/** Words that describe the cook, not the product. */
const NOISE = new Set([
  'finely', 'roughly', 'thinly', 'freshly', 'lightly', 'well', 'plus', 'more', 'for',
  'and', 'or', 'to', 'taste', 'optional', 'divided', 'packed', 'heaping', 'generous',
  'uncooked', 'cooked', 'peeled', 'chopped', 'minced', 'diced', 'sliced', 'grated',
  'boneless', 'skinless', 'halves', 'pieces', 'large', 'small', 'medium',
]);

/**
 * The noun the line is really about: "chicken or vegetable broth" is a broth,
 * "boneless skinless chicken breasts" is a breast. A product that does not
 * contain this word is the wrong product, however well it scores otherwise.
 */
export function headNoun(item: ShoppingItem): string {
  const words = cleanName(item)
    .split(/\bor\b/)
    .pop()!
    .split(' ')
    .filter((w) => w && !NOISE.has(w));
  return words[words.length - 1] ?? '';
}

function cleanName(item: ShoppingItem): string {
  const base = (item.displayName || item.canonicalName)
    .replace(/_/g, ' ')
    .replace(/lowsodium/gi, 'low sodium')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const alias = PRODUCT_ALIASES.find(([pattern]) => pattern.test(base));
  return alias ? base.replace(alias[0], alias[1]) : base;
}

/** Product words a store would recognise, in the order to try them. */
export function searchTerms(item: ShoppingItem): string[] {
  const base = cleanName(item);

  const terms: string[] = [];
  const push = (term: string) => {
    const cleaned = term.trim();
    // Kroger rejects terms under 3 characters and over 8 words.
    if (cleaned.length >= 3 && !terms.includes(cleaned)) terms.push(cleaned.split(' ').slice(0, 8).join(' '));
  };

  if (/\bor\b/.test(base)) {
    // "chicken or vegetable broth" means chicken broth OR vegetable broth. The
    // whole phrase matches soups and rice mixes, so it is never searched.
    const [left, right] = base.split(/\bor\b/).map((part) => part.trim());
    const noun = headNoun(item);
    const leftWords = left.split(' ').filter((w) => w && !NOISE.has(w));
    const rightWords = right.split(' ').filter((w) => w && !NOISE.has(w));

    // "chicken or vegetable broth": the noun sits on the right, so the first
    // option needs it — "chicken broth".
    // "chicken stock or broth": the left is already complete, so leave it be.
    push(rightWords.length > 1 ? `${leftWords.join(' ')} ${noun}`.trim() : leftWords.join(' '));
    push(rightWords.join(' '));
    push(noun);
    return terms;
  }

  push(base);

  const words = base.split(' ').filter((w) => w && !NOISE.has(w));
  push(words.join(' '));

  // Head noun plus one qualifier, then the noun alone.
  if (words.length > 2) push(words.slice(-2).join(' '));
  if (words.length > 1) push(words[words.length - 1]);

  return terms;
}

export function isOrganic(product: ProductResult): boolean {
  return /\borganic\b/i.test(`${product.brand ?? ''} ${product.description ?? ''}`);
}

function priceOf(product: ProductResult): number | null {
  return product.promoPrice ?? product.price ?? null;
}

/**
 * Organic when the premium is reasonable, conventional when it is not.
 * Without prices on either side there is nothing to weigh, so the organic one
 * wins by preference.
 */
export function chooseByPreference(candidates: ProductResult[]): ProductResult | null {
  if (candidates.length === 0) return null;

  const best = (list: ProductResult[]) =>
    list.find((r) => r.inStock !== false) ?? list[0] ?? null;

  const organic = best(candidates.filter(isOrganic));
  const conventional = best(candidates.filter((r) => !isOrganic(r)));

  if (!ORGANIC.prefer || !organic) return conventional ?? organic;
  if (!conventional) return organic;

  const organicPrice = priceOf(organic);
  const conventionalPrice = priceOf(conventional);
  if (organicPrice == null || conventionalPrice == null) return organic;

  const premium = organicPrice - conventionalPrice;
  const withinFraction = premium <= conventionalPrice * ORGANIC.maxPremiumFraction;
  const withinDollars = premium <= ORGANIC.maxPremiumUsd;

  return withinFraction && withinDollars ? organic : conventional;
}

/**
 * In stock beats out of stock, but first the product has to actually be the
 * thing asked for: a broth search that returns "Chicken Rice with Vegetables
 * Soup" has found a soup, and no soup is a broth.
 */
export function pickProduct(
  results: ProductResult[],
  noun?: string,
  avoid?: ReadonlySet<string>
): ProductResult | null {
  if (results.length === 0) return null;

  // A product reported as wrong for this ingredient never comes back, however
  // well it otherwise scores: the household already said no to it.
  const allowed = avoid?.size ? results.filter((r) => !avoid.has(r.upc)) : results;
  const candidates = noun ? allowed.filter((r) => mentions(r, noun)) : allowed;

  return chooseByPreference(candidates);
}

/**
 * Whole-word match, not substring: "butt" must not match "butter", and
 * "lime" must not match "limeade". Plural and singular both count.
 */
function mentions(product: ProductResult, noun: string): boolean {
  const words = new Set(
    `${product.brand ?? ''} ${product.description ?? ''}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );
  return words.has(noun) || words.has(singular(noun)) || words.has(`${noun}s`) || words.has(`${noun}es`);
}

function singular(word: string): string {
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  // Only -es after a sibilant drops both letters: "peaches" -> "peach", but
  // "limes" -> "lime".
  if (/(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/**
 * How many units to order. A line measured by weight or volume becomes one
 * package unless the quantity clearly calls for more; countable lines are
 * ordered as counted.
 */
export function unitsToOrder(item: ShoppingItem): number {
  // Anything counted (each, bunch, head, pack) is ordered as counted; weights
  // and volumes become one package, since the product carries its own size.
  if (dimensionOf(item.unit) === 'count') return countToOrder(item.quantity);
  return 1;
}

export interface SearchFn {
  (term: string): Promise<ProductResult[]>;
}

/** Look a product up by the UPC bought last time. */
export interface LookupFn {
  (upc: string): Promise<ProductResult | null>;
}

export interface MatchOptions {
  /** Resolve a remembered UPC straight to its product. */
  lookup?: LookupFn;
  /** UPCs reported as wrong for this ingredient; never pick them again. */
  avoid?: ReadonlySet<string>;
}

/** Walk the ladder until something matches. */
export async function matchItem(
  item: ShoppingItem,
  search: SearchFn,
  options: MatchOptions = {}
): Promise<ProductMatch> {
  const { lookup, avoid } = options;
  const noun = headNoun(item);
  // A staple carries the UPC bought last time: no search can beat that — unless
  // that is the very product someone reported as wrong.
  if (item.upc && lookup && !avoid?.has(item.upc)) {
    try {
      const product = await lookup(item.upc);
      if (product) {
        return { item, product, term: item.upc, confidence: 'direct', quantity: unitsToOrder(item) };
      }
    } catch {
      // fall through to searching
    }
  }

  const terms = searchTerms(item);

  for (const [index, term] of terms.entries()) {
    // One retry per term: a rate-limit blip should not lose the line, and a
    // single-word ingredient has no broader query to fall back to.
    let results: ProductResult[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        results = await search(term);
        break;
      } catch {
        if (attempt === 1) results = [];
        else await new Promise((r) => setTimeout(r, 250));
      }
    }
    // Require the head noun until the last resort, where the query IS the noun.
    const isLastTerm = index === terms.length - 1;
    const product = pickProduct(results, noun, avoid) ?? (isLastTerm ? pickProduct(results, undefined, avoid) : null);
    if (product) {
      // Note when organic was on the shelf but cost too much, so the choice is
      // visible rather than silent.
      const organic = results.filter((r) => !avoid?.has(r.upc)).find(isOrganic);
      const organicSkipped =
        organic && !isOrganic(product) && organic.price != null && product.price != null
          ? { organic: organic.description, premium: Math.round((organic.price - product.price) * 100) / 100 }
          : undefined;

      return {
        item,
        product,
        term,
        confidence: index === 0 ? 'direct' : 'broadened',
        quantity: unitsToOrder(item),
        organicSkipped,
      };
    }
  }

  return { item, product: null, term: terms[0] ?? '', confidence: 'none', quantity: unitsToOrder(item) };
}

export interface MatchReport {
  matches: ProductMatch[];
  total: number;
  unmatched: ProductMatch[];
  broadened: ProductMatch[];
}

export function summarizeMatches(matches: ProductMatch[]): MatchReport {
  const total = matches.reduce(
    (sum, m) => sum + (m.product ? (m.product.promoPrice ?? m.product.price ?? 0) * m.quantity : 0),
    0
  );
  return {
    matches,
    total: Math.round(total * 100) / 100,
    unmatched: matches.filter((m) => !m.product),
    broadened: matches.filter((m) => m.confidence === 'broadened'),
  };
}
