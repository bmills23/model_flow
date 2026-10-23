import { describe, expect, it } from 'vitest';
import {
  dermalWaterEventPerEpc,
  evaluateModernReceptor,
  modernChemical,
  modernPathway,
  modernReceptor,
  modernResident,
  modernWorker,
  mgPerKgToKgPerKg,
  mgPerM3ToKgPerM3,
  runModernScenario,
  constantEpc,
  seriesEpc,
  type ModernChemical,
  type ModernChemicalBoundary,
  type ModernReceptor,
  type PathwayId,
  backCalculateModern,
} from '../src/index.js';
import { MODERN_RESIDENT_BOUNDARY } from '../src/processes/exposure/receptorsModern.js';

// Hand cases of the RSL special-case cancer equations (trichloroethylene and vinyl chloride): every
// expected value below is the RSL User's Guide equation (sections 4.1.1.5, 4.1.1.6, 4.1.2.5, 4.1.2.6,
// 4.1.3.4, 4.1.3.5 and 5.18, read 2026-10-23) written out in the guide's own units, from its stated factors,
// without calling the engine's kernels for anything but the dermal event dose (which is not special).

const TR = 1e-6;
const AT_LT = 365 * 70; // days
const CAF_O = 0.804;
const MAF_O = 0.202;
const CAF_I = 0.756;
const MAF_I = 0.244;

const CSF_T = 0.046;
const IUR_T = 4.1e-6;
const CSF_V = 0.72;
const IUR_V = 4.4e-6;

const dermalParams = {
  kp: 0.0149,
  tauEvent: 0.28793386679266,
  tStar: 0.69104128030237,
  b: 0.05065008038978,
  fa: 1,
  organic: true,
  inEpd: true,
} as const;

const tceB: ModernChemicalBoundary = {
  id: '79-01-6',
  mutagen: true,
  sfo: CSF_T,
  iur: IUR_T,
  rfdo: 5e-4,
  rfci: 2e-3,
  giabs: 1,
  absd: 0.1,
  special: 'trichloroethylene',
  ...dermalParams,
};
const vcB: ModernChemicalBoundary = {
  id: '75-01-4',
  mutagen: true,
  sfo: CSF_V,
  iur: IUR_V,
  rfdo: 3e-3,
  rfci: 0.0511,
  giabs: 1,
  absd: 0.1,
  special: 'vinyl-chloride',
  ...dermalParams,
};
const tce = modernChemical(tceB);
const vc = modernChemical(vcB);
const resident = modernResident();

/** Risk per unit EPC of one pathway. */
function coef(pathway: PathwayId, receptor: ModernReceptor, chem: ModernChemical): number {
  const cell = modernPathway(pathway, receptor, chem, 1);
  expect(cell.computable).toBe(true);
  return cell.riskPerEpc!;
}

/** Screening level from a risk coefficient: TR / coefficient in the unit whose EPC scale is `scale` (kg per unit). */
const level = (risk: number, scale: number): number => TR / risk / scale;
const UG_L = 1e-6;
const MG_KG = 1e-6;
const UG_M3 = 1e-9;

function near(actual: number, expected: number, rel = 1e-9): void {
  expect(Math.abs(actual - expected) / expected).toBeLessThan(rel);
}

// life stages of the RSL resident, in the guide's units (days, years, mg/day, L/day, cm2, mg/cm2, kg)
const EF = 350;
const CHILD = { bw: 15, ed: 6, irs: 200, irw: 0.78, sa: 2373, af: 0.2, saw: 6365, etw: 0.54 };
const ADULT = { bw: 80, ed: 20, irs: 100, irw: 2.5, sa: 6032, af: 0.07, saw: 19652, etw: 0.71 };
// the ADAF segments: 0-2, 2-6 (child factors), 6-16, 16-26 (adult factors)
const SEG = [
  { ...CHILD, ed: 2, adaf: 10 },
  { ...CHILD, ed: 4, adaf: 3 },
  { ...ADULT, ed: 10, adaf: 3 },
  { ...ADULT, ed: 10, adaf: 1 },
];
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const ifs = (f: (s: typeof CHILD) => number): number =>
  (EF * CHILD.ed * f(CHILD)) / CHILD.bw + (EF * ADULT.ed * f(ADULT)) / ADULT.bw;
const ifsm = (f: (s: typeof CHILD) => number): number =>
  sum(SEG.map((s) => (EF * s.ed * f(s) * s.adaf) / s.bw));

