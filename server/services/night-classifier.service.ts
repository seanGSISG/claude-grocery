import { ADULTS, FAMILY_PORTIONS, HOUSEHOLD, ruleFor, type EventRule, type PersonId } from '../config/household.js';

/**
 * Turns calendar events into a cooking budget per night.
 *
 * The planner asks one question of each evening: how much time is there between
 * getting home and dinner at 6-7 pm? Everything else (recipe choice, shopping)
 * follows from the answer.
 */

export interface CalendarEvent {
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  status?: string;
  /** Which calendar this came from; set by mergeFeeds. */
  source?: string;
}

/** One subscribed calendar's events for the week. */
export interface CalendarFeed {
  name: string;
  calendarId?: string;
  events: CalendarEvent[];
}

/**
 * Flatten several calendars into one event list, tagging each with its source
 * and dropping duplicates. The same practice often appears on both a team feed
 * and the family calendar; counting it twice would not change the verdict, but
 * it clutters the reason shown in Slack.
 */
export function mergeFeeds(feeds: CalendarFeed[]): CalendarEvent[] {
  const seen = new Map<string, CalendarEvent>();
  for (const feed of feeds) {
    for (const event of feed.events) {
      const key = [
        (event.summary ?? '').trim().toLowerCase(),
        event.start?.dateTime ?? event.start?.date ?? '',
        event.end?.dateTime ?? event.end?.date ?? '',
      ].join('|');
      if (!seen.has(key)) seen.set(key, { ...event, source: feed.name });
    }
  }
  return [...seen.values()];
}

/**
 * How the household eats that night.
 *   full        - normal cook, everyone at the table at 6
 *   late        - normal cook, dinner pushed to ~7:30 when the last event ends
 *   shifts      - cook normally; one adult is home, others eat when they return
 *   slow-cooker - nobody is home to cook, food must be ready on arrival
 *   skip        - too fragmented to cook; eat out or fend for yourselves
 *   eat-out     - a cookable night the planner chose not to cook (quota met)
 *   leftovers   - covered by an earlier cook
 */
export type NightKind = 'full' | 'late' | 'shifts' | 'quick' | 'slow-cooker' | 'skip' | 'eat-out' | 'leftovers';

export interface NightPlan {
  /** YYYY-MM-DD, local. */
  date: string;
  weekday: string;
  kind: NightKind;
  /** Minutes of hands-on cooking this night can take. */
  maxPrepMinutes: number;
  reason: string;
  events: string[];
  /** Adults tied up during the dinner window. */
  adultsOut: string[];
  /** Adult-equivalent portions to cook for at the table; the rest reheat. */
  atTable: number;
  /** Serving time, local 24h, when it moves off the usual 6 pm. */
  serveHour?: number;
}

export interface ClassifyOptions {
  /** Dinner window, local hours. Ty's household eats 6-7 pm. */
  dinnerStartHour?: number;
  dinnerEndHour?: number;
  /** An evening event ending at or after this hour rules out a full cook. */
  eveningFromHour?: number;
  timeZone?: string;
}

const DEFAULTS: Required<Omit<ClassifyOptions, 'timeZone'>> & { timeZone: string } = {
  dinnerStartHour: 18,
  dinnerEndHour: 19,
  eveningFromHour: 16,
  timeZone: 'America/Denver',
};

const AWAY_PATTERN = /\b(vacation|trip|flight|out of town|travel|camp(?:ing)?|away)\b/i;
const DINNER_OUT_PATTERN = /\b(dinner out|dinner with|restaurant|date night|eat out|takeout|reservation)\b/i;
const GUEST_PATTERN = /\b(guests?|hosting|potluck|party|birthday|thanksgiving|christmas|dinner party)\b/i;

