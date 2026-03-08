import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPlanWeekPrompt } from './plan-week.prompt.js';
import { registerGroceryRunPrompt } from './grocery-run.prompt.js';
import { registerQuickMealPrompt } from './quick-meal.prompt.js';
import { registerWhatsForDinnerPrompt } from './whats-for-dinner.prompt.js';
import { log } from '../utils/logger.js';

export function registerAllPrompts(server: McpServer): void {
  log('info', 'Registering MCP prompts...');

  registerPlanWeekPrompt(server);
  registerGroceryRunPrompt(server);
  registerQuickMealPrompt(server);
  registerWhatsForDinnerPrompt(server);

  log('info', 'All MCP prompts registered');
}
