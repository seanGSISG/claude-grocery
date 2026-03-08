import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RecipeRepository } from '../db/repositories/recipe.repo.js';
import { log } from '../utils/logger.js';

interface RecipeToolsContext {
  recipeRepo: RecipeRepository;
}

export function registerRecipeTools(server: McpServer, ctx: RecipeToolsContext): void {
  // --- save_recipe ---
  server.registerTool(
    'save_recipe',
    {
      description:
        'Save a new recipe to the database. Provide the full recipe including title, servings, ' +
        'ingredients with quantities/units, and step-by-step instructions. Ingredients are automatically ' +
        'normalized and categorized by store department.',
      inputSchema: {
        title: z.string().describe('Recipe title, e.g. "Chicken Tikka Masala"'),
        description: z.string().optional().describe('Brief description of the dish'),
        servings: z.number().int().min(1).describe('Number of servings this recipe makes'),
        prepTimeMinutes: z.number().int().optional().describe('Prep time in minutes'),
        cookTimeMinutes: z.number().int().optional().describe('Cook time in minutes'),
        ingredients: z
          .array(
            z.object({
              name: z.string().describe('Ingredient name, e.g. "chicken breast"'),
              quantity: z.number().describe('Amount, e.g. 2'),
              unit: z.string().describe('Unit, e.g. "lb", "cup", "clove"'),
              notes: z.string().optional().describe('Prep notes, e.g. "diced", "boneless skinless"'),
              optional: z.boolean().optional().describe('Whether this ingredient is optional'),
            })
          )
          .describe('List of ingredients with quantities'),
        instructions: z.array(z.string()).describe('Ordered list of cooking steps'),
        tags: z.array(z.string()).optional().describe('Tags, e.g. ["weeknight", "indian", "spicy"]'),
        sourceUrl: z.string().optional().describe('URL where recipe was found'),
        cuisineType: z.string().optional().describe('Cuisine type, e.g. "Indian", "Italian", "Mexican"'),
        dietaryFlags: z.array(z.string()).optional().describe('Dietary flags, e.g. ["gluten-free", "dairy-free"]'),
      },
    },
    async (args) => {
      try {
        const recipe = ctx.recipeRepo.create(args);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ status: 'saved', recipe }),
            },
          ],
        };
      } catch (error) {
        log('error', 'save_recipe failed', error);
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

  // --- search_recipes ---
  server.registerTool(
    'search_recipes',
    {
      description:
        'Search saved recipes by keyword, tags, dietary flags, cuisine type, or prep time. ' +
        'Returns matching recipes sorted by most recently updated. All parameters are optional ' +
        'filters that are combined with AND logic.',
      inputSchema: {
        query: z.string().optional().describe('Search term to match against title and description'),
        tags: z.array(z.string()).optional().describe('Filter by tags, e.g. ["vegetarian", "quick"]'),
        dietaryFlags: z.array(z.string()).optional().describe('Filter by dietary flags, e.g. ["gluten-free"]'),
        cuisineType: z.string().optional().describe('Filter by cuisine type, e.g. "Mexican"'),
        maxPrepTimeMinutes: z.number().int().optional().describe('Maximum prep time in minutes'),
        limit: z.number().int().min(1).max(50).optional().describe('Max results to return (default 20)'),
      },
    },
    async ({ query, tags, dietaryFlags, cuisineType, maxPrepTimeMinutes, limit }) => {
      try {
        const recipes = ctx.recipeRepo.search({
          query,
          tags,
          dietaryFlags,
          cuisineType,
          maxPrepTimeMinutes,
          limit,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                count: recipes.length,
                recipes,
              }),
            },
          ],
        };
      } catch (error) {
        log('error', 'search_recipes failed', error);
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
