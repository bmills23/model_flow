import { describe, expect, it } from 'vitest';
import { runRisk } from './compute';

describe('runRisk', () => {
  it('turns an engine RangeError into an error for that method alone', () => {
    const out = runRisk({
      legacy: {
        receptors: [],
      },
      modern: { receptors: [] },
    });
    expect(out.legacy.ok).toBe(false);
    expect(out.modern.ok).toBe(false);
  });
});
