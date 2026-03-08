import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GroceryListRepository } from '../db/repositories/grocery-list.repo.js';
import type { HouseholdRepository } from '../db/repositories/household.repo.js';
import { log } from '../utils/logger.js';

interface BudgetToolsContext {
  groceryListRepo: GroceryListRepository;
  householdRepo: HouseholdRepository;
}

export function registerBudgetTools(server: McpServer, ctx: BudgetToolsContext): void {
  server.registerTool(
    'estimate_budget',
    {
      description:
        'Estimate the total cost of a grocery list and compare it against the household weekly budget. ' +
        'Returns a breakdown by department with estimated costs, and flags if the list is over budget. ' +
        'Uses estimated item prices from the grocery list.',
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

        // Calculate department-level cost breakdown
        const departmentCosts: Record<string, { items: number; estimatedCost: number }> = {};
        let totalEstimated = 0;
        let itemsWithPrice = 0;
        let itemsWithoutPrice = 0;

        for (const item of list.items) {
          if (!departmentCosts[item.department]) {
            departmentCosts[item.department] = { items: 0, estimatedCost: 0 };
          }
          departmentCosts[item.department].items += 1;

          if (item.estimatedPrice != null) {
            departmentCosts[item.department].estimatedCost += item.estimatedPrice;
            totalEstimated += item.estimatedPrice;
            itemsWithPrice += 1;
          } else {
            itemsWithoutPrice += 1;
          }
        }

        // Get household budget
        const household = ctx.householdRepo.get();
        const weeklyBudget = household?.budgetWeekly ?? null;

        // Build budget comparison
        let budgetComparison = null;
        if (weeklyBudget != null) {
          const difference = weeklyBudget - totalEstimated;
          budgetComparison = {
            weeklyBudget,
            estimatedTotal: Math.round(totalEstimated * 100) / 100,
            difference: Math.round(difference * 100) / 100,
            isOverBudget: difference < 0,
            percentOfBudget: Math.round((totalEstimated / weeklyBudget) * 100),
          };
        }

        // Sort departments by cost descending
        const departmentBreakdown = Object.entries(departmentCosts)
          .map(([department, data]) => ({
            department,
            items: data.items,
            estimatedCost: Math.round(data.estimatedCost * 100) / 100,
          }))
          .sort((a, b) => b.estimatedCost - a.estimatedCost);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                groceryListId: list.id,
                groceryListName: list.name,
                totalItems: list.items.length,
                itemsWithPrice,
                itemsWithoutPrice,
                estimatedTotal: Math.round(totalEstimated * 100) / 100,
                budgetComparison,
                departmentBreakdown,
                note:
                  itemsWithoutPrice > 0
                    ? `${itemsWithoutPrice} item(s) have no price estimate. Actual total may be higher.`
                    : undefined,
              }),
            },
          ],
        };
      } catch (error) {
        log('error', 'estimate_budget failed', error);
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
