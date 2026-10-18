import { describe, expect, it } from 'vitest';
import { registry } from '../src/index.js';
import { references } from '../src/references/index.js';
import {
  checkFractionSaturation,
  resolveFractions,
  tphForwardHazard,
  tphTotalLevel,
  TPH_SURROGATE_IDS,
  type TphFraction,
} from '../src/processes/tph/index.js';

const frac = (
  label: string,
  massFraction: number,
  surrogate: string | null,
  extra: Partial<TphFraction> = {},
): TphFraction => ({ label, family: 'aliphatic', massFraction, surrogate, ...extra });

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('fraction set resolution', () => {
  it('maps a fraction to an RSL surrogate record and reports an unmapped one', () => {
    const r = resolveFractions([
      frac('a', 0.6, 'E1790668'),
      frac('b', 0.4, null),
      frac('c', 0, 'not-an-rsl-id'),
    ]);
    expect(r.mapped.map((f) => f.label)).toEqual(['a']);
    expect(r.unmapped.map((f) => f.label)).toEqual(['b', 'c']);
    expect(r.warnings.filter((w) => w.code === 'TPH_FRACTION_UNMAPPED')).toHaveLength(2);
  });
  it('knows exactly the five RSL TPH surrogates', () => {
    expect([...TPH_SURROGATE_IDS].sort()).toEqual(
      ['E1790666', 'E1790668', 'E1790670', 'E1790674', 'E1790676'].sort(),
    );
  });
  it('warns when mass fractions of the full set do not sum to one', () => {
    const r = resolveFractions([frac('a', 0.6, 'E1790668'), frac('b', 0.3, 'E1790670')]);
    expect(r.warnings.some((w) => w.code === 'TPH_FRACTIONS_DO_NOT_SUM')).toBe(true);
    const ok = resolveFractions([frac('a', 0.6, 'E1790668'), frac('b', 0.4, 'E1790670')]);
    expect(ok.warnings).toEqual([]);
  });
  it('rejects negative or non-finite mass fractions', () => {
    expect(() => resolveFractions([frac('a', -0.1, 'E1790668')])).toThrow(RangeError);
    expect(() => resolveFractions([frac('a', NaN, 'E1790668')])).toThrow(RangeError);
  });
});

describe('total TPH level', () => {
  it('two fractions: C = HI / sum(f/CL), 1e-10', () => {
    const f1 = 0.7;
    const f2 = 0.3;
    const cl1 = 2e-4;
    const cl2 = 5e-5;
    const expected = 1 / (f1 / cl1 + f2 / cl2);
    const r = tphTotalLevel({
      fractions: [
        { ...frac('a', f1, 'E1790668'), levelKgPerKg: cl1 },
        { ...frac('b', f2, 'E1790670'), levelKgPerKg: cl2 },
      ],
    });
    expect(rel(r.totalKgPerKg!, expected)).toBeLessThan(1e-10);
  });
  it('three fractions with a target hazard index of 0.5, 1e-10, and the fractions then add to it', () => {
    const fs = [
      { ...frac('a', 0.5, 'E1790666'), levelKgPerKg: 3e-3 },
      { ...frac('b', 0.3, 'E1790668'), levelKgPerKg: 1e-3 },
      { ...frac('c', 0.2, 'E1790676'), levelKgPerKg: 4e-4 },
    ];
    const hi = 0.5;
    const expected = hi / (0.5 / 3e-3 + 0.3 / 1e-3 + 0.2 / 4e-4);
    const r = tphTotalLevel({ fractions: fs, targetHazardIndex: hi });
    expect(rel(r.totalKgPerKg!, expected)).toBeLessThan(1e-10);
    const hq = tphForwardHazard({
      totalKgPerKg: r.totalKgPerKg!,
      fractions: fs,
      hazardQuotient: (f, cs) => cs / f.levelKgPerKg,
    });
    expect(rel(hq.hazardIndex, hi)).toBeLessThan(1e-9);
  });
  it('an unmapped fraction is reported and excluded from the sum', () => {
    const r = tphTotalLevel({
      fractions: [
        { ...frac('a', 0.8, 'E1790668'), levelKgPerKg: 1e-3 },
        { ...frac('b', 0.2, null), levelKgPerKg: 1e-3 },
      ],
    });
    expect(r.warnings.some((w) => w.code === 'TPH_FRACTION_UNMAPPED')).toBe(true);
    expect(rel(r.totalKgPerKg!, 1 / (0.8 / 1e-3))).toBeLessThan(1e-10);
  });
  it('requires a positive level for a mapped fraction and a positive target', () => {
    expect(() =>
      tphTotalLevel({ fractions: [{ ...frac('a', 1, 'E1790668'), levelKgPerKg: 0 }] }),
    ).toThrow(RangeError);
    expect(() =>
      tphTotalLevel({
        fractions: [{ ...frac('a', 1, 'E1790668'), levelKgPerKg: 1e-3 }],
        targetHazardIndex: 0,
      }),
    ).toThrow(RangeError);
  });
});

