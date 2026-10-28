/**
 * Slack side of the weekly loop, over Socket Mode so the homelab needs no
 * inbound port.
 *
 *   op run --env-file=.env.op -- npm run slack:dev
 *
 * Needs SLACK_BOT_TOKEN (xoxb-), SLACK_APP_TOKEN (xapp-) and SLACK_USER_ID.
 * SLACK_ALLOWED_USERS adds anyone else who may drive it — Ty and Joslin both
 * plan, edit and approve. Everyone else is refused: this bot fills a real cart.
 */

import { App, SocketModeReceiver, type SayArguments } from '@slack/bolt';
import { log } from '../utils/logger.js';
import { parseReply, describeOps, type EditOp } from '../services/edit-parser.service.js';
import { renderListText, renderSlackBlocks, textBlocks, type PlanSummary } from '../services/plan-message.service.js';
import { HELP_REQUEST, renderHelpBlocks } from './help.js';
import type { NightPlan } from '../services/night-classifier.service.js';
import type { WeekPlan } from '../services/week-planner.service.js';

/** What Bolt's `say` accepts, in the shape this module uses it. */
type Respond = (msg: string | SayArguments) => Promise<unknown>;

/** What one shopping line matched at the store. */
export interface LineMatch {
  canonicalName: string;
  displayName: string;
  /** How it reads in Slack: "2 × Kroger Ground Beef", or null when nothing matched. */
  matched: string | null;
  /** The product actually chosen — what a bad-match report rejects. */
  upc?: string;
  /** The query that found it, kept so the report says why it went wrong. */
  term?: string;
  loose: boolean;
  /** What this line costs at the matched product's price, quantity included. */
  lineTotal?: number;
}

export interface PendingWeek {
  week: NightPlan[];
  plan: WeekPlan;
  summary: PlanSummary;
  /** What each line matched at the store, when it has been priced. */
  matches?: LineMatch[];
  /** Exactly what the products and quantities were when this was priced. */
  priced?: CartLine[];
  /** What the last edit actually did, and what it could not do. */
  changes?: string[];
  problems?: string[];
}

/** One line as it will be sent to Kroger. */
export interface CartLine {
  upc: string;
  quantity: number;
  displayName: string;
}

/** A reported bad match: what was rejected, and what replaced it. */
export interface ReportOutcome {
  pending: PendingWeek;
  /** One line for Slack, naming the replacement or saying there was none. */
  message: string;
}

export interface SlackDeps {
  /** Build (or rebuild) the week's plan. */
  buildPlan: (weekStart?: string) => Promise<PendingWeek>;
  /** Apply the edits and return the revised plan. */
  applyEdits: (current: PendingWeek, ops: EditOp[]) => Promise<PendingWeek>;
  /** Remember a bad product match and pick something else for that line. */
  reportMatch: (
    current: PendingWeek,
    report: { item: string; note?: string },
    reportedBy?: string
  ) => Promise<ReportOutcome>;
  /** Fill the Kroger cart. Returns a short summary line. */
  fillCart: (approved: PendingWeek) => Promise<string>;
  /** What was already sent to the cart for this week, if anything. */
  previousOrder: (weekStart: string) => Promise<{ lines: number; units: number; lastAt: string } | null>;
  /** The caps, so the instructions quote the real numbers. */
  budget: { softMax: number; hardMax: number };
}

