import { describe, expect, it } from 'vitest';
import vga from './fixtures/vadose/vga1982-a1.json' with { type: 'json' };
import {
  c14ClosedForm,
  c14Concentration,
  c14Convolution,
  c14Evaluation,
  c14TotalFlux,
} from '../src/processes/vadose/c14.js';
import { c13Concentration, type C13Params } from '../src/processes/vadose/kernel.js';
import {
  solveLayeredColumn,
  type FvLayer,
  type FvProblem,
} from '../src/processes/vadose/layered.js';
import {
  prepareLayered,
  runLayered,
  vadoseLayered,
  type LayeredInput,
} from '../src/processes/vadose/modern.js';
import { unitGradientMoisture } from '../src/processes/vadose/hydraulics.js';
import { millingtonQuirkDeff } from '../src/processes/vadose/diffusion.js';
import { registry } from '../src/index.js';
import { integrate } from '../src/numerics/quadrature.js';

const DAY = 86400;
const YEAR = 365.25 * DAY;

describe('C14 kernel against van Genuchten and Alves (1982) Table 6, third-type inlet', () => {
  const p: C13Params = { v: 1, D: 4, R: 1, mu: 0, gamma: 0, c0: 1 };
  // Seven printed values differ from the exact C14 solution by more than half a unit in the last
  // digit (largest 1.27e-4 at t = 25, x = 20). The digits were re-read from a 300 dpi render of
  // printed page 119 and are as entered. The same solution agrees with its own convolution form,
  // its PDE and inlet condition by finite differences, and the finite-volume solver, so the gap is
  // in the 1982 program's printed output. The tolerance is not widened; these points are held out
  // pending a DECISIONS.md ruling.
  const heldOut = new Set(['10:8', '10:18', '15:20', '20:20', '25:16', '25:18', '25:20']);
  it('matches every other printed value within 5e-5', () => {
    let checked = 0;
    for (const t of vga.times) {
      const col = (vga.thirdType as Record<string, number[]>)[String(t)]!;
      vga.distances.forEach((x, k) => {
        if (heldOut.has(`${t}:${x}`)) return;
        expect(Math.abs(c14Concentration(p, x, t) - col[k]!), `t=${t} x=${x}`).toBeLessThanOrEqual(
          vga.absTolerance,
        );
        checked++;
      });
    }
    expect(checked).toBe(48);
  });
  it('held-out points miss by less than 1.3e-4 (recorded, not asserted at the fixture tolerance)', () => {
    for (const key of heldOut) {
      const [t, x] = key.split(':').map(Number) as [number, number];
      const printed = (vga.thirdType as Record<string, number[]>)[String(t)]![x / 2]!;
      const miss = Math.abs(c14Concentration(p, x, t) - printed);
      expect(miss, key).toBeGreaterThan(vga.absTolerance);
      expect(miss, key).toBeLessThan(1.3e-4);
    }
  });
  it.todo(
    'third-type t:x = 10:8, 10:18, 15:20, 20:20, 25:16, 25:18, 25:20 miss 5e-5 by up to 7.7e-5 (needs a DECISIONS.md ruling)',
  );
});