describe('forward hazard by fraction', () => {
  it('runs each fraction at f_j C_TPH and adds the hazard quotients', () => {
    const seen: number[] = [];
    const r = tphForwardHazard({
      totalKgPerKg: 1e-3,
      fractions: [frac('a', 0.25, 'E1790668'), frac('b', 0.75, 'E1790674', { family: 'aromatic' })],
      hazardQuotient: (f, cs) => {
        seen.push(cs);
        return f.label === 'a' ? 2 * cs : 10 * cs;
      },
    });
    expect(seen[0]).toBeCloseTo(2.5e-4, 16);
    expect(seen[1]).toBeCloseTo(7.5e-4, 16);
    expect(r.hazardIndex).toBeCloseTo(2 * 2.5e-4 + 10 * 7.5e-4, 14);
    expect(r.byFraction.map((x) => x.label)).toEqual(['a', 'b']);
  });
});

describe('saturation check', () => {
  const soil = { rhoB: 1500, foc: 0.01, theta: 0.15, thetaA: 0.2 };
  const chem = { S: 0.22, H: 139, koc: 796 };
  it('Fsat = S (rho_b Kd + theta + thetaA H)/rho_b with x = 1, and flags f C above it', () => {
    const fSat =
      (chem.S * (soil.rhoB * (chem.koc * soil.foc) + soil.theta + soil.thetaA * chem.H)) /
      soil.rhoB;
    const lo = checkFractionSaturation({
      label: 'a',
      soil,
      chemical: chem,
      soilKgPerKg: 0.5 * fSat,
    });
    expect(rel(lo.saturationKgPerKg, fSat)).toBeLessThan(1e-12);
    expect(lo.exceeded).toBe(false);
    expect(lo.warnings).toEqual([]);
    const hi = checkFractionSaturation({ label: 'a', soil, chemical: chem, soilKgPerKg: 2 * fSat });
    expect(hi.exceeded).toBe(true);
    expect(hi.warnings[0]!.code).toBe('TPH_CSAT_EXCEEDED');
  });
});

describe('registration', () => {
  it('registers a TPHCWG and a MADEP method whose references are used', () => {
    expect(registry.get('tph.tphcwg').kind).toBe('legacy');
    expect(registry.get('tph.madep').kind).toBe('modern');
    for (const id of ['tph.tphcwg', 'tph.madep']) {
      const m = registry.get(id);
      expect(m.process).toBe('tph');
      for (const key of m.citations) {
        expect(references.find((r) => r.key === key)?.status).toBe('used');
      }
    }
    expect(registry.get('tph.tphcwg').citations).toEqual(['tphcwg1997']);
    expect(registry.get('tph.madep').citations).toEqual(['madep2002']);
  });
});
