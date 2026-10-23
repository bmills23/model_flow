import type { CatalogInput, ExampleSpec, Json } from './validation.js';
import { sweepExamples, vislExamples } from './validationCatalogSweep.js';

/**
 * The descriptive text of the validation manifest. Every statement here is checked by
 * `buildValidationManifest` against the tree: the fixture files must exist and be counted, the fixture
 * README must mention the named string, the test source must contain the evidence strings that pin the
 * tolerance, the references and methods must exist, and each warned default must still be found in the
 * file that raises it. Nothing here is a published value; no new citation is introduced.
 */

const nonNull = (v: unknown): number => (v === null || v === undefined ? 0 : 1);

/** Counts the string leaves of a nested object (the printed cells of Table R-9). */
function leaves(v: Json): number {
  if (v !== null && typeof v === 'object') {
    return Object.values(v as Record<string, Json>).reduce<number>((n, x) => n + leaves(x), 0);
  }
  return 1;
}

/** Printed concentration cells over the snapshots of an ANALGWST output file. */
function analgwstCells(files: Json[]): number {
  let n = 0;
  for (const f of files) {
    for (const r of f.results as { c: number[][] }[])
      n += r.c.reduce((a, row) => a + row.length, 0);
  }
  return n;
}

const ANALGWST_SOURCE = 'analgwst';

/** The test that asserts the named exception and deferred rows of Table R-9 against the fixture. */
const R9_ROW_TEST = 'household-e4.test.ts';

