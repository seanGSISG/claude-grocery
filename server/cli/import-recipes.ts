/**
 * Import recipes into the library from a list of URLs.
 *
 *   npm run recipes:import                          # data/recipe-urls.txt
 *   npm run recipes:import -- --file my-urls.txt
 *   npm run recipes:import -- --only <url>          # just one
 *   npm run recipes:import -- --force               # re-import ones already saved
 *   npm run recipes:import -- --dry-run             # parse only, save nothing
 *
 * Parsing relies on schema.org Recipe markup, which most recipe sites publish.
 * Video and pin links have none and have to be entered by hand.
 */

import { readFileSync } from 'node:fs';
import { initDatabase } from '../db/connection.js';
import { runMigrations } from '../db/schema.js';
import { RecipeRepository } from '../db/repositories/recipe.repo.js';
import { RecipeParserService } from '../services/recipe-parser.service.js';

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1] ?? fallback;
}

async function main(): Promise<void> {
  const file = arg('--file', 'data/recipe-urls.txt')!;
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const only = arg('--only');

  const urls = only
    ? [only]
    : readFileSync(file, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));

  if (urls.length === 0) {
    console.error(`No URLs in ${file}`);
    process.exit(1);
  }

  const parser = new RecipeParserService();
  let repo: RecipeRepository | null = null;
  if (!dryRun) {
    const db = initDatabase();
    runMigrations(db);
    repo = new RecipeRepository(db);
  }

  const saved: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];

  for (const url of urls) {
    // Say which URL before fetching it, not after: a site that stalls used to
    // leave the import silent with no clue where it was stuck.
    process.stdout.write(`  ... ${url.slice(0, 72)}\r`);

    // create() is a plain insert, so re-running this without the check used to
    // add a second copy of every recipe already in the library — and a library
    // with the same dish twice quietly skews what the planner picks.
    if (repo && !force) {
      const existing = repo.findBySourceUrl(url);
      if (existing) {
        skipped.push(existing.title);
        console.log(`  --  ${existing.title} (already imported)`.padEnd(90));
        continue;
      }
    }

    const recipe = await parser.parseFromUrl(url);
    if (!recipe) {
      failed.push(url);
      console.log(`  xx  ${url}`.padEnd(90));
      continue;
    }

    const time = (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0);
    console.log(
      `  ok  ${recipe.title} — ${recipe.ingredients.length} ingredients, ` +
        `${time || '?'} min, serves ${recipe.servings ?? '?'}`.padEnd(40)
    );

    if (repo) repo.create(recipe);
    saved.push(recipe.title);
  }

  console.log(
    `\n${saved.length} recipe(s) ${dryRun ? 'parsed' : 'saved'}` +
      `${skipped.length ? `, ${skipped.length} already there` : ''}` +
      `, ${failed.length} failed.`
  );
  if (failed.length) {
    console.log('\nCouldn\'t read these (no recipe markup, or the site blocked us):');
    for (const url of failed) console.log(`  ${url}`);
    console.log('\nAdd them by hand with the save_recipe tool, or re-run from a different network.');
    console.log('A site that blocks datacentre traffic often works from home — this is one of those.');
  }
}

main().catch((error: unknown) => {
  console.error('\nRecipe import failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