describe('C14 closed form', () => {
  const cases: C13Params[] = [
    { v: 0.5, D: 0.2, R: 2, mu: 0.01, gamma: 0.001, c0: 1 },
    { v: 0.1, D: 0.05, R: 5, mu: 0, gamma: 0.0005, c0: 2.5 },
    { v: 1, D: 1, R: 1.2, mu: 0.05, gamma: 0.01, c0: 1 },
    { v: 1, D: 1, R: 2, mu: 0.04, gamma: 0.02, c0: 1 }, // mu = gamma R exactly
  ];
  it('agrees with the Duhamel convolution to 1e-9 relative where w is real', () => {
    for (const p of cases) {
      expect(c14Evaluation(p)).toBe('closed-form');
      for (const x of [0, 0.2, 1, 3]) {
        for (const t of [1, 5, 20, 80]) {
          const a = c14ClosedForm(p, x, t);
          if (a < 1e-12 * p.c0) continue;
          const b = c14Convolution(p, x, t);
          expect(Math.abs(a - b) / a, `x=${x} t=${t}`).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('satisfies the PDE and the flux-type inlet by finite differences', () => {
    for (const p of cases) {
      const c = (x: number, t: number) => c14ClosedForm(p, x, t);
      for (const [x, t] of [
        [0.5, 3],
        [1.5, 10],
        [3, 25],
      ] as const) {
        const h = 1e-3;
        const k = 1e-3;
        const ct = (c(x, t + k) - c(x, t - k)) / (2 * k);
        const cx = (c(x + h, t) - c(x - h, t)) / (2 * h);
        const cxx = (c(x + h, t) - 2 * c(x, t) + c(x - h, t)) / (h * h);
        const lhs = p.R * ct;
        const rhs = p.D * cxx - p.v * cx - p.mu * c(x, t);
        const scale = Math.abs(p.R * ct) + Math.abs(p.D * cxx) + Math.abs(p.v * cx) + 1e-6;
        expect(Math.abs(lhs - rhs) / scale, `x=${x} t=${t}`).toBeLessThan(1e-5);
      }
      for (const t of [0.5, 4, 30]) {
        const h = 1e-5;
        const cx0 = (-3 * c(0, t) + 4 * c(h, t) - c(2 * h, t)) / (2 * h);
        const flux = -p.D * cx0 + p.v * c(0, t);
        const want = p.v * p.c0 * Math.exp(-p.gamma * t);
        expect(Math.abs(flux - want) / want, `t=${t}`).toBeLessThan(1e-6);
      }
    }
  });

  it('total flux theta (v C - D dC/dx) equals theta v times the C13 solution', () => {
    const p = cases[0]!;
    const theta = 0.3;
    for (const [x, t] of [
      [0.4, 2],
      [1, 6],
      [2.5, 20],
    ] as const) {
      const h = 1e-4;
      const cx = (c14ClosedForm(p, x + h, t) - c14ClosedForm(p, x - h, t)) / (2 * h);
      const fd = theta * (p.v * c14ClosedForm(p, x, t) - p.D * cx);
      const f = c14TotalFlux(p, theta, x, t);
      expect(f).toBeCloseTo(theta * p.v * c13Concentration(p, x, t), 14);
      expect(Math.abs(fd - f) / f).toBeLessThan(1e-6);
    }
  });

  it('uses the convolution when gamma R > mu + v^2/(4D) and near mu = gamma R: finite, non-negative, continuous', () => {
    const base = { v: 0.2, D: 0.1, R: 4, mu: 0.001, c0: 1 };
    const threshold = (base.mu + (base.v * base.v) / (4 * base.D)) / base.R;
    const above: C13Params = { ...base, gamma: threshold * 3 };
    expect(c14Evaluation(above)).toBe('convolution');
    for (const x of [0, 0.1, 0.5, 2, 5]) {
      for (const t of [0.5, 5, 50, 500]) {
        const c = c14Concentration(above, x, t);
        expect(Number.isFinite(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
      }
    }
    const below: C13Params = { ...base, gamma: threshold * (1 - 1e-7) };
    const over: C13Params = { ...base, gamma: threshold * (1 + 1e-7) };
    expect(c14Evaluation(below)).toBe('closed-form');
    expect(c14Evaluation(over)).toBe('convolution');
    for (const x of [0.3, 1, 3]) {
      for (const t of [5, 40]) {
        const a = c14Concentration(below, x, t);
        const b = c14Concentration(over, x, t);
        expect(Math.abs(a - b) / Math.max(a, 1e-12)).toBeLessThan(1e-5);
      }
    }
    // near mu = gamma R the general closed form cancels; the convolution takes over
    const eq: C13Params = { v: 1, D: 1, R: 2, mu: 0.04, gamma: 0.02, c0: 1 };
    const near: C13Params = { ...eq, gamma: 0.02 * (1 + 1e-6) };
    expect(c14Evaluation(near)).toBe('convolution');
    for (const x of [0, 1, 3]) {
      const a = c14Concentration(eq, x, 10);
      const b = c14Concentration(near, x, 10);
      expect(Math.abs(a - b) / a).toBeLessThan(1e-5);
    }
  });
});

// Homogeneous column problem shared by the solver tests (consistent units, no SI needed here).
const hom = { theta: 0.25, q: 0.25, D: 0.5, R: 2, mu: 0.01, gamma: 0.02, c0: 1 };
const homParams: C13Params = {
  v: hom.q / hom.theta,
  D: hom.D,
  R: hom.R,
  mu: hom.mu,
  gamma: hom.gamma,
  c0: hom.c0,
};
function inletOf(q: number, c0: number, gamma: number) {
  return {
    inflow: (t0: number, t1: number) =>
      gamma === 0
        ? q * c0 * (t1 - t0)
        : ((q * c0) / gamma) * (Math.exp(-gamma * t0) - Math.exp(-gamma * t1)),
    inletConcentration: (t: number) => c0 * Math.exp(-gamma * t),
  };
}
function homProblem(length: number, extra: Partial<FvProblem> = {}): FvProblem {
  return {
    q: hom.q,
    mu: hom.mu,
    layers: [{ thickness: length, theta: hom.theta, R: hom.R, D: hom.D }],
    ...inletOf(hom.q, hom.c0, hom.gamma),
    times: [0, 2, 5, 10, 15],
    depths: [0, 0.5, 1, 2, 4, 6, 8],
    profileTimes: [2, 5, 10, 15],
    ...extra,
  };
}
function maxAbsError(profiles: number[][], depths: number[], times: number[]): number {
  let worst = 0;
  times.forEach((t, i) =>
    depths.forEach((x, k) => {
      worst = Math.max(worst, Math.abs(profiles[i]![k]! - c14Concentration(homParams, x, t)));
    }),
  );
  return worst;
}
function maxRelError(
  profiles: number[][],
  depths: number[],
  times: number[],
  above: number,
): number {
  let worst = 0;
  times.forEach((t, i) => {
    depths.forEach((x, k) => {
      const exact = c14Concentration(homParams, x, t);
      if (exact <= above * hom.c0) return;
      worst = Math.max(worst, Math.abs(profiles[i]![k]! - exact) / exact);
    });
  });
  return worst;
}

describe('finite-volume solver', () => {
  it('agrees with C14 on a homogeneous column to 1e-4 of the inlet concentration', () => {
    const pr = homProblem(16, {
      grid: { maxPeclet: 0.05, tolerance: 0 },
      time: { fixedStep: 2e-3 },
    });
    const r = solveLayeredColumn(pr);
    const depths = [...pr.depths!];
    const times = [...pr.profileTimes!];
    expect(maxAbsError(r.profiles, depths, times)).toBeLessThan(1e-4 * hom.c0);
    // where C exceeds 1e-2 c0 the relative error is within 1e-2 (see the todo below)
    expect(maxRelError(r.profiles, depths, times, 1e-2)).toBeLessThan(1e-2);
  });

  // The methods note asks for 1e-4 relative wherever C exceeds 1e-6 of the inlet. The solver is
  // second order (see the next test), so its relative error grows in the leading tail of a front:
  // at t = 2, x = 4 (C = 8.0e-4) it is 0.42, 0.10, 0.025 and 0.0063 at maxPeclet 0.4, 0.2, 0.1 and
  // 0.05, and a 16 m column at maxPeclet 0.006 (5334 cells, 7 s) still gives 2.7e-4 over these
  // points. The criterion is not met at a practical grid; it is not relaxed here.
  it.todo(
    'agrees with C14 to 1e-4 relative wherever C > 1e-6 c0 (not met by the second-order scheme)',
  );

  it('converges at second order under grid refinement and time-step refinement', () => {
    const errs = [0.5, 0.25, 0.125].map((maxPeclet) => {
      const pr = homProblem(16, { grid: { maxPeclet, tolerance: 0 }, time: { fixedStep: 1e-3 } });
      const r = solveLayeredColumn(pr);
      return maxAbsError(r.profiles, [...pr.depths!], [...pr.profileTimes!]);
    });
    expect(errs[0]! / errs[1]!).toBeGreaterThan(3);
    expect(errs[1]! / errs[2]!).toBeGreaterThan(3);
    const sol = [0.5, 0.25, 0.125].map(
      (fixedStep) =>
        solveLayeredColumn(
          homProblem(16, { grid: { maxPeclet: 0.5, tolerance: 0 }, time: { fixedStep } }),
        ).profiles,
    );
    const diff = (a: number[][], b: number[][]) =>
      Math.max(...a.flatMap((row, i) => row.map((v, k) => Math.abs(v - b[i]![k]!))));
    expect(diff(sol[0]!, sol[1]!) / diff(sol[1]!, sol[2]!)).toBeGreaterThan(3);
  });

  it('two identical layers equal one layer', () => {
    const soil = { theta: 0.3, R: 1.5, D: 0.2 };
    const common = {
      q: 0.15,
      mu: 0.02,
      ...inletOf(0.15, 1, 0.01),
      times: [0, 1, 3, 6, 12],
      depths: [0, 0.3, 1, 1.7, 2],
      profileTimes: [3, 12],
      time: { fixedStep: 0.05 },
    };
    const one = solveLayeredColumn({
      ...common,
      layers: [{ thickness: 2, ...soil }],
      grid: { minCellsPerLayer: 40, tolerance: 0 },
    });
    const two = solveLayeredColumn({
      ...common,
      layers: [
        { thickness: 1, ...soil },
        { thickness: 1, ...soil },
      ],
      grid: { minCellsPerLayer: 20, tolerance: 0 },
    });
    expect(two.cells).toBe(one.cells);
    one.waterTableFlux.forEach((f, k) => {
      expect(Math.abs(two.waterTableFlux[k]! - f)).toBeLessThanOrEqual(1e-12 * Math.max(f, 1e-30));
    });
    one.profiles.forEach((row, i) =>
      row.forEach((c, k) => expect(Math.abs(two.profiles[i]![k]! - c)).toBeLessThan(1e-13)),
    );
  });

  it('closes its mass budget to 1e-9 on a three-layer column with decay', () => {
    const layers: FvLayer[] = [
      { thickness: 1.2, theta: 0.12, R: 3, D: 0.05 },
      { thickness: 0.4, theta: 0.3, R: 1.2, D: 0.01 },
      { thickness: 2.5, theta: 0.09, R: 2, D: 0.08 },
    ];
    const r = solveLayeredColumn({
      q: 0.05,
      mu: 0.03,
      layers,
      ...inletOf(0.05, 2, 0.02),
      times: Array.from({ length: 41 }, (_, k) => k * 2),
    });
    expect(r.closureError).toBeLessThan(1e-9);
    r.times.forEach((_, k) => {
      const lhs = r.inflow[k]!;
      const rhs = r.outflow[k]! + r.decayed[k]! + r.stored[k]!;
      expect(Math.abs(lhs - rhs)).toBeLessThanOrEqual(1e-9 * Math.max(lhs, 1e-30));
    });
    expect(r.decayed.at(-1)!).toBeGreaterThan(0);
    expect(r.outflow.at(-1)!).toBeGreaterThan(0);
  });
});

// A modern-method input in SI: loam-like soils, a dissolved-only source and benzene-like chemistry.
const loam = { thetaS: 0.4, thetaR: 0.05, n: 1.6, Ks: 0.25 / DAY, rhoB: 1600, foc: 0.004 };
const sand = { thetaS: 0.35, thetaR: 0.03, n: 2.7, Ks: 3 / DAY, rhoB: 1700, foc: 0.002 };
const silt = { thetaS: 0.45, thetaR: 0.07, n: 1.4, Ks: 0.1 / DAY, rhoB: 1500, foc: 0.006 };
const chem = {
  M: 0.078,
  S: 1.75,
  H: 0.228,
  Koc: 0.059,
  Da: 8.8e-6,
  Dw: 9.8e-10,
  mu: 0.001 / DAY,
};
function modernInput(extra: Partial<LayeredInput> = {}): LayeredInput {
  return {
    q: 0.2 / YEAR,
    above: [
      { ...loam, thickness: 1.5 },
      { ...silt, thickness: 0.3 },
    ],
    source: { ...loam, thickness: 1, length: 10, width: 8, F: 20e-6 },
    below: [
      { ...loam, thickness: 4 },
      { ...sand, thickness: 3 },
      { ...silt, thickness: 3 },
    ],
    chemical: chem,
    duration: 30 * YEAR,
    ...extra,
  };
}

describe('vadose.layered (modern method)', () => {
  it('is registered as the modern vadose method with used citations', () => {
    const m = registry.get('vadose.layered');
    expect(m).toBe(vadoseLayered);
    expect(m.kind).toBe('modern');
    expect(m.process).toBe('vadose');
    for (const key of ['vangenuchten1982', 'vangenuchten1980', 'mualem1976']) {
      expect(m.citations).toContain(key);
    }
  });

  it('rejects infiltration at or above the smallest Ks of any layer (no clamp)', () => {
    const minKs = silt.Ks;
    expect(() => prepareLayered(modernInput({ q: minKs }))).toThrow(RangeError);
    expect(() => prepareLayered(modernInput({ q: minKs * 1.01 }))).toThrow(RangeError);
    expect(() => prepareLayered(modernInput({ q: minKs * 0.99 }))).not.toThrow();
    const lowSource = modernInput({
      q: 0.05 / DAY,
      above: [],
      below: [{ ...sand, thickness: 2 }],
      source: { ...sand, Ks: 0.04 / DAY, thickness: 1, length: 1, width: 1, F: 1e-6 },
    });
    expect(() => prepareLayered(lowSource)).toThrow(RangeError);
  });

  it('takes the vapour path to the middle of the source through the upper half of the source', () => {
    const input = modernInput();
    const m = prepareLayered(input);
    const q = input.q;
    const hd = (s: typeof loam, h: number) => {
      const theta = unitGradientMoisture(s, q, 'vanGenuchten1980').theta;
      return h / (chem.H * millingtonQuirkDeff({ thetaS: s.thetaS, theta }, chem));
    };
    const resistance = hd(loam, 1.5) + hd(silt, 0.3) + hd(loam, 0.5);
    expect(m.diffusionPath).toBeCloseTo(1.5 + 0.3 + 0.5, 12);
    expect(m.volatilizationVelocity / (1 / resistance)).toBeCloseTo(1, 12);
    expect(m.deff! / (m.diffusionPath / (resistance * chem.H))).toBeCloseTo(1, 12);
  });

  it('uses the Mualem-van Genuchten moisture by default and adds pore-water diffusion to D', () => {
    const m = prepareLayered(modernInput());
    const th = unitGradientMoisture(loam, 0.2 / YEAR, 'vanGenuchten1980').theta;
    expect(m.below[0]!.theta).toBeCloseTo(th, 14);
    const v = 0.2 / YEAR / th;
    const dw = (chem.Dw * Math.pow(th, 7 / 3)) / (loam.thetaS * loam.thetaS);
    expect(m.below[0]!.D / (m.dispersivity * v + dw)).toBeCloseTo(1, 12);
    expect(m.below[0]!.R).toBeCloseTo(1 + (loam.rhoB * chem.Koc * loam.foc) / th, 12);
  });

  it(
    'runs a 3-layer, 10 m, 30-year monthly case under 200 ms with a closed budget',
    { timeout: 20000 },
    () => {
      const input = modernInput();
      // best of three after a warm-up run, so a busy machine does not fail the check
      let out = runLayered(input);
      let ms = Infinity;
      for (let k = 0; k < 3; k++) {
        const t0 = Date.now();
        out = runLayered(input);
        ms = Math.min(ms, Date.now() - t0);
      }
      expect(out.evaluation).toBe('finite-volume');
      expect(out.series.times).toHaveLength(361);
      expect(ms).toBeLessThan(200);
      expect(out.numerics!.converged).toBe(true);
      expect(out.budget.closureError!).toBeLessThan(1e-9);
      const b = out.budget;
      expect(
        Math.abs(b.leached - (b.inProfile + b.decayedInTransit + b.deliveredToWaterTable)),
      ).toBeLessThan(1e-9 * b.leached);
      expect(out.warnings.map((w) => w.code)).not.toContain('vadose.mass-balance');
    },
  );

  it('delivers the whole leaching loss to the water table over long times when mu = 0', () => {
    const fast = { ...chem, mu: 0, Koc: 0.002 };
    for (const below of [
      [
        { ...sand, thickness: 2 },
        { ...loam, thickness: 1.5 },
      ],
      [{ ...sand, thickness: 3 }],
    ]) {
      const out = runLayered(
        modernInput({
          chemical: fast,
          q: 0.5 / YEAR,
          below,
          source: { ...loam, thickness: 0.3, length: 2, width: 2, F: 2e-6 },
          duration: 400 * YEAR,
          seriesStep: YEAR,
          numerics: { gridTolerance: 0 },
        }),
      );
      const b = out.budget;
      expect(b.sourceMass / b.initialSourceMass).toBeLessThan(1e-6);
      expect(
        Math.abs(b.deliveredToWaterTable - b.leached) / b.leached,
        out.evaluation,
      ).toBeLessThan(1e-6);
    }
  });

  it('uses analytic C14 for one homogeneous layer below the source and matches the finite-volume solver', () => {
    const input = modernInput({ below: [{ ...loam, thickness: 3 }], duration: 15 * YEAR });
    const a = runLayered(input);
    expect(a.evaluation).toBe('analytic-c14');
    const fv = runLayered({
      ...input,
      numerics: { forceFiniteVolume: true },
    });
    expect(fv.evaluation).toBe('finite-volume');
    const peak = Math.max(...a.series.flux);
    let worst = 0;
    a.series.flux.forEach((f, k) => {
      worst = Math.max(worst, Math.abs(fv.series.flux[k]! - f) / peak);
    });
    expect(a.c14Evaluation).toBe('convolution');
    expect(fv.numerics!.converged).toBe(true);
    expect(worst).toBeLessThan(1e-3);
    // analytic budget: the in-transit decay derived from the balance equals mu theta int int C
    const m = prepareLayered(input);
    const l = m.below[0]!;
    const p: C13Params = {
      v: l.v,
      D: l.D,
      R: l.R,
      mu: chem.mu,
      gamma: m.source.gamma,
      c0: m.source.cs0,
    };
    const T = input.duration;
    const inner = (t: number) =>
      integrate((x) => c14Concentration(p, x, t), 0, 3, { relTol: 1e-8, absTol: 1e-18 }).value;
    const decayed =
      chem.mu *
      l.theta *
      integrate(inner, 0, T, { relTol: 1e-7, absTol: 1e-20 * T }).value *
      m.area;
    expect(Math.abs(a.budget.decayedInTransit - decayed) / decayed).toBeLessThan(1e-5);
  });

  it('warns about a separate phase and the constant-TPH approximation, not about the budget', () => {
    const out = runLayered(
      modernInput({
        source: {
          ...loam,
          thickness: 3,
          length: 10,
          width: 10,
          F: 300e-6,
          FT: 1000e-6,
          MT: 0.1,
        },
        duration: 5 * YEAR,
      }),
    );
    expect(out.warnings.map((w) => w.code)).toEqual([
      'vadose.residual-phase',
      'vadose.tph-constant-approximation',
    ]);
  });

  it('reports a solution that did not settle', () => {
    const out = runLayered(
      modernInput({ duration: 5 * YEAR, numerics: { maxRefinements: 0, maxGridRefinements: 0 } }),
    );
    expect(out.numerics!.converged).toBe(false);
    expect(out.warnings.map((w) => w.code)).toContain('vadose.numerics-not-converged');
  });

  it('rejects profile depths below the water table and an empty profile below the source', () => {
    expect(() => runLayered(modernInput({ depths: [0, 10.5] }))).toThrow(RangeError);
    expect(() => prepareLayered(modernInput({ below: [] }))).toThrow(RangeError);
    expect(() => prepareLayered(modernInput({ below: [{ ...loam, thickness: 0 }] }))).toThrow(
      RangeError,
    );
  });

  it('returns a clean column when nothing infiltrates', () => {
    const out = runLayered(modernInput({ q: 0, duration: 2 * YEAR }));
    expect(Math.max(...out.series.flux)).toBe(0);
    expect(out.budget.deliveredToWaterTable).toBe(0);
    expect(out.budget.sourceMass).toBeLessThan(out.budget.initialSourceMass);
  });
});
