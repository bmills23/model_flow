import { describe, expect, it } from 'vitest';
import { modernPathway } from '../src/processes/exposure/modern.js';
import {
  MODERN_RESIDENT_BOUNDARY,
  MODERN_WORKER_BOUNDARY,
  evaluateModernReceptor,
  evaluateModernRun,
  modernChemical,
  modernReceptor,
  modernResident,
  modernWorker,
  type ModernChemicalBoundary,
  type ModernReceptorRun,
} from '../src/processes/exposure/receptorsModern.js';
import {
  mgPerKgToKgPerKg,
  mgPerLToKgPerM3,
  mgPerM3ToKgPerM3,
  type PathwayId,
} from '../src/processes/exposure/units.js';

const benzeneB: ModernChemicalBoundary = {
  id: '71-43-2',
  mutagen: false,
  sfo: 0.055,
  iur: 7.8e-6,
  rfdo: 0.004,
  rfci: 0.03,
  giabs: 1,
  absd: 0.1,
  kp: 0.0149,
  tauEvent: 0.28793386679266,
  tStar: 0.69104128030237,
  b: 0.05065008038978,
  fa: 1,
  organic: true,
  inEpd: true,
};
const bapB: ModernChemicalBoundary = {
  id: '50-32-8',
  mutagen: true,
  sfo: 1,
  rfdo: 3e-4,
  giabs: 1,
  absd: 0.13,
  kp: 0.713,
  tauEvent: 2.72170311040471,
  tStar: 11.8221045485476,
  b: 4.35604161281138,
  fa: 1,
  organic: true,
  inEpd: false,
};
const benzene = modernChemical(benzeneB);
const bap = modernChemical(bapB);
const resident = modernResident();
const soil = mgPerKgToKgPerKg(1);
const water = mgPerLToKgPerM3(0.01);
const air = mgPerM3ToKgPerM3(0.001);

function run(
  over: Partial<ModernReceptorRun> & Pick<ModernReceptorRun, 'pathways'>,
): ModernReceptorRun {
  return {
    label: 'A',
    receptor: resident,
    chemicals: [],
    ...over,
  };
}

describe('identities', () => {
  it('(a) a per-stage EPC equal to the constant gives the constant result', () => {
    for (const [pathway, chem, c] of [
      ['waterIngestion', benzene, water],
      ['soilIngestion', bap, soil],
    ] as const) {
      const k = modernPathway(pathway, resident, chem, c);
      const stages = chem.mutagen ? 4 : 2;
      const s = modernPathway(pathway, resident, chem, {
        cancerByStage: Array<number>(stages).fill(c),
        noncancerByGroup: { child: c, adult: c },
      });
      expect(s.risk! / k.risk!).toBeCloseTo(1, 12);
      expect(s.hq! / k.hq!).toBeCloseTo(1, 12);
    }
  });

  it('(b) every pathway is linear in the EPC and the coefficients reproduce the result', () => {
    const cases: [PathwayId, typeof benzene, number][] = [
      ['soilIngestion', benzene, soil],
      ['soilDermal', benzene, soil],
      ['waterIngestion', benzene, water],
      ['waterDermal', benzene, water],
      ['indoorInhalation', benzene, air],
      ['showerInhalation', benzene, air],
      ['soilDermal', bap, soil],
      ['waterDermal', bap, water],
    ];
    for (const [pathway, chem, c] of cases) {
      const one = modernPathway(pathway, resident, chem, c);
      const two = modernPathway(pathway, resident, chem, 2 * c);
      expect(two.risk! / one.risk!).toBeCloseTo(2, 12);
      expect(two.hq! / one.hq!).toBeCloseTo(2, 12);
      expect((one.riskPerEpc! * c) / one.risk!).toBeCloseTo(1, 12);
      expect((one.hqPerEpc! * c) / one.hq!).toBeCloseTo(1, 12);
    }
  });

  it('(d) mutagenic over ordinary ingestion risk is the ADAF-weighted over the plain factor', () => {
    const plain = modernChemical({ ...bapB, mutagen: false });
    const m = modernPathway('soilIngestion', resident, bap, soil);
    const p = modernPathway('soilIngestion', resident, plain, soil);
    expect(m.risk! / p.risk!).toBeCloseTo(166833.33333333334 / 36750, 10);
    expect(m.hq).toBeCloseTo(p.hq!, 15);
  });

  it('per-stage EPCs weight each stage coefficient (a declining plume reaches the child first)', () => {
    const unit = modernPathway('waterIngestion', resident, benzene, 1);
    const [cChild, cAdult] = unit.riskByStage.map((s) => s.riskPerEpc);
    const d = modernPathway('waterIngestion', resident, benzene, {
      cancerByStage: [3 * water, water],
      noncancerByGroup: { child: 3 * water, adult: water },
    });
    expect(d.risk! / (cChild! * 3 * water + cAdult! * water)).toBeCloseTo(1, 12);
    const hqChild = unit.hqByGroup[0]!.hqPerEpc!;
    expect(d.hqByGroup[0]!.hq / (hqChild * 3 * water)).toBeCloseTo(1, 12);
  });

  it('a wrong-length per-stage EPC is a RangeError', () => {
    expect(() =>
      modernPathway('waterIngestion', resident, benzene, {
        cancerByStage: [water],
        noncancerByGroup: { child: water, adult: water },
      }),
    ).toThrow(RangeError);
    expect(() =>
      modernPathway('waterIngestion', resident, benzene, {
        cancerByStage: [water, water],
        noncancerByGroup: { child: water },
      }),
    ).toThrow(RangeError);
  });
});

