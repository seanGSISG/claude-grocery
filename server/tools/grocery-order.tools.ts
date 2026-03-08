import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GroceryListRepository } from '../db/repositories/grocery-list.repo.js';
import type { KrogerClient } from '../integrations/kroger/kroger-client.js';
import type { InstacartClient } from '../integrations/instacart/instacart-client.js';
import type { WalmartLinks } from '../integrations/walmart/walmart-links.js';
import { log } from '../utils/logger.js';

interface GroceryOrderToolsContext {
  groceryListRepo: GroceryListRepository;
  krogerClient: KrogerClient | null;
  instacartClient: InstacartClient | null;
  walmartLinks: WalmartLinks;
}

export function registerGroceryOrderTools(server: McpServer, ctx: GroceryOrderToolsContext): void {
  // --- search_kroger_products ---
  server.registerTool(
    'search_kroger_products',
    {
      description:
        'Search for products on Kroger/King Soopers by keyword. Returns product details including ' +
        'price, size, aisle location, and availability. Requires a Kroger location ID (use ' +
        'find_nearby_stores first) and Kroger API credentials to be configured.',
      inputSchema: {
        term: z.string().describe('Search term, e.g. "chicken breast" or "whole wheat bread"'),
        locationId: z.string().describe('Kroger location ID (required - use find_nearby_stores to get one)'),
        limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10)'),
      },
    },
    async ({ term, locationId, limit }) => {
      if (!ctx.krogerClient) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Kroger API is not configured. Set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET environment variables.',
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        const products = await ctx.krogerClient.searchProducts(
          term,
          locationId,
          limit || 10,
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                searchTerm: term,
                locationId,
                resultCount: products.length,
                products,
              }),
            },
          ],
        };
      } catch (error) {
        log('error', 'search_kroger_products failed', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: String(error) }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- add_to_kroger_cart ---
  server.registerTool(
    'add_to_kroger_cart',
    {
      description:
        'Note: Adding to the Kroger cart requires user-level OAuth authentication which is not yet ' +
        'implemented. This tool is a placeholder. For now, use search_kroger_products to find items ' +
        'and provide the user with product details to add manually.',
      inputSchema: {
        locationId: z.string().describe('Kroger location ID'),
        items: z
          .array(
            z.object({
              upc: z.string().describe('Product UPC from search_kroger_products'),
              quantity: z.number().int().min(1).describe('Number of this item to add'),
            })
          )
          .describe('Items to add to the cart'),
      },
    },
    async ({ locationId, items }) => {
      if (!ctx.krogerClient) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Kroger API is not configured. Set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET environment variables.',
              }),
            },
          ],
          isError: true,
        };
      }

      // Cart operations require user-level OAuth (authorization_code grant).
      // The current client only has client_credentials (application-level) access.
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: 'Cart operations require user-level OAuth authentication, which is not yet configured. ' +
                'Use search_kroger_products to find items, then add them manually at kroger.com.',
              locationId,
              requestedItems: items,
            }),
          },
        ],
        isError: true,
      };
    }
  );

  // --- create_instacart_list ---
  server.registerTool(
    'create_instacart_list',
    {
      description:
        'Create an Instacart shopping list from a grocery list. Generates a shareable Instacart URL ' +
        'that the user can open to review and order. Requires Instacart integration to be configured.',
      inputSchema: {
        groceryListId: z
          .string()
          .optional()
          .describe('Grocery list ID (omit to use the most recent list)'),
        title: z
          .string()
          .optional()
          .describe('Title for the Instacart list (default: grocery list name)'),
      },
    },
    async ({ groceryListId, title }) => {
      if (!ctx.instacartClient) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Instacart integration is not configured. Set INSTACART_API_KEY environment variable.',
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        const list = groceryListId
          ? ctx.groceryListRepo.getById(groceryListId)
          : ctx.groceryListRepo.getCurrent();

        if (!list) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: groceryListId
                    ? `Grocery list not found: ${groceryListId}`
                    : 'No grocery list exists. Use generate_grocery_list first.',
                }),
              },
            ],
            isError: true,
          };
        }

        const instacartItems = list.items
          .filter((item) => !item.checked)
          .map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
          }));

        const listUrl = await ctx.instacartClient.createShoppingList(
          title || list.name,
          instacartItems,
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'instacart_list_created',
                listUrl,
                itemCount: instacartItems.length,
              }),
            },
          ],
        };
      } catch (error) {
        log('error', 'create_instacart_list failed', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: String(error) }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- generate_walmart_links ---
  server.registerTool(
    'generate_walmart_links',
    {
      description:
        'Generate Walmart.com search links for each item on a grocery list. Returns URLs that ' +
        'the user can click to find and add items on Walmart\'s website. Works without API keys.',
      inputSchema: {
        groceryListId: z
          .string()
          .optional()
          .describe('Grocery list ID (omit to use the most recent list)'),
      },
    },
    async ({ groceryListId }) => {
      try {
        const list = groceryListId
          ? ctx.groceryListRepo.getById(groceryListId)
          : ctx.groceryListRepo.getCurrent();

        if (!list) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: groceryListId
                    ? `Grocery list not found: ${groceryListId}`
                    : 'No grocery list exists. Use generate_grocery_list first.',
                }),
              },
            ],
            isError: true,
          };
        }

        const uncheckedItems = list.items
          .filter((item) => !item.checked)
          .map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
          }));

        const links = ctx.walmartLinks.generateBulkLinks(uncheckedItems);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'links_generated',
                itemCount: links.length,
                links,
              }),
            },
          ],
        };
      } catch (error) {
        log('error', 'generate_walmart_links failed', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: String(error) }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
