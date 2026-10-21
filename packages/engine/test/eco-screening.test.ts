import { describe, expect, it } from 'vitest';
import { registry } from '../src/index.js';
import { references } from '../src/references/index.js';
import {
  backCalculateEcoSsl,
  benchmarkHazardQuotient,
  ecosslHazardQuotient,
  preyConcentration,
  runBenchmarkScreen,
  runEcosslScreen,
  type EcosslScreenInput,
  wildlifeDose,
  wildlifeHazardQuotient,
  type WildlifeDoseInput,
} from '../src/processes/eco/index.js';

import ecosslJson from '../../data/generated/ecossl-2026-10-18/ecossl.json' with { type: 'json' };

type EcosslFile = {
  substances: {
    substance: string;
    values: Record<string, { status: string; value: number | null }>;
    wildlife: {
      group: string;
      surrogate: string;
      trv: number;
      fir: number;
      ps: number;
      form: 'ratio' | 'ln' | 'affine' | 'NA';
      a: number | null;
      b: number | null;
      cdiet: number | null;
      ecoSsl: number | null;
      flag: string | null;
    }[];
  }[];
};
const ecossl = ecosslJson as unknown as EcosslFile;

const MG = 1e-6; // kg/kg per mg/kg

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

/** Derivation inputs of one printed surrogate row as a wildlife dose input (SI: kg/kg, kg/kg/d). */
function surrogate(
  sub: string,
  group: string,
  name: string,
): WildlifeDoseInput & { printed: number } {
  const row = ecossl.substances
    .find((s) => s.substance === sub)!
    .wildlife.find((w) => w.group === group && w.surrogate === name)!;
  return {
    foodIngestion_kg_per_kg_d: row.fir,
    soilFraction: row.ps,
    areaUseFactor: 1,
    items: [
      {
        name: 'prey',
        dietFraction: 1,
        model: {
          form: row.form as 'ratio' | 'ln' | 'affine',
          a: row.a!,
          b: row.b ?? 0,
          cdiet: row.cdiet ?? 1,
        },
      },
    ],
    trv_kg_per_kg_d: row.trv * MG,
    printed: row.ecoSsl! * MG,
  };
}

describe('soil-to-biota uptake models', () => {
  it('ratio: Bi = a C, with C = cdiet * soil', () => {
    expect(preyConcentration({ form: 'ratio', a: 0.05 }, 1e-4)).toBeCloseTo(5e-6, 15);
    expect(preyConcentration({ form: 'ratio', a: 0.05, cdiet: 2 }, 1e-4)).toBeCloseTo(1e-5, 15);
  });
  it('ln: ln Bi = a ln S + b with S and Bi in mg/kg dw', () => {
    // cadmium dove: ln Bi = 0.546 ln S - 0.475 at S = 100 mg/kg
    const expected = Math.exp(0.546 * Math.log(100) - 0.475) * MG;
    expect(
      rel(preyConcentration({ form: 'ln', a: 0.546, b: -0.475 }, 100 * MG), expected),
    ).toBeLessThan(1e-12);
  });
  it('affine: Bi = a C + b with b in mg/kg', () => {
    expect(rel(preyConcentration({ form: 'affine', a: 2, b: 3 }, 10 * MG), 23 * MG)).toBeLessThan(
      1e-12,
    );
  });
  it('refuses nonsense', () => {
    expect(() => preyConcentration({ form: 'ln', a: 0.5, b: 0 }, 0)).toThrow(RangeError);
    expect(() => preyConcentration({ form: 'ratio', a: -1 }, 1e-4)).toThrow(RangeError);
    expect(() => preyConcentration({ form: 'ratio', a: 1 }, -1)).toThrow(RangeError);
  });
});

