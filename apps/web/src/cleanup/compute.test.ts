import { describe, expect, it } from 'vitest';
import { runCleanup } from './compute';

describe('runCleanup', () => {
  it('turns an engine RangeError into an error for that method alone', () => {
    const out = runCleanup({
      legacy: { receptors: [], chemicals: [] },
      modern: { receptors: [], chemicals: [] },
    });
    expect(out.legacy.ok).toBe(false);
    expect(out.modern.ok).toBe(false);
    if (!out.legacy.ok) expect(out.legacy.error).toMatch(/receptor/i);
  });
});
