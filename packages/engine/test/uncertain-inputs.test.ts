import { describe, expect, it } from 'vitest';
import { exposureLegacy, checkUncertainInputs, prefixUncertainInputs } from '../src/index.js';
import type { LegacyScenarioInput, UncertainInput } from '../src/index.js';

function base(): LegacyScenarioInput {
  const receptor = {
    bw: 70,
    ed: 1e8,
    lifetime: 2.2e9,
    ef: 0.5,
    waterIngestionRate: 2e-8,
    efByPathway: {},
    etByPathway: {},
  };
  return {
    receptors: [
      { label: 'a', receptor, pathways: [], chemicals: [] },
      { label: 'b', receptor: { ...receptor, bw: 15 }, pathways: [], chemicals: [] },
    ],
  } as unknown as LegacyScenarioInput;
}

describe('uncertain input declarations', () => {
  const inputs = exposureLegacy.uncertainInputs ?? [];
  it('the legacy exposure method declares exposure-category inputs only', () => {
    expect(inputs.length).toBeGreaterThan(0);
    for (const u of inputs) expect(u.category).toBe('exposure');
  });
  it('passes the registry contract: unique ids, set then get, no mutation', () => {
    expect(() => checkUncertainInputs(inputs, base(), 0.5)).not.toThrow();
  });
  it('set returns a copy and targets only its own receptor', () => {
    const b = base();
    const bw0 = inputs.find(
      (u) => u.id === 'exposure.receptor0.bw',
    ) as UncertainInput<LegacyScenarioInput>;
    const next = bw0.set(b, 80);
    expect(bw0.get(next)).toBe(80);
    expect(next.receptors[1]?.receptor.bw).toBe(15);
    expect(b.receptors[0]?.receptor.bw).toBe(70);
  });
  it('the check rejects duplicate ids and a set that mutates', () => {
    const u = inputs[0] as UncertainInput<LegacyScenarioInput>;
    expect(() => checkUncertainInputs([u, u], base(), 0.5)).toThrow(/duplicate/);
    const bad: UncertainInput<{ x: number }> = {
      id: 'm.x',
      label: 'x',
      unit: '1',
      category: 'site',
      bounds: [0, 10],
      get: (i) => i.x,
      set: (i, v) => {
        i.x = v;
        return i;
      },
    };
    expect(() => checkUncertainInputs([bad], { x: 1 }, 2)).toThrow(/mutate/);
  });
  it('chain prefixing prefixes ids and keeps accessors working through a link', () => {
    const wrapped = prefixUncertainInputs(
      'exp',
      inputs,
      (c: { link: LegacyScenarioInput }) => c.link,
      (c, l) => ({ ...c, link: l }),
    );
    expect(wrapped[0]?.id.startsWith('exp.')).toBe(true);
    const chain = { link: base() };
    const w = wrapped.find((x) => x.id === 'exp.exposure.receptor1.bw') as UncertainInput<
      typeof chain
    >;
    expect(w.get(w.set(chain, 20))).toBe(20);
  });
});
