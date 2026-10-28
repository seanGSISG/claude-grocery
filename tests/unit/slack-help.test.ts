import { describe, it, expect } from 'vitest';
import { HELP_REQUEST, renderHelpBlocks } from '../../server/slack/help.js';

const text = (softMax = 425, hardMax = 500): string =>
  renderHelpBlocks(softMax, hardMax)
    .map((b) => {
      const body = b.text as { text?: string; plain_text?: string } | undefined;
      const elements = (b.elements ?? []) as Array<{ text?: string }>;
      return body?.text ?? body?.plain_text ?? elements.map((e) => e.text ?? '').join(' ');
    })
    .join('\n');

describe('asking for help', () => {
  it('recognises the ways people ask', () => {
    for (const ask of ['help', 'Help', '?', '??', 'commands', 'how does this work', 'what can you do']) {
      expect(HELP_REQUEST.test(ask)).toBe(true);
    }
  });

  it('is not triggered by an edit that merely mentions a word', () => {
    for (const edit of ['add helper bread', 'no cilantro', 'swap wed for tacos', 'ok']) {
      expect(HELP_REQUEST.test(edit)).toBe(false);
    }
  });
});

describe('the help message', () => {
  it('quotes the real caps rather than hard-coded ones', () => {
    expect(text(300, 400)).toContain('$300');
    expect(text(300, 400)).toContain('$400');
  });

  it('covers every command the parser understands', () => {
    const help = text();
    for (const command of ['plan', 'swap wed for tacos', 'skip thursday', 'no cilantro',
      'add 2 avocados', 'make it 3 avocados', 'wrong: boston butt', 'cancel', 'help']) {
      expect(help).toContain(command);
    }
  });

  it('lines the command table up', () => {
    const table = text().split('```')[1].trim().split('\n');
    // Every description has to start in the same column, whatever it follows.
    const descriptionAt = table.map((row) => row.indexOf(row.split(/\s{3,}/)[1]));
    expect(new Set(descriptionAt).size).toBe(1);
  });

  it('says plainly that approval is required and checkout is not its job', () => {
    const help = text();
    expect(help).toContain('Nothing is ordered until you approve it');
    expect(help).toMatch(/check out/);
  });

  it('explains each column of the table', () => {
    const help = text();
    expect(help).toContain('*Dinner*');
    expect(help).toContain('*Time*');
    expect(help).toContain('*Cook*');
  });

  it('stays inside Slack block text limits', () => {
    for (const block of renderHelpBlocks(425, 500)) {
      const body = block.text as { text?: string } | undefined;
      if (body?.text) expect(body.text.length).toBeLessThan(3000);
    }
  });
});
