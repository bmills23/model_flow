import { describe, expect, it } from 'vitest';
import { MethodRegistry, type MethodDescriptor } from '../src/registry/index.js';
import { registry } from '../src/index.js';
import { references } from '../src/references/index.js';

const toy = (id: string, kind: 'legacy' | 'modern'): MethodDescriptor<number, number> => ({
  id,
  process: 'dispersivity',
  kind,
  name: id,
  summary: 'toy',
  citations: ['gelhar1985'],
  assumptions: [],
  run: (x) => x * 2,
});

describe('MethodRegistry', () => {
  it('registers and retrieves a method by id', () => {
    const r = new MethodRegistry();
    r.register(toy('t.one', 'legacy'));
    expect(r.get('t.one').run(21)).toBe(42);
    expect(r.has('t.one')).toBe(true);
  });

  it('rejects duplicate ids', () => {
    const r = new MethodRegistry();
    r.register(toy('t.one', 'legacy'));
    expect(() => r.register(toy('t.one', 'modern'))).toThrow(/already registered/);
  });

  it('throws a clear error for unknown ids', () => {
    expect(() => new MethodRegistry().get('nope')).toThrow(/nope/);
  });

  it('lists methods by process and kind', () => {
    const r = new MethodRegistry();
    r.register(toy('t.one', 'legacy'));
    r.register(toy('t.two', 'modern'));
    expect(r.list('dispersivity').map((m) => m.id)).toEqual(['t.one', 't.two']);
    expect(r.list('dispersivity', 'modern').map((m) => m.id)).toEqual(['t.two']);
  });
});

describe('citation gate on the default registry', () => {
  const byKey = new Map(references.map((r) => [r.key, r]));

  it('every registered method cites at least one reference that exists and is marked used', () => {
    expect(registry.list().length).toBeGreaterThan(0);
    for (const m of registry.list()) {
      expect(m.citations.length, `${m.id} has no citations`).toBeGreaterThan(0);
      for (const key of m.citations) {
        const ref = byKey.get(key);
        expect(ref, `${m.id} cites unknown reference ${key}`).toBeDefined();
        expect(ref?.status, `${m.id} cites ${key} whose status is not "used"`).toBe('used');
      }
    }
  });

  it('every reference marked used is cited by some registered method', () => {
    const cited = new Set(registry.list().flatMap((m) => m.citations));
    for (const ref of references) {
      if (ref.status === 'used') {
        expect(cited.has(ref.key), `${ref.key} is marked used but nothing cites it`).toBe(true);
      }
    }
  });

  it('every registered method pairs legacy with at least one modern alternative per process', () => {
    for (const process of new Set(registry.list().map((m) => m.process))) {
      expect(
        registry.list(process, 'legacy').length,
        `${process} has no legacy method`,
      ).toBeGreaterThan(0);
      expect(
        registry.list(process, 'modern').length,
        `${process} has no modern method`,
      ).toBeGreaterThan(0);
    }
  });
});
