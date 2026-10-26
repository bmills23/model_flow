import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUTOSAVE_KEY, LEGACY_AUTOSAVE_KEY, PREVIOUS_AUTOSAVE_KEY } from './store';

const script = readFileSync(`${process.cwd()}/../../scripts/mobile-check.mjs`, 'utf8');

describe('the mobile check seed', () => {
  it('writes the key the app reads first', () => {
    expect(script).toContain(`localStorage.setItem('${AUTOSAVE_KEY}'`);
  });
  it('clears the older keys, which the app reads only when the first is missing', () => {
    expect(script).toContain(`localStorage.removeItem('${PREVIOUS_AUTOSAVE_KEY}')`);
    expect(script).toContain(`localStorage.removeItem('${LEGACY_AUTOSAVE_KEY}')`);
  });
});
