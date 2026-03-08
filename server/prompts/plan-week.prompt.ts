import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { log } from '../utils/logger.js';

export function registerPlanWeekPrompt(server: McpServer): void {
  server.prompt(
    'plan-week',
    {
      description: 'Plan meals for the upcoming week. Considers household preferences, dietary restrictions, budget, and optionally a theme or start date.',
      argsSchema: z.object({
        theme: z.string().optional().describe(
          'Optional meal theme for the week, e.g. "Mediterranean", "Budget-friendly", "Kid-friendly", "Meal prep", "Comfort food", "Healthy", "Quick weeknight"',
        ),
        startDate: z.string().optional().describe(
          'Start date for the meal plan in YYYY-MM-DD format. Defaults to the upcoming Monday.',
        ),
      }),
    },
    (args) => {
      log('debug', 'Generating plan-week prompt', args);

      const theme = args.theme;
      const startDate = args.startDate || getNextMonday();

      let themeInstruction = '';
      if (theme) {
        themeInstruction = `\n\n**Theme for this week: ${theme}**\nAll meals should follow the "${theme}" theme where possible. Adapt recipes and ingredient choices to fit this theme while still respecting household dietary restrictions and preferences.`;
      }

      const text = `You are a meal planning assistant for a Colorado household. Plan a full week of meals starting ${startDate}.

**Before planning, read these resources for context:**
1. \`grocery://household/profile\` - Get household size, dietary restrictions, allergies, disliked ingredients, budget, and preferred store.
2. \`grocery://pantry/staples\` - See what ingredients the household already has on hand.
3. \`grocery://meal-plan/current\` - Check if there's an existing plan to reference or replace.
${themeInstruction}

**Planning guidelines:**
- Plan dinner for all 7 days (Monday-Sunday). Breakfast and lunch are optional but encouraged.
- Each dinner should serve the household's total serving needs (based on member count and multipliers).
- Include 1-2 leftover nights to reduce waste and cooking effort (mark these as leftovers of a previous dinner).
- Avoid ingredients that any household member is allergic to or dislikes.
- Respect all dietary restrictions (vegetarian, gluten-free, etc.).
- Vary cuisines and proteins throughout the week for variety.
- Consider prep time - use quicker meals on weeknights (Mon-Thu), save elaborate meals for weekends.
- If there's a weekly budget, keep estimated grocery costs within that target.
- Prefer recipes already in the database; suggest new ones only when needed for variety.

**For each meal, provide:**
1. Recipe name
2. Serving count (adjusted for household)
3. Estimated prep + cook time
4. Key ingredients (noting any that need to be purchased vs. pantry staples)
5. Whether it's a new recipe or leftover

**After presenting the plan:**
- Ask if the user wants to make any changes before saving.
- Once confirmed, use the \`set-meal-slot\` tool to save each meal to the plan.
- Then use \`generate-grocery-list\` to create the shopping list.

**Output format:** Present the plan as a clean week view (table or day-by-day), then summarize:
- Total unique recipes to cook
- Number of leftover meals
- Estimated grocery cost (if budget is configured)
- Any notes about ingredient overlap or batch cooking opportunities`;

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

function getNextMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 0 ? 1 : (8 - day);
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  return nextMonday.toISOString().split('T')[0];
}
