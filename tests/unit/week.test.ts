import { describe, it, expect } from 'vitest';
import { nextSunday, formatLocalDate } from '../../server/utils/week.js';

/** Local wall-clock time, the way the bot experiences it on Ty's Mac. */
const at = (iso: string) => new Date(iso);

describe('which week is being planned', () => {
  it('plans the coming Sunday from the Saturday it runs on — evening included', () => {
    // This is the case that was broken: mixing a local weekday with a UTC date
    // rolled Saturday evening in Denver over into Monday.
    expect(nextSunday(at('2026-10-03T09:00:00'))).toBe('2026-10-04');
    expect(nextSunday(at('2026-10-03T18:30:00'))).toBe('2026-10-04');
    expect(nextSunday(at('2026-10-03T23:59:00'))).toBe('2026-10-04');
  });

  it('plans next Sunday, not today, when it runs on a Sunday', () => {
    expect(nextSunday(at('2026-10-04T10:00:00'))).toBe('2026-10-11');
    expect(nextSunday(at('2026-10-04T23:00:00'))).toBe('2026-10-11');
  });

  it('plans the coming Sunday from any midweek day', () => {
    expect(nextSunday(at('2026-09-30T12:00:00'))).toBe('2026-10-04');
    expect(nextSunday(at('2026-10-01T22:00:00'))).toBe('2026-10-04');
  });

  it('crosses a month and a year boundary', () => {
    expect(nextSunday(at('2026-10-31T20:00:00'))).toBe('2026-11-01');
    expect(nextSunday(at('2026-12-28T20:00:00'))).toBe('2027-01-03');
  });

  it('always lands on a Sunday, whatever hour it is asked', () => {
    for (let day = 1; day <= 60; day += 1) {
      for (const hour of [0, 9, 18, 23]) {
        const when = new Date(2026, 8, day, hour, 30);
        const [y, m, d] = nextSunday(when).split('-').map(Number);
        expect(new Date(y, m - 1, d).getDay(), `${when.toString()}`).toBe(0);
      }
    }
  });

  it('formats a local date without drifting into the next day', () => {
    expect(formatLocalDate(new Date(2026, 9, 4, 23, 30))).toBe('2026-10-04');
    expect(formatLocalDate(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
});
