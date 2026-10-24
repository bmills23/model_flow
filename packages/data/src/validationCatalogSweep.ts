import type { ExampleSpec } from './validation.js';

/**
 * Extension point for the published-value sweeps. A sweep appends its example specs here; the catalog
 * folds them into `examples` and the generator renders them like any other entry. A spec with no fixture
 * file names the data it counts in `dataFiles` (paths relative to `packages/data/generated`).
 *
 * The RSL sweeps (`rsl-tables-sweep.test.ts`) compare every published screening-level cell of the
 * November 2024 tables with the engine. Their fixture (`rsl-sweep/exceptions.json`) holds the counts the test
 * recomputes, the named exception classes with their reasons and every unexplained cell; the pins below make
 * the numbers stated in the text fail the build when the fixture changes.
 *
 * The VISL calculator comparison (`visl-sweep.test.ts`) follows the same pattern: three runs of the public
 * calculator (`packages/data/raw/visl`), each compared with the engine twice, from the calculator's printed
 * inputs and from the database the app ships. Its fixture (`visl-sweep/exceptions.json`) holds the counts
 * the test recomputes, the named exception classes with their reasons and every unexplained cell.
 */

const SWEEP_FIXTURE = 'rsl-sweep/exceptions.json';
const SCREENING_LEVELS = 'rsl-2024-11/screening-levels.json';
const RSL_TOLERANCE =
  "The engine's unrounded value lies within half a unit of the second significant figure of the printed value; the data holds at most two significant figures in every column, and nothing is widened.";
const SWEEP_EVIDENCE = [
  'expect(result.sweeps).toEqual(fixture.sweeps)',
  'expect(result.unexplained).toEqual(fixture.unexplained)',
];

interface SweepCounts {
  id: string;
  title: string;
  cells: number;
  reproduced: number;
  excepted: number;
  unexplained: number;
  columns: string;
  excepts: string;
  /** Class index in the fixture and the count the text states for this sweep. */
  classCells: [number, number][];
  methodIds: string[];
  note: string;
  /** Extra pins (soil inhalation counts) and the evidence the soil sweeps add. */
  extraPins?: { path: string; value: unknown }[];
  extraEvidence?: string[];
}

const SOIL_METHODS = [
  'exposure.rags-e-f-2014',
  'outdoorAir.ssg-vf-1996',
  'particulate.ssg-pef-2002',
];

const SOIL_EXTRA_EVIDENCE = [
  'expect(result.soilInhalation).toEqual(fixture.soilInhalation)',
  'expect(st.vf / vf).toBeCloseTo(1, 12)',
];

const SOIL_NOTE =
  "The soil inhalation level is the receptor's air level times 1/VF + 1/PEF, composed in the test from the volatilization factor (RSL inputs: Q/C 68.18, 26 years, the guide's soil) and the wind-erosion PEF (1.36E9 m3/kg); the engine gets no new option. A hand calculation of benzene checks the factors and all four levels. Twelve volatile chemicals have neither Koc nor Kd in the parameter sheet; their cells print the particulate-only level and are excepted, not counted as reproduced.";

function sweep(s: SweepCounts): ExampleSpec {
  return {
    id: `rsl-sweep-${s.id}`,
    title: `RSL November 2024 sweep, ${s.title}`,
    files: [SWEEP_FIXTURE],
    dataFiles: [SCREENING_LEVELS],
    referenceKey: 'epa2024rsl',
    methodIds: s.methodIds,
    compares: `${s.columns}: all ${s.cells} printed cells against the engine. ${s.reproduced} reproduce, ${s.excepted} ${s.excepted === 1 ? 'is' : 'are'} excepted (${s.excepts}), ${s.unexplained} ${s.unexplained === 1 ? 'is' : 'are'} unexplained.`,
    count: (j) => (j[0].sweeps[s.id] as { compared: number }).compared,
    casesUnit: 'published screening levels',
    tolerance: RSL_TOLERANCE,
    status: 'reproduced',
    testFile: 'rsl-tables-sweep.test.ts',
    evidence: [...SWEEP_EVIDENCE, ...(s.extraEvidence ?? [])],
    readmeNeedle: 'RSL sweep fixture',
    pins: [
      { path: `sweeps.${s.id}.compared`, value: s.cells },
      { path: `sweeps.${s.id}.reproduced`, value: s.reproduced },
      { path: `sweeps.${s.id}.excepted`, value: s.excepted },
      { path: `sweeps.${s.id}.unexplained`, value: s.unexplained },
      ...s.classCells.map(([cls, n]) => ({ path: `classes.${cls}.cells.${s.id}`, value: n })),
      ...(s.extraPins ?? []),
      // the household factor K note of the tap water entry (and the catalog entry for K) states these
      ...(s.id === 'tapwater'
        ? [
            { path: 'householdK.cells', value: 265 },
            { path: 'householdK.reproduced', value: 265 },
            { path: 'householdK.lPerM3', value: 0.5 },
          ]
        : []),
    ],
    note: s.note,
  };
}

