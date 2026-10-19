import { describe, expect, it } from 'vitest';
import { TPH_SURROGATE_IDS } from '@model-flow/engine';
import type { CleanupProps } from '../cleanup/ssg';
import { DEFAULT_FORM, type PlantsEcoForm } from './form';
import { buildTphFeed, computeTph } from './tph';

const [ALI_LOW, ALI_MED] = TPH_SURROGATE_IDS as [string, string];

// Arbitrary test values: the tests check the arithmetic and the unit conversions only.
const base = (over: Partial<PlantsEcoForm> = {}): PlantsEcoForm => ({
  ...DEFAULT_FORM,
  tphFractions: [
    { label: 'Low', family: 'aliphatic', massFraction: '0.25', surrogate: ALI_LOW, level: '200' },
    {
      label: 'Medium',
      family: 'aliphatic',
      massFraction: '0.75',
      surrogate: ALI_MED,
      level: '1000',
    },
  ],
  ...over,
});

const props: CleanupProps = new Map([
  [ALI_LOW, { koc: 100, hPrime: 2, s: 50 }],
  [ALI_MED, { koc: 1000, hPrime: 100, s: 0.5 }],
]);

describe('computeTph', () => {
  it('gives the total level as the target over the sum of fraction over level, by hand', () => {
    const r = computeTph(base(), props);
    if (!r.ok) throw new Error(r.errors.join('; '));
    // 1 / (0.25/200 + 0.75/1000)
    expect(r.result.totalMgPerKg! / (1 / (0.25 / 200 + 0.75 / 1000))).toBeCloseTo(1, 10);
  });

  it('scales the total with the target hazard index', () => {
    const r = computeTph(base({ tphTargetHi: '0.5' }), props);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.result.totalMgPerKg! / (0.5 / (0.25 / 200 + 0.75 / 1000))).toBeCloseTo(1, 10);
  });

  it('selects the registry method of the fraction set', () => {
    const a = computeTph(base({ tphSet: 'tphcwg' }), props);
    const b = computeTph(base({ tphSet: 'madep' }), props);
    if (!a.ok || !b.ok) throw new Error('expected both');
    expect(a.result.methodId).toBe('tph.tphcwg');
    expect(b.result.methodId).toBe('tph.madep');
  });

  it('runs the forward hazard index at f_j times the total', () => {
    const r = computeTph(base({ tphTotal: '500' }), props);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.result.forward!.hazardIndex / ((0.25 * 500) / 200 + (0.75 * 500) / 1000)).toBeCloseTo(
      1,
      10,
    );
  });

  it('excludes an unmapped fraction and says so', () => {
    const f = base();
    f.tphFractions[1] = { ...f.tphFractions[1]!, surrogate: '', level: '' };
    const r = computeTph(f, props);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.result.unmapped).toEqual(['Medium']);
    expect(r.result.warnings.map((w) => w.code)).toContain('TPH_FRACTION_UNMAPPED');
  });

  it('warns when the fractions do not sum to one', () => {
    const f = base();
    f.tphFractions[1] = { ...f.tphFractions[1]!, massFraction: '0.5' };
    const r = computeTph(f, props);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.result.warnings.map((w) => w.code)).toContain('TPH_FRACTIONS_DO_NOT_SUM');
  });

  it('needs a level for a mapped fraction and refuses an empty composition', () => {
    const f = base();
    f.tphFractions[0] = { ...f.tphFractions[0]!, level: '' };
    expect(computeTph(f, props).ok).toBe(false);
    expect(computeTph(base({ tphFractions: [] }), props).ok).toBe(false);
  });

  describe('saturation', () => {
    const soil = {
      bulkDensity: '1.5',
      foc: '0.01',
      waterFilledPorosity: '0.3',
      tphThetaA: '0.2',
    };
    it('computes the pure-phase limit by hand and the mixture index', () => {
      const r = computeTph(base({ ...soil, tphTotal: '1000' }), props);
      if (!r.ok) throw new Error(r.errors.join('; '));
      const sat = r.result.saturation;
      expect(sat && 'index' in sat).toBe(true);
      if (!sat || !('index' in sat)) return;
      // Csat = S (rho_b Kd + theta + thetaA H) / rho_b, S in kg/m3, rho_b 1500 kg/m3, Kd = Koc foc in m3/kg
      const limit = (S: number, koc: number, H: number): number =>
        (S * (1500 * (koc * 0.01) + 0.3 + 0.2 * H)) / 1500;
      const low = limit(50 / 1000, 100 / 1000, 2);
      const med = limit(0.5 / 1000, 1000 / 1000, 100);
      expect(sat.perFraction[0]!.limitMgPerKg / (low * 1e6)).toBeCloseTo(1, 9);
      const index = (0.25 * 1000e-6) / low + (0.75 * 1000e-6) / med;
      expect(sat.index / index).toBeCloseTo(1, 9);
    });

    it('raises TPH_CSAT_EXCEEDED when the mixture is saturated even though no fraction is alone', () => {
      const r = computeTph(base({ ...soil, tphTotal: '1000' }), props);
      if (!r.ok) throw new Error(r.errors.join('; '));
      const sat = r.result.saturation;
      if (!sat || !('index' in sat)) throw new Error('expected a saturation result');
      const big = computeTph(base({ ...soil, tphTotal: String(1000 / sat.index) }), props);
      if (!big.ok) throw new Error(big.errors.join('; '));
      const s2 = big.result.saturation as { index: number };
      expect(s2.index).toBeCloseTo(1, 6);
      const over = computeTph(
        base({ ...soil, tphTotal: String((1000 / sat.index) * 1.05) }),
        props,
      );
      if (!over.ok) throw new Error(over.errors.join('; '));
      expect(over.result.warnings.map((w) => w.code)).toContain('TPH_CSAT_EXCEEDED');
    });

    it('names the soil inputs it still needs instead of guessing', () => {
      const r = computeTph(base({ tphTotal: '1000' }), props);
      if (!r.ok) throw new Error(r.errors.join('; '));
      expect(r.result.saturation).toEqual({
        missing: expect.arrayContaining([expect.stringMatching(/bulk density/i)]),
      });
    });
  });
});

describe('buildTphFeed', () => {
  it('carries the total level, target, fractions and engine warnings to the cleanup screen', () => {
    const form = base({ tphTargetHi: '0.5' });
    const r = computeTph(form, props);
    const feed = buildTphFeed(form, r);
    expect(feed.ok).toBe(true);
    if (!feed.ok || !r.ok) return;
    expect(feed.feed.methodId).toBe('tph.tphcwg');
    expect(feed.feed.targetHazardIndex).toBe(0.5);
    expect(feed.feed.totalMgPerKg).toBe(r.result.totalMgPerKg);
    expect(feed.feed.fractions.map((f) => f.label)).toEqual(['Low', 'Medium']);
    expect(feed.feed.warnings).toEqual(
      r.result.warnings.map((w) => ({ code: w.code, message: w.message })),
    );
  });

  it('selects the MADEP id with the MADEP set and is refused when nothing computed', () => {
    const form = base({ tphSet: 'madep' });
    const feed = buildTphFeed(form, computeTph(form, props));
    expect(feed.ok && feed.feed.methodId).toBe('tph.madep');
    const none = base({ tphFractions: [] });
    expect(buildTphFeed(none, computeTph(none, props)).ok).toBe(false);
  });
});
