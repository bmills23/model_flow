import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, migrate, migrations } from './migrate';

describe('migration table', () => {
  it('has one step for every version below the current one', () => {
    for (let n = 1; n < CURRENT_VERSION; n += 1) expect(typeof migrations[n]).toBe('function');
    expect(Object.keys(migrations).length).toBe(CURRENT_VERSION - 1);
  });
});

describe('migrate', () => {
  const table = {
    1: (d: Record<string, unknown>) => ({ ...d, version: 2, renamed: d['old'], old: undefined }),
    2: (d: Record<string, unknown>) => ({ ...d, version: 3, extra: 'added' }),
  };
  it('applies the steps in order from the document version to the target', () => {
    const out = migrate({ format: 'f', version: 1, old: 'x' }, 3, table);
    expect(out).toEqual({ format: 'f', version: 3, renamed: 'x', old: undefined, extra: 'added' });
  });
  it('starts from the document version, not from 1', () => {
    expect(migrate({ version: 2 }, 3, table)).toEqual({ version: 3, extra: 'added' });
  });
  it('returns the document unchanged when already at the target', () => {
    const doc = { version: 3, k: 1 };
    expect(migrate(doc, 3, table)).toEqual(doc);
  });
  it('throws when a step is missing', () => {
    expect(() => migrate({ version: 1 }, 3, { 1: table[1] })).toThrow(/migration from version 2/);
  });
  it('does not mutate the input document', () => {
    const doc = { version: 1, old: 'x' };
    migrate(doc, 3, table);
    expect(doc).toEqual({ version: 1, old: 'x' });
  });
});
