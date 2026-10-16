import { describe, expect, it } from 'vitest';
import vga from './fixtures/vadose/vga1982-a1.json' with { type: 'json' };
import {
  c13ClosedForm,
  c13Concentration,
  c13Convolution,
  c13Evaluation,
  c13InletGradient,
  type C13Params,
} from '../src/processes/vadose/kernel.js';
import { vadsatDispersivity } from '../src/processes/vadose/dispersivity.js';
import { sourceDepletionRate, sourceState } from '../src/processes/vadose/source.js';
import { prepareVadsat, vadoseVadsat, type VadsatInput } from '../src/processes/vadose/index.js';
import { registry } from '../src/index.js';
import { integrateTanhSinh } from '../src/numerics/quadrature.js';

const DAY = 86400;
const YEAR = 365.25 * DAY;

describe('C13 kernel against van Genuchten and Alves (1982) Table 6, first-type inlet', () => {
  const p: C13Params = { v: 1, D: 4, R: 1, mu: 0, gamma: 0, c0: 1 };
  // t = 5, x = 18 is printed 0.0324; the exact value 0.0323495 sits 5.4e-7 below the rounding
  // boundary, so the print misses the half-unit tolerance by 5.4e-7. Held out pending a decision.
  const heldOut = new Set(['5:18']);
  it('matches every printed value within 5e-5 (one held-out point, see the todo below)', () => {
    let checked = 0;
    for (const t of vga.times) {
      const col = (vga.firstType as Record<string, number[]>)[String(t)]!;
      vga.distances.forEach((x, k) => {
        if (heldOut.has(`${t}:${x}`)) return;
        expect(Math.abs(c13Concentration(p, x, t) - col[k]!), `t=${t} x=${x}`).toBeLessThanOrEqual(
          vga.absTolerance,
        );
        checked++;
      });
    }
    expect(checked).toBe(54);
  });
  it.todo(
    't = 5, x = 18: printed 0.0324, closed form 0.0323495, misses 5e-5 by 5.4e-7 (needs a DECISIONS.md ruling)',
  );
});

