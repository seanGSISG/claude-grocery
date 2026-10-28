import { describe, it, expect } from 'vitest';
import { parseReply, describeOps } from '../../server/services/edit-parser.service.js';

const ops = (reply: string) => parseReply(reply).ops;

describe('approval', () => {
  it('accepts the short words people actually send', () => {
    for (const reply of ['ok', 'yes', 'yep', 'approve', 'looks good', 'lgtm', 'send it', '👍']) {
      expect(ops(reply)).toEqual([{ op: 'approve' }]);
    }
  });

  it('accepts a rejection', () => {
    expect(ops('cancel')).toEqual([{ op: 'reject' }]);
    expect(ops("don't order")).toEqual([{ op: 'reject' }]);
  });

  it('does not read "no cilantro" as a rejection', () => {
    expect(ops('no cilantro')).toEqual([{ op: 'remove_item', item: 'cilantro' }]);
  });
});

describe('meal changes', () => {
  it('swaps a named night', () => {
    expect(ops('swap tue for tacos')).toEqual([{ op: 'swap_meal', day: 'Tuesday', request: 'tacos' }]);
    expect(ops('change wednesday to korean beef')).toEqual([{ op: 'swap_meal', day: 'Wednesday', request: 'korean beef' }]);
  });

  it('accepts the colon shorthand', () => {
    expect(ops('thu: pizza')).toEqual([{ op: 'swap_meal', day: 'Thursday', request: 'pizza' }]);
  });

  it('skips a night', () => {
    expect(ops('skip thursday')).toEqual([{ op: 'skip_night', day: 'Thursday' }]);
    expect(ops('eating out on friday')).toEqual([{ op: 'skip_night', day: 'Friday' }]);
  });
});

describe('list changes', () => {
  it('adds an item with or without a quantity', () => {
    expect(ops('add bananas')).toEqual([{ op: 'add_item', item: 'bananas' }]);
    expect(ops('add 2 gallons of milk')).toEqual([{ op: 'add_item', item: 'gallons of milk', quantity: 2 }]);
    expect(ops('we need eggs')).toEqual([{ op: 'add_item', item: 'eggs' }]);
  });

  it('removes an item', () => {
    expect(ops('drop the salsa')).toEqual([{ op: 'remove_item', item: 'salsa' }]);
    expect(ops('remove peanuts from the list')).toEqual([{ op: 'remove_item', item: 'peanuts' }]);
  });

  it('changes a quantity', () => {
    expect(ops('make it 3 avocados')).toEqual([{ op: 'set_qty', item: 'avocados', quantity: 3 }]);
    expect(ops('2x sour cream')).toEqual([{ op: 'set_qty', item: 'sour cream', quantity: 2 }]);
  });

  it('reads "make it 2 milk" as a quantity, not a meal swap', () => {
    expect(ops('make it 2 milk')).toEqual([{ op: 'set_qty', item: 'milk', quantity: 2 }]);
  });
});

describe('real replies', () => {
  it('handles several instructions in one message', () => {
    expect(ops('swap tue for tacos, no cilantro, add 2 avocados')).toEqual([
      { op: 'swap_meal', day: 'Tuesday', request: 'tacos' },
      { op: 'remove_item', item: 'cilantro' },
      { op: 'add_item', item: 'avocados', quantity: 2 },
    ]);
  });

  it('splits on "and" without breaking "sour cream"', () => {
    expect(ops('add sour cream and drop the peanuts')).toEqual([
      { op: 'add_item', item: 'sour cream' },
      { op: 'remove_item', item: 'peanuts' },
    ]);
  });

  it('handles newlines', () => {
    expect(ops('skip friday\nadd eggs')).toEqual([
      { op: 'skip_night', day: 'Friday' },
      { op: 'add_item', item: 'eggs' },
    ]);
  });

  it('reports what it could not read instead of guessing', () => {
    const parsed = parseReply('hmm what about something lighter this week?');
    expect(parsed.ops).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });

  it('keeps the readable ops when one clause is unclear', () => {
    const parsed = parseReply('add milk, maybe something else too');
    expect(parsed.ops).toEqual([{ op: 'add_item', item: 'milk' }]);
    expect(parsed.unparsed).toEqual(['maybe something else too']);
  });
});

