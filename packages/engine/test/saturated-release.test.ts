import { describe, expect, it } from 'vitest';
import { hand, handInput, relErr, DAY, YEAR, type HandCase } from './saturatedHelpers.js';
import {
  runTwoRegion,
  runExponential,
  type SaturatedSourceInput,
} from '../src/processes/saturatedSource/index.js';

const seasonal = (which: HandCase, patch: Partial<SaturatedSourceInput> = {}) => {
  const base = handInput(which, patch);
  return { ...base, source: { ...base.source, schedule: 'seasonal' as const } };
};

describe('legacy release, annual mean', () => {
  for (const which of ['A', 'B'] as const) {
    it(`case ${which}: depletion time and initial mass`, () => {
      const e = hand.cases[which].expected;
      const out = runTwoRegion(handInput(which));
      expect(out.methodId).toBe('saturatedSource.two-region');
      expect(out.exponent).toBe(0);
      expect(relErr(out.initialMass, e.initialMassKg)).toBeLessThan(1e-12);
      expect(relErr(out.depletionTime / DAY, e.depletionAnnualMeanDays)).toBeLessThan(1e-9);
      expect(relErr(out.depletionTime, out.initialMass / out.rates.mean)).toBeLessThan(1e-14);
    });
  }
  it('delivers min(Qbar t, M0), then stops', () => {
    const out = runTwoRegion(handInput('A'));
    const Q = out.rates.mean;
    for (const t of [0, 30 * DAY, 900 * DAY, 0.99 * out.depletionTime]) {
      expect(relErr(out.schedule.delivered(t) + 1e-30, Q * t + 1e-30)).toBeLessThan(1e-12);
    }
    const td = out.depletionTime;
    expect(out.schedule.delivered(td * 1.0001)).toBe(out.initialMass);
    expect(out.schedule.delivered(10 * td)).toBe(out.initialMass);
    expect(out.schedule.rate(0.5 * td)).toBeCloseTo(Q, 20);
    expect(out.schedule.rate(td * 1.0001)).toBe(0);
    expect(out.schedule.remaining(td * 1.0001)).toBe(0);
    expect(relErr(out.schedule.remaining(0.5 * td), 0.5 * out.initialMass)).toBeLessThan(1e-12);
  });
  it('reports no release with an infinite depletion time when nothing flushes the source', () => {
    const out = runTwoRegion(
      handInput('A', {
        infiltration: 0,
        source: { ...handInput('A').source, minSaturatedThickness: 0, fluctuation: 0 },
      }),
    );
    expect(out.depletionTime).toBe(Infinity);
    expect(out.schedule.delivered(50 * YEAR)).toBe(0);
    expect(out.warnings.map((w) => w.code)).toContain('saturatedSource.no-release');
  });
});

describe('legacy release, seasonal', () => {
  it('case A depletes at 1737.2300 days', () => {
    const out = runTwoRegion(seasonal('A'));
    expect(
      relErr(out.depletionTime / DAY, hand.cases.A.expected.depletionSeasonalDays),
    ).toBeLessThan(1e-9);
  });
  it('delivers the annual-mean mass at every year end before depletion (1e-12)', () => {
    const s = runTwoRegion(seasonal('A'));
    const a = runTwoRegion(handInput('A'));
    for (let y = 1; y <= 4; y++) {
      expect(relErr(s.schedule.delivered(y * YEAR), a.schedule.delivered(y * YEAR))).toBeLessThan(
        1e-12,
      );
    }
    expect(s.schedule.delivered(s.depletionTime)).toBe(s.initialMass);
    expect(s.schedule.delivered(s.depletionTime + 50 * DAY)).toBe(s.initialMass);
    // high water first: the rate in the first fraction of a year is the high-water rate
    expect(s.schedule.rate(10 * DAY)).toBe(s.rates.high.q1 + s.rates.high.q2);
    expect(s.schedule.rate(200 * DAY)).toBe(s.rates.low.q1 + s.rates.low.q2);
    expect(s.schedule.rate(YEAR + 10 * DAY)).toBe(s.rates.high.q1 + s.rates.high.q2);
  });
  it('does not materialise long horizons', () => {
    const s = runTwoRegion(seasonal('A', { tEnd: 5e5 * YEAR }));
    expect(s.schedule.delivered(4e5 * YEAR)).toBe(s.initialMass);
  });
});