describe('trichloroethylene, resident (guide sections 4.1.x.6 and 5.18)', () => {
  it('soil ingestion: TR AT LT / (CSF 1e-6 RBA (CAF IFS + MAF IFSM))', () => {
    const IFS = ifs((s) => s.irs);
    const IFSM = ifsm((s) => s.irs);
    near(IFS, 36750);
    near(IFSM, 166833.3, 1e-6);
    const sl = (TR * AT_LT) / (CSF_T * 1e-6 * (CAF_O * IFS + MAF_O * IFSM));
    near(level(coef('soilIngestion', resident, tce), MG_KG), sl);
    expect(sl).toBeGreaterThan(8.75);
    expect(sl).toBeLessThan(8.85); // the table prints 8.8 mg/kg
  });

  it('soil dermal: the same weights on the dermal soil factor, ABSd and GIABS', () => {
    const absd = 0.1;
    const DFS = ifs((s) => s.sa * s.af);
    const DFSM = ifsm((s) => s.sa * s.af);
    near(DFS, 103390, 1e-5);
    near(DFSM, 428260, 1e-5);
    const sl = (TR * AT_LT) / ((CSF_T / 1) * 1e-6 * (CAF_O * DFS + MAF_O * DFSM) * absd);
    near(level(coef('soilDermal', resident, tce), MG_KG), sl);
  });

  it('tap water ingestion: TR AT LT / (CSF 1e-3 (CAF IFW + MAF IFWM))', () => {
    const IFW = ifs((s) => s.irw);
    const IFWM = ifsm((s) => s.irw);
    near(IFW, 327.95);
    near(IFWM, 1019.9, 1e-6);
    const sl = (TR * AT_LT) / (CSF_T * 1e-3 * (CAF_O * IFW + MAF_O * IFWM));
    near(level(coef('waterIngestion', resident, tce), UG_L), sl);
    expect(sl).toBeGreaterThan(1.15);
    expect(sl).toBeLessThan(1.25); // the table prints 1.2 ug/L
  });

  it('tap water dermal: the event dose at the time-weighted event time, DA_event / (event dose)', () => {
    const DFW = ifs((s) => s.saw);
    const DFWM = ifsm((s) => s.saw);
    near(DFW, 2610650, 1e-6);
    near(DFWM, 8191633, 1e-6);
    const daEvent = (TR * AT_LT) / (CSF_T * 1e-3 * (CAF_O * DFW + MAF_O * DFWM)); // ug/cm2-event
    const etAdj = (2 * 0.54 + 4 * 0.54 + 10 * 0.71 + 10 * 0.71) / 26; // 0.6708 h
    const ev = dermalWaterEventPerEpc(modernChemical(tceB).dermalWater!, 0.6708 * 3600)!.perEpc; // m per (kg/m3)
    expect(etAdj).toBeCloseTo(0.6708, 3);
    const slUgL = (daEvent * 1000) / (ev * 100); // ug/cm2 x cm3/L over cm
    near(level(coef('waterDermal', resident, tce), UG_L), slUgL);
  });

  it('indoor air: TR AT LT / (IUR (CAF_i EF ED ET + MAF_i sum EF ED ET ADAF))', () => {
    const sl =
      (TR * AT_LT) / (IUR_T * (CAF_I * EF * 26 + MAF_I * EF * (2 * 10 + 4 * 3 + 10 * 3 + 10 * 1)));
    near(level(coef('indoorInhalation', resident, tce), UG_M3), sl);
    expect(sl).toBeGreaterThan(0.47);
    expect(sl).toBeLessThan(0.49); // the table prints 0.48 ug/m3
  });

  it('applies the same inhalation weights to outdoor air', () => {
    near(
      coef(
        'outdoorInhalation',
        modernReceptor({
          ...MODERN_RESIDENT_BOUNDARY,
          stages: MODERN_RESIDENT_BOUNDARY.stages.map((s) => ({
            ...s,
            etHoursPerDay: { ...s.etHoursPerDay, outdoorInhalation: 24 },
          })),
          mutagenStages: MODERN_RESIDENT_BOUNDARY.mutagenStages!.map((s) => ({
            ...s,
            etHoursPerDay: { ...s.etHoursPerDay, outdoorInhalation: 24 },
          })),
        }),
        tce,
      ),
      coef('indoorInhalation', resident, tce),
    );
  });

  it('a child resident (child stage, 0-2 and 2-6 segments) uses the same equation over its own stages', () => {
    const childOnly = modernReceptor({
      label: 'Child resident',
      cancerBathingTimeHr: 0.54,
      stages: MODERN_RESIDENT_BOUNDARY.stages.slice(0, 1),
      mutagenStages: MODERN_RESIDENT_BOUNDARY.mutagenStages!.slice(0, 2),
    });
    const ing = (EF * 6 * 0.78) / 15; // child stage, CAF
    const ingM = (EF * 2 * 0.78 * 10) / 15 + (EF * 4 * 0.78 * 3) / 15;
    const sl = (TR * AT_LT) / (CSF_T * 1e-3 * (CAF_O * ing + MAF_O * ingM));
    near(level(coef('waterIngestion', childOnly, tce), UG_L), sl);
  });
});