describe('C13 closed form and Duhamel convolution', () => {
  const cases: C13Params[] = [
    { v: 0.5, D: 0.2, R: 2, mu: 0.01, gamma: 0.001, c0: 1 },
    { v: 0.1, D: 0.05, R: 5, mu: 0, gamma: 0.0005, c0: 2.5 },
    { v: 1, D: 1, R: 1.2, mu: 0.05, gamma: 0.05, c0: 1 },
  ];
  it('agree to 1e-9 relative where w is real', () => {
    for (const p of cases) {
      expect(c13Evaluation(p)).toBe('closed-form');
      for (const x of [0.2, 1, 3]) {
        for (const t of [1, 5, 20, 80]) {
          const a = c13ClosedForm(p, x, t);
          if (a < 1e-12 * p.c0) continue;
          const b = c13Convolution(p, x, t);
          expect(Math.abs(a - b) / a, `x=${x} t=${t}`).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('uses the convolution when gamma R > mu + v^2/(4D): finite, non-negative, continuous', () => {
    const base = { v: 0.2, D: 0.1, R: 4, mu: 0.001, c0: 1 };
    const threshold = (base.mu + (base.v * base.v) / (4 * base.D)) / base.R;
    const above: C13Params = { ...base, gamma: threshold * 3 };
    expect(c13Evaluation(above)).toBe('convolution');
    for (const x of [0, 0.1, 0.5, 2, 5]) {
      for (const t of [0.5, 5, 50, 500]) {
        const c = c13Concentration(above, x, t);
        expect(Number.isFinite(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
      }
    }
    const below: C13Params = { ...base, gamma: threshold * (1 - 1e-7) };
    const over: C13Params = { ...base, gamma: threshold * (1 + 1e-7) };
    expect(c13Evaluation(below)).toBe('closed-form');
    expect(c13Evaluation(over)).toBe('convolution');
    for (const x of [0.3, 1, 3]) {
      for (const t of [2, 20, 100]) {
        const a = c13Concentration(below, x, t);
        const b = c13Concentration(over, x, t);
        expect(Math.abs(a - b)).toBeLessThan(1e-6 * Math.max(a, 1e-12) + 1e-14);
      }
    }
  });

  it('satisfies the PDE R C_t = D C_xx - v C_x - mu C by finite differences', () => {
    const p: C13Params = { v: 0.5, D: 0.2, R: 2, mu: 0.01, gamma: 0.002, c0: 1 };
    for (const x of [0.5, 1.5, 3]) {
      for (const t of [3, 8, 15]) {
        const h = 1e-3;
        const k = 1e-3;
        const c = c13Concentration(p, x, t);
        const ct = (c13Concentration(p, x, t + k) - c13Concentration(p, x, t - k)) / (2 * k);
        const cx = (c13Concentration(p, x + h, t) - c13Concentration(p, x - h, t)) / (2 * h);
        const cxx =
          (c13Concentration(p, x + h, t) - 2 * c + c13Concentration(p, x - h, t)) / (h * h);
        const scale = Math.abs(p.R * ct) + Math.abs(p.D * cxx) + Math.abs(p.v * cx) + p.mu * c;
        const resid = p.R * ct - p.D * cxx + p.v * cx + p.mu * c;
        expect(Math.abs(resid) / scale, `x=${x} t=${t}`).toBeLessThan(1e-5);
      }
    }
  });

  it('holds the inlet at c0 exp(-gamma t) and reduces to the plain solution as gamma, mu -> 0', () => {
    const p: C13Params = { v: 0.5, D: 0.2, R: 2, mu: 0.01, gamma: 0.002, c0: 3 };
    expect(c13Concentration(p, 0, 7)).toBeCloseTo(3 * Math.exp(-0.014), 14);
    const plain: C13Params = { v: 1, D: 4, R: 1, mu: 0, gamma: 0, c0: 1 };
    const tiny: C13Params = { v: 1, D: 4, R: 1, mu: 1e-12, gamma: 1e-12, c0: 1 };
    expect(c13Concentration(tiny, 6, 10)).toBeCloseTo(c13Concentration(plain, 6, 10), 9);
  });

  it('gives an inlet gradient that matches a one-sided finite difference', () => {
    for (const p of [
      { v: 0.5, D: 0.2, R: 2, mu: 0.01, gamma: 0.002, c0: 1 },
      { v: 0.2, D: 0.1, R: 4, mu: 0.001, gamma: 0.01, c0: 1 },
    ] satisfies C13Params[]) {
      for (const t of [1, 10, 50]) {
        const h = 1e-5;
        const fd =
          (-3 * c13Concentration(p, 0, t) +
            4 * c13Concentration(p, h, t) -
            c13Concentration(p, 2 * h, t)) /
          (2 * h);
        const g = c13InletGradient(p, t);
        expect(Math.abs(g - fd), `t=${t} ${c13Evaluation(p)}`).toBeLessThan(
          1e-4 * Math.abs(g) + 1e-8,
        );
      }
    }
  });
});

describe('legacy dispersivity regression', () => {
  it('uses the two branches split at 2 m', () => {
    expect(vadsatDispersivity(1)).toBeCloseTo(Math.exp(-4.933), 12);
    expect(vadsatDispersivity(2)).toBeCloseTo(Math.exp(-4.933 + 3.811 * Math.log(2)), 12);
    expect(vadsatDispersivity(2.8)).toBeCloseTo(Math.exp(-2.727 + 0.584 * Math.log(2.8)), 12);
    expect(vadsatDispersivity(2)).toBeCloseTo(0.101, 3);
    expect(vadsatDispersivity(2 + 1e-9)).toBeCloseTo(0.098, 3);
  });
  it('rejects non-positive and non-finite distances', () => {
    expect(() => vadsatDispersivity(0)).toThrow(RangeError);
    expect(() => vadsatDispersivity(-1)).toThrow(RangeError);
    expect(() => vadsatDispersivity(NaN)).toThrow(RangeError);
  });
});

/** A small sand case in SI. */
function baseInput(over: Partial<VadsatInput> = {}): VadsatInput {
  const soil = { thetaS: 0.35, thetaR: 0.05, n: 2.68, Ks: 10 / DAY, rhoB: 1700, foc: 0.01 };
  return {
    q: 0.2 / YEAR,
    depthToSource: 4,
    above: soil,
    lens: { ...soil, n: 2, thetaR: 0.15, Ks: 1 / DAY, thickness: 0.2 },
    source: { ...soil, thickness: 3, length: 10, width: 10, F: 5e-6 },
    below: { ...soil, thickness: 2.8 },
    chemical: {
      M: 0.078,
      S: 1.75,
      H: 0.228,
      Koc: 0.059,
      Da: 0.088e-4,
      Dw: 9.8e-10,
      mu: 0.001 / DAY,
    },
    duration: 10 * YEAR,
    ...over,
  };
}

describe('source depletion', () => {
  it('unified gamma equals the separate no-residual and residual expressions', () => {
    const noRes = prepareVadsat(baseInput());
    expect(noRes.partition.residual).toBe(false);
    const s = noRes.sourceSoil;
    const cap = s.rhoB * s.kd + s.theta + s.thetaA * noRes.chemical.H;
    const vol = noRes.volatilizationVelocity;
    const separateNoRes = (noRes.q + vol) / (noRes.sourceThickness * cap);
    expect(noRes.source.gamma).toBeCloseTo(separateNoRes, 20);
    expect(Math.abs(noRes.source.gamma - separateNoRes) / separateNoRes).toBeLessThan(1e-12);

    const res = prepareVadsat(
      baseInput({
        source: { ...baseInput().source, F: 500e-6, FT: 5000e-6, MT: 0.1 },
      }),
    );
    expect(res.partition.residual).toBe(true);
    const c = res.chemical;
    const separateRes =
      ((res.q + res.volatilizationVelocity) * c.S * 0.1) /
      (res.sourceThickness * res.sourceSoil.rhoB * c.M * 5000e-6);
    expect(Math.abs(res.source.gamma - separateRes) / separateRes).toBeLessThan(1e-12);
  });

  it('splits the lost mass into leached, volatilized and decayed shares that close', () => {
    const p = { cs0: 0.2, m0: 2.5, q: 1e-8, volatilization: 4e-9, sourceDecay: 1e-9 };
    const gamma = sourceDepletionRate(p);
    expect(gamma).toBeCloseTo((1.4e-8 * 0.2) / 2.5 + 1e-9, 22);
    for (const t of [0, 1e6, 1e8, 1e10]) {
      const st = sourceState(p, t);
      expect(st.cs).toBeCloseTo(0.2 * Math.exp(-gamma * t), 15);
      expect(st.mass + st.leached + st.volatilized + st.decayed).toBeCloseTo(2.5, 12);
      const leachedQuad = integrateTanhSinh((s) => p.q * 0.2 * Math.exp(-gamma * s), 0, t).value;
      if (t > 0) expect(Math.abs(st.leached - leachedQuad) / leachedQuad).toBeLessThan(1e-9);
    }
  });

  it('handles a clean source (F = 0) without dividing by zero', () => {
    const st = sourceState({ cs0: 0, m0: 0, q: 1e-8, volatilization: 1e-9, sourceDecay: 0 }, 1e8);
    expect(st).toEqual({ cs: 0, mass: 0, leached: 0, volatilized: 0, decayed: 0 });
  });
});

describe('vadose.vadsat method', () => {
  it('is registered as the legacy vadose method with used citations', () => {
    const m = registry.get('vadose.vadsat');
    expect(m.process).toBe('vadose');
    expect(m.kind).toBe('legacy');
    expect(m.risc5Choice).toBeTruthy();
    expect(m.citations).toEqual(
      expect.arrayContaining([
        'unlu1992',
        'vangenuchten1982',
        'brookscorey1964',
        'lenhard1989',
        'millingtonquirk1961',
        'epa1996ssg',
        'gelhar1985',
      ]),
    );
  });

  it('returns profiles, a monthly water-table series, the source series and a budget', () => {
    const out = vadoseVadsat.run(
      baseInput({ profileTimes: [2 * YEAR, 10 * YEAR], depths: [0, 0.5, 1, 2.8] }),
    );
    expect(out.evaluation).toBe('closed-form');
    expect(out.profiles.concentrations).toHaveLength(2);
    expect(out.profiles.concentrations[0]).toHaveLength(4);
    expect(out.profiles.dispersivity[0]).toBe(0);
    expect(out.profiles.dispersivity[3]).toBeCloseTo(vadsatDispersivity(2.8), 12);
    expect(out.series.times).toHaveLength(121);
    expect(out.series.times[120]).toBeCloseTo(10 * YEAR, 3);
    const last = out.series.times.length - 1;
    expect(out.series.flux[last]).toBeCloseTo(out.q * out.series.waterTable[last]!, 20);
    expect(out.series.massRate[last]).toBeCloseTo(out.series.flux[last]! * 100, 20);
    // the inlet of every profile is the source pore water
    expect(out.profiles.concentrations[1]![0]).toBeCloseTo(out.series.sourcePoreWater[last]!, 12);
    const b = out.budget;
    expect(
      b.sourceMass + b.leached + b.volatilized + b.sourceDecayed - b.initialSourceMass,
    ).toBeCloseTo(0, 9);
    expect(b.columnInflux).toBeGreaterThanOrEqual(b.leached);
    expect(b.inletExcessRatio).toBeCloseTo(b.columnInflux / b.leached, 12);
    expect(b.deliveredToWaterTable).toBeGreaterThan(0);
    expect(b.deliveredToWaterTable).toBeCloseTo(out.series.delivered[last]!, 12);
  });

  it('cumulative delivery equals the time integral of the mass rate', () => {
    const input = baseInput({ duration: 20 * YEAR });
    const out = vadoseVadsat.run(input);
    const model = prepareVadsat(input);
    const quad = integrateTanhSinh(
      (t) => model.q * c13Concentration(model.waterTable!, model.waterTableDepth, t) * 100,
      0,
      20 * YEAR,
      { relTol: 1e-12 },
    ).value;
    expect(Math.abs(out.budget.deliveredToWaterTable - quad) / quad).toBeLessThan(1e-8);
  });

  it('the end-of-run inlet ratio tends to the closed-form lifetime ratio', () => {
    const out = vadoseVadsat.run(baseInput({ duration: 300 * YEAR, seriesStep: YEAR }));
    const lifetime = out.budget.lifetimeInletExcessRatio;
    expect(lifetime).toBeGreaterThan(1);
    expect(Math.abs(out.budget.inletExcessRatio - lifetime)).toBeLessThan(1e-4 * lifetime);
    const noDecay = baseInput({ chemical: { ...baseInput().chemical, mu: 0 } });
    expect(vadoseVadsat.run(noDecay).budget.lifetimeInletExcessRatio).toBe(1);
  });

  it('a user-entered dispersivity overrides the regression at every depth', () => {
    const out = vadoseVadsat.run(baseInput({ alphaL: 0.3, depths: [0.5, 1, 2] }));
    expect(out.profiles.dispersivity).toEqual([0.3, 0.3, 0.3]);
  });

  it('is fast: 100 depths by 120 months under 50 ms', () => {
    const depths = Array.from({ length: 100 }, (_, k) => (2.8 * (k + 1)) / 100);
    const profileTimes = Array.from({ length: 120 }, (_, k) => ((k + 1) * YEAR) / 12);
    const input = baseInput({ depths, profileTimes });
    vadoseVadsat.run(input); // warm up the JIT
    const t0 = Date.now();
    const out = vadoseVadsat.run(input);
    const elapsed = Date.now() - t0;
    expect(out.profiles.concentrations.length).toBe(120);
    expect(elapsed).toBeLessThan(50);
  });
});

describe('vadose.vadsat warnings', () => {
  const codes = (input: VadsatInput) => vadoseVadsat.run(input).warnings.map((w) => w.code);

  it('infiltration-clamped fires when q exceeds a layer Ks', () => {
    const input = baseInput({ q: 2 / DAY });
    expect(codes(input)).toContain('vadose.infiltration-clamped');
    const out = vadoseVadsat.run(input);
    expect(out.q).toBeCloseTo(1 / DAY, 20);
    expect(codes(baseInput())).not.toContain('vadose.infiltration-clamped');
  });

  it('residual-phase fires with a separate phase and reports x, xS and Ceq', () => {
    const input = baseInput({ source: { ...baseInput().source, F: 2000e-6 } });
    const w = vadoseVadsat.run(input).warnings.find((x) => x.code === 'vadose.residual-phase');
    expect(w).toBeDefined();
    expect(w!.message).toMatch(/x = /);
    expect(codes(baseInput())).not.toContain('vadose.residual-phase');
  });

  it('tph-constant-approximation fires above F / FT = 0.1 only', () => {
    const src = baseInput().source;
    expect(codes(baseInput({ source: { ...src, F: 600e-6, FT: 5000e-6, MT: 0.1 } }))).toContain(
      'vadose.tph-constant-approximation',
    );
    expect(codes(baseInput({ source: { ...src, F: 500e-6, FT: 5000e-6, MT: 0.1 } }))).not.toContain(
      'vadose.tph-constant-approximation',
    );
  });

  it('low-foc-retardation-ignored fires below foc 0.001 and sets R = 1', () => {
    const b = baseInput();
    const input = baseInput({ below: { ...b.below, foc: 0.0005 } });
    expect(codes(input)).toContain('vadose.low-foc-retardation-ignored');
    expect(vadoseVadsat.run(input).retardation).toBe(1);
    expect(codes(b)).not.toContain('vadose.low-foc-retardation-ignored');
  });

  it('inlet-mass-excess fires for a strongly dispersive, strongly decaying column', () => {
    const b = baseInput();
    const input = baseInput({
      below: { ...b.below, thickness: 0.3 },
      alphaL: 0.5,
      chemical: { ...b.chemical, mu: 0.01 / DAY },
    });
    expect(vadoseVadsat.run(input).budget.lifetimeInletExcessRatio).toBeGreaterThan(1.05);
    expect(codes(input)).toContain('vadose.inlet-mass-excess');
    expect(codes(b)).not.toContain('vadose.inlet-mass-excess');
  });

  it('validate() returns the same warnings as run()', () => {
    const input = baseInput({ q: 2 / DAY });
    expect(vadoseVadsat.validate!(input)).toEqual(vadoseVadsat.run(input).warnings);
  });
});

describe('vadose.vadsat input validation', () => {
  const b = baseInput();
  const bad: [string, VadsatInput][] = [
    ['negative q', baseInput({ q: -1e-9 })],
    ['NaN q', baseInput({ q: NaN })],
    ['thetaS > 1', baseInput({ below: { ...b.below, thetaS: 1.2 } })],
    ['thetaR >= thetaS', baseInput({ above: { ...b.above, thetaR: 0.35 } })],
    ['n <= 1', baseInput({ source: { ...b.source, n: 1 } })],
    ['Ks <= 0', baseInput({ below: { ...b.below, Ks: 0 } })],
    ['rhoB <= 0', baseInput({ source: { ...b.source, rhoB: 0 } })],
    ['negative foc', baseInput({ above: { ...b.above, foc: -0.1 } })],
    ['negative Koc', baseInput({ chemical: { ...b.chemical, Koc: -1 } })],
    ['negative H', baseInput({ chemical: { ...b.chemical, H: -1 } })],
    ['negative mu', baseInput({ chemical: { ...b.chemical, mu: -1 } })],
    ['zero S', baseInput({ chemical: { ...b.chemical, S: 0 } })],
    ['zero M', baseInput({ chemical: { ...b.chemical, M: 0 } })],
    ['negative F', baseInput({ source: { ...b.source, F: -1 } })],
    ['F > FT', baseInput({ source: { ...b.source, F: 0.01, FT: 0.005, MT: 0.1 } })],
    ['source thickness 0', baseInput({ source: { ...b.source, thickness: 0 } })],
    ['L_u 0', baseInput({ below: { ...b.below, thickness: 0 } })],
    ['lens thicker than the soil above', baseInput({ lens: { ...b.lens!, thickness: 5 } })],
    ['negative depth to source', baseInput({ depthToSource: -1 })],
    ['negative duration', baseInput({ duration: -1 })],
    ['negative profile time', baseInput({ profileTimes: [-1] })],
    ['negative source decay', baseInput({ source: { ...b.source, decayRate: -1 } })],
    ['depth below zero', baseInput({ depths: [-0.1] })],
    ['negative alphaL', baseInput({ alphaL: -0.1 })],
  ];
  for (const [name, input] of bad) {
    it(`rejects ${name}`, () => {
      expect(() => vadoseVadsat.run(input)).toThrow(RangeError);
    });
  }
});