export const sweepExamples: ExampleSpec[] = [
  sweep({
    id: 'tapwater',
    title: 'tap water',
    cells: 3053,
    reproduced: 3048,
    excepted: 5,
    unexplained: 0,
    columns:
      'Resident tap water ingestion, dermal, inhalation and total, cancer (target risk 1e-6) and noncancer (child, hazard quotient 1)',
    excepts:
      'one lead cell with no toxicity value in the database and four Aroclor total cancer cells that fall inside the rounding of the printed unit risk',
    classCells: [
      [2, 1],
      [4, 4],
    ],
    methodIds: ['exposure.rags-e-f-2014', 'shower.rsl-household'],
    note: 'The 265 inhalation cells (93 cancer, 172 noncancer) are the resident air level divided by the household factor K, entered as 0.5 L/m3; all 265 reproduce, the trichloroethylene and vinyl chloride cancer cells included (through the RSL equations for those two chemicals, which the modern exposure method applies). Excepted: the total cancer level of Aroclor 1242, 1248, 1254 and 1260 is printed 0.0078 ug/L and computed 0.007852 ug/L; the tables print their unit risk as 5.71E-4 (three figures) and at 5.7118E-4 or more, inside that rounding, the total prints 0.0078.',
  }),
  sweep({
    id: 'soil-resident',
    title: 'resident soil',
    cells: 3012,
    reproduced: 2984,
    excepted: 28,
    unexplained: 0,
    columns:
      'Resident soil ingestion, dermal, inhalation and total, cancer (target risk 1e-6) and noncancer (child, hazard quotient 1)',
    excepts:
      '26 soil inhalation cells and totals of twelve chemicals that have no volatilization factor, and two lead cells with no toxicity value in the database',
    classCells: [
      [0, 13],
      [1, 13],
      [2, 2],
    ],
    methodIds: SOIL_METHODS,
    extraEvidence: SOIL_EXTRA_EVIDENCE,
    extraPins: [
      { path: 'soilInhalation.soil-resident.inhalation.compared', value: 435 },
      { path: 'soilInhalation.soil-resident.inhalation.reproduced', value: 422 },
      { path: 'soilInhalation.soil-resident.inhalation.excepted', value: 13 },
      { path: 'soilInhalation.soil-resident.inhalation.unexplained', value: 0 },
      { path: 'soilInhalation.soil-resident.totalWithInhalation.compared', value: 435 },
      { path: 'soilInhalation.soil-resident.totalWithInhalation.reproduced', value: 422 },
      { path: 'soilInhalation.soil-resident.totalWithInhalation.excepted', value: 13 },
      { path: 'soilInhalation.soil-resident.totalWithInhalation.unexplained', value: 0 },
    ],
    note: `${SOIL_NOTE} Soil inhalation cells: 435, of which 422 reproduce and 13 are excepted; soil totals that include one: 435, of which 422 reproduce and 13 are excepted. The noncancer inhalation level of PCB 105 (printed 840 mg/kg) reproduces since the database keeps its TEF-applied reference concentration as 4E-8 over 3E-5 rather than the printed 1.33E-3.`,
  }),
  sweep({
    id: 'soil-industrial',
    title: 'composite worker soil',
    cells: 3011,
    reproduced: 2983,
    excepted: 27,
    unexplained: 1,
    columns:
      'Industrial soil ingestion, dermal, inhalation and total, cancer (target risk 1e-6) and noncancer (hazard quotient 1)',
    excepts:
      '26 soil inhalation cells and totals of twelve chemicals that have no volatilization factor, and one lead cell with no toxicity value in the database',
    classCells: [
      [0, 13],
      [1, 13],
      [2, 1],
    ],
    methodIds: SOIL_METHODS,
    extraEvidence: SOIL_EXTRA_EVIDENCE,
    extraPins: [
      { path: 'soilInhalation.soil-industrial.inhalation.compared', value: 435 },
      { path: 'soilInhalation.soil-industrial.inhalation.reproduced', value: 422 },
      { path: 'soilInhalation.soil-industrial.inhalation.excepted', value: 13 },
      { path: 'soilInhalation.soil-industrial.inhalation.unexplained', value: 0 },
      { path: 'soilInhalation.soil-industrial.totalWithInhalation.compared', value: 435 },
      { path: 'soilInhalation.soil-industrial.totalWithInhalation.reproduced', value: 421 },
      { path: 'soilInhalation.soil-industrial.totalWithInhalation.excepted', value: 13 },
      { path: 'soilInhalation.soil-industrial.totalWithInhalation.unexplained', value: 1 },
    ],
    note: `${SOIL_NOTE} Soil inhalation cells: 435, of which 422 reproduce and 13 are excepted; soil totals that include one: 435, of which 421 reproduce, 13 are excepted and 1 is unexplained. Unexplained: the noncancer total of n-nonane is printed 72 mg/kg and computed 72.5012 mg/kg, 0.002 percent above the half-unit limit of 72.5; no printed input or rule accounts for it.`,
  }),
  sweep({
    id: 'air',
    title: 'resident and industrial air',
    cells: 812,
    reproduced: 809,
    excepted: 3,
    unexplained: 0,
    columns:
      'Resident air inhalation, cancer and noncancer, and the summary governing level for industrial air (the lower of the cancer and noncancer levels)',
    excepts:
      'one lead cell with no toxicity value in the database and two refractory ceramic fiber cells whose database value is in fibers',
    classCells: [
      [2, 1],
      [3, 2],
    ],
    methodIds: ['exposure.rags-e-f-2014'],
    note: 'In all 365 reproduced industrial air cells the summary key letter (c or n) names the endpoint the engine finds governing.',
  }),
  {
    id: 'nrwqc-hardness-metals',
    title: 'NRWQC hardness-dependent metals at a hardness of 100 mg/L',
    files: [],
    referenceKey: 'epanrwqc',
    methodIds: [],
    compares:
      'The acute and chronic freshwater criteria of cadmium, chromium III, lead, nickel, silver and zinc, computed from the slope, intercept and conversion factor of the Appendix B data file at a hardness of 100 mg/L, against the printed criteria of the aquatic life table. Cadmium chronic (vacated) and silver chronic (none) print no value.',
    count: () => 10,
    casesUnit: 'published criteria',
    tolerance:
      'Within half a unit of the second significant figure of the printed value (all ten printed values have two).',
    status: 'reproduced',
    testFile: 'surfacewater-criteria.test.ts',
    evidence: ['expect(compared).toBe(10)'],
    note: 'Extends the zinc entry above to every hardness-dependent metal of the data files.',
  },
];

