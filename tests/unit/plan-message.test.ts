import { describe, it, expect } from 'vitest';
import {
  renderSms, renderSlackBlocks, renderListText, renderWeekTable, weekNotes,
  chunkForBlocks, textBlocks, SLACK_BLOCK_LIMIT,
} from '../../server/services/plan-message.service.js';
import type { NightPlan } from '../../server/services/night-classifier.service.js';
import type { WeekPlan } from '../../server/services/week-planner.service.js';

const night = (weekday: string, date: string, kind: NightPlan['kind'], reason = ''): NightPlan => ({
  date, weekday, kind, maxPrepMinutes: 45, reason, events: [], adultsOut: [], atTable: 4.2,
});

const week: NightPlan[] = [
  night('Sunday', '2026-09-27', 'shifts'),
  night('Monday', '2026-09-28', 'shifts'),
  night('Tuesday', '2026-09-29', 'skip', '4 overlapping commitments'),
  night('Wednesday', '2026-09-30', 'shifts'),
  night('Thursday', '2026-10-01', 'shifts'),
  night('Friday', '2026-10-02', 'skip', '3 overlapping commitments'),
  night('Saturday', '2026-10-03', 'eat-out', 'quota met'),
];

const meal = (date: string, weekday: string, title: string, scale = 1) => ({
  date, weekday, kind: 'shifts' as const, portions: 6.2, scale, fit: '25 min hands-on',
  recipe: { id: title, title, description: null, servings: 4, prepTimeMinutes: 25, cookTimeMinutes: 20,
    totalTimeMinutes: 45, ingredients: [], instructions: [], tags: [], sourceUrl: null,
    cuisineType: null, dietaryFlags: [], createdAt: '', updatedAt: '' },
});

const plan: WeekPlan = {
  weekStart: '2026-09-27',
  meals: [
    meal('2026-09-27', 'Sunday', 'Thai Chicken Curry Soup'),
    meal('2026-09-28', 'Monday', 'Taco Baked Potatoes', 1.5),
    meal('2026-09-30', 'Wednesday', 'Crock-Pot Chicken Marsala', 1.5),
    meal('2026-10-01', 'Thursday', 'Grilled Greek Lemon Chicken'),
  ],
  unplanned: [],
  items: [
    { canonicalName: 'ground_beef', displayName: 'Ground Beef', quantity: 680, unit: 'g', department: 'Meat & Seafood', forMeals: ['Taco Baked Potatoes'], source: 'recipe' as const },
    { canonicalName: 'garlic', displayName: 'Garlic', quantity: 7, unit: 'each', department: 'Produce', forMeals: ['A', 'B'], source: 'recipe' as const },
    { canonicalName: 'lime', displayName: 'Lime', quantity: 2, unit: 'each', department: 'Produce', forMeals: ['A'], source: 'recipe' as const },
  ],
  warnings: [],
};

const summary = { weekStart: '2026-09-27', cookingNights: 4, softMax: 425, hardMax: 500 };

describe('SMS', () => {
  it('fits in two segments and names every night', () => {
    const sms = renderSms(week, plan, { ...summary, estimatedTotal: 312.4 });
    expect(sms.length).toBeLessThanOrEqual(320);
    expect(sms).toContain('4 dinners');
    expect(sms).toContain('~$312.40');
    expect(sms).toContain('Reply OK');
  });

  it('drops the eat-out nights when the message would be too long', () => {
    const longPlan = {
      ...plan,
      meals: plan.meals.map((m) => ({ ...m, recipe: { ...m.recipe, title: `${m.recipe.title} with a Very Long Descriptive Name` } })),
    };
    const sms = renderSms(week, longPlan, summary);
    expect(sms.length).toBeLessThanOrEqual(320);
    expect(sms).not.toContain('Tue: out');
  });
});

