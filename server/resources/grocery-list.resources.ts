import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GroceryListRepository } from '../db/repositories/grocery-list.repo.js';
import { log } from '../utils/logger.js';

export function registerGroceryListResources(
  server: McpServer,
  groceryListRepo: GroceryListRepository,
): void {
  server.resource(
    'current-grocery-list',
    'grocery://grocery-list/current',
    {
      description: 'The most recent grocery list with items organized by department, quantities, and estimated prices.',
      mimeType: 'application/json',
    },
    async (uri) => {
      log('debug', 'Reading current grocery list resource');

      const list = groceryListRepo.getCurrent();

      if (!list) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              status: 'no_list',
              message: 'No grocery list exists yet. Generate one from a meal plan using the generate-grocery-list tool.',
            }, null, 2),
          }],
        };
      }

      // Group items by department
      const byDepartment: Record<string, Array<{
        name: string;
        quantity: number;
        unit: string;
        checked: boolean;
        estimatedPrice: number | null;
        notes: string | null;
      }>> = {};

      for (const item of list.items) {
        if (!byDepartment[item.department]) {
          byDepartment[item.department] = [];
        }
        byDepartment[item.department].push({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          checked: item.checked,
          estimatedPrice: item.estimatedPrice,
          notes: item.notes,
        });
      }

      const checkedCount = list.items.filter(i => i.checked).length;
      const uncheckedCount = list.items.length - checkedCount;

      const result = {
        id: list.id,
        name: list.name,
        mealPlanId: list.mealPlanId,
        storeName: list.storeName,
        departments: byDepartment,
        summary: {
          totalItems: list.items.length,
          checkedItems: checkedCount,
          uncheckedItems: uncheckedCount,
          totalEstimatedCost: list.totalEstimatedCost,
          departmentCount: Object.keys(byDepartment).length,
        },
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
      };

      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );
}