describe('reporting a bad match', () => {
  it('reads the ways people actually say it', () => {
    expect(ops('wrong: boston butt')).toEqual([{ op: 'report_match', item: 'boston butt' }]);
    expect(ops('bad match on limes')).toEqual([{ op: 'report_match', item: 'limes' }]);
    expect(ops('wrong product for lemon juice')).toEqual([{ op: 'report_match', item: 'lemon juice' }]);
    expect(ops('the butter is wrong')).toEqual([{ op: 'report_match', item: 'butter' }]);
    expect(ops('green onions was a bad match')).toEqual([{ op: 'report_match', item: 'green onions' }]);
  });

  it('keeps a trailing note as the reason', () => {
    expect(ops('wrong: lemon juice - that is a fruit punch')).toEqual([
      // "a" is dropped as filler, the same as everywhere else.
      { op: 'report_match', item: 'lemon juice', note: 'that is fruit punch' },
    ]);
  });

  it('does not mistake a removal for a report', () => {
    expect(ops('no cilantro')).toEqual([{ op: 'remove_item', item: 'cilantro' }]);
  });

  it('travels with other edits in one reply', () => {
    expect(ops('wrong: boston butt, add 2 avocados')).toEqual([
      { op: 'report_match', item: 'boston butt' },
      { op: 'add_item', item: 'avocados', quantity: 2 },
    ]);
  });
});

describe('confirmation text', () => {
  it('describes each operation in plain words', () => {
    expect(describeOps(parseReply('swap tue for tacos, no cilantro').ops)).toEqual([
      'Swap Tuesday for tacos',
      'Remove cilantro',
    ]);
  });

  it('says a report will stick', () => {
    expect(describeOps(parseReply('wrong: boston butt').ops)).toEqual([
      'Never buy that product for boston butt again',
    ]);
  });
});

describe('not mistaking conversation for a command', () => {
  // This bot fills a real cart and cancels a real week, and it reads every
  // message in the channel. These are the sentences that used to do damage.
  it('does not cancel the week because someone said "stop" or "cancel"', () => {
    expect(ops('stop by the store for milk')).not.toContainEqual({ op: 'reject' });
    expect(ops('cancel my 3pm')).not.toContainEqual({ op: 'reject' });
    expect(ops('no rush on this')).not.toContainEqual({ op: 'reject' });
    expect(ops('hold off on telling the kids')).not.toContainEqual({ op: 'reject' });
  });

  it('does not order because someone said "ok" or "go" mid-sentence', () => {
    expect(ops('ok I will be home late')).not.toContainEqual({ op: 'approve' });
    expect(ops('go ahead and tell camden practice moved')).not.toContainEqual({ op: 'approve' });
    expect(ops('yes the game is at 4')).not.toContainEqual({ op: 'approve' });
    expect(ops('do it after you drop ivy off')).not.toContainEqual({ op: 'approve' });
  });

  it('still approves and cancels when that is all someone said', () => {
    for (const yes of ['ok', 'Okay', 'yes', 'yep', 'looks good', 'lgtm', '👍', 'send it', 'order it', 'ok!']) {
      expect(ops(yes), yes).toEqual([{ op: 'approve' }]);
    }
    for (const no of ['no', 'nope', 'cancel', 'stop', 'hold off', "don't order", 'skip this week']) {
      expect(ops(no), no).toEqual([{ op: 'reject' }]);
    }
  });

  it('reads an approval that shares a message with a real edit', () => {
    expect(ops('no cilantro, ok')).toEqual([
      { op: 'remove_item', item: 'cilantro' },
      { op: 'approve' },
    ]);
  });

  it('keeps treating "no <thing>" as a removal, not a refusal', () => {
    expect(ops('no cilantro')).toEqual([{ op: 'remove_item', item: 'cilantro' }]);
  });
});
