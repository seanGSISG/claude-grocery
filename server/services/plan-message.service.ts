/**
 * Rendering a week plan for the two places Ty reads it: a Slack message with
 * the whole plan, and an SMS that has to fit in a glance from the sideline.
 */

import { DEPARTMENTS } from '../models/ingredient.model.js';
import { formatAmount } from '../utils/item-units.js';
import type { NightKind, NightPlan } from './night-classifier.service.js';
import type { WeekPlan } from './week-planner.service.js';

export interface PlanSummary {
  weekStart: string;
  /** Which posting of this week's plan the buttons belong to. */
  version?: number;
  cookingNights: number;
  estimatedTotal?: number;
  softMax: number;
  hardMax: number;
}

function shortDay(weekday: string): string {
  return weekday.slice(0, 3);
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function nightLine(night: NightPlan, plan: WeekPlan): string {
  const meal = plan.meals.find((m) => m.date === night.date);
  if (meal) return `${shortDay(night.weekday)}: ${meal.recipe.title}`;
  if (night.kind === 'leftovers') return `${shortDay(night.weekday)}: leftovers`;
  if (night.kind === 'eat-out' || night.kind === 'skip') return `${shortDay(night.weekday)}: out`;
  return `${shortDay(night.weekday)}: —`;
}

/**
 * The Saturday text. Kept under 320 characters (two SMS segments) so it arrives
 * as one message and reads without scrolling.
 */
export function renderSms(week: NightPlan[], plan: WeekPlan, summary: PlanSummary): string {
  const lines = week.map((night) => nightLine(night, plan));
  const cost = summary.estimatedTotal != null ? `, ~${money(summary.estimatedTotal)}` : '';
  const head = `Week of ${summary.weekStart}: ${summary.cookingNights} dinners${cost}.`;
  const body = lines.join(' · ');
  const tail = 'Reply OK to order, or tell me what to change.';

  const full = `${head}\n${body}\n${tail}`;
  if (full.length <= 320) return full;

  // Too long: drop the eat-out nights, they carry no information.
  const cooked = week.filter((night) => plan.meals.some((m) => m.date === night.date));
  const cookedLines = cooked.map((night) => nightLine(night, plan));
  const shorter = `${head}\n${cookedLines.join(' · ')}\n${tail}`;
  if (shorter.length <= 320) return shorter;

  // Still long: shorten the dish names rather than cutting the message off.
  const clipped = cooked.map((night) => {
    const line = nightLine(night, plan);
    return line.length > 32 ? `${line.slice(0, 29).trimEnd()}…` : line;
  });
  return `${head}\n${clipped.join(' · ')}\n${tail}`.slice(0, 320);
}

export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

/** Dinner time as a kitchen says it: "6:30". Evening is assumed. */
function clockTime(hour: number): string {
  const hours = Math.floor(hour);
  const minutes = Math.round((hour - hours) * 60);
  return `${((hours + 11) % 12) + 1}:${String(minutes).padStart(2, '0')}`;
}

/** The usual sitting, when the calendar leaves the evening alone. */
const DEFAULT_SERVE_HOUR = 18;

const COOKING: NightKind[] = ['full', 'late', 'shifts', 'quick', 'slow-cooker'];

interface WeekRow {
  day: string;
  dinner: string;
  time: string;
  cook: string;
}

function weekRows(week: NightPlan[], plan: WeekPlan): WeekRow[] {
  return week.map((night) => {
    const meal = plan.meals.find((m) => m.date === night.date);
    // "leftovers from Wednesday's cook" is worth a word in the table: it says
    // what is in the fridge, not just that nobody is cooking.
    const source = night.reason.match(/from (\w+)/i);
    const dinner = meal
      ? meal.recipe.title
      : night.kind === 'leftovers'
        ? source
          ? `leftovers · ${source[1].slice(0, 3)}`
          : 'leftovers'
        : 'eat out';
    const served = COOKING.includes(night.kind) || night.kind === 'leftovers';

    return {
      day: shortDay(night.weekday),
      dinner: dinner.length > 26 ? `${dinner.slice(0, 25).trimEnd()}…` : dinner,
      time: served ? clockTime(night.serveHour ?? DEFAULT_SERVE_HOUR) : '–',
      cook: meal && meal.scale !== 1 ? `×${meal.scale}` : '',
    };
  });
}

/**
 * The week as a table. Slack has no table markup, so a code block with padded
 * columns is the only way to get columns that line up — and it lines up the same
 * on a phone. The dish column is sized to the week's longest title so a quiet
 * week is not rendered as a wide, mostly empty grid, and the last column
 * disappears entirely when nothing is being scaled.
 */
export function renderWeekTable(week: NightPlan[], plan: WeekPlan): string {
  const rows = weekRows(week, plan);
  const dishWidth = Math.max(6, ...rows.map((r) => r.dinner.length), 'Dinner'.length);
  const scaling = rows.some((r) => r.cook);

  const line = (day: string, dinner: string, time: string, cook: string) =>
    `${day.padEnd(3)}  ${dinner.padEnd(dishWidth)}  ${time.padStart(5)}${scaling ? `  ${cook}` : ''}`.trimEnd();

  return [
    line('Day', 'Dinner', ' Time', 'Cook'),
    line('───', '─'.repeat(dishWidth), '─────', '────'),
    ...rows.map((r) => line(r.day, r.dinner, r.time, r.cook)),
  ].join('\n');
}

/** How a night differs from just cooking at six — in as few words as possible. */
const KIND_NOTE: Partial<Record<NightKind, string>> = {
  late: 'late dinner',
  shifts: 'eaten in shifts',
  quick: 'quick cook',
  'slow-cooker': 'slow cooker',
};

/**
 * One line of caveats under the table. A night the calendar killed says why;
 * a night the planner simply chose not to cook needs no explanation.
 */
export function weekNotes(week: NightPlan[]): string[] {
  const notes: string[] = [];
  for (const night of week) {
    const day = shortDay(night.weekday);
    if (night.kind === 'skip') notes.push(`${day} out: ${shortReason(night.reason)}`);
    else if (KIND_NOTE[night.kind]) notes.push(`${day} ${KIND_NOTE[night.kind]}`);
  }
  return notes;
}

/**
 * The reason, short enough to sit four-to-a-line. The classifier's own wording
 * repeats the verdict ("eating out: team dinner") and the note already says the
 * night is out, so that lead-in comes off.
 */
function shortReason(reason: string): string {
  const trimmed = reason.replace(/^(?:eating out|away|out)\s*:\s*/i, '').trim();
  return trimmed.length > 34 ? `${trimmed.slice(0, 33).trimEnd()}…` : trimmed;
}

/** The full plan, as Slack Block Kit. */
export function renderSlackBlocks(week: NightPlan[], plan: WeekPlan, summary: PlanSummary): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Meal plan — week of ${summary.weekStart}` },
    },
  ];

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `\`\`\`\n${renderWeekTable(week, plan)}\n\`\`\`` },
  });

  const notes = weekNotes(week);
  if (notes.length > 0) {
    const shown = notes.slice(0, 4).join(' · ');
    const more = notes.length > 4 ? ` · +${notes.length - 4} more` : '';
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `${shown}${more}` }] });
  }

  const budget = summary.estimatedTotal;
  const overSoft = budget != null && budget > summary.softMax;
  const overHard = budget != null && budget > summary.hardMax;
  const costLine =
    budget == null
      ? `${plan.items.length} items · no price estimate yet`
      : `${plan.items.length} items · est. ${money(budget)} of ${money(summary.softMax)}` +
        (overHard ? ' · *over the hard cap, will not order*' : overSoft ? ' · *over budget*' : '');

  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: costLine }] });

  if (plan.warnings.length > 0) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `:warning: ${plan.warnings.slice(0, 3).join(' · ')}` }],
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        style: overHard ? undefined : 'primary',
        text: { type: 'plain_text', text: overHard ? 'Over cap' : 'Approve & fill cart' },
        action_id: 'approve_plan',
        value: `${summary.weekStart}#${summary.version ?? 0}`,
        ...(overHard ? { confirm: {
          title: { type: 'plain_text', text: 'Over the hard cap' },
          text: { type: 'mrkdwn', text: `This basket is ${money(budget!)}, above the ${money(summary.hardMax)} limit.` },
          // In Slack's confirm dialog the `confirm` button is the one that
          // dispatches the action, so it must be the one that says "order".
          confirm: { type: 'plain_text', text: 'Order it anyway' },
          deny: { type: 'plain_text', text: 'Cancel' },
        } } : {}),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Show list' },
        action_id: 'show_list',
        value: `${summary.weekStart}#${summary.version ?? 0}`,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'How this works' },
        action_id: 'show_help',
        value: 'help',
      },
    ],
  });

  return blocks;
}