describe('vinyl chloride, resident (guide sections 4.1.x.5)', () => {
  it('soil ingestion: the averaged term plus the unaveraged child term', () => {
    const IFS = ifs((s) => s.irs);
    const sl = TR / ((CSF_V * 1e-6 * IFS) / AT_LT + (CSF_V * 1e-6 * CHILD.irs) / CHILD.bw);
    near(level(coef('soilIngestion', resident, vc), MG_KG), sl);
    expect(sl).toBeGreaterThan(0.09);
    expect(sl).toBeLessThan(0.1); // the table prints 0.094 mg/kg
  });

  it('soil dermal', () => {
    const absd = 0.1;
    const DFS = ifs((s) => s.sa * s.af);
    const sl =
      TR /
      (((CSF_V / 1) * 1e-6 * DFS * absd) / AT_LT +
        ((CSF_V / 1) * 1e-6 * CHILD.sa * CHILD.af * absd) / CHILD.bw);
    near(level(coef('soilDermal', resident, vc), MG_KG), sl);
  });

  it('tap water ingestion', () => {
    const IFW = ifs((s) => s.irw);
    const sl = TR / ((CSF_V * 1e-3 * IFW) / AT_LT + (CSF_V * 1e-3 * CHILD.irw) / CHILD.bw);
    near(level(coef('waterIngestion', resident, vc), UG_L), sl);
    expect(sl).toBeGreaterThan(0.02);
    expect(sl).toBeLessThan(0.022); // the table prints 0.021 ug/L
  });

  it('tap water dermal: event dose at the ED-weighted event time of the child and adult stages', () => {
    const DFW = ifs((s) => s.saw);
    const daEvent = TR / (CSF_V * 1e-3 * (DFW / AT_LT + (1 * CHILD.saw) / CHILD.bw));
    const et = (6 * 0.54 + 20 * 0.71) / 26;
    const ev = dermalWaterEventPerEpc(vc.dermalWater!, 0.6708 * 3600)!.perEpc;
    expect(et).toBeCloseTo(0.6708, 3);
    near(level(coef('waterDermal', resident, vc), UG_L), (daEvent * 1000) / (ev * 100));
  });

  it('air: TR / (IUR + IUR EF ED ET / (AT LT))', () => {
    const sl = TR / (IUR_V + (IUR_V * EF * 26 * 1) / AT_LT);
    near(level(coef('indoorInhalation', resident, vc), UG_M3), sl);
    expect(sl).toBeGreaterThan(0.16);
    expect(sl).toBeLessThan(0.18); // the table prints 0.17 ug/m3
  });
});

