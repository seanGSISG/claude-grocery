import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { log } from '../utils/logger.js';

export function registerQuickMealPrompt(server: McpServer): void {
  server.prompt(
    'quick-meal',
    'Suggest a quick meal based on what is likely on hand or easy to prepare. Considers dietary restrictions and optional constraints.',
    {
      constraint: z.string().optional().describe(
        'Optional constraint like "vegetarian", "under 20 minutes", "use chicken", "no cooking", "kids will eat it", "date night"',
      ),
    },
    (args, _extra) => {
      log('debug', 'Generating quick-meal prompt', args);

      const constraint = args.constraint;

      let constraintInstruction = '';
      if (constraint) {
        constraintInstruction = `\n\n**Additional constraint: "${constraint}"**\nThe suggestion must satisfy this constraint on top of normal dietary restrictions.`;
      }

      const text = `You are a quick meal suggestion assistant for a busy household.

**Read these resources for context:**
1. \`grocery://household/profile\` - Dietary restrictions, allergies, dislikes, and household size.
2. \`grocery://pantry/staples\` - Ingredients already on hand.
3. \`grocery://meal-plan/current\` - What's already planned (avoid repeating recent meals).
${constraintInstruction}

**Suggest 3 quick meal options that:**
- Can be prepared in 30 minutes or less (including prep)
- Use mostly pantry staples and common ingredients
- Are appropriate for the household's dietary needs
- Are different from meals already planned this week
- Are practical and family-friendly

**For each suggestion, provide:**
1. **Meal name** and brief description
2. **Total time** (prep + cook)
3. **Ingredients needed** - split into "already have" (pantry staples) and "might need to buy"
4. **Quick instructions** (3-5 steps max)
5. **Servings** (matched to household size)
6. **Why this works** (e.g., "uses up the chicken from Tuesday", "kid-approved", "no oven needed")

**After suggestions:**
- Ask if the user wants to add any of these to the meal plan
- If yes, use \`add-recipe\` to save the recipe and \`set-meal-slot\` to add it to the plan
- Offer to update the grocery list if new ingredients are needed

Keep suggestions practical and achievable for a tired weeknight cook.`;

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
