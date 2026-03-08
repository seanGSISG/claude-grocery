import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HouseholdRepository } from '../db/repositories/household.repo.js';
import type { KrogerClient } from '../integrations/kroger/kroger-client.js';
import { log } from '../utils/logger.js';

interface StoreToolsContext {
  householdRepo: HouseholdRepository;
  krogerClient: KrogerClient | null;
}

export function registerStoreTools(server: McpServer, ctx: StoreToolsContext): void {
  server.registerTool(
    'find_nearby_stores',
    {
      description:
        'Find grocery stores near a zip code. Uses the Kroger API to search for King Soopers, ' +
        'Safeway, and other Kroger-family stores. If no zip code is provided, uses the household ' +
        'profile zip code. Returns store details including address, phone, and departments.',
      inputSchema: {
        zipCode: z.string().optional().describe('Zip code to search near (uses household zip if omitted)'),
        radiusInMiles: z.number().min(1).max(100).optional().describe('Search radius in miles (1-100, default 10)'),
        limit: z.number().int().min(1).max(200).optional().describe('Max results (1-200, default 10)'),
        chain: z.string().optional().describe('Filter by chain name, e.g. "KingSoopers" (default: "KingSoopers")'),
      },
    },
    async ({ zipCode, radiusInMiles, limit, chain }) => {
      if (!ctx.krogerClient) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error:
                  'Kroger API is not configured. Set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET environment variables to search for stores.',
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        // Resolve zip code
        let resolvedZip = zipCode;
        if (!resolvedZip) {
          const household = ctx.householdRepo.get();
          if (household?.zipCode) {
            resolvedZip = household.zipCode;
          } else {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    error:
                      'No zip code provided and no household profile with a zip code exists. ' +
                      'Provide a zipCode parameter or set up your household profile first.',
                  }),
                },
              ],
              isError: true,
            };
          }
        }

        const locations = await ctx.krogerClient.searchLocations({
          zipCode: resolvedZip,
          radiusInMiles: radiusInMiles || 10,
          chain: chain || 'KingSoopers',
          limit: limit || 5,
        });

        // Map KrogerLocation objects to a simplified response
        const stores = locations.map((loc) => ({
          locationId: loc.locationId,
          chain: loc.chain,
          name: loc.name,
          address: loc.address.addressLine1,
          city: loc.address.city,
          state: loc.address.state,
          zipCode: loc.address.zipCode,
          phone: loc.phone,
          latitude: loc.geolocation.latitude,
          longitude: loc.geolocation.longitude,
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                zipCode: resolvedZip,
                resultCount: stores.length,
                stores,
              }),
            },
          ],
        };
      } catch (error) {
        log('error', 'find_nearby_stores failed', error);
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