const VISL_FIXTURE = 'visl-sweep/exceptions.json';
const VISL_TOLERANCE =
  "The engine's unrounded value lies within half a unit of the last printed digit (three significant figures in every compared numeric cell, asserted by the test); a yes or no answer must be equal; nothing is widened.";
const VISL_EVIDENCE = [
  'expect(counts).toEqual(fixture.comparisons)',
  'expect(fixture.unexplained).toEqual(unexplained.map(shown))',
  "expect(withinPrinted(0.36051, '3.60E-01')).toBe(false)",
];

type VislComparison = 'printed-inputs' | 'database';
type VislRun = 'resident-default' | 'resident-tgw10' | 'commercial-default';

interface VislCase {
  comparison: VislComparison;
  run: VislRun;
  compared: number;
  reproduced: number;
  excepted: number;
  /** Class index in the fixture and the count the text states for this run. */
  classCells: [number, number][];
  excepts: string;
  note: string;
}

const VISL_RUNS: Record<VislRun, { title: string; settings: string }> = {
  'resident-default': {
    title: 'resident at the form defaults',
    settings: 'resident, groundwater at 25 deg C, hazard quotient 0.1, target risk 1e-6',
  },
  'resident-tgw10': {
    title: 'resident, groundwater at 10 deg C, hazard quotient 1, target risk 1e-5',
    settings:
      'resident, groundwater at 10 deg C, hazard quotient 1, target risk 1e-5 (the Henry constant temperature correction and the target scaling)',
  },
  'commercial-default': {
    title: 'commercial at the form defaults',
    settings:
      'commercial/industrial, groundwater at 25 deg C, hazard quotient 0.1, target risk 1e-6',
  },
};

const VISL_COMPARISONS: Record<VislComparison, { title: string; source: string; note: string }> = {
  'printed-inputs': {
    title: "from the calculator's printed inputs",
    source:
      "the engine is run from the properties, toxicity values and exposure inputs the calculator prints for the run, which checks the engine's equations",
    note: 'The printed inputs carry three or five significant figures, so a few outputs that miss by less than the input rounding are excepted as printed-input-rounding.',
  },
  database: {
    title: "from the app's shipped database",
    source:
      'the engine is run from the chemical file the vapor screen loads and the RSL toxicity file the exposure screens use (vapor-chemicals.json, tox.json), which checks what a user of the app gets; the database holds the vapor pressure at 25 deg C only',
    note: 'Each cell that differs is explained by the database input that differs (database-input-differs) or counted as unexplained.',
  },
};