describe('Slack blocks', () => {
  it('shows each night and the cost against the budget', () => {
    const blocks = renderSlackBlocks(week, plan, { ...summary, estimatedTotal: 312.4 });
    const text = JSON.stringify(blocks);
    expect(text).toContain('Thai Chicken Curry Soup');
    expect(text).toContain('×1.5');
    expect(text).toContain('est. $312.40 of $425.00');
    expect(text).not.toContain('over budget');
  });

  it('marks a basket over the soft cap', () => {
    const text = JSON.stringify(renderSlackBlocks(week, plan, { ...summary, estimatedTotal: 460 }));
    expect(text).toContain('over budget');
  });

  it('refuses to offer approval above the hard cap', () => {
    const blocks = renderSlackBlocks(week, plan, { ...summary, estimatedTotal: 540 });
    const text = JSON.stringify(blocks);
    expect(text).toContain('will not order');
    expect(text).toContain('Over cap');
    expect(text).not.toContain('"style":"primary"');
  });

  it('surfaces planner warnings', () => {
    const text = JSON.stringify(renderSlackBlocks(week, { ...plan, warnings: ['No recipe fits Friday'] }, summary));
    expect(text).toContain('No recipe fits Friday');
  });

  it('always offers approve and show-list actions', () => {
    const actions = renderSlackBlocks(week, plan, summary).find((b) => b.type === 'actions') as unknown as { elements: Array<{ action_id: string }> };
    expect(actions.elements.map((e) => e.action_id)).toEqual(['approve_plan', 'show_list', 'show_help']);
  });

  it('renders the week as a code block so the columns line up', () => {
    const section = renderSlackBlocks(week, plan, summary)[1] as unknown as { text: { text: string } };
    expect(section.text.text.startsWith('```')).toBe(true);
    expect(section.text.text.endsWith('```')).toBe(true);
  });
});

describe('the week table', () => {
  const lines = () => renderWeekTable(week, plan).split('\n');

  it('gives every night one row, under a header and a rule', () => {
    expect(lines()).toHaveLength(9);
    expect(lines()[0]).toContain('Dinner');
    expect(lines()[1]).toMatch(/^───/);
    expect(lines()[2]).toContain('Sun');
    expect(lines()[8]).toContain('Sat');
  });

  it('lines the columns up to the same width on every row', () => {
    // Trailing space is trimmed, so compare where each column starts instead.
    const rows = lines().slice(2);
    const dishAt = rows.map((r) => r.indexOf(r.trim().split(/\s{2,}/)[1] ?? ''));
    expect(new Set(dishAt).size).toBe(1);
  });

  it('shows the dish, the serving time and the scale', () => {
    const sunday = lines()[2];
    expect(sunday).toContain('Thai Chicken Curry Soup');
    expect(sunday).toContain('6:00');
    const monday = lines()[3];
    expect(monday).toContain('×1.5');
  });

  it('reads the serving time off the night when an event pushed it', () => {
    const late = [{ ...week[0], kind: 'late' as const, serveHour: 19.5 }];
    expect(renderWeekTable(late, plan)).toContain('7:30');
  });

  it('says eat out with no time rather than inventing one', () => {
    const tuesday = lines()[4];
    expect(tuesday).toContain('eat out');
    expect(tuesday).toContain('–');
    expect(tuesday).not.toMatch(/\d:\d\d/);
  });

  it('drops the scale column entirely when nothing is scaled', () => {
    const plain = { ...plan, meals: plan.meals.map((m) => ({ ...m, scale: 1 })) };
    expect(renderWeekTable(week, plain)).not.toContain('Cook');
  });

  it('truncates a dish name rather than breaking the grid', () => {
    const long = {
      ...plan,
      meals: [{ ...plan.meals[0], recipe: { ...plan.meals[0].recipe, title: 'A Dish With An Extremely Long And Unhelpful Name' } }],
    };
    const row = renderWeekTable(week, long).split('\n')[2];
    expect(row).toContain('…');
    expect(row.length).toBeLessThan(45);
  });
});

describe('the notes under the table', () => {
  it('says why a night the calendar killed is out', () => {
    expect(weekNotes(week)).toContain('Tue out: 4 overlapping commitments');
  });

  it('says nothing about a night the planner simply chose not to cook', () => {
    expect(weekNotes(week).join(' ')).not.toContain('Sat');
  });

  it('flags how an unusual cooking night works', () => {
    const notes = weekNotes([
      night('Sunday', '2026-09-27', 'slow-cooker'),
      night('Monday', '2026-09-28', 'late'),
      night('Tuesday', '2026-09-29', 'full'),
    ]);
    expect(notes).toEqual(['Sun slow cooker', 'Mon late dinner']);
  });
});

