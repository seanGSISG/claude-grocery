import { describe, it, expect } from 'vitest';
import {
  classifyWeek,
  assignLeftovers,
  applyCookQuota,
  mergeFeeds,
  weekDates,
  type CalendarEvent,
} from '../../server/services/night-classifier.service.js';

const ev = (summary: string, startIso: string, endIso: string): CalendarEvent => ({
  summary, start: { dateTime: startIso }, end: { dateTime: endIso },
});

const WEEK = '2026-09-27'; // Sunday
const on = (week: ReturnType<typeof classifyWeek>, date: string) => week.find((n) => n.date === date)!;

describe('week shape', () => {
  it('produces seven consecutive dates', () => {
    expect(weekDates(WEEK)).toHaveLength(7);
    expect(weekDates(WEEK)[6]).toBe('2026-10-03');
  });

  it('treats an empty evening as a full cook for the whole family', () => {
    const night = on(classifyWeek(WEEK, []), '2026-09-29');
    expect(night.kind).toBe('full');
    expect(night.maxPrepMinutes).toBe(60);
    expect(night.atTable).toBeCloseTo(4.2); // 2 adults + Camden + 0.6 + 0.6
  });

  it('ignores morning and daytime events', () => {
    const week = classifyWeek(WEEK, [
      ev('12U A Red Practice', '2026-10-01T05:45:00-06:00', '2026-10-01T07:00:00-06:00'),
      ev('Dr Chikuri [Ty] Virtual', '2026-10-01T10:00:00-06:00', '2026-10-01T11:00:00-06:00'),
    ]);
    expect(on(week, '2026-10-01').kind).toBe('full');
  });
});

describe('who is out', () => {
  it('keeps one parent home when a single child has practice', () => {
    const night = on(classifyWeek(WEEK, [ev('Ivy gymnastics', '2026-09-28T16:00:00-06:00', '2026-09-28T20:00:00-06:00')]), '2026-09-28');
    expect(night.kind).toBe('shifts');
    expect(night.adultsOut).toHaveLength(1);
    expect(night.atTable).toBeCloseTo(2.6); // home parent + Camden + Eli; Ivy and her driver eat later
    expect(night.reason).toContain('hold portions');
  });

  it('counts Ty as out for Eli hockey because he coaches that team', () => {
    const night = on(classifyWeek(WEEK, [ev('12U A Red Practice', '2026-09-29T17:50:00-06:00', '2026-09-29T19:00:00-06:00')]), '2026-09-29');
    expect(night.adultsOut).toEqual(['Ty']);
    expect(night.kind).toBe('shifts');
  });

  it('sends the other parent when a second child has an overlapping event', () => {
    const night = on(classifyWeek(WEEK, [
      ev('12U A Red Practice', '2026-09-29T17:50:00-06:00', '2026-09-29T19:00:00-06:00'),
      ev('Ivy gymnastics', '2026-09-29T16:00:00-06:00', '2026-09-29T20:00:00-06:00'),
    ]), '2026-09-29');
    expect(night.adultsOut.sort()).toEqual(['Joslin', 'Ty']);
    expect(night.kind).toBe('slow-cooker');
    expect(night.atTable).toBe(0);
  });

  it('does not tie up an adult for a lesson held at the house', () => {
    const night = on(classifyWeek(WEEK, [
      ev('Piano Lesson - Alexander', '2026-09-29T16:00:00-06:00', '2026-09-29T16:30:00-06:00'),
      ev('Guitar Lesson - Alexander', '2026-09-29T16:30:00-06:00', '2026-09-29T17:00:00-06:00'),
    ]), '2026-09-29');
    expect(night.kind).toBe('full');
    expect(night.adultsOut).toEqual([]);
  });

  it("does not send a driver for Ty's own hockey", () => {
    const night = on(classifyWeek(WEEK, [ev('Loonies at The Tropics', '2026-10-02T19:10:00-06:00', '2026-10-02T20:25:00-06:00')]), '2026-10-02');
    expect(night.adultsOut).toEqual([]); // starts after dinner
    expect(night.kind).toBe('full');
  });
});

describe('how they eat', () => {
  it('pushes dinner later when both parents are out but back before 7', () => {
    const night = on(classifyWeek(WEEK, [
      ev('12U A Red Practice', '2026-10-01T17:00:00-06:00', '2026-10-01T18:00:00-06:00'),
      ev('Kings 2031 - Practice', '2026-10-01T17:00:00-06:00', '2026-10-01T18:00:00-06:00'),
    ]), '2026-10-01');
    expect(night.kind).toBe('late');
    expect(night.serveHour).toBe(18.5);
    expect(night.reason).toContain('6:30pm');
  });

  it('needs the slow cooker when both parents are out through dinner', () => {
    const night = on(classifyWeek(WEEK, [
      ev('12U A Red Practice', '2026-09-30T17:00:00-06:00', '2026-09-30T20:00:00-06:00'),
      ev('Kings 2031 - Practice', '2026-09-30T17:00:00-06:00', '2026-09-30T20:00:00-06:00'),
    ]), '2026-09-30');
    expect(night.kind).toBe('slow-cooker');
    expect(night.maxPrepMinutes).toBe(15);
    expect(night.reason).toContain('ready on arrival');
  });

  it('gives up on a night with three or more trips out', () => {
    const night = on(classifyWeek(WEEK, [
      ev('Ivy gymnastics', '2026-10-02T16:00:00-06:00', '2026-10-02T20:00:00-06:00'),
      ev('14U AA Prospects Practice', '2026-10-02T16:15:00-06:00', '2026-10-02T17:15:00-06:00'),
      ev('12U A Red Practice', '2026-10-02T17:50:00-06:00', '2026-10-02T19:00:00-06:00'),
    ]), '2026-10-02');
    expect(night.kind).toBe('skip');
    expect(night.maxPrepMinutes).toBe(0);
  });

  it('skips travel and dinners out', () => {
    const week = classifyWeek(WEEK, [
      ev('Dinner out with the Smiths', '2026-09-27T18:00:00-06:00', '2026-09-27T20:00:00-06:00'),
      { summary: 'Moab trip', start: { date: '2026-09-30' }, end: { date: '2026-10-02' } },
    ]);
    expect(on(week, '2026-09-27').kind).toBe('skip');
    expect(on(week, '2026-10-01').kind).toBe('skip');
    expect(on(week, '2026-10-02').kind).toBe('full'); // end date is exclusive
  });

  it('ignores cancelled events', () => {
    const week = classifyWeek(WEEK, [{ ...ev('Ivy gymnastics', '2026-09-28T16:00:00-06:00', '2026-09-28T20:00:00-06:00'), status: 'cancelled' }]);
    expect(on(week, '2026-09-28').kind).toBe('full');
  });
});