/**
 * Slack refuses a section block whose text runs past 3000 characters, and a
 * sixty-line shopping list goes well past it. Cutting at 3000 loses the end of
 * the list — and worse, it looks like the list simply ended — so the text is
 * split across blocks instead, always on a line boundary.
 *
 * A single line longer than the limit is the one thing that cannot be split;
 * that gets cut, with an ellipsis to say so.
 */
export const SLACK_BLOCK_LIMIT = 2900;

export function chunkForBlocks(text: string, limit = SLACK_BLOCK_LIMIT): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const rawLine of text.split('\n')) {
    const line = rawLine.length > limit ? `${rawLine.slice(0, limit - 1)}…` : rawLine;
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > limit) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [''];
}

/**
 * The same text as Block Kit sections, none of them over the limit. Slack
 * rejects a section whose text is empty, so an empty list says so in words
 * rather than failing the whole message.
 */
export function textBlocks(text: string, whenEmpty = '_Nothing on the list._'): SlackBlock[] {
  const chunks = chunkForBlocks(text).filter((chunk) => chunk.trim().length > 0);
  return (chunks.length > 0 ? chunks : [whenEmpty]).map((chunk) => ({
    type: 'section',
    text: { type: 'mrkdwn', text: chunk },
  }));
}

/**
 * The shopping list, grouped the way you shop it: one block per meal, a block
 * for anything two or more meals need, then staples and one-off requests.
 */
