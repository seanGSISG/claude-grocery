/**
 * Walmart deep link generator.
 *
 * Generates search URLs for Walmart.com. No API key required --
 * these are simple URL-based links that open in the user's browser.
 * Supports optional affiliate tags for attribution.
 */

import { log } from '../../utils/logger.js';

const WALMART_SEARCH_BASE = 'https://www.walmart.com/search';

export interface WalmartLinkItem {
  name: string;
  quantity?: number;
  unit?: string;
}

export interface WalmartBulkLinkResult {
  name: string;
  quantity: string;
  url: string;
}

export class WalmartLinks {
  private readonly affiliateTag: string | null;

  constructor(affiliateTag?: string) {
    this.affiliateTag = affiliateTag ?? null;
  }

  /**
   * Generate a Walmart search URL for a single product name.
   */
  generateSearchLink(productName: string): string {
    if (!productName.trim()) {
      log('warn', 'Empty product name passed to generateSearchLink');
      return WALMART_SEARCH_BASE;
    }

    const params = new URLSearchParams({ q: productName.trim() });

    if (this.affiliateTag) {
      params.set('affiliates', this.affiliateTag);
    }

    return `${WALMART_SEARCH_BASE}?${params.toString()}`;
  }

  /**
   * Generate search links for a list of grocery items.
   *
   * The search query incorporates quantity and unit for better results
   * (e.g. "2 lb chicken breast").
   */
  generateBulkLinks(items: WalmartLinkItem[]): WalmartBulkLinkResult[] {
    return items.map((item) => {
      // Build a descriptive search term
      const parts: string[] = [];
      if (item.quantity !== undefined && item.quantity > 0) {
        parts.push(String(item.quantity));
      }
      if (item.unit) {
        parts.push(item.unit);
      }
      parts.push(item.name);

      const searchTerm = parts.join(' ');

      // Build display quantity string
      const quantityDisplay =
        item.quantity !== undefined
          ? item.unit
            ? `${item.quantity} ${item.unit}`
            : String(item.quantity)
          : '1';

      return {
        name: item.name,
        quantity: quantityDisplay,
        url: this.generateSearchLink(searchTerm),
      };
    });
  }
}
