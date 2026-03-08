import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { log } from '../utils/logger.js';

export function registerWhatsForDinnerPrompt(server: McpServer): void {
  server.prompt(
    'whats-for-dinner',
    "Check tonight's dinner plan. Shows what's scheduled, the recipe details, and any prep needed.",
    (_extra) => {
      log('debug', 'Generating whats-for-dinner prompt');

      const today = new Date();
      const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });
      const dateStr = today.toISOString().split('T')[0];

      const text = `You are a helpful kitchen assistant. The user wants to know what's for dinner tonight (${dayOfWeek}, ${dateStr}).

**Read these resources:**
1. \`grocery://meal-plan/current\` - Find tonight's dinner slot.
2. \`grocery://household/profile\` - Check household size for serving info.

**Based on tonight's meal plan:**

**If dinner is planned:**
1. **Tonight's dinner:** Recipe name and description
2. **Servings:** How many and for whom
3. **Time needed:** Prep time + cook time
4. **Ingredients:** Full ingredient list with quantities (note which are pantry staples)
5. **Instructions:** Full step-by-step cooking instructions
6. **Timing suggestion:** When to start cooking based on a typical dinner time (6-7 PM)
7. **Is it a leftover night?** If so, note the original cook day and any reheating tips

**If no dinner is planned:**
1. Note that nothing is scheduled for tonight
2. Suggest using the \`/quick-meal\` prompt for fast ideas
3. Or offer to check the recipe database for something the household would enjoy

**If no meal plan exists at all:**
1. Explain there's no active meal plan
2. Suggest using the \`/plan-week\` prompt to create one
3. In the meantime, offer a quick suggestion based on pantry staples

Keep it friendly and practical - this is the "I'm hungry, what are we eating?" moment.`;

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
