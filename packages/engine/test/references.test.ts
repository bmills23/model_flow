import { describe, expect, it } from 'vitest';
import { references, referenceSchema } from '../src/references/index.js';

describe('references.json', () => {
  it('validates every entry against the schema', () => {
    for (const ref of references) {
      expect(() => referenceSchema.parse(ref)).not.toThrow();
    }
    expect(references.length).toBeGreaterThan(0);
  });

  it('has unique, slug-style keys', () => {
    const keys = references.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9]*$/);
  });

  it('has well-formed DOIs and plausible years', () => {
    const thisYear = new Date().getFullYear();
    for (const ref of references) {
      if (ref.doi) expect(ref.doi).toMatch(/^10\.\d{4,9}\/\S+$/);
      expect(ref.year).toBeGreaterThanOrEqual(1900);
      expect(ref.year).toBeLessThanOrEqual(thisYear);
    }
  });
});

describe('formatReference', () => {
  it('formats authors, year, title, venue and identifier in order', async () => {
    const { formatReference } = await import('../src/references/index.js');
    const text = formatReference({
      key: 'yeh1981',
      type: 'method',
      status: 'used',
      authors: 'Yeh, G.T.',
      year: 1981,
      title: 'AT123D: Analytical transient simulation',
      venue: 'Oak Ridge National Laboratory',
      identifier: 'ORNL-5602',
      tags: ['groundwater'],
    });
    expect(text).toBe(
      'Yeh, G.T. (1981). AT123D: Analytical transient simulation. Oak Ridge National Laboratory. ORNL-5602.',
    );
  });
});