describe('wildlife dose', () => {
  const input: WildlifeDoseInput = {
    foodIngestion_kg_per_kg_d: 0.2,
    soilFraction: 0.05,
    areaUseFactor: 0.5,
    items: [
      { name: 'plants', dietFraction: 0.6, model: { form: 'ratio', a: 0.1 } },
      { name: 'worms', dietFraction: 0.35, model: { form: 'ratio', a: 2 } },
    ],
    trv_kg_per_kg_d: 1e-6,
  };
  it('is [sum(C_i P_i) + C_s P_s] IR AUF per kg body weight, by hand', () => {
    const s = 1e-5;
    const hand = (0.1 * s * 0.6 + 2 * s * 0.35 + s * 0.05) * 0.2 * 0.5;
    expect(rel(wildlifeDose(input, s), hand)).toBeLessThan(1e-12);
    expect(rel(wildlifeHazardQuotient(input, s), hand / 1e-6)).toBeLessThan(1e-12);
  });
  it('rejects a diet fraction outside 0 to 1', () => {
    expect(() =>
      wildlifeDose(
        { ...input, items: [{ name: 'x', dietFraction: 1.5, model: { form: 'ratio', a: 1 } }] },
        1e-5,
      ),
    ).toThrow(RangeError);
    expect(() => wildlifeDose({ ...input, soilFraction: -0.1 }, 1e-5)).toThrow(RangeError);
  });
  it('back-calculation inverts the dose to HQ = 1 within 1e-9', () => {
    const s = backCalculateEcoSsl(input)!;
    expect(rel(wildlifeHazardQuotient(input, s), 1)).toBeLessThan(1e-9);
  });
  it('returns null when no soil concentration reaches the TRV', () => {
    const low: WildlifeDoseInput = {
      ...input,
      items: [{ name: 'x', dietFraction: 0.5, model: { form: 'affine', a: 0, b: 1e6 } }],
      trv_kg_per_kg_d: 1e-9,
    };
    expect(backCalculateEcoSsl(low)).toBeNull();
  });
});

describe('published wildlife Eco-SSL reproduction (5 percent, DECISIONS 10)', () => {
  // published-reproduction: eco-wildlife-ecossl
  const cases: [string, string, string][] = [
    ['cadmium', 'avian', 'dove'],
    ['cadmium', 'avian', 'woodcock'],
    ['cadmium', 'avian', 'hawk'],
    ['cadmium', 'mammalian', 'vole'],
    ['cadmium', 'mammalian', 'shrew'],
    ['cadmium', 'mammalian', 'weasel'],
    ['lead', 'avian', 'dove'],
    ['lead', 'avian', 'woodcock'],
    ['lead', 'avian', 'hawk'],
    ['lead', 'mammalian', 'vole'],
    ['lead', 'mammalian', 'shrew'],
    ['lead', 'mammalian', 'weasel'],
  ];
  for (const [sub, group, name] of cases) {
    it(`${sub} ${group} ${name}`, () => {
      const { printed, ...input } = surrogate(sub, group, name);
      const got = backCalculateEcoSsl(input)!;
      expect(rel(got, printed)).toBeLessThan(0.05);
    });
  }
  // published-reproduction: eco-wildlife-guild
  it('the guild value is the smallest surrogate value (cadmium mammal 0.36, lead bird 11 mg/kg)', () => {
    const guild = (sub: string, group: string, names: string[]) =>
      Math.min(
        ...names.map((n) => {
          const i = surrogate(sub, group, n);
          return backCalculateEcoSsl(i)!;
        }),
      ) / MG;
    expect(rel(guild('cadmium', 'mammalian', ['vole', 'shrew', 'weasel']), 0.36)).toBeLessThan(
      0.05,
    );
    expect(rel(guild('lead', 'avian', ['dove', 'woodcock', 'hawk']), 11)).toBeLessThan(0.05);
  });
});

