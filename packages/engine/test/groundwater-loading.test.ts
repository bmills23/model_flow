import { describe, expect, it } from 'vitest';
import {
  domenicoConcentration,
  domenicoWarnings,
  groundwaterDomenico,
  groundwaterWexler,
  patchfConcentration,
  patchfGrid,
  patchiConcentration,
  patchiGrid,
  type ConcentrationStep,
  type DomenicoInput,
  type WexlerInput,
} from '../src/processes/groundwater/index.js';

const w: WexlerInput = {
  velocity: 0.5,
  decayRate: 0.01,
  dx: 2,
  dy: 0.4,
  dz: 0.1,
  c0: 1000,
  patch: { y1: 20, y2: 40, z1: 0, z2: 4 },
};
const fin = { width: 60, thickness: 10 };
const p = { x: 30, y: 30, z: 2 };
const d: DomenicoInput = {
  velocity: 0.2,
  decayRate: 0.002,
  alphaL: 10,
  alphaT: 1,
  alphaV: 0.1,
  c0: 10,
  sourceWidth: 20,
  sourceThickness: 3,
};
const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

describe('concentration loading', () => {
  const pulse: ConcentrationStep[] = [{ start: 10, end: 50, concentration: 600 }];
  it('a pulse equals the difference of two step responses (PATCHI, PATCHF, Domenico)', () => {
    const t = 120;
    const unit = (tau: number): number => patchiConcentration({ ...w, c0: 1 }, p, tau);
    expect(rel(patchiConcentration(w, p, t, pulse), 600 * (unit(110) - unit(70)))).toBeLessThan(
      1e-12,
    );
    const f = (tau: number): number => patchfConcentration({ ...w, c0: 1 }, p, tau, fin).value;
    expect(
      rel(patchfConcentration(w, p, t, fin, pulse).value, 600 * (f(110) - f(70))),
    ).toBeLessThan(1e-12);
    const g = (tau: number): number => domenicoConcentration({ ...d, c0: 1 }, p, tau);
    const dp = [{ start: 10, end: 50, concentration: 6 }];
    expect(rel(domenicoConcentration(d, p, t, dp), 6 * (g(110) - g(70)))).toBeLessThan(1e-12);
  });
  it('equal consecutive steps collapse to the continuous result', () => {
    const two: ConcentrationStep[] = [
      { start: 0, end: 40, concentration: 1000 },
      { start: 40, end: Infinity, concentration: 1000 },
    ];
    for (const t of [30, 90, 400]) {
      expect(rel(patchiConcentration(w, p, t, two), patchiConcentration(w, p, t))).toBeLessThan(
        1e-12,
      );
      expect(
        rel(patchfConcentration(w, p, t, fin, two).value, patchfConcentration(w, p, t, fin).value),
      ).toBeLessThan(1e-12);
    }
    const dtwo = two.map((s) => ({ ...s, concentration: 10 }));
    expect(
      rel(domenicoConcentration(d, p, 90, dtwo), domenicoConcentration(d, p, 90)),
    ).toBeLessThan(1e-12);
  });
  it('grids agree with points for a two-step loading', () => {
    const two: ConcentrationStep[] = [
      { start: 0, end: 40, concentration: 1000 },
      { start: 60, end: 100, concentration: 500 },
    ];
    const xs = [10, 30];
    const ys = [25, 35];
    for (const t of [80, 150]) {
      const gi = patchiGrid(w, xs, ys, 2, t, undefined, two);
      const gf = patchfGrid(w, xs, ys, 2, t, fin, undefined, two);
      xs.forEach((x, i) =>
        ys.forEach((y, j) => {
          const a = patchiConcentration(w, { x, y, z: 2 }, t, two);
          const b = patchfConcentration(w, { x, y, z: 2 }, t, fin, two).value;
          if (a > 1e-3) expect(rel(gi[i]![j]!, a)).toBeLessThan(1e-4);
          if (b > 1e-3) expect(rel(gf[i]![j]!, b)).toBeLessThan(1e-4);
        }),
      );
    }
  });
  it('steady state: a finished pulse gives 0, an open final step its steady value', () => {
    expect(patchiConcentration(w, p, Infinity, pulse)).toBe(0);
    expect(patchfConcentration(w, p, Infinity, fin, pulse).value).toBe(0);
    expect(domenicoConcentration(d, p, Infinity, [{ start: 0, end: 5, concentration: 3 }])).toBe(0);
    const open: ConcentrationStep[] = [
      { start: 0, end: 10, concentration: 1000 },
      { start: 20, end: Infinity, concentration: 400 },
    ];
    expect(
      rel(patchiConcentration(w, p, Infinity, open), 0.4 * patchiConcentration(w, p, Infinity)),
    ).toBeLessThan(1e-12);
    expect(patchiGrid(w, [30], [30], 2, Infinity, undefined, pulse)[0]![0]).toBe(0);
  });
  it('Domenico warnings compare against the same loaded concentration', () => {
    const dp = [{ start: 0, end: 60, concentration: 10 }];
    const cont = domenicoWarnings({ ...d, alphaL: 10 }, { x: 20, y: 0, z: 0 }, 100);
    const loaded = domenicoWarnings({ ...d, alphaL: 10 }, { x: 20, y: 0, z: 0 }, 100, 0.1, dp);
    const msg = (ws: typeof cont): string | undefined =>
      ws.find((x) => x.code === 'domenico.deviates-from-exact')?.message;
    expect(msg(loaded)).toBeDefined();
    expect(msg(loaded)).not.toBe(msg(cont));
  });
  it('is wired through the method run inputs', () => {
    const a = groundwaterWexler.run({ params: w, time: 120, loading: pulse, points: [p] });
    expect(a.concentrations[0]).toBe(patchiConcentration(w, p, 120, pulse));
    const dp = [{ start: 10, end: 50, concentration: 6 }];
    const b = groundwaterDomenico.run({ params: d, time: 120, loading: dp, points: [p] });
    expect(b.concentrations[0]).toBe(domenicoConcentration(d, p, 120, dp));
  });
  it('rejects overlapping, unordered, negative or malformed steps with RangeError', () => {
    const bad: ConcentrationStep[][] = [
      [
        { start: 0, end: 30, concentration: 1 },
        { start: 20, end: 40, concentration: 1 },
      ],
      [
        { start: 50, end: 60, concentration: 1 },
        { start: 0, end: 10, concentration: 1 },
      ],
      [{ start: 0, end: 10, concentration: -1 }],
      [{ start: 0, end: 10, concentration: NaN }],
      [{ start: 10, end: 10, concentration: 1 }],
      [{ start: -1, end: 10, concentration: 1 }],
    ];
    for (const l of bad) {
      expect(() => patchiConcentration(w, p, 100, l)).toThrow(RangeError);
      expect(() => patchfConcentration(w, p, 100, fin, l)).toThrow(RangeError);
      expect(() => domenicoConcentration(d, p, 100, l)).toThrow(RangeError);
      expect(() => patchiGrid(w, [10], [30], 2, 100, undefined, l)).toThrow(RangeError);
    }
  });
});
