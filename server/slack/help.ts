/**
 * What the bot says when asked what it is.
 *
 * Two people drive this thing and neither of them wrote it, so the instructions
 * live with the code rather than in someone's memory. The same text is posted on
 * `help`, on the "How this works" button, and the first time the bot speaks in a
 * channel. The command table below and the one in docs/slack.md should agree.
 */

import type { SlackBlock } from '../services/plan-message.service.js';

/** Checked before anything else, so `help` is never read as an edit. */
export const HELP_REQUEST =
  // A bare "?" has no word boundary to end on, so it sits outside the \b group.
  /^\s*(?:\?+|(?:help|commands?|how (?:does this|do you) work|what can you do)\b)/i;

/** Left column is what you type; right column is what happens. */
const COMMANDS: Array<[said: string, does: string]> = [
  ['plan', "build this week's plan"],
  ['ok / yes / looks good', 'approve it and fill the cart'],
  ['swap wed for tacos', "replace one night's dinner"],
  ['skip thursday', 'skip cooking that night'],
  ['no cilantro', 'drop an item from the list'],
  ['add 2 avocados', 'add an item'],
  ['make it 3 avocados', 'change an amount'],
  ['wrong: boston butt', 'reject the product I matched'],
  ['cancel', 'drop the week and order nothing'],
  ['help', 'show this message'],
];

function commandTable(): string {
  const width = Math.max(...COMMANDS.map(([said]) => said.length));
  return COMMANDS.map(([said, does]) => `${said.padEnd(width)}   ${does}`).join('\n');
}

function section(text: string): SlackBlock {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}

export function renderHelpBlocks(softMax: number, hardMax: number): SlackBlock[] {
  return [
    { type: 'header', text: { type: 'plain_text', text: 'Meal Planner — how this works' } },

    section(
      'I plan the week’s dinners around your calendars and fill your King Soopers cart. ' +
        'Every Saturday I post a plan in this channel and wait for one of you to answer. ' +
        '*Nothing is ordered until you approve it*, and even then I only fill the cart — ' +
        'placing the order stays with you, in the King Soopers app.'
    ),

    section(
      '*How I build a week*\n' +
        '1. Read the family calendar along with the hockey, lacrosse, gymnastics, and work calendars.\n' +
        '2. Work out what time each evening actually leaves between the last event and dinner.\n' +
        '3. Pick the three best weeknights and one weekend night to cook, and let leftovers cover a night that’s too tight.\n' +
        '4. Choose recipes that fit the time those nights have, without repeating a protein two nights running.\n' +
        '5. Scale each recipe for five people, plus two servings of leftovers.\n' +
        '6. Add the staples you’re due for, based on how often you’ve bought them before.\n' +
        '7. Match every line to a product at your store, price the basket, and post it here.'
    ),

    section(
      '*Reading the plan*\n' +
        'The table gives one row to each night of the week.\n' +
        '• *Dinner* — the recipe, or `eat out`, or `leftovers · Wed` to say which cook they came from.\n' +
        '• *Time* — when dinner lands. It’s 6:00 unless an event pushes it later.\n' +
        '• *Cook* — how far I scaled the recipe, so `×1.5` means one and a half batches.\n' +
        'The line under the table flags whatever is unusual: a night eaten in shifts as people ' +
        'get home, a night the food has to wait in the slow cooker, or the reason the calendar ' +
        'ruled a night out. *Show list* breaks the order into one section per meal, then the ' +
        'ingredients two meals share, then staples — all in US measures.'
    ),

    section(`*Changing it*\nReply in plain words:\n\`\`\`\n${commandTable()}\n\`\`\``),

    section(
      'Several changes in one message are fine: _“swap wed for tacos, no cilantro, add 2 ' +
        'avocados”_. I re-plan, re-price, and post the new version. If I don’t understand a ' +
        'phrase I’ll ask about it rather than guess — I never invent an edit.'
    ),

    section(
      '*When I match the wrong product*\n' +
        'Store search occasionally returns something absurd — Kerrygold butter for a Boston ' +
        'butt, fruit punch for lemon juice. Name the line and I’ll fix it: `wrong: lemon ' +
        'juice`. I search that line again, tell you what replaced it, and never buy the ' +
        'rejected product for that ingredient again — this week or any week. Add a reason if ' +
        'it’s worth recording: `wrong: lemon juice - that’s a fruit punch`.'
    ),

    section(
      '*Limits*\n' +
        `• I aim to stay under $${softMax} and refuse to order above $${hardMax}. Over the ` +
        'cap I’ll say so and wait for you to tell me what to cut.\n' +
        '• Kroger only lets me add to the cart, never read it back, so glance over the cart ' +
        'in the app before you check out.\n' +
        '• Ty and Joslin have the same rights: either of you can plan, edit, or approve, and ' +
        'I say who did what.'
    ),

    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'The buttons do the same as the words: *Approve & fill cart*, *Show list*, *How this works*.',
        },
      ],
    },
  ];
}
