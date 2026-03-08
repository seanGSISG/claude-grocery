import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GroceryListRepository } from '../db/repositories/grocery-list.repo.js';
import type { MealPlanRepository } from '../db/repositories/meal-plan.repo.js';
import type { GroceryListService } from '../services/grocery-list.service.js';
import { log } from '../utils/logger.js';

interface GroceryListToolsContext {
  groceryListRepo: GroceryListRepository;
  mealPlanRepo: MealPlanRepository;
  groceryListService: GroceryListService;
}

export function registerGroceryListTools(server: McpServer, ctx: GroceryListToolsContext): void {
  // --- generate_grocery_list ---
  server.registerTool(
    'generate_grocery_list',
    {
      description:
        'Generate a consolidated grocery list from a meal plan. Aggregates all ingredients across ' +
        'recipes, deduplicates and converts units, excludes pantry staples, and organizes ' +
        'items by store department. This is the primary way to create a shopping list.',
      inputSchema: {
        mealPlanId: z.string().describe('ID of the meal plan to generate a grocery list from'),
        name: z.string().optional().describe('Optional name for the grocery list'),
      },
    },
    async ({ mealPlanId, name }) => {
      try {
        // Verify meal plan exists
        const plan = ctx.mealPlanRepo.getById(mealPlanId);
        if (!plan) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: `Meal plan not found: ${mealPlanId}` }),
              },
            ],
            isError: true,
          };
        }

        const groceryList = ctx.groceryListService.generate(mealPlanId, name);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'generated',
                groceryList,
                summary: {
                  totalItems: groceryList.items.length,
                  estimatedCost: groceryList.totalEstimatedCost,
                  departments: [...new Set(groceryList.items.map((i) => i.department))],
                },
              }),
            },
          ],
        };
      } catch (error) {
        log('error', 'generate_grocery_list failed', error);
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

  // --- modify_grocery_list ---
  server.registerTool(
    'modify_grocery_list',
    {
      description:
        'Modify an existing grocery list. Actions: "add_items" to add new items, ' +
        '"remove_items" to remove items by ID, "update_item" to change quantity/unit/checked status, ' +
        '"get" to retrieve the current list.',
      inputSchema: {
        action: z.enum(['get', 'add_items', 'remove_items', 'update_item']).describe('Modification action'),
        groceryListId: z.string().optional().describe('Grocery list ID (omit to use the most recent list)'),
        addItems: z
          .array(
            z.object({
              name: z.string().describe('Item name'),
              quantity: z.number().describe('Quantity'),
              unit: z.string().describe('Unit, e.g. "lb", "each", "oz"'),
              department: z.string().optional().describe('Store department, e.g. "Produce", "Dairy"'),
            })
          )
          .optional()
          .describe('Items to add (required for "add_items" action)'),
        removeItemIds: z
          .array(z.string())
          .optional()
          .describe('Item IDs to remove (required for "remove_items" action)'),
        updateItemId: z.string().optional().describe('Item ID to update (required for "update_item" action)'),
        updateData: z
          .object({
            quantity: z.number().optional().describe('New quantity'),
            unit: z.string().optional().describe('New unit'),
            checked: z.boolean().optional().describe('Whether the item has been checked off'),
          })
          .optional()
          .describe('Fields to update (required for "update_item" action)'),
      },
    },
    async ({ action, groceryListId, addItems, removeItemIds, updateItemId, updateData }) => {
      try {
        // Resolve grocery list
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
                    : 'No grocery list exists yet. Use generate_grocery_list first.',
                }),
              },
            ],
            isError: true,
          };
        }

        switch (action) {
          case 'get': {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(list) }],
            };
          }

          case 'add_items': {
            if (!addItems || addItems.length === 0) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify({ error: 'Provide "addItems" array when using "add_items" action.' }),
                  },
                ],
                isError: true,
              };
            }

            ctx.groceryListRepo.addItems(list.id, addItems);
            const updated = ctx.groceryListRepo.getById(list.id)!;
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({ status: 'items_added', groceryList: updated }),
                },
              ],
            };
          }

          case 'remove_items': {
            if (!removeItemIds || removeItemIds.length === 0) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify({ error: 'Provide "removeItemIds" array when using "remove_items" action.' }),
                  },
                ],
                isError: true,
              };
            }

            const removedCount = ctx.groceryListRepo.removeItems(list.id, removeItemIds);
            const updated = ctx.groceryListRepo.getById(list.id)!;
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({ status: 'items_removed', removedCount, groceryList: updated }),
                },
              ],
            };
          }

          case 'update_item': {
            if (!updateItemId) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify({ error: 'Provide "updateItemId" when using "update_item" action.' }),
                  },
                ],
                isError: true,
              };
            }

            if (!updateData) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify({ error: 'Provide "updateData" object when using "update_item" action.' }),
                  },
                ],
                isError: true,
              };
            }

            ctx.groceryListRepo.updateItem(updateItemId, updateData);
            const updated = ctx.groceryListRepo.getById(list.id)!;
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({ status: 'item_updated', groceryList: updated }),
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
        log('error', 'modify_grocery_list failed', error);
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
