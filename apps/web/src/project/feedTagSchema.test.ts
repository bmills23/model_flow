import { describe, expect, it } from 'vitest';
import { feedShapes } from './schema';
import { chemicalTag, feedChemicalProblem } from './feedChemical';

const env = (value: unknown) => ({ source: 'x', inputsHash: 'h', value });

describe('feed chemical tags in the project file', () => {
  it('keeps chemicalId on the five stored feeds and accepts them without it', () => {
    const well = { method: 'modern', label: 'w', times: [0], values: [1] };
    const bank = { scenario: {}, label: 'b' };
    const vadose = { scenario: {}, method: 'modern', label: 'v' };
    const saturated = { input: {}, method: 'modern', label: 's' };
    const surface = { method: 'well-mixed', origin: 'o', label: 'l', times: [0], values: [1] };
    const cases = [
      ['well', well],
      ['bank', bank],
      ['vadose', vadose],
      ['saturated', saturated],
      ['surfaceWater', surface],
    ] as const;
    for (const [key, v] of cases) {
      const shape = feedShapes[key];
      const tagged = shape.safeParse(env({ ...v, chemicalId: '71-43-2' }));
      expect(tagged.success).toBe(true);
      expect((tagged.data as { value: { chemicalId?: string } }).value.chemicalId).toBe('71-43-2');
      expect(shape.safeParse(env(v)).success).toBe(true);
    }
  });
});

describe('chemicalTag and feedChemicalProblem', () => {
  it('tags only a non-blank chemical', () => {
    expect(chemicalTag('71-43-2')).toEqual({ chemicalId: '71-43-2' });
    expect(chemicalTag('')).toEqual({});
    expect(chemicalTag(undefined)).toEqual({});
  });

  it('accepts a match, refuses another chemical, and refuses an untagged feed only in a multi run', () => {
    const nameOf = (id: string) => id;
    const base = { feed: 'f', rowId: 'a', nameOf };
    expect(feedChemicalProblem({ ...base, feedChemical: 'a', runCount: 2 })).toBeNull();
    expect(feedChemicalProblem({ ...base, feedChemical: 'b', runCount: 1 })).toMatch(
      /is for b, not a/,
    );
    expect(feedChemicalProblem({ ...base, feedChemical: undefined, runCount: 1 })).toBeNull();
    expect(feedChemicalProblem({ ...base, feedChemical: '', runCount: 2 })).toMatch(
      /does not record which chemical/,
    );
  });
});
