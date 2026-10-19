import { describe, expect, it } from 'vitest';
import { wellConcentrations, type Transport } from '../src/processes/cleanup/chains.js';
import {
  at123dConcentration,
  massRateFromConcentration,
  patchiConcentration,
  type At123dAquifer,
} from '../src/processes/groundwater/index.js';
import { waterTableSource } from '../src/processes/vadose/index.js';

const YEAR = 365.25 * 86400;
const aquifer: At123dAquifer = {
  velocity: 2e-7,
  porosity: 0.3,
  retardation: 1.7,
  decayRate: 0,
  dx: 4e-7,
  dy: 1e-7,
  dz: 2e-8,
  thickness: 3,
};
const source = waterTableSource(10, 10, { thickness: 3 });
const darcyFlux = aquifer.velocity * aquifer.porosity;
const points = [
  { x: 25, y: 0, z: 1.5 },
  { x: 25, y: 0, z: 2.5 },
];
const steps = (c: number) => [
  { start: 0, end: 2 * YEAR, concentration: c },
  { start: 2 * YEAR, end: 5 * YEAR, concentration: 0.5 * c },
];

describe('repeated evaluation of one transport (the solver re-runs it with new concentrations)', () => {
  it('the kernel reuses the per-step time integrals and returns the very same numbers', () => {
    const p = points[0]!;
    const time = 6 * YEAR;
    const rates = (r: number) => [
      { start: 0, end: 2 * YEAR, rate: r },
      { start: 2 * YEAR, end: 5 * YEAR, rate: 0.5 * r },
    ];
    const integrals = new Map<string, number>();
    const first = at123dConcentration({ aquifer, source, loading: rates(1e-9), time }, p, {
      integrals,
    });
    expect(integrals.size).toBe(2);
    const again = at123dConcentration({ aquifer, source, loading: rates(3e-9), time }, p, {
      integrals,
    });
    expect(first).toBe(at123dConcentration({ aquifer, source, loading: rates(1e-9), time }, p));
    expect(again).toBe(at123dConcentration({ aquifer, source, loading: rates(3e-9), time }, p));
    expect(integrals.size).toBe(2);
  });

  it('PATCHI reuses the unit step response and returns the very same numbers', () => {
    const params = {
      velocity: 1e-7,
      dx: 2e-7,
      dy: 6e-8,
      dz: 1e-8,
      c0: 1,
      patch: { y1: -5, y2: 5, z1: 0, z2: 3 },
    };
    const p = { x: 25, y: 0.5, z: 1.5 };
    const unitResponse = new Map<number, number>();
    const run = (c: number, memo?: Map<number, number>) =>
      patchiConcentration(params, p, 6 * YEAR, steps(c), undefined, memo);
    const first = run(1, unitResponse);
    expect(unitResponse.size).toBeGreaterThan(0);
    const size = unitResponse.size;
    expect(first).toBe(run(1));
    expect(run(7, unitResponse)).toBe(run(7));
    expect(unitResponse.size).toBe(size);
  });

  it('wellConcentrations gives the direct numbers on every call, for both transports', () => {
    const at: Transport = {
      kind: 'at123d',
      aquifer,
      source,
      darcyFlux,
      crossSection: 30,
      points,
    };
    const wexlerParams = {
      velocity: 1e-7,
      dx: 2e-7,
      dy: 6e-8,
      dz: 1e-8,
      c0: 1,
      patch: { y1: -5, y2: 5, z1: 0, z2: 3 },
    };
    const wx: Transport = {
      kind: 'wexler',
      params: wexlerParams,
      darcyFlux,
      crossSection: 30,
      points,
    };
    for (const t of [3 * YEAR, 6 * YEAR]) {
      for (const c of [1e-4, 2.5e-3, 1e-4]) {
        const load = { kind: 'conc' as const, steps: steps(c) };
        const expectedAt = points.map((p) =>
          at123dConcentration(
            {
              aquifer,
              source,
              loading: steps(c).map((s) => ({
                start: s.start,
                end: s.end,
                rate: massRateFromConcentration(s.concentration, darcyFlux, 30),
              })),
              time: t,
            },
            p,
          ),
        );
        expect(wellConcentrations(at, load, t)).toEqual(expectedAt);
        const conc = steps(c);
        const expectedWx = points.map((p) =>
          patchiConcentration(wexlerParams, p, t, conc, undefined),
        );
        expect(wellConcentrations(wx, load, t)).toEqual(expectedWx);
      }
    }
  });
});
