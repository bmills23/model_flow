// @vitest-environment node
import { references, registry } from '@model-flow/engine';
import { describe, expect, it } from 'vitest';
import { buildMethodsStatement, DATA_SOURCES } from './methodsStatement';

const IDS = ['groundwater.at123d', 'vadose.vadsat', 'dispersivity.gelhar1985-api1987'];

describe('buildMethodsStatement', () => {
  const statement = buildMethodsStatement({ methodIds: IDS });

  it('lists exactly the methods that were run, once each, in registry order', () => {
    const order = registry.list().map((m) => m.id);
    const got = statement.methods.map((m) => m.id);
    expect([...got].sort()).toEqual([...IDS].sort());
    expect(got).toEqual([...got].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  });

  it('prints name, kind, summary, assumptions and the RISC5 choice from the descriptor', () => {
    for (const m of statement.methods) {
      const d = registry.get(m.id);
      expect(m.name).toBe(d.name);
      expect(m.kind).toBe(d.kind);
      expect(m.summary).toBe(d.summary);
      expect(m.assumptions).toEqual([...d.assumptions]);
      expect(m.risc5Choice).toBe(d.risc5Choice);
    }
  });

  it('contains every cited reference key and no key that no run method cites', () => {
    const cited = new Set(IDS.flatMap((id) => [...registry.get(id).citations]));
    const printed = new Set(statement.references.map((r) => r.key));
    expect(printed).toEqual(cited);
    // A method that was not run contributes nothing of its own.
    const notRun = registry
      .list()
      .filter((m) => !IDS.includes(m.id))
      .flatMap((m) => [...m.citations])
      .filter((k) => !cited.has(k));
    expect(notRun.length).toBeGreaterThan(0);
    for (const k of notRun) expect(printed.has(k)).toBe(false);
    expect(statement.methods.map((m) => m.id)).not.toContain('cleanup.rags-b-1991');
  });

  it('numbers the references from 1 without repeats and points each method at its numbers', () => {
    const keys = statement.references.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(statement.references.map((r) => r.n)).toEqual(keys.map((_, i) => i + 1));
    for (const m of statement.methods) {
      const want = [...registry.get(m.id).citations].map(
        (k) => statement.references.find((r) => r.key === k)!.n,
      );
      expect(m.refs).toEqual(want);
    }
  });

  it('deduplicates a reference cited by two methods', () => {
    const all = IDS.flatMap((id) => [...registry.get(id).citations]);
    expect(new Set(all).size).toBeLessThan(all.length);
  });

  it('formats each reference through the reference list', () => {
    const r = statement.references[0]!;
    const ref = references.find((x) => x.key === r.key)!;
    expect(r.text).toContain(ref.title);
  });

  it('throws on a method id that is not registered', () => {
    expect(() => buildMethodsStatement({ methodIds: ['no.such'] })).toThrow(/no\.such/);
  });

  it('ignores a repeated id', () => {
    const s = buildMethodsStatement({ methodIds: [...IDS, ...IDS] });
    expect(s.methods).toHaveLength(IDS.length);
  });

  it('is empty when nothing was run', () => {
    const s = buildMethodsStatement({ methodIds: [] });
    expect(s.methods).toEqual([]);
    expect(s.references).toEqual([]);
    expect(s.data).toEqual([]);
  });

  it('cites each data source with its edition string and appends its references after the methods', () => {
    const s = buildMethodsStatement({
      methodIds: IDS,
      dataEditions: { rsl: 'rsl-2024-11', nrwqc: 'nrwqc-2026-10-16' },
    });
    expect(s.data.map((d) => d.kind)).toEqual(['rsl', 'nrwqc']);
    expect(s.data[0]!.edition).toBe('rsl-2024-11');
    for (const d of s.data) {
      for (const key of DATA_SOURCES[d.kind].keys) {
        const printed = s.references.find((r) => r.key === key);
        expect(printed).toBeDefined();
        expect(d.refs).toContain(printed!.n);
      }
    }
    expect(s.references.length).toBeGreaterThan(statement.references.length);
  });

  it('cites the references of the criteria sets chosen, and nothing for the criteria kind without them', () => {
    const none = buildMethodsStatement({
      methodIds: [],
      dataEditions: { criteria: 'criteria-2026-10-23' },
    });
    expect(none.data).toEqual([]);
    const s = buildMethodsStatement({
      methodIds: [],
      dataEditions: { criteria: 'criteria-2026-10-23' },
      criteriaKeys: ['eudir2008105', 'eudir201339'],
    });
    expect(s.data.map((d) => d.kind)).toEqual(['criteria']);
    expect(s.data[0]!.edition).toBe('criteria-2026-10-23');
    expect(s.references.map((r) => r.key)).toEqual(['eudir2008105', 'eudir201339']);
  });

  it('only cites data references that exist in the reference list', () => {
    const keys = new Set(references.map((r) => r.key));
    for (const src of Object.values(DATA_SOURCES))
      for (const k of src.keys) expect(keys.has(k)).toBe(true);
  });
});
