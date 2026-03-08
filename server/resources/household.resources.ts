import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HouseholdRepository } from '../db/repositories/household.repo.js';
import { log } from '../utils/logger.js';

export function registerHouseholdResources(
  server: McpServer,
  householdRepo: HouseholdRepository,
): void {
  server.resource(
    'household-profile',
    'grocery://household/profile',
    {
      description: 'Current household profile including members, dietary restrictions, allergies, budget, and preferred store.',
      mimeType: 'application/json',
    },
    async (uri) => {
      log('debug', 'Reading household profile resource');

      const household = householdRepo.get();

      if (!household) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              status: 'not_configured',
              message: 'No household profile configured yet. Use the setup-household tool to create one.',
            }, null, 2),
          }],
        };
      }

      const totalServingMultiplier = household.members.reduce(
        (sum, m) => sum + m.servingMultiplier, 0,
      );

      const allAllergies = [...new Set(household.members.flatMap(m => m.allergies))];
      const allRestrictions = [...new Set(household.members.flatMap(m => m.dietaryRestrictions))];
      const allDislikes = [...new Set(household.members.flatMap(m => m.dislikedIngredients))];

      const profile = {
        ...household,
        computed: {
          totalMembers: household.members.length,
          totalServingMultiplier,
          adultCount: household.members.filter(m => m.type === 'adult').length,
          childCount: household.members.filter(m => m.type === 'child').length,
          toddlerCount: household.members.filter(m => m.type === 'toddler').length,
          allAllergies,
          allDietaryRestrictions: allRestrictions,
          allDislikedIngredients: allDislikes,
        },
      };

      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(profile, null, 2),
        }],
      };
    },
  );
}