describe('list text', () => {
  const listPlan: WeekPlan = {
    ...plan,
    items: [
      { canonicalName: 'ground_beef', displayName: 'Ground Beef', quantity: 680, unit: 'g', department: 'Meat', forMeals: ['Taco Baked Potatoes'], source: 'recipe' },
      { canonicalName: 'garlic', displayName: 'Garlic', quantity: 7, unit: 'each', department: 'Produce', forMeals: ['Thai Chicken Curry Soup', 'Crock-Pot Chicken Marsala'], source: 'recipe' },
      { canonicalName: 'lime', displayName: 'Lime', quantity: 2, unit: 'each', department: 'Produce', forMeals: ['Thai Chicken Curry Soup'], source: 'recipe' },
      { canonicalName: 'milk', displayName: 'Milk', quantity: 1, unit: 'each', department: 'Dairy', forMeals: [], source: 'staple' },
      { canonicalName: 'avocado', displayName: 'avocados', quantity: 2, unit: 'each', department: 'Produce', forMeals: [], source: 'requested' },
    ],
  };

  it('groups by meal', () => {
    const text = renderListText(listPlan);
    expect(text).toContain('*Monday — Taco Baked Potatoes*');
    // 680 g is not a thing anyone buys: the list speaks US units.
    expect(text).toContain('• 1 1/2 lb Ground Beef');
    expect(text).not.toContain('680 g');
    expect(text).toContain('*Sunday — Thai Chicken Curry Soup*');
    expect(text).toContain('• 2 Lime');
  });

  it('puts an ingredient two meals need in Shared, once', () => {
    const text = renderListText(listPlan);
    expect(text).toContain('*Shared*');
    expect(text).toContain('• 7 Garlic _(Thai Chicken Curry Soup, Crock-Pot Chicken Marsala)_');
    expect(text.match(/Garlic/g)).toHaveLength(1);
  });

  it('keeps staples and requests in their own sections', () => {
    const text = renderListText(listPlan);
    expect(text).toContain('*Staples*\n_Dairy_\n• 1 Milk');
    expect(text).toContain('*You asked for*\n• 2 avocados');
  });

  it('splits the staples into aisles, in the order the store is walked', () => {
    const text = renderListText({
      ...listPlan,
      items: [
        { canonicalName: 'milk', displayName: 'Milk', quantity: 1, unit: 'each', department: 'Dairy', forMeals: [], source: 'staple' },
        { canonicalName: 'toilet_paper', displayName: 'Toilet Paper', quantity: 1, unit: 'each', department: 'Other', forMeals: [], source: 'staple' },
        { canonicalName: 'banana', displayName: 'Bananas', quantity: 6, unit: 'each', department: 'Produce', forMeals: [], source: 'staple' },
        { canonicalName: 'yogurt', displayName: 'Yogurt', quantity: 4, unit: 'each', department: 'Dairy', forMeals: [], source: 'staple' },
      ],
    });
    const staples = text.slice(text.indexOf('*Staples*'));
    expect(staples.split('\n').slice(0, 7)).toEqual([
      '*Staples*',
      '_Produce_',
      '• 6 Bananas',
      '_Dairy_',
      '• 1 Milk',
      '• 4 Yogurt',
      '_Other_',
    ]);
  });

  it('drops the unit for countable things', () => {
    expect(renderListText(listPlan)).toContain('• 2 Lime');
  });

  it('parks an item whose meal was swapped away under Other', () => {
    const text = renderListText({
      ...listPlan,
      items: [{ canonicalName: 'salsa', displayName: 'Salsa', quantity: 1, unit: 'each', department: 'Other', forMeals: ['A Dish No Longer Planned'], source: 'recipe' }],
    });
    expect(text).toContain('*Other*');
    expect(text).toContain('• 1 Salsa');
  });
});

describe('fitting a long list into Slack', () => {
  const longList = Array.from({ length: 200 }, (_, i) => `• 1 Item number ${i} with a fairly long name`).join('\n');

  it('keeps every line — nothing is cut off the end', () => {
    const joined = chunkForBlocks(longList).join('\n');
    expect(joined).toBe(longList);
    expect(joined).toContain('Item number 199');
  });

  it('never exceeds what Slack accepts in one block', () => {
    for (const chunk of chunkForBlocks(longList)) {
      expect(chunk.length).toBeLessThanOrEqual(SLACK_BLOCK_LIMIT);
    }
  });

  it('splits between lines, never through one', () => {
    for (const chunk of chunkForBlocks(longList)) {
      for (const line of chunk.split('\n')) expect(line).toMatch(/^• 1 Item number \d+ with a fairly long name$/);
    }
  });

  it('leaves a list that already fits in a single block', () => {
    expect(chunkForBlocks('• 1 Milk\n• 2 Eggs')).toEqual(['• 1 Milk\n• 2 Eggs']);
    expect(textBlocks('• 1 Milk')).toHaveLength(1);
  });

  it('cuts the one thing it cannot split, and says so', () => {
    const [chunk] = chunkForBlocks('x'.repeat(SLACK_BLOCK_LIMIT + 500));
    expect(chunk.length).toBe(SLACK_BLOCK_LIMIT);
    expect(chunk.endsWith('…')).toBe(true);
  });

  it('produces section blocks Slack will accept', () => {
    const blocks = textBlocks(longList);
    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) expect(block.type).toBe('section');
  });
});