const examples: ExampleSpec[] = [
  {
    id: 'analgwst-point3',
    title: 'ANALGWST POINT3, continuous point source',
    files: ['analgwst/point3-nodecay.json', 'analgwst/point3-decay.json'],
    referenceKey: ANALGWST_SOURCE,
    methodIds: ['groundwater.at123d'],
    compares:
      'Concentration on the printed grid at each printed time and depth, decay 0 and 0.03 per day, against the program output.',
    count: analgwstCells,
    casesUnit: 'printed concentrations',
    tolerance:
      'Half a unit in the last printed decimal: 5e-7 absolute (test bound 5.1e-7), plus 1e-9 relative.',
    status: 'reproduced',
    testFile: 'groundwater-fixtures.test.ts',
    evidence: [
      { text: '5.1e-7', count: 2 },
      { text: '1e-9,\n', count: 3 },
    ],
    readmeNeedle: 'POINT3',
  },
  {
    id: 'analgwst-patchi',
    title: 'ANALGWST PATCHI, patch source on the inflow plane',
    files: ['analgwst/patchi-nodecay.json', 'analgwst/patchi-decay.json'],
    referenceKey: ANALGWST_SOURCE,
    methodIds: ['groundwater.wexler1992'],
    compares:
      'Concentration on the printed grid at each printed time and depth, decay 0 and 0.01 per day, against the program output.',
    count: analgwstCells,
    casesUnit: 'printed concentrations',
    tolerance:
      'Half a unit in the last printed decimal: 5e-7 absolute (test bound 5.1e-7), plus 1e-9 relative.',
    status: 'reproduced',
    testFile: 'groundwater-fixtures.test.ts',
    evidence: [
      { text: '5.1e-7', count: 2 },
      { text: '1e-9,\n', count: 3 },
    ],
    readmeNeedle: 'PATCHI',
  },
  {
    id: 'analgwst-patchf',
    title: 'ANALGWST PATCHF, finite aquifer with no-flux boundaries',
    files: ['analgwst/patchf-nodecay.json', 'analgwst/patchf-decay.json'],
    referenceKey: ANALGWST_SOURCE,
    methodIds: ['groundwater.wexler1992'],
    compares:
      'Concentration on the printed grid at each printed time and depth in a 60 m wide, 10 m thick aquifer, decay 0 and 0.01 per day, against the program output.',
    count: analgwstCells,
    casesUnit: 'printed concentrations',
    tolerance:
      'Half a unit in the last printed decimal: 5e-6 absolute (test bound 5.1e-6), plus 1e-9 relative.',
    status: 'reproduced',
    testFile: 'groundwater-fixtures.test.ts',
    evidence: [
      { text: '5.1e-6', count: 1 },
      { text: '1e-9,\n', count: 3 },
    ],
    readmeNeedle: 'PATCHF',
  },
  {
    id: 'mibitrans-domenico',
    title: 'mibitrans Bioscreen, truncated Domenico solution',
    files: ['mibitrans/cases.json'],
    referenceKey: 'mibitrans',
    methodIds: ['groundwater.domenico1987'],
    compares:
      'The truncated Domenico plume concentration at sampled (x, y, t) points against the package output.',
    count: (j) => (j[0].cases.nodecay.points.length + j[0].cases.decay.points.length) as number,
    casesUnit: 'points',
    tolerance: '1e-9 absolute plus 1e-9 relative.',
    status: 'reproduced',
    testFile: 'groundwater-fixtures.test.ts',
    evidence: ['1e-9 + 1e-9 * Math.abs(p.domenico)'],
    readmeNeedle: 'Bioscreen',
  },
  {
    id: 'mibitrans-exact',
    title: 'mibitrans Mibitrans, exact patch solution',
    files: ['mibitrans/cases.json'],
    referenceKey: 'mibitrans',
    methodIds: ['groundwater.wexler1992'],
    compares:
      'The exact Wexler patch solution (no source depletion) at the same sampled points against the package output.',
    count: (j) => (j[0].cases.nodecay.points.length + j[0].cases.decay.points.length) as number,
    casesUnit: 'points',
    tolerance: '1e-10 absolute plus 1e-7 relative.',
    status: 'reproduced',
    testFile: 'groundwater-fixtures.test.ts',
    evidence: ['1e-10 + 1e-7 * Math.abs(p.exact)'],
    readmeNeedle: 'Mibitrans',
  },
  {
    id: 'ssg1996-table-a1',
    title: 'SSG 1996 Table A-1, generic soil-to-groundwater levels',
    files: ['cleanup/ssg1996-table-a1.json'],
    referenceKey: 'epa1996ssg',
    methodIds: ['cleanup.ssg-leaching'],
    compares:
      'The MCL-based generic level at DAF 20 and DAF 1 for 15 chemicals. It checks the three-phase partition formula, the DAF arithmetic and the metal Kd values; the organic Koc and H were read from Tables 36 and 39 of the document on 2026-10-21.',
    count: (j) => (j[0].chemicals.length * 2) as number,
    casesUnit: 'printed levels',
    tolerance:
      'Half a unit in the last printed digit: two significant figures from 10 up, one below 10.',
    status: 'reproduced',
    testFile: 'cleanup-ssg.test.ts',
    evidence: ['halfUnit', 'printedDaf20MgPerKg'],
    readmeNeedle: 'What this fixture validates and what it does not',
  },
  {
    id: 'rsl-tap-water-combined',
    title: 'RSL November 2024 resident tap water, combined levels',
    files: ['cleanup/rsl-2024-11-cleanup.json'],
    referenceKey: 'epa2024rsl',
    methodIds: ['cleanup.rags-e-f-2014'],
    compares:
      'The carcinogenic and child noncarcinogenic tap water levels over ingestion and bathing dermal, back-calculated by the cleanup solver. A blank cell is asserted as no level.',
    count: (j) =>
      (j[0].tapWaterCombined.cases as { cancer: unknown; noncancer: unknown }[]).reduce(
        (n, c) => n + nonNull(c.cancer) + nonNull(c.noncancer),
        0,
      ),
    casesUnit: 'published levels',
    tolerance: 'Half a unit in the second significant figure.',
    status: 'reproduced',
    testFile: 'cleanup-direct.test.ts',
    evidence: ['withinHalfUnit', 'cleanup.tapWaterCombined'],
    readmeNeedle: 'tapWaterCombined',
  },
  {
    id: 'rsl-risk-based-ssl',
    title: 'RSL November 2024 risk-based soil-to-groundwater SSL',
    files: ['cleanup/rsl-2024-11-cleanup.json'],
    referenceKey: 'epa2024rsl',
    methodIds: ['cleanup.ssg-leaching', 'cleanup.rags-e-f-2014'],
    compares:
      'The DAF 1 risk-based SSL for the six chemicals with no household-use inhalation term: the unrounded lower tap water level times the partition factor.',
    count: (j) => j[0].riskBasedSsl.cases.length as number,
    casesUnit: 'published levels',
    tolerance: 'Half a unit in the second significant figure.',
    status: 'reproduced',
    testFile: 'cleanup-rsl-ssl.test.ts',
    evidence: ['withinHalfUnit'],
    readmeNeedle: 'riskBasedSsl',
  },
  {
    id: 'r9',
    title: 'Table R-9, direct exposure pathways (page 1 of 3)',
    files: ['exposure/r9.json'],
    referenceKey: 'arcadis2001',
    methodIds: ['exposure.rags-a-1989'],
    compares:
      'Dose, cancer risk and hazard index for soil ingestion, soil dermal contact, groundwater ingestion and shower dermal contact, for four chemicals. A printed NQ is asserted as a null. The table lists no exposure inputs; the RISC4 manual values are fixture inputs for this case only, and the dermal soil rows use a back-solved product of 5,750.',
    count: (j) => leaves(j[0].targets) as number,
    casesUnit: 'printed cells',
    tolerance: 'Half a unit in the last printed digit, derived from the printed string.',
    status: 'reproduced',
    testFile: 'exposure-legacy-r9.test.ts',
    evidence: ['tolerance(printed)'],
    readmeNeedle: 'Named exception',
    note: 'This reproduces the review arithmetic and is not evidence of model accuracy.',
  },
  {
    id: 'rsl-2024-11',
    title: 'RSL November 2024, independent check of the modern method',
    files: ['exposure/rsl-2024-11.json'],
    referenceKey: 'epa2024rsl',
    methodIds: ['exposure.rags-e-f-2014'],
    compares:
      'Resident soil, composite worker soil, resident tap water and resident air screening levels at target risk 1e-6 and hazard quotient 1. A blank cell is asserted as no coefficient.',
    count: (j) =>
      (j[0].cases as { cancer: unknown; noncancer: unknown }[]).reduce(
        (n, c) => n + nonNull(c.cancer) + nonNull(c.noncancer),
        0,
      ),
    casesUnit: 'published levels',
    tolerance:
      'The engine value rounds to the published value: half a unit in the second significant figure.',
    status: 'reproduced',
    testFile: 'exposure-modern-rsl.test.ts',
    evidence: [{ text: '0.5 * unit * (1 + 1e-9)', count: 1 }],
    readmeNeedle: 'RSL independent check',
  },
  {
    id: 'rsl-2024-11-default-parameters',
    title: 'RSL November 2024 default exposure parameters',
    files: ['exposure/rsl-2024-11-default-parameters.json'],
    referenceKey: 'epa2024rsl',
    methodIds: ['exposure.rags-e-f-2014'],
    compares:
      'The modern resident and composite worker presets, the ADAF age segments and the sheet’s own age-adjusted factors.',
    count: (j) => Object.keys(j[0].ageAdjusted).length as number,
    casesUnit: 'age-adjusted factors (the preset values are compared as well)',
    tolerance: 'Equal to the printed precision of each factor (toBeCloseTo at 1 to 6 decimals).',
    status: 'reproduced',
    testFile: 'exposure-modern-presets.test.ts',
    evidence: ["a['IFWres-adj']"],
    readmeNeedle: 'Default Exposure Parameters',
  },
  {
    id: 'ssg1996-csat',
    title: 'SSG 1996 Table 3-A, soil saturation limits',
    files: ['saturatedSource/ssg1996-csat.json'],
    referenceKey: 'epa1996ssg',
    methodIds: ['saturatedSource.two-region'],
    compares: 'The soil saturation limit Csat for six chemicals with the document’s default soil.',
    count: (j) => j[0].chemicals.length as number,
    casesUnit: 'printed limits',
    tolerance:
      'Half a unit in the second printed significant figure (per-chemical bound in the file).',
    status: 'reproduced',
    testFile: 'saturated-fixtures.test.ts',
    evidence: ['toleranceMgPerKg'],
    readmeNeedle: 'Table 3-A',
  },
  {
    id: 'bioscreen-mass',
    title: 'BIOSCREEN soluble mass example',
    files: ['saturatedSource/bioscreen-mass.json'],
    referenceKey: 'newell1996',
    methodIds: ['saturatedSource.exponential'],
    compares: 'The initial soluble mass of three zones, M0 = F rho_b H_s A.',
    count: (j) => j[0].zones.length as number,
    casesUnit: 'zone masses',
    tolerance: '0.5 kg absolute (the printed masses are rounded to kg).',
    status: 'reproduced',
    testFile: 'saturated-fixtures.test.ts',
    evidence: ['absoluteKg'],
    pins: [{ path: 'tolerance.absoluteKg', value: 0.5 }],
    readmeNeedle: 'soluble mass',
  },
  {
    id: 'saturated-hand-cases',
    title: 'Saturated soil source constructed cases A and B',
    files: ['saturatedSource/hand-cases.json'],
    referenceKey: null,
    sourceText:
      'Constructed cases computed by an independent script from the equations of the methods note; not a published example.',
    methodIds: ['saturatedSource.exponential', 'saturatedSource.two-region'],
    compares:
      'Depletion times, rates and initial masses of a source with and without a separate phase and a fluctuating water table.',
    count: (j) => Object.keys(j[0].cases).length as number,
    casesUnit: 'constructed cases',
    tolerance: '1e-9 relative (arithmetic); initial mass 1e-12.',
    status: 'reproduced',
    testFile: 'saturated-release.test.ts',
    evidence: [{ text: 'toBeLessThan(1e-9)', count: 7 }],
    pins: [{ path: 'tolerance.relative', value: 1e-9 }],
    readmeNeedle: 'hand-cases.json',
    note: 'An arithmetic cross-check, not a comparison with a published value.',
  },
  {
    id: 'r8',
    title: 'Table R-8, river and lake mixing',
    files: ['surfaceWater/r8.json'],
    referenceKey: 'arcadis2001',
    methodIds: ['surfaceWater.well-mixed', 'surfaceWater.mass-discharge'],
    compares:
      'Groundwater flow, mass flux, the river and lake concentrations and the sediment concentration. The RISC4 benzene Koc is a fixture input for this case only.',
    count: (j) => (Object.keys(j[0].expected).length + j[0].cases.length) as number,
    casesUnit: 'printed values',
    tolerance: 'Half a unit in the last printed digit (0.005 mg/L, 0.005 mg/kg, 0.5 mg/d).',
    status: 'reproduced',
    testFile: 'surfacewater-r8.test.ts',
    evidence: ['r8.tolerance.concentrationMgPerL'],
    pins: [
      { path: 'tolerance.concentrationMgPerL', value: 0.005 },
      { path: 'tolerance.sedimentMgPerKg', value: 0.005 },
      { path: 'tolerance.massFluxMgPerDay', value: 0.5 },
    ],
    readmeNeedle: 'r8.json',
    note: 'The review reports exact agreement with its own hand calculation, so this reproduces arithmetic, not model accuracy.',
  },
  {
    id: 'manual-l4',
    title: 'RISC5 user’s guide Appendix L, river and lake examples',
    files: ['surfaceWater/manual-l4.json'],
    referenceKey: null,
    sourceText: 'RISC5 user’s guide, Appendix L (not a references.json record).',
    methodIds: ['surfaceWater.well-mixed'],
    compares:
      'The river (30.8 mg/L) and lake (11.7 mg/L) concentrations. The adjusted-volume lake example is not used.',
    count: (j) => j[0].cases.length as number,
    casesUnit: 'printed values',
    tolerance: 'Half a unit in the last printed digit (0.05 mg/L).',
    status: 'reproduced',
    testFile: 'surfacewater-r8.test.ts',
    evidence: ['manual.tolerance.concentrationMgPerL'],
    pins: [{ path: 'tolerance.concentrationMgPerL', value: 0.05 }],
    readmeNeedle: 'manual-l4.json',
  },
  {
    id: 'table-r2',
    title: 'Table R-2, probabilistic drinking water case',
    files: ['uncertainty/table-r2.json'],
    referenceKey: 'arcadis2001',
    methodIds: ['uncertainty.srs-exposure'],
    compares:
      'The legacy method runs the printed case with body weight, exposure duration and water ingestion sampled, and the test asserts no failed iteration and monotone, non-degenerate percentiles. The printed percentiles are recorded and not compared, because the review gives no input distributions.',
    count: () => 1,
    casesUnit: 'case run',
    tolerance: 'None. No printed value is compared.',
    status: 'smoke test only',
    testFile: 'uncertainty-runner.test.ts',
    evidence: ['smoke test'],
    readmeNeedle: 'smoke test',
    note: 'A comparison waits for sourced input distributions.',
  },
  {
    id: 'r7',
    title: 'Table R-7, vadose leaching to the water table',
    files: ['vadose/r7.json'],
    referenceKey: 'arcadis2001',
    methodIds: ['vadose.vadsat'],
    compares:
      'The source pore water concentration and the water table concentration at 10 years (mean of the twelve month-end values of year 10). Benzene properties are RISC4 values used for this case only.',
    count: (j) => Object.keys(j[0].targets).length as number,
    casesUnit: 'printed values',
    tolerance: '1 percent (source pore water) and 3 percent (water table) relative.',
    status: 'reproduced',
    testFile: 'vadose-r7.test.ts',
    evidence: ['relativeTolerance'],
    pins: [
      { path: 'targets.sourcePoreWaterMgPerL.relativeTolerance', value: 0.01 },
      { path: 'targets.waterTableYear10MeanMgPerL.relativeTolerance', value: 0.03 },
    ],
    readmeNeedle: 'ill-conditioned',
    note: 'The water table value is ill-conditioned (5 percent on Koc moves it about 25 percent), so this reproduces the review arithmetic and is not evidence of model accuracy.',
  },
  {
    id: 'vga1982-a1',
    title: 'van Genuchten and Alves 1982 Table 6, program A1 output',
    files: ['vadose/vga1982-a1.json'],
    referenceKey: 'vangenuchten1982',
    methodIds: ['vadose.vadsat', 'vadose.layered'],
    compares:
      'Concentration against distance at five times for the first-type and third-type inlets, without decay or depletion.',
    count: (j) =>
      (j[0].times.length * j[0].distances.length * 2 -
        j[0].namedExceptions.points.length) as number,
    casesUnit: 'printed values',
    tolerance: '5e-5 absolute (four decimals as printed).',
    status: 'reproduced',
    testFile: 'vadose-legacy.test.ts',
    evidence: ['vga.absTolerance'],
    pins: [{ path: 'absTolerance', value: 5e-5 }],
    readmeNeedle: 'namedExceptions',
    note: 'One first-type value (t = 10, x = 14) has a degraded printed glyph and is entered as the closed form reads it.',
  },
  {
    id: 'risc-r3-r5',
    title: 'Tables R-3, R-4 and R-5, vapor intrusion',
    files: ['vapor/risc-r3-r5.json'],
    referenceKey: 'arcadis2001',
    methodIds: ['vapor.je-1991', 'vapor.dominant-layer-1998'],
    compares:
      'Soil to indoor air with and without TPH (R-3), the dominant layer with degradation (R-4) and groundwater to indoor air (R-5). The independent column of R-3 is recorded, not asserted.',
    // R-3 cases A and B, the R-4 source vapor, indoor and soil-gas entry values, and the R-5 indoor value
    count: (j) =>
      (Object.keys(j[0].r3).filter((k) => k.startsWith('case')).length +
        ['sourceVaporMgPerM3', 'indoorMgPerM3', 'indoorFromSoilGasMgPerM3'].filter(
          (k) => j[0].r4[k] !== undefined,
        ).length +
        (j[0].r5.riscMgPerM3 !== undefined ? 1 : 0)) as number,
    casesUnit: 'printed results',
    tolerance:
      '0.5 percent of the RISC value (the test asserts it seven times: the six printed results and a second run of R-3 case A without degradation).',
    status: 'reproduced',
    testFile: 'vapor-legacy.test.ts',
    evidence: [{ text: 'toBeLessThan(0.005)', count: 7 }],
    readmeNeedle: 'Tolerance 0.5 percent',
  },
  {
    id: 'table-r6',
    title: 'Table R-6, groundwater to outdoor air',
    files: ['vapor/risc-r3-r5.json'],
    referenceKey: 'arcadis2001',
    methodIds: ['outdoorAir.box'],
    compares:
      'The printed 2.27e-3 mg/m^3 equals the indoor result of Table R-5 to three figures and no box reading reproduces it (the box gives 2.54e-6 mg/m^3). It is treated as a transcription error in the review. The box hand value is asserted instead.',
    count: () => 1,
    casesUnit: 'printed value',
    tolerance:
      'The box hand value at 1e-9 relative; the printed value is never widened into a tolerance.',
    status: 'named exception',
    testFile: 'outdoor-air.test.ts',
    evidence: ['Table R-6 column', { text: 'toBeLessThan(1e-9)', count: 2 }],
    readmeNeedle: 'Named exception: Table R-6',
    note: 'Not reproduced; the printed value is believed to be a transcription error.',
  },
  {
    id: 'appendix-j',
    title: 'RISC5 user’s guide Appendix J, layered vapor example',
    files: ['vapor/appendix-j.json'],
    referenceKey: null,
    sourceText: 'RISC5 user’s guide, Appendix J (not a references.json record).',
    methodIds: ['vapor.dominant-layer-1998'],
    compares:
      'The normalized concentration at the top of layer 1 for the base, dry and wet cases. The values are stated in prose from figures, so they are figure readings.',
    count: (j) => Object.keys(j[0].normalizedAtTopOfLayer1).length as number,
    casesUnit: 'figure readings',
    tolerance: '0.01 absolute.',
    status: 'reproduced',
    testFile: 'vapor-legacy.test.ts',
    evidence: [
      { text: 'toBeLessThan(0.01)', count: 2 },
      { text: 'toBeLessThan(\n      0.01,\n    )', count: 1 },
    ],
    pins: [{ path: 'toleranceAbsolute', value: 0.01 }],
    readmeNeedle: 'figure readings',
  },
  {
    id: 'epa2004-sl-adv',
    title: 'EPA 2004 Appendix C, SL-ADV benzene worked example',
    files: ['vapor/epa2004-sl-adv.json'],
    referenceKey: 'epa2004je',
    methodIds: ['vapor.je-epa'],
    compares:
      'Printed intermediate and final values of the spreadsheet example: building geometry, ventilation, permeability, effective diffusion, source vapor, and the mass-limited building concentration.',
    count: (j, test) => Object.keys(j[0].printed).filter((k) => test.includes(`p.${k}`)).length,
    casesUnit: 'printed values',
    tolerance:
      'Half a unit in the last printed digit of each value (the test derives it from the printed string).',
    status: 'reproduced',
    testFile: 'vapor-epa-je.test.ts',
    evidence: ['expectPrinted', 'halfUnit'],
    readmeNeedle: 'epa2004-sl-adv.json',
  },
  {
    id: 'eco-wildlife-ecossl',
    title: 'Eco-SSL wildlife derivation, cadmium and lead surrogate rows',
    files: [],
    referenceKey: 'epaecossl',
    methodIds: ['eco.ecossl-2005'],
    compares:
      'The soil concentration at which the wildlife hazard quotient is 1, back-calculated from the transcribed derivation inputs of the printed surrogate rows, against the printed wildlife Eco-SSL. Avian (dove, woodcock, hawk) and mammalian (vole, shrew, weasel) surrogates for cadmium and lead.',
    count: (_j, test) =>
      (test.match(/^\s*\['(?:cadmium|lead)', '(?:avian|mammalian)', '/gm) ?? []).length,
    casesUnit: 'printed surrogate values',
    tolerance: '5 percent relative (a ruling, DECISIONS.md entry 10 of the Eco-SSL milestone).',
    status: 'reproduced',
    testFile: 'eco-screening.test.ts',
    evidence: [{ text: 'rel(got, printed)).toBeLessThan(0.05)', count: 1 }],
    note: 'The derivation inputs come from the transcribed Eco-SSL data, so this checks the back-calculation arithmetic against the printed values, not the inputs.',
  },
  {
    id: 'eco-wildlife-guild',
    title: 'Eco-SSL wildlife guild values, cadmium mammalian and lead avian',
    files: [],
    referenceKey: 'epaecossl',
    methodIds: ['eco.ecossl-2005'],
    compares:
      'The smallest surrogate value of the guild against the printed guild Eco-SSL: 0.36 mg/kg for cadmium (mammalian) and 11 mg/kg for lead (avian).',
    count: () => 2,
    casesUnit: 'printed guild values',
    tolerance: '5 percent relative (the same ruling as the surrogate rows).',
    status: 'reproduced',
    testFile: 'eco-screening.test.ts',
    evidence: [
      { text: 'toBeLessThan(\n      0.05,\n    )', count: 1 },
      { text: "'hawk']), 11)).toBeLessThan(0.05)", count: 1 },
    ],
  },
  {
    id: 'ssg1996-default-pef',
    title: 'SSG 1996 default particulate emission factor',
    files: [],
    referenceKey: 'epa1996ssg',
    methodIds: ['particulate.ssg-pef-1996'],
    compares: 'The default PEF of 1.32E9 m^3/kg from the printed wind erosion inputs.',
    count: () => 1,
    casesUnit: 'printed value',
    tolerance: 'Equal to the printed three significant figures (1.32e9).',
    status: 'reproduced',
    testFile: 'particulate.test.ts',
    evidence: [
      { text: 'toBeCloseTo(1.3162, 3)', count: 1 },
      { text: 'toBe(1.32e9)', count: 1 },
    ],
  },
  {
    id: 'ssg2002-default-pef',
    title: 'SSG 2002 default particulate emission factor',
    files: [],
    referenceKey: 'epa2002ssg',
    methodIds: ['particulate.ssg-pef-2002'],
    compares: 'The default PEF of 1.36E9 m^3/kg with Q/C 93.77.',
    count: () => 1,
    casesUnit: 'printed value',
    tolerance: 'Equal to the printed three significant figures (1.36e9).',
    status: 'reproduced',
    testFile: 'particulate.test.ts',
    evidence: [{ text: 'toBe(1.36e9)', count: 1 }],
  },
  {
    id: 'nrwqc-zinc-hardness',
    title: 'NRWQC zinc criteria at a hardness of 100 mg/L',
    files: [],
    referenceKey: 'epanrwqc',
    methodIds: [],
    compares:
      'The hardness-dependent acute and chronic freshwater zinc criteria computed from the Appendix B slope, intercept and conversion factor against the published 117.2 and 118.1 ug/L.',
    count: () => 2,
    casesUnit: 'published criteria',
    tolerance:
      'Within 0.5 ug/L (toBeCloseTo at zero decimals), and the acute value rounds to 120 at two significant figures.',
    status: 'reproduced',
    testFile: 'surfacewater-criteria.test.ts',
    evidence: [
      { text: 'toBeCloseTo(117.2, 0)', count: 1 },
      { text: 'toBeCloseTo(118.1, 0)', count: 1 },
    ],
  },
  {
    id: 'r7-theta',
    title: 'Table R-7, unit-gradient moisture content',
    files: [],
    referenceKey: 'arcadis2001',
    methodIds: ['vadose.vadsat'],
    compares:
      'The moisture content that carries 20 cm/yr in the vadose soil (theta 0.0885) and in the lens (theta 0.2031) with the Brooks and Corey relative permeability.',
    count: () => 2,
    casesUnit: 'printed values',
    tolerance: '1e-4 absolute (four decimals as printed).',
    status: 'reproduced',
    testFile: 'vadose-hydraulics.test.ts',
    evidence: [
      { text: 'r.theta - 0.0885)).toBeLessThan(1e-4)', count: 1 },
      { text: 'r.theta - 0.2031)).toBeLessThan(1e-4)', count: 1 },
    ],
  },
  {
    id: 'epa2004-henry-temperature',
    title: 'EPA 2004 Appendix C, benzene Henry constant at the system temperature',
    files: [],
    referenceKey: 'epa2004je',
    methodIds: ['vapor.je-epa'],
    compares:
      'The enthalpy of vaporization at 10 degrees C (8,122 cal/mol), the Henry constant (2.68e-3 atm m^3/mol) and the dimensionless constant (0.115) of the spreadsheet example.',
    count: () => 3,
    casesUnit: 'printed values',
    tolerance:
      'The printed digits: the enthalpy rounds to the integer, the two constants to three significant figures. The unrounded values are pinned to 1e-9 relative.',
    status: 'reproduced',
    testFile: 'vapor-source.test.ts',
    evidence: [
      { text: 'toBe(8122)', count: 1 },
      { text: 'toBe(2.68e-3)', count: 1 },
      { text: 'toBe(0.115)', count: 1 },
    ],
  },
];

export const validationCatalog: CatalogInput = {
  examples: [...examples, ...sweepExamples, ...vislExamples],
  derived: (read) => {
    const out: ExampleSpec[] = [];
    const r9 = read('exposure/r9.json');
    for (const e of r9.namedExceptions as { row: string; reason: string; decision: string }[]) {
      out.push({
        id: `r9-exception-${slug(e.row)}`,
        title: `Table R-9, ${e.row}`,
        files: ['exposure/r9.json'],
        referenceKey: 'arcadis2001',
        methodIds: ['shower.fc-1986'],
        compares: e.reason,
        count: () => 1,
        casesUnit: 'row',
        tolerance: 'Not compared. Checked by identities and hand cases instead.',
        status: 'named exception',
        testFile: R9_ROW_TEST,
        evidence: [{ text: `namedExceptions.map((e) => e.row)).toEqual(['${e.row}'])`, count: 1 }],
        readmeNeedle: 'Named exception',
        note: `Ruling recorded in ${e.decision}.`,
      });
    }
    for (const d of r9.deferred as string[]) {
      out.push({
        id: `r9-deferred-${slug(d)}`,
        title: `Table R-9, ${d}`,
        files: ['exposure/r9.json'],
        referenceKey: 'arcadis2001',
        methodIds: ['plantUptake.trapp-matthies-1995'],
        compares: 'The root vegetable ingestion row of the page-1 table is not reproduced yet.',
        count: () => 1,
        casesUnit: 'row',
        tolerance: 'Not compared yet.',
        status: 'pending or deferred',
        testFile: R9_ROW_TEST,
        evidence: [{ text: `r9.deferred).toEqual(['${d}'])`, count: 1 }],
        readmeNeedle: 'Row deferred',
      });
    }
    const vga = read('vadose/vga1982-a1.json');
    out.push({
      id: 'vga1982-a1-exceptions',
      title: 'van Genuchten and Alves 1982 Table 6, eight named exceptions',
      files: ['vadose/vga1982-a1.json'],
      referenceKey: 'vangenuchten1982',
      methodIds: ['vadose.vadsat', 'vadose.layered'],
      compares:
        'Eight printed values the 1982 program evidently evaluated slightly differently at large x and t: first-type t = 5, x = 18 and seven third-type points. Each is asserted at the widened bound, and the other values stay at 5e-5.',
      count: () => (vga.namedExceptions.points as unknown[]).length,
      casesUnit: 'printed values',
      tolerance: `${String(vga.namedExceptions.absTolerance)} absolute, by name (ruling in ${String(vga.namedExceptions.source)}).`,
      status: 'named exception',
      testFile: 'vadose-layered.test.ts',
      evidence: [{ text: '1.5e-4', count: 3 }],
      pins: [{ path: 'namedExceptions.absTolerance', value: 1.5e-4 }],
      readmeNeedle: 'namedExceptions',
      note: 'The closed form agrees with the printed values only to 1.5e-4 at these points.',
    });
    return out;
  },
  defaults: [
    {
      id: 'shower-film-reference',
      scope: 'warning',
      subject: 'Foster and Chrostowski film reference coefficients (3000 cm/h gas, 20 cm/h liquid)',
      methodIds: ['shower.fc-1986'],
      warningCode: 'shower.film-reference-unverified',
      referenceKey: 'foster1986',
      note: 'RISC5 choices that could not be verified against the primary paper; they are inputs and the defaults are warned. The stagnant stall source is a planned, unverified record and is not cited.',
      where: {
        file: 'packages/engine/src/processes/shower/droplet.ts',
        needle: 'could not be verified against the primary paper',
      },
    },
    {
      id: 'shower-little-1992-balance',
      scope: 'method',
      subject: 'Little (1992) two-resistance stall mass balance',
      methodIds: ['shower.little-1992'],
      warningCode: null,
      referenceKey: 'little1992',
      note: 'The mass balance is our statement of the two-resistance theory, checked by limit identities; it is not a transcription of the paper.',
      where: {
        file: 'packages/engine/src/processes/shower/methods.ts',
        needle: 'our statement of the two-resistance theory',
      },
    },
    {
      id: 'shower-household-k',
      scope: 'warning',
      subject: 'Household transfer factor K (RSL whole-house water-to-air term)',
      methodIds: ['shower.rsl-household'],
      warningCode: 'shower.household-factor-unverified',
      referenceKey: 'epa2024rslug',
      note: "An entered value, not verified against a primary page of the RSL documentation. Table 1 of the archived RSL User's Guide (19january2021snapshot.epa.gov/risk/regional-screening-levels-rsls-users-guide_.html, read 2026-10-21) lists K, the Andelman volatilization factor, as 0.5 L/m3, citing U.S. EPA 1991b (pg. 20). The page prints its equations as images, so the form (C_a = C_w K) was not read from it. Numerically, K = 0.5 reproduces all 265 tap water inhalation levels of the RSL November 2024 table (the resident air level divided by K; the two trichloroethylene and vinyl chloride cancer cells reproduce through the RSL equations for those chemicals, which the modern exposure method applies; see the tap water sweep above). That is consistency with the published table, not verification from a primary source, so the warning stays.",
      where: {
        file: 'packages/engine/src/processes/shower/household.ts',
        needle: 'it reproduces all 265 tap water inhalation screening levels',
      },
    },
    {
      id: 'plant-hhrap-fallback',
      scope: 'method',
      subject: 'HHRAP fallback standing in for Trapp (2015)',
      methodIds: ['plantUptake.hhrap-2005'],
      warningCode: null,
      referenceKey: 'trapp2015',
      note: 'The modern plant model is the EPA HHRAP 2005 produce equations until the Trapp (2015) models are read.',
      where: {
        file: 'packages/engine/src/processes/plantUptake/index.ts',
        needle: 'fallback for the modern plant model',
      },
    },
    {
      id: 'plant-tscf-leaf-air',
      scope: 'method',
      subject:
        'Transpiration stream concentration factor (TSCF) and leaf-air partition coefficient',
      methodIds: ['plantUptake.trapp-matthies-1995'],
      warningCode: null,
      referenceKey: 'trappmatthies1995',
      note: 'User inputs, because their published regressions were not read.',
      where: {
        file: 'packages/engine/src/processes/plantUptake/index.ts',
        needle: 'their published regressions were not read',
      },
    },
    {
      id: 'plant-briggs-rcf',
      scope: 'method',
      subject: 'Briggs root concentration factor constants',
      methodIds: ['plantUptake.trapp-matthies-1995', 'plantUptake.hhrap-2005'],
      warningCode: null,
      referenceKey: 'briggs1982',
      note: "The constants 0.77 and -1.52 were read in the paper itself on 2026-10-21 (Pestic. Sci. 13, 495-504, open copy in the Rothamsted repository, page 500, Equations 1 and 2; the TSCF equation is on page 502). The engine's form drops the paper's 0.82 term above log Kow 2, as the HHRAP appendix does: Equation 1 is the macerated-root line, and Equation 2 adds 0.82 to the root concentration factor at every log Kow.",
      where: {
        file: 'packages/engine/src/processes/plantUptake/index.ts',
        needle: 'The root factor constants are those the HHRAP appendix prints',
      },
    },
    {
      id: 'dispersivity-schulze-makuch',
      scope: 'method',
      subject: 'Schulze-Makuch (2005) dispersivity coefficients',
      methodIds: ['dispersivity.schulze-makuch2005'],
      warningCode: null,
      referenceKey: 'schulzemakuch2005',
      note: 'The unconsolidated-media pair c = 0.20, m = 0.44 is quoted from lecture notes that cite the paper, not from the paper’s own tables.',
      where: {
        file: 'packages/engine/src/processes/dispersivity/index.ts',
        needle: 'is quoted from a secondary source',
      },
    },
    {
      id: 'gelhar-vadose-regression',
      scope: 'warning',
      subject: 'Gelhar et al. (1985) two-branch vadose dispersivity regression',
      methodIds: ['vadose.vadsat', 'vadose.layered'],
      warningCode: 'vadose.dispersivity-regression-unsourced',
      referenceKey: 'gelhar1985',
      note: 'The coefficients have no primary source located: the EPRI report (EA-4190, full text read 2026-10-21) prints no regression equation, only field data and a plot against scale. They come from RISC5’s statement of its choice. The reference stays cited for the field data compilation it does contain.',
      where: {
        file: 'packages/engine/src/processes/vadose/dispersivity.ts',
        needle: 'has no primary source located',
      },
    },
    {
      id: 'gelhar-saturated-log-quadratic',
      scope: 'warning',
      subject: 'Gelhar et al. (1985) saturated-zone log-quadratic dispersivity regression',
      methodIds: ['dispersivity.gelhar1985-api1987'],
      warningCode: 'dispersivity.regression-unsourced',
      referenceKey: 'gelhar1985',
      note: 'The coefficients of ln(aL) = -3.795 + 1.774 ln x - 0.093 (ln x)^2 have no primary source located: the EPRI report (EA-4190) prints no regression equation, only field data and a plot against scale. They come from RISC5’s statement of its choice. The reference stays cited for the field data compilation it does contain.',
      where: {
        file: 'packages/engine/src/processes/dispersivity/index.ts',
        needle: 'The saturated-zone log-quadratic has no primary source located',
      },
    },
    {
      id: 'ssg-table-a1-koc-h',
      scope: 'method',
      subject: 'Organic Koc and H of the SSG 1996 Table A-1 fixture',
      methodIds: ['cleanup.ssg-leaching'],
      warningCode: null,
      referenceKey: 'epa1996ssg',
      note: "The nine organic Koc values (Table 39, calculated Koc) and H (Table 36, dimensionless) were read from the primary document on 2026-10-21 and match, after correcting PCE H to 0.754. Table C-1 of the User's Guide and the inorganic Kd values were not re-read.",
      where: {
        file: 'packages/engine/test/fixtures/cleanup/README.md',
        needle: 'were checked on 2026-10-21',
      },
    },
  ],
  notChecked: [
    {
      subject: 'RSL soil inhalation cells',
      note: 'The soil inhalation levels of the RSL tables (435 cells each for resident and industrial soil) and the soil totals that include them (another 435 each) are not checked: they rest on the RSL volatilization and particulate emission factors, which the November 2024 sweep does not compute. The sweeps check tap water inhalation and the industrial air levels; the 30-case independent check does not. The benzo(a)pyrene tap water dermal value is omitted by the RSL and has no case.',
      where: {
        file: 'packages/engine/test/fixtures/exposure/README.md',
        needle: 'Tap-water inhalation, soil inhalation',
      },
    },
    {
      subject: 'RSL sweep cells that do not reproduce',
      note: 'Unexplained: the tap water total cancer level of Aroclor 1242, 1248, 1254 and 1260 (printed 0.0078 ug/L, computed 0.007852 ug/L; no reason found). Excepted with a reason: lead (key G, no toxicity value in the database) and refractory ceramic fibers (key G, database value in fibers). The counts are in the sweep entries above.',
      where: {
        file: 'packages/engine/test/fixtures/rsl-sweep/README.md',
        needle: 'Aroclor 1242, 1248, 1254 and 1260',
      },
    },
    {
      subject: 'DeVaull (2007) vapor model',
      note: 'No published numeric example could be verified, so the model rests on identities and hand cases built from independent closed forms. There is no fixture file.',
      where: {
        file: 'packages/engine/test/fixtures/vapor/README.md',
        needle: 'DeVaull 2007: no published numeric fixture',
      },
    },
    {
      subject: 'Table R-9 pages 2 and 3',
      note: 'The RISC5 guide reproduces only page 1 of the three pages, so the other rows cannot be checked.',
      where: {
        file: 'packages/engine/test/fixtures/exposure/README.md',
        needle: 'Pages 2 and 3 are not available',
      },
    },
  ],
};

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
