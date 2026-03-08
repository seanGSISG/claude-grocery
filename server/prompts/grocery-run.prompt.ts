import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { log } from '../utils/logger.js';

export function registerGroceryRunPrompt(server: McpServer): void {
  server.prompt(
    'grocery-run',
    'Prepare for a grocery shopping trip. Reviews the current grocery list, organizes by store department, and provides shopping tips.',
    {
      store: z.enum(['king_soopers', 'safeway', 'walmart', 'instacart']).optional().describe(
        'Which store to shop at. Affects department ordering and available products. Defaults to the household preferred store.',
      ),
    },
    (args, _extra) => {
      log('debug', 'Generating grocery-run prompt', args);

      const storeArg = args.store;

      const storeNames: Record<string, string> = {
        king_soopers: 'King Soopers',
        safeway: 'Safeway',
        walmart: 'Walmart',
        instacart: 'Instacart',
      };

      let storeInstruction = '';
      if (storeArg) {
        const storeName = storeNames[storeArg] || storeArg;
        storeInstruction = `\n\n**Shopping at: ${storeName}**\nOrganize the list according to ${storeName}'s typical store layout and department arrangement.`;
      } else {
        storeInstruction = '\n\nCheck the household profile for a preferred store. If none is set, organize generically by department.';
      }

      const text = `You are a grocery shopping assistant helping prepare for a shopping trip.

**Read these resources first:**
1. \`grocery://grocery-list/current\` - Get the current grocery list with all items.
2. \`grocery://household/profile\` - Check budget and preferred store.
3. \`grocery://pantry/staples\` - Verify pantry staples are excluded.
${storeInstruction}

**Organize the shopping list by providing:**

1. **Quick summary** - Total items, estimated cost, number of departments to visit.

2. **Department-by-department list** ordered by typical store layout:
   - Produce (fruits, vegetables, herbs)
   - Bakery
   - Deli
   - Meat & Seafood
   - Dairy
   - Frozen
   - Canned & Jarred
   - Dry Goods & Pasta
   - Condiments & Sauces
   - Spices & Seasonings
   - Baking
   - Snacks
   - Beverages
   - International
   - Other

3. For each item show:
   - Item name
   - Quantity and unit (e.g., "2 lb", "3 cups worth")
   - Which recipes use it
   - Any notes (organic preferred, specific brand, etc.)

4. **Budget check** - If household has a weekly budget:
   - Compare estimated total to budget
   - Suggest substitutions if over budget
   - Note any items that could be bought in bulk for savings

5. **Shopping tips:**
   - Items that are likely on sale (seasonal produce, etc.)
   - Suggested substitutions for hard-to-find items
   - Items to check at home before buying (might already have partial amounts)

**Format:** Clean, scannable list that could be used on a phone while shopping. Use checkboxes or bullet points.`;

      return {
        messages: [{
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text,
          },
        }],
      };
    },
  );
}