describe('modern release', () => {
  it('has gamma = Qbar/M0 (+ lambda_s) and the BIOSCREEN half-life ln2 M0/(Q C0)', () => {
    const out = runExponential(handInput('A'));
    expect(out.methodId).toBe('saturatedSource.exponential');
    expect(out.exponent).toBe(1);
    expect(out.depletionTime).toBe(Infinity);
    expect(relErr(out.gamma!, out.rates.mean / out.initialMass)).toBeLessThan(1e-12);
    expect(
      relErr(Math.LN2 / out.gamma!, (Math.LN2 * out.initialMass) / out.rates.mean),
    ).toBeLessThan(1e-12);
    const dec = runExponential(handInput('A', { sourceDecayRate: 1e-9 }));
    expect(relErr(dec.gamma!, dec.rates.mean / dec.initialMass + 1e-9)).toBeLessThan(1e-12);
  });
  for (const which of ['A', 'B'] as const) {
    it(`case ${which}: gamma, m(10 yr)/M0 and delivered mass`, () => {
      const e = hand.cases[which].expected;
      const out = runExponential(handInput(which));
      expect(relErr(out.gamma! * YEAR, e.gammaPerYear)).toBeLessThan(1e-9);
      const t = 10 * YEAR;
      expect(
        relErr(out.schedule.remaining(t) / out.initialMass, e.massRatioAt10Years),
      ).toBeLessThan(1e-9);
      expect(relErr(out.schedule.delivered(t), e.deliveredAt10YearsKg)).toBeLessThan(1e-9);
    });
  }
  it('seasonal piecewise closed form matches a fine numerical integration of dm/dt', () => {
    const lam = 3e-10;
    const out = runExponential(seasonal('A', { sourceDecayRate: lam }));
    const M0 = out.initialMass;
    const qh = out.rates.high.q1 + out.rates.high.q2;
    const ql = out.rates.low.q1 + out.rates.low.q2;
    const f = 0.25;
    let m = M0;
    let delivered = 0;
    const years = 7;
    const subs = 4000;
    for (let y = 0; y < years; y++) {
      for (const [q, len] of [
        [qh, f * YEAR],
        [ql, (1 - f) * YEAR],
      ] as const) {
        const dt = len / subs;
        const kk = q / M0 + lam;
        const rhs = (mm: number) => [-kk * mm, (q / M0) * mm] as const;
        for (let s = 0; s < subs; s++) {
          const k1 = rhs(m);
          const k2 = rhs(m + 0.5 * dt * k1[0]);
          const k3 = rhs(m + 0.5 * dt * k2[0]);
          const k4 = rhs(m + dt * k3[0]);
          delivered += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
          m += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
        }
      }
    }
    const t = years * YEAR;
    expect(relErr(out.schedule.remaining(t), m)).toBeLessThan(1e-9);
    expect(relErr(out.schedule.delivered(t), delivered)).toBeLessThan(1e-9);
  });
  it('closes the mass budget with source decay: initial = remaining + delivered + decayed', () => {
    for (const sch of [
      handInput('A', { sourceDecayRate: 2e-9 }),
      seasonal('A', { sourceDecayRate: 2e-9 }),
    ]) {
      const out = runExponential(sch);
      const b = out.budget;
      expect(b.decayed).toBeGreaterThan(0);
      expect(relErr(b.remaining + b.delivered + b.decayed, b.initial)).toBeLessThan(1e-12);
      for (const t of [DAY, 100 * DAY, 3.3 * YEAR, 40 * YEAR]) {
        const sum = out.schedule.remaining(t) + out.schedule.delivered(t) + out.schedule.decayed(t);
        expect(relErr(sum, out.initialMass)).toBeLessThan(1e-12);
      }
    }
  });
  it('without source decay the seasonal schedule delivers the annual-mean mass at every year end', () => {
    const s = runExponential(seasonal('A'));
    const a = runExponential(handInput('A'));
    for (const n of [1, 2, 10, 40]) {
      expect(relErr(s.schedule.delivered(n * YEAR), a.schedule.delivered(n * YEAR))).toBeLessThan(
        1e-12,
      );
    }
    expect(
      relErr(s.schedule.delivered(0.3 * YEAR), a.schedule.delivered(0.3 * YEAR)),
    ).toBeGreaterThan(1e-4);
  });
  it('with source decay the seasonal schedule delivers more than the annual mean at year ends', () => {
    const lam = 0.001 / DAY;
    const s = runExponential(seasonal('A', { sourceDecayRate: lam }));
    const a = runExponential(handInput('A', { sourceDecayRate: lam }));
    const r = relErr(s.schedule.delivered(30 * YEAR), a.schedule.delivered(30 * YEAR));
    expect(r).toBeGreaterThan(0.03);
    expect(s.schedule.delivered(30 * YEAR)).toBeGreaterThan(a.schedule.delivered(30 * YEAR));
    // remaining mass is identical: the mean schedule books the shortfall as decay
    expect(relErr(s.schedule.remaining(30 * YEAR), a.schedule.remaining(30 * YEAR))).toBeLessThan(
      1e-12,
    );
  });
});

describe('Falta et al. source-strength family', () => {
  it('Gamma = 0: C/C0 stays 1 until the mass is gone; Gamma = 1: C/C0 = m/M0', () => {
    const legacy = runTwoRegion(handInput('A'));
    const modern = runExponential(handInput('A'));
    for (const frac of [0, 0.1, 0.5, 0.9]) {
      expect(legacy.schedule.concentrationRatio(frac * legacy.depletionTime)).toBe(1);
    }
    expect(legacy.schedule.concentrationRatio(1.01 * legacy.depletionTime)).toBe(0);
    for (const t of [0, 100 * DAY, YEAR, 5 * YEAR]) {
      const ratio = modern.schedule.remaining(t) / modern.initialMass;
      expect(relErr(modern.schedule.concentrationRatio(t), ratio)).toBeLessThan(1e-14);
      expect(relErr(ratio, Math.exp(-modern.gamma! * t))).toBeLessThan(1e-12);
    }
  });
});

describe('series and budget', () => {
  it('gives monthly nodes up to tEnd with consistent cumulative values', () => {
    const out = runExponential(handInput('A'));
    const s = out.series;
    expect(s.times[0]).toBe(0);
    expect(s.times[s.times.length - 1]).toBe(out.schedule.initialMass > 0 ? 10 * YEAR : 0);
    expect(s.times).toHaveLength(121);
    expect(s.rate).toHaveLength(121);
    expect(s.delivered[0]).toBe(0);
    expect(s.remaining[0]).toBe(out.initialMass);
    expect(out.budget.delivered).toBe(out.schedule.delivered(10 * YEAR));
  });
});