export function createSlackApp(deps: SlackDeps) {
  const botToken = requireEnv('SLACK_BOT_TOKEN');
  const appToken = requireEnv('SLACK_APP_TOKEN');
  const ownerId = requireEnv('SLACK_USER_ID');

  // Everyone allowed to drive the planner. Both adults have the same rights:
  // the household shares the order, so it shares the controls.
  const household = new Set(
    [ownerId, ...(process.env.SLACK_ALLOWED_USERS ?? '').split(',')]
      .map((id) => id.trim())
      .filter(Boolean)
  );

  // Bolt's default 5s ping timeout is tight for a process that spends minutes
  // in Kroger API calls; a missed pong then logs a warning and reconnects.
  // Loosening it keeps the log honest — a warning should mean something.
  const receiver = new SocketModeReceiver({
    appToken,
    clientPingTimeout: Number(process.env.SLACK_PING_TIMEOUT_MS ?? 30_000),
    serverPingTimeout: Number(process.env.SLACK_SERVER_PING_TIMEOUT_MS ?? 60_000),
  });

  const app = new App({ token: botToken, receiver });

  // One pending plan at a time; the week is the unit of work, shared by both.
  let pending: PendingWeek | null = null;

  /**
   * Every change to `pending` runs through here, one at a time.
   *
   * Two people share this bot and the work between reading `pending` and
   * writing it back takes a minute of Kroger calls. Without a queue, Joslin
   * saying "ok" while Ty's edit is still pricing fills the cart with the plan
   * before the edit — and both of them saying "ok" at once fills it twice,
   * which cannot be undone because the Cart API only adds.
   */
  let work: Promise<unknown> = Promise.resolve();
  function serialize<T>(job: () => Promise<T>): Promise<T> {
    const next = work.then(job, job);
    work = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  /**
   * Which posted plan the buttons belong to. Old plan messages keep their
   * buttons forever, and a click on last week's message used to approve this
   * week's basket, so a click has to name the plan it came from.
   */
  let postedVersion = 0;

  const blocksFor = (week: PendingWeek) => {
    postedVersion += 1;
    return renderSlackBlocks(week.week, week.plan, { ...week.summary, version: postedVersion });
  };

  /** True when the click came from the plan currently on the table. */
  function isCurrentPlan(body: unknown): boolean {
    const actions = (body as { actions?: Array<{ value?: string }> }).actions ?? [];
    const value = actions[0]?.value;
    if (!value) return true; // nothing to check against; older message shape
    return value === `${pending?.summary.weekStart}#${postedVersion}`;
  }

  // Channels that have already been told how this works. Nobody wants the
  // instructions twice, but everybody wants them once.
  const briefed = new Set<string>();

  const isOwner = (userId?: string): boolean => !!userId && household.has(userId);

  /** Slack rejects a message carrying more than 50 blocks. */
  const MAX_BLOCKS_PER_MESSAGE = 45;

  /** Slack renders this as the person's name, so edits are attributable. */
  const who = (userId?: string): string => (userId ? `<@${userId}>` : 'someone');

  const helpBlocks = () => renderHelpBlocks(deps.budget.softMax, deps.budget.hardMax);

  async function postHelp(channel: string): Promise<void> {
    await app.client.chat.postMessage({
      channel,
      text: 'How the meal planner works',
      blocks: helpBlocks(),
    });
    // Only after it actually posted; a failed post must not mark the channel
    // briefed and leave nobody ever seeing the instructions.
    briefed.add(channel);
  }

  /** Post this week's plan and remember it as the thing being edited. */
  async function postPlan(channel: string, weekStart?: string): Promise<void> {
    // First plan in a channel comes with the instructions, so a plan is never
    // the first thing someone sees with no idea what to reply.
    if (!briefed.has(channel)) await postHelp(channel);
    const built = await deps.buildPlan(weekStart);
    await app.client.chat.postMessage({
      channel,
      text: `Meal plan for the week of ${built.summary.weekStart}`,
      blocks: blocksFor(built),
    });
    // Only once it is on screen: a plan nobody has seen must not be approvable.
    pending = built;
  }

  /**
   * Slack delivers a message that mentions the bot twice — once as `app_mention`
   * and once as an ordinary channel message — and both handlers are needed,
   * because only one of the two subscriptions may be enabled. Both carry the
   * same `ts`, so the second delivery is dropped rather than planning the week
   * twice or answering twice.
   */
  const handledEvents = new Set<string>();
  function alreadyHandled(ts?: string): boolean {
    if (!ts) return false;
    if (handledEvents.has(ts)) return true;
    handledEvents.add(ts);
    // A handful is plenty; this only has to span the gap between two deliveries.
    if (handledEvents.size > 200) {
      for (const old of [...handledEvents].slice(0, 100)) handledEvents.delete(old);
    }
    return false;
  }

  /** A request for a fresh plan, not a message that merely says "plan". */
  const PLAN_REQUEST = /^(?:new plan|re-?plan|plan(?: (?:the |this |next )?week)?|what'?s for dinner)[?.!]*$/i;

  app.event('app_mention', async ({ event, say }) => {
    const { user, channel, text, ts } = event as unknown as
      { user?: string; channel: string; text: string; ts?: string };
    if (!isOwner(user)) {
      await say('Only the household can change the grocery order.');
      return;
    }
    if (alreadyHandled(ts)) return;
    await guard(say, () => serialize(() => handleReply(stripMention(text), channel, say, user)));
  });

  app.message(async ({ message, say }) => {
    const m = message as unknown as
      { user?: string; text?: string; channel: string; subtype?: string; ts?: string };
    if (m.subtype || !m.text) return;
    if (!isOwner(m.user)) return;
    if (alreadyHandled(m.ts)) return;
    await guard(say, () => serialize(() => handleReply(stripMention(m.text!), m.channel, say, m.user)));
  });

  // Anything that still escapes a handler is logged rather than swallowed by
  // Bolt's default, which prints nothing useful and tells nobody.
  app.error(async (error) => {
    log('error', `Unhandled Slack error: ${error instanceof Error ? error.message : String(error)}`);
  });

  /**
   * A failed handler used to be completely silent: the user said "ok", the
   * Kroger token had expired, and nothing came back — so they said "ok" again,
   * which is the one action that can double an order. Every handler answers,
   * even when it fails.
   */
  async function guard(say: Respond, job: () => Promise<unknown>): Promise<void> {
    try {
      await job();
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      log('error', `Slack handler failed: ${detail}`);
      try {
        await say(`Something went wrong and I stopped: ${detail}\nNothing further was ordered. Try again, or say *plan* to start over.`);
      } catch {
        // Slack itself is unreachable; the log above is all there is.
      }
    }
  }

  async function handleReply(text: string, channel: string, say: Respond, userId?: string): Promise<void> {
    // Asked before anything is parsed: "help" is never an edit.
    if (HELP_REQUEST.test(text)) {
      await postHelp(channel);
      return;
    }

    if (PLAN_REQUEST.test(text.trim())) {
      await postPlan(channel);
      return;
    }

    if (!pending) {
      // Anything else with no plan on the table is just conversation. Building
      // a week costs a minute of Kroger calls; it happens when asked for.
      const { ops } = parseReply(text);
      if (ops.length === 0) return;
      await say('There is no plan on the table right now — say *plan* and I will build one.');
      return;
    }

    const { ops, unparsed, held } = parseReply(text);

    if (ops.length === 0) {
      await say(
        held
          ? `I didn't follow "${unparsed[0]}", so I have not ${held === 'approve' ? 'ordered anything' : 'cancelled anything'}. Say *${held === 'approve' ? 'ok' : 'cancel'}* on its own if that is what you meant.`
          : unparsed.length
            ? `I didn't follow "${unparsed[0]}". Try *swap tue for tacos*, *no cilantro*, *add 2 avocados*, *wrong: limes*, or *ok* to order — say *help* for the full list.`
            : 'Reply *ok* to order, or tell me what to change. Say *help* for what I understand.'
      );
      return;
    }

    if (ops.some((op) => op.op === 'reject')) {
      pending = null;
      await say(`${who(userId)} cancelled this week — nothing ordered. Say *plan* for a new one.`);
      return;
    }

    // A bad-match report changes which product a line buys, not the plan, so it
    // is applied on its own and answered with the replacement.
    const reports = ops.filter(
      (op): op is Extract<EditOp, { op: 'report_match' }> => op.op === 'report_match'
    );
    if (reports.length > 0) {
      const replies: string[] = [];
      for (const report of reports) {
        const outcome = await deps.reportMatch(pending, report, userId);
        pending = outcome.pending;
        replies.push(outcome.message);
      }
      await say(`${who(userId)} flagged a bad match:\n${replies.join('\n')}`);
    }

    const edits = ops.filter((op) => op.op !== 'approve' && op.op !== 'report_match');
    if (edits.length > 0) {
      pending = await deps.applyEdits(pending, edits);
      // What actually happened, not what was asked for: a swap with no matching
      // recipe used to be reported as done while the plan stayed as it was.
      const done = pending.changes?.length ? pending.changes : describeOps(edits);
      const failed = pending.problems ?? [];
      await say({
        text: `Updated: ${done.join('; ')}`,
        blocks: [
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `${who(userId)} changed: ${done.join(' · ')}` }],
          },
          ...blocksFor(pending),
        ],
      });
      if (failed.length > 0) await say(`I could not do that: ${failed.join('; ')}`);
      if (unparsed.length) await say(`I skipped ${unparsed.map((u) => `"${u}"`).join(' and ')} — say it another way?`);
    }

    if (held) {
      await say(
        `I didn't follow "${unparsed[0]}", so I have not ${held === 'approve' ? 'ordered anything' : 'cancelled anything'}. ` +
          `Say *${held === 'approve' ? 'ok' : 'cancel'}* on its own if that is what you meant.`
      );
    }

    if (ops.some((op) => op.op === 'approve')) {
      await approve(say, userId);
    }
  }

  /**
   * A week someone has already ordered, waiting on a second explicit yes.
   *
   * Kroger's cart only accepts additions — it cannot be read back or cleared
   * from here — so approving twice silently doubles the real basket, and the
   * only way to undo it is by hand in the app. Hence: say it twice.
   */
  let reorderConfirmed: string | null = null;

  async function approve(say: Respond, userId?: string): Promise<void> {
    if (!pending) {
      await say('Nothing to approve yet — say *plan*.');
      return;
    }
    const { weekStart, estimatedTotal, hardMax } = pending.summary;

    if (reorderConfirmed !== weekStart) {
      const already = await deps.previousOrder(weekStart);
      if (already) {
        reorderConfirmed = weekStart;
        await say(
          `Careful — I already added ${already.lines} ${already.lines === 1 ? 'line' : 'lines'} ` +
            `(${already.units} items) to the cart for the week of ${weekStart}, at ${already.lastAt}.\n` +
            'Kroger only lets me add, never read the cart back or clear it, so doing it again *stacks on top* ' +
            'of what is already there — and you would have to fix it by hand in the app.\n' +
            'If the cart is empty now, or you really do want these on top, say *ok* once more.'
        );
        return;
      }
    }
    reorderConfirmed = null;
    if (estimatedTotal != null && estimatedTotal > hardMax) {
      await say(
        `That basket is $${estimatedTotal.toFixed(2)}, over the $${hardMax} cap. ` +
          'Tell me what to cut and I will re-price it.'
      );
      return;
    }

    const result = await deps.fillCart(pending);
    pending = null;
    await say(
      `Approved by ${who(userId)}.\n${result}\nOpen the King Soopers app to check out — I can't place the order.`
    );
  }

  // Button clicks carry no `say`, so reply into the channel the click came from.
  app.action('approve_plan', async ({ ack, body }) => {
    await ack();
    const click = body as { user?: { id?: string }; channel?: { id?: string } };
    if (!isOwner(click.user?.id) || !click.channel?.id) return;
    const channel = click.channel.id;
    const post: Respond = (msg) =>
      app.client.chat.postMessage(
        typeof msg === 'string'
          ? { channel, text: msg }
          : ({ ...msg, channel } as Parameters<typeof app.client.chat.postMessage>[0])
      );

    await guard(post, () =>
      serialize(async () => {
        // Old plan messages keep working buttons; clicking one used to approve
        // whatever plan was current, which is not the basket that was read.
        if (!isCurrentPlan(body)) {
          await post('That is an older version of the plan — scroll down to the latest one and approve there.');
          return;
        }
        await approve(post, click.user?.id);
      })
    );
  });

  app.action('show_help', async ({ ack, body }) => {
    await ack();
    const click = body as { channel?: { id?: string } };
    if (!click.channel?.id) return;
    const channel = click.channel.id;
    await guard((msg) => app.client.chat.postMessage(typeof msg === 'string' ? { channel, text: msg } : { ...msg, channel } as Parameters<typeof app.client.chat.postMessage>[0]),
      () => postHelp(channel));
  });

  app.action('show_list', async ({ ack, body }) => {
    await ack();
    const click = body as { user?: { id?: string }; channel?: { id?: string } };
    if (!pending || !isOwner(click.user?.id) || !click.channel?.id) return;
    const channel = click.channel.id;
    const post: Respond = (msg) =>
      app.client.chat.postMessage(
        typeof msg === 'string' ? { channel, text: msg } : ({ ...msg, channel } as Parameters<typeof app.client.chat.postMessage>[0])
      );
    await guard(post, () => showList(channel));
  });

  async function showList(channel: string): Promise<void> {
    if (!pending) return;
    const list = renderListText(pending.plan);
    const detail = pending.matches?.length
      ? '\n\n*At the store*\n' +
        pending.matches
          .map((m) =>
            m.matched
              ? `${m.loose ? ':mag: ' : ''}${m.displayName} → ${m.matched}`
              : `:x: ${m.displayName} → not found`
          )
          .join('\n')
      : '';

    // A full basket runs past a single block, and Slack caps a message at 50
    // blocks, so long lists go out as several messages rather than being cut.
    const blocks = textBlocks(`${list}${detail}`);
    for (let start = 0; start < blocks.length; start += MAX_BLOCKS_PER_MESSAGE) {
      await app.client.chat.postMessage({
        channel,
        text: 'Shopping list',
        blocks: blocks.slice(start, start + MAX_BLOCKS_PER_MESSAGE),
      });
    }
  }

  /** The shared channel when set, otherwise a DM with the owner. */
  async function ownerDm(): Promise<string> {
    if (process.env.SLACK_CHANNEL) return process.env.SLACK_CHANNEL;
    const open = await app.client.conversations.open({ users: ownerId });
    const channel = open.channel?.id;
    if (!channel) throw new Error(`Could not open a DM with ${ownerId}`);
    return channel;
  }

  return {
    app,
    ownerDm,
    /** Post the instructions on demand, for the timer's first run. */
    async pushHelp(channel?: string): Promise<void> {
      await postHelp(channel ?? (await ownerDm()));
    },
    /** Used by the Saturday timer to push the week without being asked. */
    async pushWeeklyPlan(channel?: string, weekStart?: string): Promise<void> {
      const target = channel ?? (await ownerDm());
      await postPlan(target, weekStart);
      log('info', `Posted weekly plan to ${target}`);
    },
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — see docs/slack.md`);
  return value;
}

/** `<@U123> help` is a request for help, the mention is just addressing. */
function stripMention(text: string): string {
  return text.replace(/<@[^>]+>/g, '').trim();
}
