/**
 * Turns a free-text reply ("swap tue for tacos, no cilantro, make it 2 milk")
 * into operations the agent can apply and show as a diff.
 *
 * Deliberately rule-based: an approval flow should be predictable, and an
 * unrecognised phrase should come back as a question rather than a guess. The
 * model handles judgment (which recipe counts as "tacos"); this decides intent.
 */

export type EditOp =
  | { op: 'approve' }
  | { op: 'reject' }
  | { op: 'swap_meal'; day: string | null; request: string }
  | { op: 'skip_night'; day: string }
  | { op: 'add_item'; item: string; quantity?: number }
  | { op: 'remove_item'; item: string }
  | { op: 'set_qty'; item: string; quantity: number }
  | { op: 'report_match'; item: string; note?: string };

export interface ParsedReply {
  ops: EditOp[];
  /** Phrases that matched nothing; the agent asks about these instead of guessing. */
  unparsed: string[];
  /**
   * An approval or refusal that was withheld because the same message contained
   * something unreadable. The caller says what it did not follow and waits.
   */
  held?: 'approve' | 'reject';
}

const DAYS: Record<string, string> = {
  sun: 'Sunday', sunday: 'Sunday',
  mon: 'Monday', monday: 'Monday',
  tue: 'Tuesday', tues: 'Tuesday', tuesday: 'Tuesday',
  wed: 'Wednesday', weds: 'Wednesday', wednesday: 'Wednesday',
  thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday', thursday: 'Thursday',
  fri: 'Friday', friday: 'Friday',
  sat: 'Saturday', saturday: 'Saturday',
  tonight: 'today', tomorrow: 'tomorrow',
};

/**
 * Approval and refusal are matched against a WHOLE clause, never as a prefix.
 *
 * This bot fills a real cart and cancels a real week, and it reads every message
 * in the channel. A prefix match turns "stop by the store for milk" into a
 * cancellation and "ok, I'll be late" into an order. Requiring the clause to be
 * nothing but the word costs a second message in the rare ambiguous case and
 * removes a whole class of accidents.
 */
const APPROVE =
  /^(?:(?:ok(?:ay)?|yes|yep|yup|yeah|sure|approved?|approve it|looks good|looks good to me|sounds good|lgtm|go|go ahead|send it|do it|ship it|order it|buy it|perfect|great)[.!]*|[👍✅🆗]+)$/i;
