import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HouseholdRepository } from '../db/repositories/household.repo.js';
import { log } from '../utils/logger.js';

interface HouseholdToolsContext {
  householdRepo: HouseholdRepository;
}

export function registerHouseholdTools(server: McpServer, ctx: HouseholdToolsContext): void {
  server.registerTool(
    'manage_household',
    {
      description:
        'Get or update the household profile. Use action "get" to retrieve the current profile, ' +
        'or "update" to modify it. The household stores member info (names, ages, dietary needs), ' +
        'preferred store, weekly budget, and zip code.',
      inputSchema: {
        action: z.enum(['get', 'update']).describe('Whether to get or update the household profile'),
        name: z.string().optional().describe('Household name, e.g. "The Smith Family"'),
        zipCode: z.string().optional().describe('Zip code for store lookups, e.g. "80202"'),
        defaultDiet: z.string().optional().describe('Default diet: omnivore, vegetarian, vegan, pescatarian, etc.'),
        budgetWeekly: z.number().optional().describe('Weekly grocery budget in dollars'),
        preferredStoreId: z.string().optional().describe('Preferred store ID from find_nearby_stores'),
        preferredStoreChain: z.string().optional().describe('Preferred store chain: king_soopers, safeway, walmart, etc.'),
        members: z
          .array(
            z.object({
              name: z.string().describe('Member name'),
              type: z.enum(['adult', 'child', 'toddler']).describe('Member type for serving size calculation'),
              allergies: z.array(z.string()).optional().describe('Food allergies, e.g. ["peanuts", "shellfish"]'),
              dietaryRestrictions: z.array(z.string()).optional().describe('e.g. ["vegetarian", "gluten-free"]'),
              dislikedIngredients: z.array(z.string()).optional().describe('Ingredients to avoid'),
            })
          )
          .optional()
          .describe('Household members'),
      },
    },
    async ({ action, name, zipCode, defaultDiet, budgetWeekly, preferredStoreId, preferredStoreChain, members }) => {
      try {
        if (action === 'get') {
          const household = ctx.householdRepo.get();
          if (!household) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    status: 'not_found',
                    message: 'No household profile exists yet. Use action "update" with at least a zipCode to create one.',
                  }),
                },
              ],
            };
          }
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(household) }],
          };
        }

        // action === 'update'
        if (!zipCode) {
          const existing = ctx.householdRepo.get();
          if (!existing) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    error: 'zipCode is required when creating a new household profile.',
                  }),
                },
              ],
              isError: true,
            };
          }
        }

        const household = ctx.householdRepo.upsert({
          name,
          zipCode: zipCode || ctx.householdRepo.get()?.zipCode || '',
          defaultDiet,
          budgetWeekly,
          preferredStoreId,
          preferredStoreChain,
          members: members as any,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ status: 'updated', household }),
            },
          ],
        };
      } catch (error) {
        log('error', 'manage_household failed', error);
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