function localParts(iso: string, timeZone: string): { date: string; hour: number; minute: number } {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

function weekdayName(date: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(new Date(`${date}T12:00:00Z`));
}

export function weekDates(start: string, days = 7): string[] {
  const out: string[] = [];
  const base = new Date(`${start}T12:00:00Z`);
  for (let i = 0; i < days; i += 1) {
    const d = new Date(base.getTime() + i * 86_400_000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Classify every night of the week starting at `weekStart` (YYYY-MM-DD).
 * `leftoversNights` marks nights the planner intends to fill from leftovers.
 */
export function classifyWeek(
  weekStart: string,
  events: CalendarEvent[],
  options: ClassifyOptions = {}
): NightPlan[] {
  const opts = { ...DEFAULTS, ...options };
  const byDate = new Map<
    string,
    Array<{ summary: string; startHour: number; endHour: number; allDay: boolean; source?: string }>
  >();

  for (const event of events) {
    if (event.status === 'cancelled') continue;
    const summary = event.summary ?? '(untitled)';

    if (event.start?.date) {
      // All-day event: applies to every date it covers.
      const end = event.end?.date ?? event.start.date;
      for (const date of weekDates(event.start.date, 14)) {
        if (date >= end) break;
        const list = byDate.get(date) ?? [];
        list.push({ summary, startHour: 0, endHour: 24, allDay: true, source: event.source });
        byDate.set(date, list);
      }
      continue;
    }

    if (!event.start?.dateTime) continue;
    const start = localParts(event.start.dateTime, opts.timeZone);
    const end = event.end?.dateTime ? localParts(event.end.dateTime, opts.timeZone) : start;
    const list = byDate.get(start.date) ?? [];
    list.push({
      summary,
      startHour: start.hour + start.minute / 60,
      endHour: end.date === start.date ? end.hour + end.minute / 60 : 24,
      allDay: false,
      source: event.source,
    });
    byDate.set(start.date, list);
  }

  return weekDates(weekStart).map((date) => {
    const dayEvents = (byDate.get(date) ?? []).slice().sort((a, b) => a.startHour - b.startHour);
    const weekday = weekdayName(date, opts.timeZone);
    const names = dayEvents.map((e) => (e.source ? `${e.summary} [${e.source}]` : e.summary));

    const away = dayEvents.find((e) => AWAY_PATTERN.test(e.summary));
    if (away) {
      return night(date, weekday, 'skip', 0, `away: ${away.summary}`, names, [], 0);
    }
    const out = dayEvents.find((e) => DINNER_OUT_PATTERN.test(e.summary));
    if (out) {
      return night(date, weekday, 'skip', 0, `eating out: ${out.summary}`, names, [], 0);
    }

    // The window that matters: prep time through the end of dinner.
    const prepFrom = opts.dinnerStartHour - 1.5;
    const relevant = dayEvents.filter(
      (e) => !e.allDay && e.endHour > prepFrom && e.startHour < opts.dinnerEndHour
    );

    // Who is out of the house, and when does the household reconvene?
    const adultsOut = new Set<PersonId>();
    const kidsOut = new Set<PersonId>();
    let lastEnd = 0;
    let awayEvents = 0;

    // Two passes: events with a fixed adult first (Ty coaches Eli's team), so
    // "whoever is free" assignments land on the parent who is actually free.
    const outings: Array<{ summary: string; endHour: number; rule: EventRule | null }> = [];
    for (const event of relevant) {
      const rule = ruleFor(event.summary);
      if (rule?.atHome) continue; // lessons at the house tie up nobody
      outings.push({ summary: event.summary, endHour: event.endHour, rule });
      lastEnd = Math.max(lastEnd, event.endHour);
      awayEvents += 1;
    }

    for (const { rule } of outings) {
      if (!rule) continue;
      for (const person of rule.who) {
        if (ADULTS.includes(person)) adultsOut.add(person);
        else kidsOut.add(person);
      }
      if (rule.driver.kind === 'fixed') adultsOut.add(rule.driver.person);
    }

    for (const { rule } of outings) {
      if (!rule) {
        // Unknown event on a family calendar: assume it takes whoever is free.
        const free = ADULTS.find((a) => !adultsOut.has(a));
        adultsOut.add(free ?? ADULTS[ADULTS.length - 1]);
        continue;
      }
      if (rule.driver.kind !== 'any') continue;
      const needsDriver = rule.who.some((id: PersonId) => HOUSEHOLD.find((p) => p.id === id)?.needsDriver);
      if (!needsDriver) continue;
      const free = ADULTS.find((a) => !adultsOut.has(a));
      if (free) adultsOut.add(free);
    }

    const outNames = [...adultsOut].map((id) => HOUSEHOLD.find((p) => p.id === id)!.name);
    const atTable = HOUSEHOLD.filter(
      (p) => !adultsOut.has(p.id as PersonId) && !kidsOut.has(p.id as PersonId)
    ).reduce((sum, p) => sum + p.portion, 0);

    if (awayEvents === 0) {
      return night(date, weekday, 'full', 60, 'open evening', names, outNames, FAMILY_PORTIONS);
    }

    // Three or more separate trips out is a night nobody cooks.
    if (awayEvents >= 3 && adultsOut.size >= ADULTS.length) {
      return night(date, weekday, 'skip', 0, `${awayEvents} overlapping commitments, nobody home to cook`, names, outNames, 0);
    }

    const bothAdultsOut = adultsOut.size >= ADULTS.length;
    const throughDinner = relevant.some(
      (e) => !ruleFor(e.summary)?.atHome && e.startHour < opts.dinnerEndHour && e.endHour > opts.dinnerStartHour
    );

    if (bothAdultsOut && throughDinner) {
      return night(date, weekday, 'slow-cooker', 15,
        `${outNames.join(' and ')} out until ${formatHour(lastEnd)} — food has to be ready on arrival`,
        names, outNames, 0);
    }

    if (bothAdultsOut) {
      // Everyone is back before dinner, just later than usual.
      const serve = Math.max(opts.dinnerStartHour, roundUpHalf(lastEnd + 0.5));
      return night(date, weekday, 'late', 40,
        `last event ends ${formatHour(lastEnd)}; eat at ${formatHour(serve)}`,
        names, outNames, FAMILY_PORTIONS, serve);
    }

    if (throughDinner) {
      const homeAdult = HOUSEHOLD.find((p) => p.isAdult && !adultsOut.has(p.id))!;
      return night(date, weekday, 'shifts', 45,
        `${homeAdult.name} is home to cook; ${outNames.join(' and ')} back ${formatHour(lastEnd)} — hold portions`,
        names, outNames, atTable);
    }

    const serve = Math.max(opts.dinnerStartHour, roundUpHalf(lastEnd + 0.5));
    return night(date, weekday, 'late', 45,
      `${outNames.join(' and ')} back ${formatHour(lastEnd)}; eat at ${formatHour(serve)}`,
      names, outNames, FAMILY_PORTIONS, serve);
  });
}

function night(
  date: string,
  weekday: string,
  kind: NightKind,
  maxPrepMinutes: number,
  reason: string,
  events: string[],
  adultsOut: string[],
  atTable: number,
  serveHour?: number
): NightPlan {
  return { date, weekday, kind, maxPrepMinutes, reason, events, adultsOut, atTable, serveHour };
}

function roundUpHalf(hour: number): number {
  return Math.ceil(hour * 2) / 2;
}

function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

/**
 * Mark one leftovers night: the day after the biggest cook, when that day is
 * otherwise constrained. Keeps the week from needing seven recipes.
 */
export function assignLeftovers(week: NightPlan[]): NightPlan[] {
  const out = [...week];
  for (let i = 1; i < out.length; i += 1) {
    const prev = out[i - 1];
    const here = out[i];
    const cooked = prev.kind === 'full' || prev.kind === 'late' || prev.kind === 'shifts';
    const tight = here.kind === 'quick' || here.kind === 'slow-cooker';
    if (cooked && tight) {
      out[i] = { ...here, kind: 'leftovers', maxPrepMinutes: 10, reason: `leftovers from ${prev.weekday}'s cook` };
      break;
    }
  }
  return out;
}


// ---------------------------------------------------------------------------
// Cooking quota
// ---------------------------------------------------------------------------

export interface CookQuota {
  /** Cooked dinners Mon-Fri. */
  weekdays: number;
  /** Cooked dinners Sat-Sun. */
  weekend: number;
}

export const DEFAULT_QUOTA: CookQuota = { weekdays: 3, weekend: 1 };

/** Easiest night to cook on comes first. */
const COOKABILITY: Record<NightKind, number> = {
  full: 0,
  late: 1,
  shifts: 2,
  quick: 3,
  'slow-cooker': 4,
  leftovers: 98,
  'eat-out': 99,
  skip: 99,
};

function isWeekend(weekday: string): boolean {
  return weekday === 'Saturday' || weekday === 'Sunday';
}

/**
 * The household cooks a fixed number of dinners a week (3 weekdays + 1 weekend)
 * and eats out the rest. Keep the easiest nights to cook on, and turn the rest
 * into eat-out nights so the grocery list does not carry food nobody will make.
 *
 * Nights already marked `skip` (travel, dinner out, chaos) are never cooking
 * candidates.
 */
export function applyCookQuota(week: NightPlan[], quota: CookQuota = DEFAULT_QUOTA): NightPlan[] {
  const candidates = week
    .map((night, index) => ({ night, index }))
    .filter(({ night }) => night.kind !== 'skip' && night.kind !== 'leftovers')
    .sort((a, b) =>
      COOKABILITY[a.night.kind] - COOKABILITY[b.night.kind] ||
      b.night.atTable - a.night.atTable ||
      a.index - b.index
    );

  const keep = new Set<number>();
  let weekdaysLeft = quota.weekdays;
  let weekendLeft = quota.weekend;

  for (const { night, index } of candidates) {
    if (isWeekend(night.weekday)) {
      if (weekendLeft > 0) { keep.add(index); weekendLeft -= 1; }
    } else if (weekdaysLeft > 0) {
      keep.add(index); weekdaysLeft -= 1;
    }
  }

  return week.map((night, index) => {
    if (keep.has(index) || night.kind === 'skip' || night.kind === 'leftovers') return night;
    return {
      ...night,
      kind: 'eat-out',
      maxPrepMinutes: 0,
      reason: night.kind === 'full'
        ? 'eating out (weekly cooking quota already met)'
        : `${night.reason} — eating out`,
    };
  });
}