describe('contact terms', () => {
  it('worker is a single adult stage; a mutagen uses the same stage', () => {
    const w = modernWorker();
    const b = modernPathway('soilIngestion', w, benzene, soil);
    const m = modernPathway(
      'soilIngestion',
      w,
      modernChemical({ ...benzeneB, mutagen: true }),
      soil,
    );
    expect(b.hqByGroup.map((g) => g.group)).toEqual(['worker']);
    expect(m.risk! / b.risk!).toBeCloseTo(1, 14);
  });

  it('worker soil ingestion risk by hand: SF RBA IRS EF ED / (BW LT)', () => {
    const w = modernPathway('soilIngestion', modernWorker(), benzene, soil);
    // dose mg/kg-d = C IRS / BW, times EF/365 and ED/LT, risk = SF dose, C = 1 mg/kg
    const expected = 0.055 * ((100e-6 / 80) * (250 / 365) * (25 / 70));
    expect(w.risk! / expected).toBeCloseTo(1, 10);
  });

  it('a chemical without ABSd has no soil dermal pathway and is not quantified, not zero', () => {
    const noAbs = modernChemical({ ...benzeneB, absd: undefined });
    const c = modernPathway('soilDermal', resident, noAbs, soil);
    expect(c.computable).toBe(false);
    expect(c.missing).toContain('absd');
    expect(c.risk).toBeNull();
    expect(c.hq).toBeNull();
  });

  it('missing toxicity for the route gives null, not zero', () => {
    const noIur = modernChemical({ ...benzeneB, iur: undefined });
    const c = modernPathway('indoorInhalation', resident, noIur, air);
    expect(c.computable).toBe(true);
    expect(c.risk).toBeNull();
    expect(c.hq).not.toBeNull();
  });

  it('GIABS below 0.5 raises the dermal slope factor and lowers the reference dose', () => {
    const lowGi = modernChemical({ ...benzeneB, giabs: 0.25 });
    const base = modernPathway('soilDermal', resident, benzene, soil);
    const adj = modernPathway('soilDermal', resident, lowGi, soil);
    expect(adj.dermalAdjusted).toBe(true);
    expect(adj.risk! / base.risk!).toBeCloseTo(4, 12);
    expect(adj.hq! / base.hq!).toBeCloseTo(4, 12);
    const oral = modernPathway('soilIngestion', resident, lowGi, soil);
    expect(oral.dermalAdjusted).toBe(false);
  });

  it('inhalation needs no body weight: the child and adult HQs are equal for equal ET and EF', () => {
    const c = modernPathway('indoorInhalation', resident, benzene, air);
    expect(c.hqByGroup[0]!.hq).toBeCloseTo(c.hqByGroup[1]!.hq, 15);
  });

  it('swimming needs a frequency and an event time; with them the ingestion risk is the age sum', () => {
    const missing = modernPathway('swimIngestion', resident, benzene, water);
    expect(missing.computable).toBe(false);
    expect(missing.missing.join()).toMatch(/swimEventTime/);
    expect(missing.missing.join()).toMatch(/efByPathway/);

    const b = JSON.parse(
      JSON.stringify(MODERN_RESIDENT_BOUNDARY),
    ) as typeof MODERN_RESIDENT_BOUNDARY;
    for (const s of [...b.stages, ...b.mutagenStages!]) {
      s.swimTimeHr = 2;
      s.swimEventsPerDay = 1;
      s.efDaysPerYrByPathway = { swimIngestion: 10, swimDermal: 10 };
    }
    const rec = modernReceptor(b);
    const c = modernPathway('swimIngestion', rec, benzene, water);
    expect(c.computable).toBe(true);
    // risk = SF C sum(IRsw t EV EF ED / BW) / LT, per mg/L and L: hand arithmetic
    const per = (0.12 * 2 * 1 * 10 * 6) / 15 + (0.11 * 2 * 1 * 10 * 20) / 80; // L-d-yr/kg per 1 event-day
    const expected = (0.055 * 0.01 * per) / (365 * 70);
    expect(c.risk! / expected).toBeCloseTo(1, 10);
    const dermal = modernPathway('swimDermal', rec, benzene, water);
    expect(dermal.computable).toBe(true);
    expect(dermal.risk).toBeGreaterThan(0);
  });
});