describe('what the equations do not cover', () => {
  it('leaves a worker (no early-life segments) on the ordinary equation and says so', () => {
    const worker = modernWorker();
    const ordinary = modernChemical({ ...tceB, special: undefined, mutagen: false });
    const a = modernPathway('soilIngestion', worker, tce, 1).riskPerEpc;
    const b = modernPathway('soilIngestion', worker, ordinary, 1).riskPerEpc;
    expect(a).toBe(b);
    const r = evaluateModernReceptor({
      label: 'Worker',
      receptor: worker,
      pathways: ['soilIngestion'],
      chemicals: [{ id: 'tce', chemical: tce, epcs: { soilIngestion: mgPerKgToKgPerKg(1) } }],
    });
    expect(r.warnings.map((w) => w.code)).toContain('exposure.special-case-not-modelled');
  });

  it('computes no warning when the equations are applied in full', () => {
    const r = evaluateModernReceptor({
      label: 'Resident',
      receptor: resident,
      pathways: ['soilIngestion', 'indoorInhalation'],
      chemicals: [
        {
          id: 'tce',
          chemical: tce,
          epcs: { soilIngestion: mgPerKgToKgPerKg(1), indoorInhalation: mgPerM3ToKgPerM3(0.001) },
        },
      ],
    });
    expect(r.warnings.map((w) => w.code)).not.toContain('exposure.special-case-not-modelled');
  });

  it('warns for vinyl chloride in shower air, where the from-birth term is not applied', () => {
    const r = evaluateModernReceptor({
      label: 'Resident',
      receptor: resident,
      pathways: ['showerInhalation'],
      chemicals: [{ id: 'vc', chemical: vc, epcs: { showerInhalation: mgPerM3ToKgPerM3(0.001) } }],
    });
    const w = r.warnings.filter((x) => x.code === 'exposure.special-case-not-modelled');
    expect(w).toHaveLength(1);
    expect(w[0]!.message).toContain('showerInhalation');
    const ordinary = modernChemical({ ...vcB, special: undefined, mutagen: true });
    near(coef('showerInhalation', resident, vc), coef('showerInhalation', resident, ordinary));
  });
});

describe('overridden cancer values', () => {
  it('applies the equations to the given value in the guide proportions, and warns', () => {
    const edited = modernChemical({ ...tceB, sfo: 0.1, iur: 1e-5, cancerOverridden: true });
    const IFW = ifs((s) => s.irw);
    const IFWM = ifsm((s) => s.irw);
    const sl = (TR * AT_LT) / (0.1 * 1e-3 * (CAF_O * IFW + MAF_O * IFWM));
    near(level(coef('waterIngestion', resident, edited), UG_L), sl);
    const r = evaluateModernReceptor({
      label: 'Resident',
      receptor: resident,
      pathways: ['waterIngestion'],
      chemicals: [{ id: 'tce', chemical: edited, epcs: { waterIngestion: 1e-5 } }],
    });
    expect(r.warnings.map((w) => w.code)).toContain('exposure.special-case-override');
    const plain = evaluateModernReceptor({
      label: 'Resident',
      receptor: resident,
      pathways: ['waterIngestion'],
      chemicals: [{ id: 'tce', chemical: tce, epcs: { waterIngestion: 1e-5 } }],
    });
    expect(plain.warnings.map((w) => w.code)).not.toContain('exposure.special-case-override');
  });
});

describe('series concentrations follow the same terms', () => {
  const Y = 365 * 86400;
  const run = (chem: ModernChemical, spec: ReturnType<typeof constantEpc>): number =>
    runModernScenario({
      receptors: [
        {
          label: 'Resident',
          receptor: resident,
          pathways: ['waterIngestion'],
          chemicals: [{ id: 'x', chemical: chem, epcs: { waterIngestion: spec } }],
        },
      ],
    }).receptors[0]!.totals.risk;

  it('a flat series gives the constant result for both chemicals', () => {
    for (const chem of [tce, vc]) {
      const flat = seriesEpc({ times: [0, 60 * Y], values: [1e-5, 1e-5] }, 'entered');
      near(run(chem, flat), run(chem, constantEpc('waterIngestion', 0.01)), 1e-9);
    }
  });

  it('a series that stops after childhood still counts the from-birth term of vinyl chloride', () => {
    const early = seriesEpc(
      { times: [0, 6 * Y, 6 * Y + 1, 60 * Y], values: [1e-5, 1e-5, 0, 0] },
      'entered',
    );
    const flat = constantEpc('waterIngestion', 0.01);
    expect(run(vc, early)).toBeGreaterThan(0);
    expect(run(vc, early)).toBeLessThan(run(vc, flat));
    // the unaveraged child term is a share of the whole, so more than the averaged adult-and-child terms alone
    expect(run(vc, early)).toBeGreaterThan(run(vc, flat) * 0.5);
  });
});

