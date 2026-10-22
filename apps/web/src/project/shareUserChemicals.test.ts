import { describe, expect, it } from 'vitest';
import { buildProject, chemicalsOf, defaultScreens } from './index';
import type { ProjectChemical } from './chemicals';
import { MAX_SHARE_LINK_LENGTH, decodeShare, makeShareLink } from './share';
import { USER_FIELDS } from '../overrides/userChemicals';

const BASE = 'https://example.org/model_flow/';

/** A user chemical with every field filled and a note about 100 characters long that differs per field. */
function full(n: number): ProjectChemical {
  const values: Record<string, { value: string; note: string }> = {};
  USER_FIELDS.forEach(({ key, label }, i) => {
    values[key] = {
      value: String((n * 7 + i + 1) / 13),
      note: `Measured at the site laboratory, report ${n}-${i}, ${label.toLowerCase()} from the batch test of well MW-${n * 11 + i}.`,
    };
  });
  return { id: `user-${n}`, name: `Site chemical ${n}`, cas: '', values };
}

const projectOf = (count: number) =>
  buildProject({
    screens: defaultScreens(),
    chemicals: Array.from({ length: count }, (_, i) => full(i + 1)),
    createdWith: '0.0.0',
    now: new Date('2026-10-21T12:00:00Z'),
  });

describe('share link with user-defined chemicals', () => {
  it('carries a few fully filled user chemicals and reads them back', async () => {
    const r = await makeShareLink(projectOf(3), BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.link.length).toBeLessThan(MAX_SHARE_LINK_LENGTH);
    const back = await decodeShare(r.link.slice(r.link.indexOf('#/p=') + 4));
    expect(back.ok).toBe(true);
    if (back.ok) expect(chemicalsOf(back.project)).toEqual(chemicalsOf(projectOf(3)));
  });

  it('refuses, never truncates, a link past the cap, and says to save a file', async () => {
    const r = await makeShareLink(projectOf(60), BASE);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.length).toBeGreaterThan(MAX_SHARE_LINK_LENGTH);
    expect(r.error).toMatch(/too large for a share link/i);
    expect(r.error).toMatch(/Save project/);
  });
});