export function renderListText(plan: WeekPlan): string {
  const plannedTitles = new Set(plan.meals.map((m) => m.recipe.title));
  const mealsUsing = (item: { forMeals: string[] }) => item.forMeals.filter((t) => plannedTitles.has(t));

  const lines: string[] = [];
  const bullet = (item: typeof plan.items[number], note?: (i: typeof plan.items[number]) => string) =>
    `• ${formatAmount(item.quantity, item.unit)} ${item.displayName}${note?.(item) ?? ''}`;

  const section = (heading: string, items: typeof plan.items, note?: (i: typeof plan.items[number]) => string) => {
    if (items.length === 0) return;
    lines.push(`*${heading}*`);
    for (const item of items) lines.push(bullet(item, note));
    lines.push('');
  };

  /** The same, but split into aisles, in the order DEPARTMENTS lists them. */
  const groupedSection = (heading: string, items: typeof plan.items) => {
    if (items.length === 0) return;
    lines.push(`*${heading}*`);

    const known = DEPARTMENTS.filter((d) => items.some((i) => i.department === d));
    // A department the classifier invented still gets its items shown.
    const extra = [...new Set(items.map((i) => i.department))].filter((d) => !known.includes(d as never));

    for (const department of [...known, ...extra]) {
      const mine = items.filter((i) => i.department === department);
      if (mine.length === 0) continue;
      lines.push(`_${department}_`);
      for (const item of mine) lines.push(bullet(item));
    }
    lines.push('');
  };

  const recipeItems = plan.items.filter((i) => i.source === 'recipe');

  // One meal needs it -> that meal's block. Two or more -> Shared.
  for (const meal of plan.meals) {
    const mine = recipeItems.filter((i) => {
      const used = mealsUsing(i);
      return used.length === 1 && used[0] === meal.recipe.title;
    });
    section(`${meal.weekday} — ${meal.recipe.title}`, mine);
  }

  section(
    'Shared',
    recipeItems.filter((i) => mealsUsing(i).length > 1),
    (item) => ` _(${mealsUsing(item).join(', ')})_`
  );

  // Staples are the long part of the order — forty-odd lines — so they are
  // grouped the way the store is walked rather than listed in one column.
  groupedSection('Staples', plan.items.filter((i) => i.source === 'staple'));
  section('You asked for', plan.items.filter((i) => i.source === 'requested'));
  section('Other', recipeItems.filter((i) => mealsUsing(i).length === 0));

  return lines.join('\n').trim();
}
