// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './markdown';

describe('parseMarkdown', () => {
  it('reads headings with their level', () => {
    expect(parseMarkdown('# One\n\n## Two words')).toEqual([
      { type: 'heading', level: 1, text: 'One' },
      { type: 'heading', level: 2, text: 'Two words' },
    ]);
  });

  it('joins wrapped paragraph lines and splits on blank lines', () => {
    const b = parseMarkdown('first line\nsecond line\n\nnext');
    expect(b).toEqual([
      { type: 'paragraph', text: 'first line second line' },
      { type: 'paragraph', text: 'next' },
    ]);
  });

  it('keeps a fenced code block verbatim, including blank lines and markdown marks', () => {
    const b = parseMarkdown('```json\n{ "a": 1 }\n\n# not a heading\n```\nafter');
    expect(b[0]).toEqual({ type: 'code', lang: 'json', text: '{ "a": 1 }\n\n# not a heading' });
    expect(b[1]).toEqual({ type: 'paragraph', text: 'after' });
  });

  it('reads bullet and numbered lists with wrapped items and a nested list', () => {
    const b = parseMarkdown('- alpha\n  continues here\n- beta\n  - inner\n\n1. one\n2. two');
    expect(b[0]).toEqual({
      type: 'list',
      ordered: false,
      items: [
        { text: 'alpha continues here', children: [] },
        {
          text: 'beta',
          children: [
            { type: 'list', ordered: false, items: [{ text: 'inner', children: [] }] },
          ],
        },
      ],
    });
    expect(b[1]).toMatchObject({ type: 'list', ordered: true });
    expect((b[1] as { items: unknown[] }).items).toHaveLength(2);
  });

  it('reads a table with a header, rows and short rows padded', () => {
    const b = parseMarkdown('| A | B |\n|---|:-:|\n| 1 | 2 |\n| 3 |');
    expect(b).toEqual([
      {
        type: 'table',
        header: ['A', 'B'],
        rows: [
          ['1', '2'],
          ['3', ''],
        ],
      },
    ]);
  });

  it('reads block quotes and rules', () => {
    expect(parseMarkdown('> note one\n> note two\n\n---')).toEqual([
      { type: 'quote', text: 'note one note two' },
      { type: 'rule' },
    ]);
  });

  it('does not treat a pipe in running text as a table', () => {
    expect(parseMarkdown('a | b')).toEqual([{ type: 'paragraph', text: 'a | b' }]);
  });
});

describe('parseInline', () => {
  it('reads code, bold, italic and links, leaving other text alone', () => {
    expect(parseInline('a `x*y` **b** *c* [d](https://e.org/f) g')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'code', text: 'x*y' },
      { type: 'text', text: ' ' },
      { type: 'strong', text: 'b' },
      { type: 'text', text: ' ' },
      { type: 'em', text: 'c' },
      { type: 'text', text: ' ' },
      { type: 'link', text: 'd', href: 'https://e.org/f' },
      { type: 'text', text: ' g' },
    ]);
  });

  it('keeps underscores inside words and unmatched marks as text', () => {
    expect(parseInline('snake_case_name and 2 * 3 and **open')).toEqual([
      { type: 'text', text: 'snake_case_name and 2 * 3 and **open' },
    ]);
  });
});