describe('Eco-SSL hazard quotients', () => {
  it('plant and invertebrate HQ is exact against the hand-entered value', () => {
    const cd = ecossl.substances.find((s) => s.substance === 'cadmium')!;
    expect(cd.values.plants!.value).toBe(32);
    const r = ecosslHazardQuotient(64 * MG, { status: 'value', value: 32 * MG });
    expect(r.hq).toBe(2);
    expect(r.warnings.map((w) => w.code)).toEqual(['ECO_SCREENING_ONLY']);
  });
  it('a group with no number warns ECO_NO_SSL and gives no HQ', () => {
    for (const status of ['NA', 'NC', 'procedure'] as const) {
      const r = ecosslHazardQuotient(1e-5, { status, value: null });
      expect(r.hq).toBeNull();
      expect(r.warnings.map((w) => w.code).sort()).toEqual(['ECO_NO_SSL', 'ECO_SCREENING_ONLY']);
    }
  });
  it('runEcosslScreen returns one row per group and always shows ECO_SCREENING_ONLY', () => {
    const r = runEcosslScreen({
      soil_kg_per_kg: 10 * MG,
      ssl: {
        plants: { status: 'value', value: 32 * MG },
        invertebrates: { status: 'value', value: 140 * MG },
        avian: { status: 'value', value: 0.77 * MG },
        mammalian: { status: 'NA', value: null },
      },
    });
    expect(r.rows.map((x) => x.group)).toEqual(['plants', 'invertebrates', 'avian', 'mammalian']);
    expect(rel(r.rows[0]!.hq!, 10 / 32)).toBeLessThan(1e-12);
    expect(r.rows[3]!.hq).toBeNull();
    expect(r.warnings.map((w) => w.code)).toContain('ECO_SCREENING_ONLY');
    expect(r.warnings.map((w) => w.code)).toContain('ECO_NO_SSL');
  });
  it('throws on a missing receptor group instead of reporting it as NA', () => {
    expect(() =>
      runEcosslScreen({
        soil_kg_per_kg: 1e-6,
        ssl: { plants: { status: 'value', value: 1e-6 } } as unknown as EcosslScreenInput['ssl'],
      }),
    ).toThrow(RangeError);
  });
  it('offers no ecological cleanup level', () => {
    const r = runEcosslScreen({
      soil_kg_per_kg: 1e-6,
      ssl: {
        plants: { status: 'value', value: 1e-6 },
        invertebrates: { status: 'NA', value: null },
        avian: { status: 'NA', value: null },
        mammalian: { status: 'NA', value: null },
      },
    });
    expect(Object.keys(r)).not.toContain('cleanupLevel');
  });
});

describe('legacy benchmark screen', () => {
  it('HQ = C / benchmark and tags the user entry', () => {
    const r = benchmarkHazardQuotient(3e-5, { value_kg_per_kg: 1.5e-5, citation: 'sample1996' });
    expect(r.hq).toBe(2);
    expect(r.warnings.map((w) => w.code)).toEqual(['ECO_BENCHMARK_USER_ENTERED']);
  });
  it('rejects a non-positive benchmark and requires a citation', () => {
    expect(() => benchmarkHazardQuotient(1, { value_kg_per_kg: 0, citation: 'x' })).toThrow(
      RangeError,
    );
    expect(() => benchmarkHazardQuotient(1, { value_kg_per_kg: 1, citation: '' })).toThrow(
      RangeError,
    );
  });
  it('runBenchmarkScreen gives receptor HQs and a user-BAF food web dose', () => {
    const r = runBenchmarkScreen({
      soil_kg_per_kg: 1e-5,
      benchmarks: [{ receptor: 'plants', value_kg_per_kg: 5e-6, citation: 'user' }],
      wildlife: [
        {
          receptor: 'robin',
          food: {
            foodIngestion_kg_per_kg_d: 0.2,
            soilFraction: 0.1,
            areaUseFactor: 1,
            items: [{ name: 'worms', dietFraction: 0.9, model: { form: 'ratio', a: 1.5 } }],
            trv_kg_per_kg_d: 1e-6,
          },
        },
      ],
    });
    expect(r.benchmarkRows[0]!.hq).toBe(2);
    const dose = (1.5e-5 * 0.9 + 1e-5 * 0.1) * 0.2;
    expect(rel(r.wildlifeRows[0]!.hq, dose / 1e-6)).toBeLessThan(1e-12);
    expect(r.warnings.map((w) => w.code)).toContain('ECO_BENCHMARK_USER_ENTERED');
  });
});

describe('registry', () => {
  it('registers eco.benchmark-hq (legacy) and eco.ecossl-2005 (modern) citing used references', () => {
    expect(registry.get('eco.benchmark-hq').kind).toBe('legacy');
    expect(registry.get('eco.ecossl-2005').kind).toBe('modern');
    const byKey = new Map(references.map((r) => [r.key, r]));
    for (const m of registry.list('eco')) {
      expect(m.citations.length).toBeGreaterThan(0);
      for (const k of m.citations) expect(byKey.get(k)?.status, `${m.id} ${k}`).toBe('used');
    }
    expect(registry.list('eco').length).toBe(2);
  });
  it('legacy method runs and validates through the registry', () => {
    const m = registry.get('eco.ecossl-2005');
    const na = { status: 'NA', value: null };
    const out = m.run({
      soil_kg_per_kg: 1e-5,
      ssl: { plants: na, invertebrates: na, avian: na, mammalian: na },
    }) as {
      rows: { hq: number | null }[];
    };
    expect(out.rows[0]!.hq).toBeNull();
  });
});
