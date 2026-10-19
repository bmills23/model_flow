import { describe, expect, it } from 'vitest';
import { checkUncertainInputs, pathInput } from '../src/index.js';

interface Probe {
  a: { x: number; y?: number };
  list: { t: number }[];
  mode: { kind: 'one'; p: number } | { kind: 'two'; q: number };
  opt?: { z: number };
}

const base: Probe = {
  a: { x: 1 },
  list: [{ t: 10 }, { t: 20 }],
  mode: { kind: 'one', p: 5 },
};

const spec = { label: 'l', unit: '1', category: 'site' as const, bounds: [0, 100] as const };

describe('pathInput', () => {
  it('reads and writes a nested scalar without mutating the input', () => {
    const u = pathInput<Probe>({ ...spec, id: 't.x', path: ['a', 'x'] });
    expect(u.get(base)).toBe(1);
    const next = u.set(base, 7);
    expect(u.get(next)).toBe(7);
    expect(base.a.x).toBe(1);
    expect(next.list).toBe(base.list);
  });

  it('indexes arrays and refuses an index past the end', () => {
    const u1 = pathInput<Probe>({ ...spec, id: 't.l1', path: ['list', 1, 't'] });
    expect(u1.get(base)).toBe(20);
    expect(u1.set(base, 3).list.map((l) => l.t)).toEqual([10, 3]);
    const u5 = pathInput<Probe>({ ...spec, id: 't.l5', path: ['list', 5, 't'] });
    expect(Number.isNaN(u5.get(base))).toBe(true);
    expect(() => u5.set(base, 1)).toThrow(RangeError);
  });

  it('an absent optional scalar reads as NaN and is created by set', () => {
    const u = pathInput<Probe>({ ...spec, id: 't.y', path: ['a', 'y'] });
    expect(Number.isNaN(u.get(base))).toBe(true);
    expect(u.get(u.set(base, 4))).toBe(4);
  });

  it('an absent optional parent reads as NaN and set refuses', () => {
    const u = pathInput<Probe>({ ...spec, id: 't.z', path: ['opt', 'z'] });
    expect(Number.isNaN(u.get(base))).toBe(true);
    expect(() => u.set(base, 1)).toThrow(RangeError);
  });

  it('a guard hides an input of the other variant and refuses a set', () => {
    const q = pathInput<Probe>({
      ...spec,
      id: 't.q',
      path: ['mode', 'q'],
      when: (i) => i.mode.kind === 'two',
    });
    expect(Number.isNaN(q.get(base))).toBe(true);
    expect(() => q.set(base, 1)).toThrow(/not present/);
    const p = pathInput<Probe>({
      ...spec,
      id: 't.p',
      path: ['mode', 'p'],
      when: (i) => i.mode.kind === 'one',
    });
    expect(p.get(base)).toBe(5);
  });

  it('satisfies the registry contract', () => {
    const inputs = [
      pathInput<Probe>({ ...spec, id: 't.x', path: ['a', 'x'] }),
      pathInput<Probe>({ ...spec, id: 't.l0', path: ['list', 0, 't'] }),
    ];
    expect(() => checkUncertainInputs(inputs, base, 0.5)).not.toThrow();
  });
});