describe('receptor evaluation', () => {
  const base = (over: Partial<ModernReceptorRun> = {}): ModernReceptorRun =>
    run({
      pathways: ['waterIngestion', 'indoorInhalation'],
      chemicals: [
        {
          id: 'benzene',
          chemical: benzene,
          epcs: { waterIngestion: water, indoorInhalation: air },
        },
      ],
      ...over,
    });

  it('sums risk over pathways and chemicals and keeps the HI by life stage group', () => {
    const r = evaluateModernReceptor(base());
    const w = modernPathway('waterIngestion', resident, benzene, water);
    const a = modernPathway('indoorInhalation', resident, benzene, air);
    expect(r.totals.risk / (w.risk! + a.risk!)).toBeCloseTo(1, 12);
    expect(r.totals.hiByGroup.child! / (w.hqByGroup[0]!.hq + a.hqByGroup[0]!.hq)).toBeCloseTo(
      1,
      12,
    );
    expect(r.totals.hi).toBe(Math.max(r.totals.hiByGroup.child!, r.totals.hiByGroup.adult!));
    expect(r.totals.hiByGroup.child!).toBeGreaterThan(r.totals.hiByGroup.adult!);
  });

  it('(e) the additive option is the sum of the cancer risks and leaves each HI unchanged', () => {
    const wA = modernWorker();
    const wB = modernReceptor({
      label: 'B',
      stages: [{ ...MODERN_WORKER_BOUNDARY.stages[0]!, edYr: 10 }],
    });
    const mk = (label: string, receptor: typeof wA): ModernReceptorRun => ({
      label,
      receptor,
      pathways: ['soilIngestion'],
      chemicals: [{ id: 'benzene', chemical: benzene, epcs: { soilIngestion: soil } }],
    });
    const plain = evaluateModernRun([mk('A', wA), mk('B', wB)]);
    const add = evaluateModernRun([mk('A', wA), mk('B', wB)], { additive: true });
    expect(plain.additiveCancerRisk).toBeNull();
    expect(
      add.additiveCancerRisk! / (plain.receptors[0]!.totals.risk + plain.receptors[1]!.totals.risk),
    ).toBeCloseTo(1, 14);
    expect(add.receptors[0]!.totals.hi).toBe(plain.receptors[0]!.totals.hi);
    expect(add.receptors[1]!.totals.hi).toBe(plain.receptors[1]!.totals.hi);
  });

  it('the additive option with an age-segmented resident is a RangeError', () => {
    const mk = (label: string, receptor: typeof resident): ModernReceptorRun => ({
      label,
      receptor,
      pathways: ['soilIngestion'],
      chemicals: [{ id: 'b', chemical: benzene, epcs: { soilIngestion: soil } }],
    });
    expect(() =>
      evaluateModernRun([mk('A', resident), mk('B', modernWorker())], { additive: true }),
    ).toThrow(RangeError);
    expect(() => evaluateModernRun([mk('A', resident)], { additive: true })).toThrow(RangeError);
  });

  it('one or two receptors only', () => {
    expect(() => evaluateModernRun([])).toThrow(RangeError);
    const r = base();
    expect(() => evaluateModernRun([r, r, r])).toThrow(RangeError);
  });

  it('a pathway on with no EPC for any chemical is a RangeError', () => {
    expect(() => evaluateModernReceptor(base({ pathways: ['soilIngestion'] }))).toThrow(RangeError);
  });

  it('rejects negative or non-finite EPCs', () => {
    expect(() =>
      evaluateModernReceptor(
        base({
          chemicals: [
            { id: 'b', chemical: benzene, epcs: { waterIngestion: -1, indoorInhalation: air } },
          ],
        }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      evaluateModernReceptor(
        base({
          chemicals: [
            {
              id: 'b',
              chemical: benzene,
              epcs: { waterIngestion: Number.NaN, indoorInhalation: air },
            },
          ],
        }),
      ),
    ).toThrow(RangeError);
  });

  const codes = (r: { warnings: { code: string }[] }): string[] => r.warnings.map((w) => w.code);

  it('warns for dermal water outside the EPD but still computes it', () => {
    const r = evaluateModernReceptor(
      run({
        pathways: ['waterDermal'],
        chemicals: [{ id: 'bap', chemical: bap, epcs: { waterDermal: water } }],
      }),
    );
    expect(codes(r)).toContain('exposure.dermal-outside-epd');
    expect(r.totals.risk).toBeGreaterThan(0);
  });

  it('warns when a GIABS adjustment was used', () => {
    const r = evaluateModernReceptor(
      run({
        pathways: ['soilDermal'],
        chemicals: [
          {
            id: 'x',
            chemical: modernChemical({ ...benzeneB, giabs: 0.2 }),
            epcs: { soilDermal: soil },
          },
        ],
      }),
    );
    expect(codes(r)).toContain('exposure.giabs-adjusted');
  });

  it('warns for the special-case chemicals, once per chemical', () => {
    const tce = modernChemical({ ...benzeneB, special: 'trichloroethylene' });
    const r = evaluateModernReceptor(
      run({
        pathways: ['waterIngestion', 'indoorInhalation'],
        chemicals: [
          { id: 'tce', chemical: tce, epcs: { waterIngestion: water, indoorInhalation: air } },
        ],
      }),
    );
    expect(codes(r).filter((c) => c === 'exposure.special-case-not-modelled')).toHaveLength(1);
  });

  it('warns not-quantified and site-specific-required', () => {
    const noAbs = modernChemical({ ...benzeneB, absd: undefined });
    const r = evaluateModernReceptor(
      run({
        pathways: ['soilDermal', 'swimIngestion'],
        chemicals: [{ id: 'x', chemical: noAbs, epcs: { soilDermal: soil, swimIngestion: water } }],
      }),
    );
    expect(codes(r)).toContain('exposure.not-quantified');
    expect(codes(r)).toContain('exposure.site-specific-required');
    expect(r.totals.risk).toBe(0);
  });

  it('warns for Csat and the soil ceiling', () => {
    const sat = modernChemical({ ...benzeneB, csat: 1820 });
    const r1 = evaluateModernReceptor(
      run({
        pathways: ['soilIngestion'],
        chemicals: [{ id: 'x', chemical: sat, epcs: { soilIngestion: mgPerKgToKgPerKg(2000) } }],
      }),
    );
    expect(codes(r1)).toContain('exposure.csat-exceeded');
    expect(codes(r1)).not.toContain('exposure.soil-ceiling');
    const r2 = evaluateModernReceptor(
      run({
        pathways: ['soilIngestion'],
        chemicals: [{ id: 'x', chemical: benzene, epcs: { soilIngestion: mgPerKgToKgPerKg(2e5) } }],
      }),
    );
    expect(codes(r2)).toContain('exposure.soil-ceiling');
  });

  it('warns for risk above 0.01 and an unsegregated HI above 1', () => {
    const r = evaluateModernReceptor(
      run({
        pathways: ['waterIngestion'],
        chemicals: [{ id: 'x', chemical: benzene, epcs: { waterIngestion: mgPerLToKgPerM3(1e4) } }],
      }),
    );
    expect(codes(r)).toContain('risk.linear-above-0.01');
    expect(codes(r)).toContain('risk.hi-above-1-unsegregated');
    const quiet = evaluateModernReceptor(base());
    expect(codes(quiet)).toEqual([]);
  });
});

describe('dermal water form is never guessed', () => {
  it('leaves dermal water unquantified when the form is not stated, even with every lag-time column', () => {
    const unstated = modernChemical({ ...benzeneB, organic: undefined });
    expect(unstated.dermalWater).toBeUndefined();
    const cell = modernPathway('waterDermal', resident, unstated, 1);
    expect(cell.riskPerEpc).toBeNull();
    expect(cell.hqPerEpc).toBeNull();
    expect(cell.missing).toContain('dermalWater');
  });

  it('uses the stated form', () => {
    expect(modernChemical(benzeneB).dermalWater?.organic).toBe(true);
    expect(modernChemical({ ...benzeneB, organic: false }).dermalWater?.organic).toBe(false);
  });
});

describe('validation', () => {
  it('rejects chemical values out of range', () => {
    for (const bad of [
      { absd: 1.1 },
      { giabs: -0.1 },
      { rba: 2 },
      { fa: 1.5 },
      { sfo: -1 },
      { rfdo: 0 },
      { rfci: 0 },
      { kp: -1 },
      { csat: -1 },
      { b: -1 },
    ]) {
      expect(() => modernChemical({ ...benzeneB, ...bad })).toThrow(RangeError);
    }
  });

  it('rejects receptor values out of range', () => {
    const good = MODERN_RESIDENT_BOUNDARY;
    const mod = (patch: object) => ({
      label: 'x',
      stages: [{ ...good.stages[0]!, ...patch }, good.stages[1]!],
    });
    for (const bad of [
      { bwKg: 0 },
      { edYr: 0 },
      { efDaysPerYr: 366 },
      { etHoursPerDay: { indoorInhalation: 25 } },
      { soilIngestionMgPerDay: -1 },
      { adaf: 0 },
      { bathingTimeHr: Number.NaN },
      { bathingEventsPerDay: -1 },
    ]) {
      expect(() => modernReceptor(mod(bad))).toThrow(RangeError);
    }
    expect(() => modernReceptor({ label: 'x', stages: [] })).toThrow(RangeError);
    expect(() => modernReceptor({ label: 'x', stages: good.stages, lifetimeYr: 20 })).toThrow(
      RangeError,
    );
  });

  it('presets are the documented resident and worker', () => {
    expect(modernResident().stages.map((s) => s.group)).toEqual(['child', 'adult']);
    expect(modernResident().mutagenStages!.map((s) => s.adaf)).toEqual([10, 3, 3, 1]);
    expect(modernWorker().stages).toHaveLength(1);
  });
});
