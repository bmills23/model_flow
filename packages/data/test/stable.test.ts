import { describe, expect, it } from 'vitest';
import { localIsoDate, renderStable } from '../src/stable.js';

const render = (body: string) => (date: string) =>
  `# Doc\n\nGenerated ${date} from source.\n\n${body}\n`;

describe('renderStable', () => {
  it('uses today when there is no previous document', () => {
    expect(renderStable(render('a'), undefined, '2026-10-16')).toContain('Generated 2026-10-16');
  });

  it('keeps the previous date when only the date would change', () => {
    const old = render('a')('2026-10-15');
    expect(renderStable(render('a'), old, '2026-10-16')).toBe(old);
  });

  it('uses today when the content changed', () => {
    const old = render('a')('2026-10-15');
    const next = renderStable(render('b'), old, '2026-10-16');
    expect(next).toContain('Generated 2026-10-16');
    expect(next).toContain('b');
  });

  it('uses today when the previous document has no date line', () => {
    expect(renderStable(render('a'), '# Doc\n', '2026-10-16')).toContain('Generated 2026-10-16');
  });
});

describe('localIsoDate', () => {
  // toISOString would give the UTC day: 23:30 on 2026-10-16 in Mountain time is 05:30 UTC on 2026-10-17.
  it('uses the local calendar day, not the UTC day', () => {
    expect(localIsoDate(new Date(2026, 9, 16, 23, 30))).toBe('2026-10-16');
  });

  it('zero-pads month and day', () => {
    expect(localIsoDate(new Date(2026, 0, 3, 12))).toBe('2026-01-03');
  });
});