const REJECT =
  /^(?:(?:no|nope|cancel|cancel it|stop|hold off|don'?t order|do not order|skip it|skip this week|reject)[.!]*)$/i;

function dayFrom(text: string): string | null {
  const match = text.match(/\b(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday|tonight|tomorrow)\b/i);
  return match ? DAYS[match[1].toLowerCase()] ?? null : null;
}

function cleanItem(text: string): string {
  return text
    .replace(/\b(the|some|a|an|please|too|also|for (me|us)|from (the )?(list|cart|order))\b/gi, ' ')
    .replace(/[.,!]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseQuantity(text: string): { quantity: number | null; rest: string } {
  const match = text.match(/^\s*(\d+(?:\.\d+)?)\s*(?:x\s*)?(.*)$/);
  if (match) return { quantity: Number(match[1]), rest: match[2] };
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, a: 1, an: 1 };
  const word = text.match(/^\s*(one|two|three|four|five|six|a|an)\s+(.*)$/i);
  if (word) return { quantity: words[word[1].toLowerCase()], rest: word[2] };
  return { quantity: null, rest: text };
}

/** Split on commas, "and", newlines and semicolons — how people actually type. */
function clauses(reply: string): string[] {
  return reply
    // A capturing group here would leak undefined entries into the split result.
    .split(/[\n;,]+|\band\b(?!\s+(?:cheese|cream|sour|half))/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

export function parseReply(reply: string): ParsedReply {
  const ops: EditOp[] = [];
  const unparsed: string[] = [];

  for (const clause of clauses(reply)) {
    const text = clause.trim();
    if (!text) continue;

    if (APPROVE.test(text)) { ops.push({ op: 'approve' }); continue; }
    if (REJECT.test(text)) { ops.push({ op: 'reject' }); continue; }

    // Read before the swap rule: "wrong: boston butt" also looks like "<day>: <meal>".
    // wrong: boston butt / bad match on limes / that's not broth
    const report = text.match(/^(?:wrong|bad|incorrect|not right|that'?s not|mismatch)(?:\s+(?:product|item|match))?\s*(?:on|for|:)?\s+(.+)$/i)
      ?? text.match(/^(.+?)\s+(?:is|was)\s+(?:wrong|the wrong \w+|not right|a bad match)$/i);
    if (report) {
      const [item, ...rest] = cleanItem(report[1]).split(/\s*[-—]\s*/);
      if (item) {
        ops.push(rest.length > 0 ? { op: 'report_match', item, note: rest.join(' ') } : { op: 'report_match', item });
        continue;
      }
    }

    // swap tuesday for tacos / change wed to chicken / tuesday: pizza
    const swap = text.match(/\b(?:swap|change|replace|make)\b\s+(.+?)\s+(?:for|to|with)\s+(.+)$/i)
      ?? text.match(/^(\w+)\s*:\s*(.+)$/);
    if (swap) {
      const day = dayFrom(swap[1]);
      const request = cleanItem(swap[2]);
      // "make it 2 gallons of milk" is a quantity change, not a meal swap.
      const quantified = swap[1].match(/^it$/i) ? parseQuantity(request) : { quantity: null, rest: request };
      if (quantified.quantity != null) {
        ops.push({ op: 'set_qty', item: cleanItem(quantified.rest), quantity: quantified.quantity });
      } else if (day || /\b(dinner|meal|night)\b/i.test(swap[1])) {
        ops.push({ op: 'swap_meal', day, request });
      } else {
        ops.push({ op: 'swap_meal', day: null, request });
      }
      continue;
    }

    // skip thursday / no dinner friday
    const skip = text.match(/\b(?:skip|no dinner(?: on)?|we'?re out(?: on)?|eating out(?: on)?)\s+(.+)$/i);
    if (skip) {
      const day = dayFrom(skip[1]);
      if (day) { ops.push({ op: 'skip_night', day }); continue; }
    }

    // make it 3 avocados / 2x milk
    const qty = text.match(/^(?:make it|set|change)\s+(\d+(?:\.\d+)?)\s*(?:x\s*)?(.+)$/i)
      ?? text.match(/^(\d+(?:\.\d+)?)\s*x\s+(.+)$/i);
    if (qty) {
      ops.push({ op: 'set_qty', item: cleanItem(qty[2]), quantity: Number(qty[1]) });
      continue;
    }

    // drop the cilantro / no cilantro / remove salsa
    const remove = text.match(/^(?:no|drop|remove|delete|skip|without|take off)\s+(.+)$/i);
    if (remove) {
      const item = cleanItem(remove[1]);
      if (item) { ops.push({ op: 'remove_item', item }); continue; }
    }

    // add bananas / add 2 gallons of milk / we need eggs
    const add = text.match(/^(?:add|also get|get|buy|we need|need|throw in|include)\s+(.+)$/i);
    if (add) {
      const { quantity, rest } = parseQuantity(add[1]);
      const item = cleanItem(rest);
      if (item) {
        ops.push(quantity == null ? { op: 'add_item', item } : { op: 'add_item', item, quantity });
        continue;
      }
    }

    unparsed.push(text);
  }

  // Filling a cart and cancelling a week are the two irreversible acts here, so
  // neither happens on a message that was only partly understood. "go ahead and
  // tell Camden practice moved" splits into an approval and a sentence about
  // hockey; the approval waits until someone says it on its own.
  const decision = ops.find((op) => op.op === 'approve' || op.op === 'reject');
  if (unparsed.length > 0 && decision) {
    return {
      ops: ops.filter((op) => op.op !== 'approve' && op.op !== 'reject'),
      unparsed,
      held: decision.op as 'approve' | 'reject',
    };
  }

  return { ops, unparsed };
}

/** One line per operation, for the confirmation the agent posts before acting. */
export function describeOps(ops: EditOp[]): string[] {
  return ops.map((op) => {
    switch (op.op) {
      case 'approve': return 'Approve the plan and fill the cart';
      case 'reject': return 'Cancel this week';
      case 'swap_meal': return `Swap ${op.day ?? 'a night'} for ${op.request}`;
      case 'skip_night': return `Skip cooking on ${op.day}`;
      case 'add_item': return `Add ${op.quantity ? `${op.quantity} ` : ''}${op.item}`;
      case 'remove_item': return `Remove ${op.item}`;
      case 'set_qty': return `Set ${op.item} to ${op.quantity}`;
      case 'report_match': return `Never buy that product for ${op.item} again`;
    }
  });
}
