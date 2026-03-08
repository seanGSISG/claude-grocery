import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PantryRepository } from '../db/repositories/pantry.repo.js';
import { log } from '../utils/logger.js';

export function registerPantryResources(
  server: McpServer,
  pantryRepo: PantryRepository,
): void {
  server.resource(
    'pantry-staples',
    'grocery://pantry/staples',
    {
      description: 'List of pantry staples that the household always has on hand. These items are excluded from grocery lists.',
      mimeType: 'application/json',
    },
    async (uri) => {
      log('debug', 'Reading pantry staples resource');

      const staples = pantryRepo.getAll();

      const grouped: Record<string, Array<{ name: string; canonicalName: string; isDefault: boolean }>> = {};
      for (const staple of staples) {
        if (!grouped[staple.category]) {
          grouped[staple.category] = [];
        }
        grouped[staple.category].push({
          name: staple.name,
          canonicalName: staple.canonicalName,
          isDefault: staple.isDefault,
        });
      }

      const result = {
        totalCount: staples.length,
        defaultCount: staples.filter(s => s.isDefault).length,
        customCount: staples.filter(s => !s.isDefault).length,
        categories: grouped,
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
