import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PantryRepository } from '../db/repositories/pantry.repo.js';
import { normalizeIngredientName } from '../utils/ingredient-normalizer.js';
import { log } from '../utils/logger.js';

interface PantryToolsContext {
  pantryRepo: PantryRepository;
}

export function registerPantryTools(server: McpServer, ctx: PantryToolsContext): void {
  server.registerTool(
    'manage_pantry',
    {
      description:
        'Manage pantry staples (items the user always has on hand and should NOT appear on grocery lists). ' +
        'Actions: "list" shows current staples, "add" adds new items, "remove" removes items by name, ' +
        '"reset" restores the default staple list. Common staples include salt, pepper, olive oil, butter, etc.',
      inputSchema: {
        action: z.enum(['list', 'add', 'remove', 'reset']).describe('Pantry management action'),
        items: z
          .array(
            z.object({
              name: z.string().describe('Item name, e.g. "olive oil", "garlic powder"'),
              category: z
                .enum([
                  'oil_fat',
                  'vinegar_acid',
                  'seasoning',
                  'spice',
                  'condiment',
                  'baking',
                  'grain',
                  'sweetener',
                  'dairy_basic',
                  'other',
                ])
                .optional()
                .describe('Category for the staple item'),
            })
          )
          .optional()
          .describe('Items to add (required for "add" action)'),
        names: z
          .array(z.string())
          .optional()
          .describe('Canonical names of items to remove (required for "remove" action)'),
      },
    },
    async ({ action, items, names }) => {
      try {
        switch (action) {
          case 'list': {
            const staples = ctx.pantryRepo.getAll();
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    count: staples.length,
                    staples,
                  }),
                },
              ],
            };
          }

          case 'add': {
            if (!items || items.length === 0) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify({ error: 'Provide "items" array when using "add" action.' }),
                  },
                ],
                isError: true,
              };
            }

            const toAdd = items.map((item) => ({
              name: item.name,
              canonicalName: normalizeIngredientName(item.name),
              category: item.category,
            }));

            const added = ctx.pantryRepo.add(toAdd);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    status: 'added',
                    addedCount: added.length,
                    added,
                  }),
                },
              ],
            };
          }

          case 'remove': {
            if (!names || names.length === 0) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify({ error: 'Provide "names" array of canonical names when using "remove" action.' }),
                  },
                ],
                isError: true,
              };
            }

            const removedCount = ctx.pantryRepo.remove(names);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    status: 'removed',
                    removedCount,
                    requestedNames: names,
                  }),
                },
              ],
            };
          }

          case 'reset': {
            ctx.pantryRepo.resetDefaults();
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    status: 'reset',
                    message: 'Pantry staples cleared. Default staples will be restored on next server restart.',
                  }),
                },
              ],
            };
          }

          default:
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({ error: `Unknown action: ${action}` }),
                },
              ],
              isError: true,
            };
        }
      } catch (error) {
        log('error', 'manage_pantry failed', error);
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
