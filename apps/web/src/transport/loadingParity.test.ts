import { describe, expect, it } from 'vitest';
import { plumeGrid, receptorConcentration } from './compute';
import { DEFAULT_FORM, toScenario, type TransportForm } from './form';

function scenario(over: Partial<TransportForm>) {
  const r = toScenario({ ...DEFAULT_FORM, ...over });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.scenario;
}

const xs = [10, 40, 80, 120];
const ys = [-10, 0, 10];

const cases: Record<string, Partial<TransportForm>> = {
  pulse: { loading: 'pulse', pulseYr: '3', timeYr: '10' },
  steps: {
    loading: 'steps',
    timeYr: '12',
    steps: [
      { start: '0', end: '4', factor: '1' },
      { start: '6', end: '9', factor: '0.5' },
    ],
  },
};

function record(over: Partial<TransportForm>) {
  // The recorded Wexler values are the whole-space PATCHI superposition. The screen's infinitely
  // deep aquifer now applies the no-flux water table, so drop that flag to pin the loading code alone.
  const { top: _noFlux, ...s } = scenario(over);
  void _noFlux;
  const f = scenario({ ...over, thicknessMode: 'finite', thickness: '10', width: '200' });
  return {
    wexlerPoint: receptorConcentration(s, 'modern', s.time),
    domenicoPoint: receptorConcentration(s, 'domenico', s.time),
    wexlerGrid: plumeGrid(s, 'modern', xs, ys),
    patchfPoint: receptorConcentration(f, 'modern', f.time),
    patchfGrid: plumeGrid(f, 'modern', xs, ys),
  };
}

/** Values recorded from the screen's own superposition code before loading moved into the engine. */
const recorded: Record<string, unknown> = {
  pulse: {
    wexlerPoint: 6.43127444055091e-5,
    domenicoPoint: 0.00020614087748544872,
    wexlerGrid: [
      [4.6540522685104696e-7, 4.863842600994969e-7, 4.6540522685104696e-7],
      [5.766570443212996e-6, 6.02602876518827e-6, 5.766570443212996e-6],
      [3.4184491665776705e-5, 3.571325637547417e-5, 3.4184491665776705e-5],
      [9.476215684211338e-5, 9.895538950855439e-5, 9.476215684211338e-5],
    ],
    patchfPoint: 0.00011050981044150574,
    patchfGrid: [
      [7.984074579404227e-7, 8.343582114135606e-7, 7.984074579404227e-7],
      [9.895069589081242e-6, 1.0339795128480687e-5, 9.895069589081242e-6],
      [5.8706089503752666e-5, 6.132849399897804e-5, 5.8706089503752666e-5],
      [0.0001629667093515807, 0.00017016934668497323, 0.0001629667093515807],
    ],
  },
  steps: {
    wexlerPoint: 0.00031620887310604136,
    domenicoPoint: 0.0004944018383611664,
    wexlerGrid: [
      [9.49032702052396e-6, 1.0379516155122146e-5, 9.49032702052396e-6],
      [9.188641611489233e-5, 0.00010034863768921599, 9.188641611489233e-5],
      [0.00026231006849087034, 0.000284887084871795, 0.00026231006849087034],
      [0.00027572600184832104, 0.0002958712842646828, 0.00027572600184832104],
    ],
    patchfPoint: 0.0004958423087642493,
    patchfGrid: [
      [1.4434978296768049e-5, 1.577746656827514e-5, 1.4434978296768049e-5],
      [0.00014028648034378915, 0.00015309989515539346, 0.00014028648034378915],
      [0.0004062958398773832, 0.000440863491980042, 0.0004062958398773832],
      [0.00044111280295247324, 0.0004727573704868001, 0.00044111280295247324],
    ],
  },
};

function flat(v: unknown): number[] {
  return Array.isArray(v) ? v.flatMap(flat) : [v as number];
}

describe('pulse and stepped loading is unchanged by the move into the engine', () => {
  for (const [name, over] of Object.entries(cases)) {
    it(`${name} reproduces the superposition values recorded before the change`, () => {
      const now = record(over) as unknown as Record<string, unknown>;
      expect(Object.keys(recorded[name] as object).sort()).toEqual(Object.keys(now).sort());
      for (const key of Object.keys(now)) {
        const a = flat(now[key]);
        const b = flat((recorded[name] as Record<string, unknown>)[key]);
        expect(a.length).toBe(b.length);
        a.forEach((v, i) => {
          expect(Math.abs(v - b[i]!)).toBeLessThanOrEqual(1e-9 * Math.max(Math.abs(b[i]!), 1e-300));
        });
      }
    });
  }
  it('records nonzero values', () => {
    expect(
      flat((recorded['pulse'] as Record<string, unknown>)['wexlerGrid']).some((v) => v > 0),
    ).toBe(true);
  });
});
