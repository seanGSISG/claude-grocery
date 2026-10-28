import { describe, it, expect } from 'vitest';
import { findLine, applyReplacement } from '../../server/services/match-feedback.service.js';
import type { LineMatch, PendingWeek } from '../../server/slack/app.js';

const line = (over: Partial<LineMatch> = {}): LineMatch => ({
  canonicalName: 'lemon_juice', displayName: 'Lemon Juice',
  matched: '1 × Hawaiian Punch Lemon Berry', upc: 'BAD', term: 'lemon juice',
  loose: true, lineTotal: 3.49, ...over,
});

const matches: LineMatch[] = [
  line(),
  line({ canonicalName: 'boston_butt', displayName: 'Boneless Boston Butt', matched: '1 × Kerrygold Butter', upc: 'B2', lineTotal: 6.99 }),
  line({ canonicalName: 'green_onion', displayName: 'Green Onions', matched: '1 × Green Onions', upc: 'G1', loose: false, lineTotal: 1.29 }),
];

const pending = (over: Partial<PendingWeek['summary']> = {}): PendingWeek => ({
  week: [],
  plan: { weekStart: '2026-10-04', meals: [], unplanned: [], items: [], warnings: [] },
  matches,
  summary: { weekStart: '2026-10-04', cookingNights: 3, estimatedTotal: 400, softMax: 425, hardMax: 500, ...over },
});

describe('finding the line someone reported', () => {
  it('matches the name the list uses', () => {
    expect(findLine(matches, 'Lemon Juice')?.canonicalName).toBe('lemon_juice');
    expect(findLine(matches, 'green onions')?.canonicalName).toBe('green_onion');
  });

  it('matches a partial name', () => {
    expect(findLine(matches, 'boston butt')?.canonicalName).toBe('boston_butt');
  });

  it('matches the product that came back instead', () => {
    expect(findLine(matches, 'kerrygold')?.canonicalName).toBe('boston_butt');
    expect(findLine(matches, 'hawaiian punch')?.canonicalName).toBe('lemon_juice');
  });

  it('prefers the exact line over one that merely contains the words', () => {
    const both = [line({ canonicalName: 'lemon_juice_concentrate', displayName: 'Lemon Juice Concentrate' }), line()];
    expect(findLine(both, 'lemon juice')?.displayName).toBe('Lemon Juice');
  });

  it('returns nothing rather than guessing', () => {
    expect(findLine(matches, 'quinoa')).toBeUndefined();
    expect(findLine(matches, '')).toBeUndefined();
    expect(findLine([], 'lemon juice')).toBeUndefined();
  });
});

describe('swapping in the replacement', () => {
  const replacement = line({ matched: '3 × Fresh Lemons', upc: 'GOOD', loose: false, lineTotal: 2.01 });

  it('replaces only the reported line', () => {
    const { pending: next } = applyReplacement(pending(), matches[0], replacement);
    expect(next.matches).toHaveLength(3);
    expect(next.matches![0].matched).toBe('3 × Fresh Lemons');
    expect(next.matches![1]).toBe(matches[1]);
    expect(next.matches![2]).toBe(matches[2]);
  });

  it('adjusts the estimate by the difference, not by re-pricing the week', () => {
    const { pending: next } = applyReplacement(pending(), matches[0], replacement);
    expect(next.summary.estimatedTotal).toBeCloseTo(400 - 3.49 + 2.01, 2);
  });

  it('leaves an unpriced week unpriced', () => {
    const { pending: next } = applyReplacement(pending({ estimatedTotal: undefined }), matches[0], replacement);
    expect(next.summary.estimatedTotal).toBeUndefined();
  });

  it('never drives the estimate below zero', () => {
    const { pending: next } = applyReplacement(pending({ estimatedTotal: 1 }), matches[1], replacement);
    expect(next.summary.estimatedTotal).toBeGreaterThanOrEqual(0);
  });

  it('says what replaced it and what will never be bought again', () => {
    const { message } = applyReplacement(pending(), matches[0], replacement);
    expect(message).toContain('3 × Fresh Lemons instead');
    expect(message).toContain("Won't buy 1 × Hawaiian Punch Lemon Berry for it again");
  });

  it('warns when the replacement is itself a loose match', () => {
    const { message } = applyReplacement(pending(), matches[0], line({ matched: '1 × Something Else', loose: true }));
    expect(message).toContain('still a loose match');
  });

  it('says so plainly when nothing else matched', () => {
    const { message } = applyReplacement(pending(), matches[0], line({ matched: null, lineTotal: 0 }));
    expect(message).toContain('nothing else matched, so add it yourself');
  });

  it('does not mutate the week it was given', () => {
    const before = pending();
    const snapshot = JSON.stringify(before);
    applyReplacement(before, matches[0], replacement);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