describe('swimming (the recreator surface-water equations, sections 4.6.2.5 and 4.6.2.6)', () => {
  const EF_SWIM = 45;
  const HOURS = 2;
  // swimming 45 d/yr for 2 h at one event per day, every stage; the resident's surface-water ingestion rates
  const swimmer = (hours: (stageIndex: number) => number): ModernReceptor =>
    modernReceptor({
      ...MODERN_RESIDENT_BOUNDARY,
      stages: MODERN_RESIDENT_BOUNDARY.stages.map((s, i) => ({
        ...s,
        efDaysPerYrByPathway: { swimIngestion: EF_SWIM, swimDermal: EF_SWIM },
        swimTimeHr: hours(i),
        swimEventsPerDay: 1,
      })),
      mutagenStages: MODERN_RESIDENT_BOUNDARY.mutagenStages!.map((s, i) => ({
        ...s,
        efDaysPerYrByPathway: { swimIngestion: EF_SWIM, swimDermal: EF_SWIM },
        swimTimeHr: hours(i < 2 ? 0 : 1),
        swimEventsPerDay: 1,
      })),
    });
  const same = swimmer(() => HOURS);
  const RATE = { child: 0.12, adult: 0.11, seg: [0.12, 0.12, 0.124, 0.0985] };

  it('trichloroethylene: CAF and MAF over the stage and segment intakes', () => {
    const ifw =
      (EF_SWIM * CHILD.ed * HOURS * RATE.child) / CHILD.bw +
      (EF_SWIM * ADULT.ed * HOURS * RATE.adult) / ADULT.bw;
    const ifwm = SEG.reduce(
      (a, s, i) => a + (EF_SWIM * s.ed * HOURS * RATE.seg[i]! * s.adaf) / s.bw,
      0,
    );
    const sl = (TR * AT_LT) / (CSF_T * 1e-3 * (CAF_O * ifw + MAF_O * ifwm));
    near(level(coef('swimIngestion', same, tce), UG_L), sl);
  });

  it('vinyl chloride: the averaged intake plus the child event dose with no frequency or averaging', () => {
    const ifw =
      (EF_SWIM * CHILD.ed * HOURS * RATE.child) / CHILD.bw +
      (EF_SWIM * ADULT.ed * HOURS * RATE.adult) / ADULT.bw;
    const sl = TR / ((CSF_V * 1e-3 * ifw) / AT_LT + (CSF_V * 1e-3 * HOURS * RATE.child) / CHILD.bw);
    near(level(coef('swimIngestion', same, vc), UG_L), sl);
  });

  it('dermal: the event time is the ED-weighted time over the stage set of the equation', () => {
    // child stages swim 1 h, adult stages 3 h: trichloroethylene weights the four segments (2, 4, 10, 10 yr)
    const times = swimmer((i) => (i === 0 ? 1 : 3));
    const etAdj = (2 * 1 + 4 * 1 + 10 * 3 + 10 * 3) / 26;
    const dfw = ifs((s) => s.saw * (EF_SWIM / EF));
    const dfwm = ifsm((s) => s.saw * (EF_SWIM / EF));
    const da = (TR * AT_LT) / (CSF_T * 1e-3 * (CAF_O * dfw + MAF_O * dfwm));
    const ev = dermalWaterEventPerEpc(tce.dermalWater!, etAdj * 3600)!.perEpc;
    near(level(coef('swimDermal', times, tce), UG_L), (da * 1000) / (ev * 100));
    // vinyl chloride weights the child and adult stages (6 and 20 yr)
    const etV = (6 * 1 + 20 * 3) / 26;
    const daV = TR / (CSF_V * 1e-3 * (dfw / AT_LT + CHILD.saw / CHILD.bw));
    const evV = dermalWaterEventPerEpc(vc.dermalWater!, etV * 3600)!.perEpc;
    near(level(coef('swimDermal', times, vc), UG_L), (daV * 1000) / (evV * 100));
  });
});

describe('the cleanup level follows the equations', () => {
  it('tap water ingestion and dermal: the combined level is the harmonic sum of the two guide levels', () => {
    const slIng =
      (TR * AT_LT) / (CSF_T * 1e-3 * (CAF_O * ifs((s) => s.irw) + MAF_O * ifsm((s) => s.irw)));
    const ev = dermalWaterEventPerEpc(tce.dermalWater!, 0.6708 * 3600)!.perEpc;
    const da =
      (TR * AT_LT) / (CSF_T * 1e-3 * (CAF_O * ifs((s) => s.saw) + MAF_O * ifsm((s) => s.saw)));
    const slDerm = (da * 1000) / (ev * 100);
    const r = backCalculateModern({
      receptors: [
        { label: 'resident', receptor: resident, pathways: ['waterIngestion', 'waterDermal'] },
      ],
      chemicals: [{ id: 'tce', chemical: tce }],
    });
    const lv = r.media[0]!.levels[0]!;
    near(lv.cancerLevel! / UG_L, 1 / (1 / slIng + 1 / slDerm));
  });
});