function visl(c: VislCase): ExampleSpec {
  const run = VISL_RUNS[c.run];
  const how = VISL_COMPARISONS[c.comparison];
  const path = `comparisons.${c.comparison}.${c.run}`;
  return {
    id: `visl-${c.comparison}-${c.run}`,
    title: `VISL calculator, ${run.title}, ${how.title}`,
    files: [VISL_FIXTURE],
    referenceKey: 'epavisl',
    methodIds: ['vapor.attenuation-factor-2015', 'exposure.rags-e-f-2014'],
    compares: `The calculator output for five chemicals (benzene, trichloroethylene, tetrachloroethylene, naphthalene, ethylbenzene; ${run.settings}), retrieved 2026-10-22: ${how.source}. Compared: the cancer and noncancer target indoor air levels and the governing one, the sub-slab and near-source soil gas level, the groundwater level, the pure phase and maximum groundwater vapor concentrations, H prime used, and the yes or no answers. All ${c.compared} printed cells: ${c.reproduced} reproduce, ${c.excepted} ${c.excepted === 1 ? 'is' : 'are'} excepted (${c.excepts}), 0 are unexplained.`,
    count: (j) => (j[0].comparisons[c.comparison][c.run] as { compared: number }).compared,
    casesUnit: 'printed cells',
    tolerance: VISL_TOLERANCE,
    status: 'reproduced',
    testFile: 'visl-sweep.test.ts',
    evidence: VISL_EVIDENCE,
    readmeNeedle: 'VISL sweep fixture',
    pins: [
      { path: `${path}.compared`, value: c.compared },
      { path: `${path}.reproduced`, value: c.reproduced },
      { path: `${path}.excepted`, value: c.excepted },
      { path: `${path}.unexplained`, value: 0 },
      ...c.classCells.map(([cls, n]) => ({
        path: `classes.${cls}.cells.${c.comparison}.${c.run}`,
        value: n,
      })),
    ],
    note: `${how.note} ${c.note}`,
  };
}

export const vislExamples: ExampleSpec[] = [
  visl({
    comparison: 'printed-inputs',
    run: 'resident-default',
    compared: 65,
    reproduced: 63,
    excepted: 2,
    classCells: [[1, 2]],
    excepts:
      'the tetrachloroethylene groundwater level and H prime, which miss by less than the rounding of the printed inputs',
    note: 'The trichloroethylene cancer level (printed 0.478 ug/m3) reproduces from the RSL equations for that chemical, which the modern exposure method applies to a receptor with early-life segments (the engine gives 0.4783 ug/m3); its noncancer level governs, so the sub-slab and groundwater levels reproduce.',
  }),
  visl({
    comparison: 'printed-inputs',
    run: 'resident-tgw10',
    compared: 65,
    reproduced: 56,
    excepted: 9,
    classCells: [
      [0, 5],
      [1, 4],
    ],
    excepts:
      'five pure phase vapor concentrations that the calculator leaves at their 25 deg C values, and four outputs that miss by less than the rounding of the printed inputs',
    note: 'Under a header naming 10 deg C the calculator prints a pure phase vapor concentration equal to its 25 deg C value; the engine, given the printed vapor pressure at 10 deg C, gives a third to a half of it. The Henry constant temperature correction (H prime, the groundwater level and the maximum groundwater vapor) reproduces for all five chemicals up to the input rounding.',
  }),
  visl({
    comparison: 'printed-inputs',
    run: 'commercial-default',
    compared: 65,
    reproduced: 64,
    excepted: 1,
    classCells: [[1, 1]],
    excepts:
      'the tetrachloroethylene H prime, which misses by less than the rounding of the printed inputs',
    note: 'The commercial receptor has no early-life segments, so the trichloroethylene cancer level reproduces as an ordinary chemical.',
  }),
  visl({
    comparison: 'database',
    run: 'resident-default',
    compared: 70,
    reproduced: 70,
    excepted: 0,
    classCells: [],
    excepts: 'none',
    note: 'With the shipped Henry constants at 25 deg C every cell reproduces, including the trichloroethylene cancer level (from the RSL equations for that chemical), the mutagenic indicator and the toxicity basis.',
  }),
  visl({
    comparison: 'database',
    run: 'resident-tgw10',
    compared: 70,
    reproduced: 65,
    excepted: 5,
    classCells: [[2, 5]],
    excepts:
      'five outputs of the 10 deg C correction that differ because the database critical temperature (trichloroethylene) or enthalpy of vaporization (naphthalene) differs from the calculator',
    note: 'The database critical temperature of trichloroethylene is 544.2 K, the calculator prints 571 K; the naphthalene enthalpy is 10373 cal/mol against 10300. The pure phase vapor concentrations reproduce here because the database holds the 25 deg C vapor pressure only, and the calculator prints that value.',
  }),
  visl({
    comparison: 'database',
    run: 'commercial-default',
    compared: 70,
    reproduced: 70,
    excepted: 0,
    classCells: [],
    excepts: 'none',
    note: 'Every cell reproduces.',
  }),
];
