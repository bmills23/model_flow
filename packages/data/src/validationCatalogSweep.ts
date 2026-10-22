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
}

const SOIL_NOTE =
  'The soil inhalation level rests on the RSL volatilization and particulate emission factors, which the sweep does not compute, so the 435 inhalation cells and the 435 totals that include them are excepted, not compared.';

function sweep(s: SweepCounts): ExampleSpec {
  return {
    id: `rsl-sweep-${s.id}`,
    title: `RSL November 2024 sweep, ${s.title}`,
    files: [SWEEP_FIXTURE],
    dataFiles: [SCREENING_LEVELS],
    referenceKey: 'epa2024rsl',
    methodIds: s.methodIds,
    compares: `${s.columns}: all ${s.cells} printed cells against the engine. ${s.reproduced} reproduce, ${s.excepted} are excepted (${s.excepts}), ${s.unexplained} are unexplained.`,
    count: (j) => (j[0].sweeps[s.id] as { compared: number }).compared,
    casesUnit: 'published screening levels',
    tolerance: RSL_TOLERANCE,
    status: 'reproduced',
    testFile: 'rsl-tables-sweep.test.ts',
    evidence: SWEEP_EVIDENCE,
    readmeNeedle: 'RSL sweep fixture',
    pins: [
      { path: `sweeps.${s.id}.compared`, value: s.cells },
      { path: `sweeps.${s.id}.reproduced`, value: s.reproduced },
      { path: `sweeps.${s.id}.excepted`, value: s.excepted },
      { path: `sweeps.${s.id}.unexplained`, value: s.unexplained },
      ...s.classCells.map(([cls, n]) => ({ path: `classes.${cls}.cells.${s.id}`, value: n })),
      // the household factor K note of the tap water entry (and the catalog entry for K) states these
      ...(s.id === 'tapwater'
        ? [
            { path: 'householdK.cells', value: 265 },
            { path: 'householdK.reproduced', value: 263 },
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
    reproduced: 3040,
    excepted: 9,
    unexplained: 4,
    columns:
      'Resident tap water ingestion, dermal, inhalation and total, cancer (target risk 1e-6) and noncancer (child, hazard quotient 1)',
    excepts:
      'eight trichloroethylene and vinyl chloride cancer cells, which the RSL treats with its own equations, and one lead cell with no toxicity value in the database',
    classCells: [
      [2, 1],
      [4, 8],
    ],
    methodIds: ['exposure.rags-e-f-2014', 'shower.rsl-household'],
    note: 'The 265 inhalation cells (93 cancer, 172 noncancer) are the resident air level divided by the household factor K, entered as 0.5 L/m3; 263 reproduce and the two that do not are the trichloroethylene and vinyl chloride cancer cells. Unexplained: the total cancer level of Aroclor 1242, 1248, 1254 and 1260 is printed 0.0078 ug/L and computed 0.007852 ug/L (0.7 percent above); the ingestion and inhalation cells of these rows reproduce and the dermal cell is blank, and no reason was found.',
  }),
  sweep({
    id: 'soil-resident',
    title: 'resident soil',
    cells: 3012,
    reproduced: 2138,
    excepted: 874,
    unexplained: 0,
    columns:
      'Resident soil ingestion, dermal, inhalation and total, cancer (target risk 1e-6) and noncancer (child, hazard quotient 1)',
    excepts:
      '870 soil inhalation cells and totals that include them, two trichloroethylene and vinyl chloride cancer cells, and two lead cells with no toxicity value in the database',
    classCells: [
      [0, 435],
      [1, 435],
      [2, 2],
      [4, 2],
    ],
    methodIds: ['exposure.rags-e-f-2014'],
    note: SOIL_NOTE,
  }),
  sweep({
    id: 'soil-industrial',
    title: 'composite worker soil',
    cells: 3011,
    reproduced: 2140,
    excepted: 871,
    unexplained: 0,
    columns:
      'Industrial soil ingestion, dermal, inhalation and total, cancer (target risk 1e-6) and noncancer (hazard quotient 1)',
    excepts:
      '870 soil inhalation cells and totals that include them, and one lead cell with no toxicity value in the database',
    classCells: [
      [0, 435],
      [1, 435],
      [2, 1],
    ],
    methodIds: ['exposure.rags-e-f-2014'],
    note: SOIL_NOTE,
  }),
  sweep({
    id: 'air',
    title: 'resident and industrial air',
    cells: 812,
    reproduced: 807,
    excepted: 5,
    unexplained: 0,
    columns:
      'Resident air inhalation, cancer and noncancer, and the summary governing level for industrial air (the lower of the cancer and noncancer levels)',
    excepts:
      'two trichloroethylene and vinyl chloride cancer cells, one lead cell with no toxicity value in the database and two refractory ceramic fiber cells whose database value is in fibers',
    classCells: [
      [2, 1],
      [3, 2],
      [4, 2],
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