describe('multiple calendars', () => {
  const feeds = [
    { name: 'Family', events: [ev('Ivy gymnastics', '2026-09-28T16:00:00-06:00', '2026-09-28T20:00:00-06:00')] },
    { name: 'Kings 2031', events: [ev('Kings 2031 - Practice', '2026-09-27T17:00:00-06:00', '2026-09-27T19:00:00-06:00')] },
  ];

  it('tags each event with its calendar', () => {
    const week = classifyWeek(WEEK, mergeFeeds(feeds));
    expect(on(week, '2026-09-28').events).toEqual(['Ivy gymnastics [Family]']);
  });

  it('lets a team calendar change a night the family calendar shows as free', () => {
    expect(on(classifyWeek(WEEK, feeds[0].events), '2026-09-27').kind).toBe('full');
    expect(on(classifyWeek(WEEK, mergeFeeds(feeds)), '2026-09-27').kind).toBe('shifts');
  });

  it('drops an event duplicated across feeds', () => {
    const dupe = [
      { name: 'Family', events: [ev('Kings 2031 - Practice', '2026-09-27T17:00:00-06:00', '2026-09-27T19:00:00-06:00')] },
      { name: 'Kings 2031', events: [ev('kings 2031 - practice ', '2026-09-27T17:00:00-06:00', '2026-09-27T19:00:00-06:00')] },
    ];
    expect(mergeFeeds(dupe)).toHaveLength(1);
    expect(mergeFeeds(dupe)[0].source).toBe('Family');
  });
});

describe('leftovers', () => {
  it('fills one tight night from the previous cook', () => {
    const week = assignLeftovers(classifyWeek(WEEK, [
      ev('12U A Red Practice', '2026-09-28T17:00:00-06:00', '2026-09-28T20:00:00-06:00'),
      ev('Kings 2031 - Practice', '2026-09-28T17:00:00-06:00', '2026-09-28T20:00:00-06:00'),
    ]));
    expect(on(week, '2026-09-27').kind).toBe('full');
    expect(on(week, '2026-09-28').kind).toBe('leftovers');
    expect(week.filter((n) => n.kind === 'leftovers')).toHaveLength(1);
  });
});

describe('cooking quota', () => {
  const week = classifyWeek(WEEK, [
    ev('Kings 2031 - Practice', '2026-09-27T17:00:00-06:00', '2026-09-27T19:00:00-06:00'),   // Sun shifts
    ev('Ivy gymnastics', '2026-09-28T16:00:00-06:00', '2026-09-28T20:00:00-06:00'),          // Mon shifts
    ev('Ivy gymnastics', '2026-09-30T16:00:00-06:00', '2026-09-30T20:00:00-06:00'),          // Wed shifts
    ev('12U A Red Practice', '2026-10-02T17:50:00-06:00', '2026-10-02T19:00:00-06:00'),      // Fri shifts
    ev('Ivy gymnastics', '2026-10-02T16:00:00-06:00', '2026-10-02T20:00:00-06:00'),
    ev('14U AA Prospects Practice', '2026-10-02T16:15:00-06:00', '2026-10-02T17:15:00-06:00'),
  ]);

  it('cooks three weekdays and one weekend night', () => {
    const planned = applyCookQuota(week);
    const cooking = planned.filter((n) => !['eat-out', 'skip', 'leftovers'].includes(n.kind));
    expect(cooking.filter((n) => ['Saturday', 'Sunday'].includes(n.weekday))).toHaveLength(1);
    expect(cooking.filter((n) => !['Saturday', 'Sunday'].includes(n.weekday))).toHaveLength(3);
  });

  it('prefers the easiest nights to cook on', () => {
    const planned = applyCookQuota(week);
    // Tue and Thu are wide open; they get cooked before the gymnastics nights.
    expect(on(planned, '2026-09-29').kind).toBe('full');
    expect(on(planned, '2026-10-01').kind).toBe('full');
    // Both gymnastics nights are equally awkward; the earlier one wins the last
    // weekday slot and Wednesday becomes an eat-out night.
    expect(on(planned, '2026-09-28').kind).toBe('shifts');
    expect(on(planned, '2026-09-30').kind).toBe('eat-out');
  });

  it('never turns a skip night into a cooking night', () => {
    const planned = applyCookQuota(week);
    expect(on(planned, '2026-10-02').kind).toBe('skip'); // Friday chaos stays a skip
  });

  it('honours a different quota', () => {
    const planned = applyCookQuota(week, { weekdays: 1, weekend: 0 });
    const cooking = planned.filter((n) => !['eat-out', 'skip', 'leftovers'].includes(n.kind));
    expect(cooking).toHaveLength(1);
  });
});
