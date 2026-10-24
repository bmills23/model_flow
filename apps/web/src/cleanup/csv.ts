import type { Medium } from '@model-flow/engine';
import type { CsvColumn, CsvRow } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import { PATHWAY_LABELS } from '../risk/chartData';
import { FROM_SI, MEDIUM_UNIT } from './build';
import type { CleanupOutcome } from './compute';
import type { ModeledOutcome } from './modeledTypes';
import { NOT_REACHED, summarizeModeledLevels, type SavedModeledLevels } from './modeledLevels';
import { solubilityFlag, type SolubilityCeiling } from './solubility';
import type { SsgRow } from './ssg';
import type { TphRiskFeed } from '../plantsEco/feeds';

export const CLEANUP_METHOD_IDS = {
  legacy: 'cleanup.rags-b-1991',
  modern: 'cleanup.rags-e-f-2014',
} as const;
export const MODELED_METHOD_ID = 'cleanup.modeled-chains';
export const SSG_METHOD_ID = 'cleanup.ssg-leaching';

type Method = keyof typeof CLEANUP_METHOD_IDS;
const METHODS: readonly Method[] = ['modern', 'legacy'];

const scaled = (si: number | null, medium: Medium): number | null =>
  si === null ? null : si * FROM_SI(medium);

/* ---------------------------------------------------------------- direct cleanup levels */

const LEVEL_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'medium', header: 'medium' },
  { key: 'unit', header: 'unit' },
  { key: 'chemical', header: 'chemical' },
  { key: 'level', header: 'cleanup level' },
  { key: 'limiting', header: 'limiting endpoint' },
  { key: 'cancerLevel', header: 'cancer level' },
  { key: 'noncancerLevel', header: 'noncancer level' },
  { key: 'group', header: 'noncancer group' },
  { key: 'receptor', header: 'limiting receptor' },
  { key: 'solubility', header: 'above the solubility' },
  { key: 'note', header: 'not quantified because' },
];

/** Why a cleanup level cell is empty: the same words the cleanup screen's "Not quantified" panel uses. */
export const LEVEL_GAP = {
  none: 'no toxicity value for any switched-on pathway of this medium',
  noneCumulative:
    'no toxicity value for any switched-on pathway of this medium, or no concentration entered (blank or zero) in this medium; with cumulative allocation it has no level, which is not the same as a required level of zero',
  noCancer: 'no cancer endpoint; the level rests on the noncancer endpoint alone',
  noNoncancer: 'no noncancer endpoint; the level rests on the cancer endpoint alone',
  noCancerRoute: 'no cancer toxicity value for this route',
  noNoncancerRoute: 'no noncancer toxicity value for this route',
} as const;

const PATHWAY_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'medium', header: 'medium' },
  { key: 'unit', header: 'unit' },
  { key: 'chemical', header: 'chemical' },
  { key: 'receptor', header: 'receptor' },
  { key: 'pathway', header: 'pathway' },
  { key: 'cancerLevel', header: 'cancer level' },
  { key: 'noncancerLevel', header: 'noncancer level' },
  { key: 'note', header: 'not quantified because' },
];

export function cleanupLevelRows(
  outcome: CleanupOutcome,
  names: Record<string, string>,
  ceilingOf: (chemicalId: string) => SolubilityCeiling | null = () => null,
): CsvRow[] {
  return METHODS.flatMap((m) => {
    const o = outcome[m];
    if (!o.ok) return [];
    return o.result.media.flatMap((r) =>
      r.levels.map((lv) => ({
        method: CLEANUP_METHOD_IDS[m],
        medium: r.medium,
        unit: MEDIUM_UNIT(r.medium),
        chemical: names[lv.chemical] ?? lv.chemical,
        level: scaled(lv.level, r.medium),
        limiting: lv.limiting,
        cancerLevel: scaled(lv.cancerLevel, r.medium),
        noncancerLevel: scaled(lv.noncancerLevel, r.medium),
        group: lv.noncancerGroup,
        receptor: lv.limitingReceptor,
        // a groundwater level is a dissolved concentration, so it is held against the solubility
        solubility:
          r.medium === 'groundwater' && lv.level !== null
            ? (solubilityFlag(
                names[lv.chemical] ?? lv.chemical,
                lv.level * FROM_SI('groundwater'),
                ceilingOf(lv.chemical),
              ) ?? '')
            : '',
        note:
          lv.level === null
            ? `no level: ${r.allocation === 'cumulative' ? LEVEL_GAP.noneCumulative : LEVEL_GAP.none}`
            : lv.cancerLevel === null
              ? `cancer level: ${LEVEL_GAP.noCancer}`
              : lv.noncancerLevel === null
                ? `noncancer level: ${LEVEL_GAP.noNoncancer}`
                : '',
      })),
    );
  });
}

export function cleanupPathwayRows(
  outcome: CleanupOutcome,
  names: Record<string, string>,
): CsvRow[] {
  return METHODS.flatMap((m) => {
    const o = outcome[m];
    if (!o.ok) return [];
    return o.result.media.flatMap((r) =>
      r.levels.flatMap((lv) =>
        lv.byReceptor.flatMap((rc) =>
          rc.byPathway.map((p) => ({
            method: CLEANUP_METHOD_IDS[m],
            medium: r.medium,
            unit: MEDIUM_UNIT(r.medium),
            chemical: names[lv.chemical] ?? lv.chemical,
            receptor: rc.label,
            pathway: PATHWAY_LABELS[p.pathway],
            cancerLevel: scaled(p.cancerLevel, r.medium),
            noncancerLevel: scaled(p.noncancerLevel, r.medium),
            note: [
              p.cancerLevel === null ? `cancer level: ${LEVEL_GAP.noCancerRoute}` : '',
              p.noncancerLevel === null ? `noncancer level: ${LEVEL_GAP.noNoncancerRoute}` : '',
            ]
              .filter((t) => t !== '')
              .join('; '),
          })),
        ),
      ),
    );
  });
}

export function cleanupCsvTables(
  outcome: CleanupOutcome,
  names: Record<string, string>,
  ceilingOf: (chemicalId: string) => SolubilityCeiling | null = () => null,
): CsvTable[] {
  return [
    {
      name: 'cleanup-levels',
      editions: ['rsl'],
      label: 'cleanup levels',
      rows: cleanupLevelRows(outcome, names, ceilingOf),
      columns: LEVEL_COLUMNS,
      missing: { keys: ['level', 'cancerLevel', 'noncancerLevel'], because: 'note' },
    },
    {
      name: 'cleanup-pathways',
      editions: ['rsl'],
      label: 'each pathway alone',
      rows: cleanupPathwayRows(outcome, names),
      columns: PATHWAY_COLUMNS,
      missing: { keys: ['cancerLevel', 'noncancerLevel'], because: 'note' },
    },
  ];
}

/* ---------------------------------------------------------------- modeled cleanup levels */

const MODELED_METHODS = ['modern', 'legacy'] as const;

function modeledResultColumns(medium: ModeledOutcome['medium']): CsvColumn[] {
  const unit = MEDIUM_UNIT(medium);
  return [
    { key: 'method', header: 'method' },
    { key: 'basis', header: 'factor set' },
    { key: 'chemical', header: 'chemical' },
    { key: 'level', header: 'cleanup level', unit },
    { key: 'limiting', header: 'limiting endpoint' },
    { key: 'cancerLevel', header: 'cancer level', unit },
    { key: 'noncancerLevel', header: 'noncancer level', unit },
    { key: 'endpoint', header: 'target endpoint' },
    { key: 'target', header: 'target value', unit: 'risk, hazard index or mg/L' },
    { key: 'impliedTph', header: 'implied TPH', unit: 'mg/kg' },
    { key: 'solvedBy', header: 'solved by' },
    { key: 'evaluations', header: 'forward runs' },
    { key: 'residual', header: 'residual', unit: '-' },
    { key: 'transport', header: 'transport method' },
    { key: 'solubility', header: 'above the solubility' },
    { key: 'note', header: 'not quantified because' },
  ];
}

function modeledCurveColumns(medium: ModeledOutcome['medium']): CsvColumn[] {
  return [
    { key: 'method', header: 'method' },
    { key: 'basis', header: 'factor set' },
    { key: 'chemical', header: 'chemical' },
    { key: 'conc', header: 'source concentration', unit: MEDIUM_UNIT(medium) },
    { key: 'cancer', header: 'cancer risk', unit: '-' },
    { key: 'hi', header: 'hazard index', unit: '-' },
    { key: 'peak', header: 'averaged peak at the well', unit: 'mg/L' },
  ];
}

function modeledRuns(outcome: ModeledOutcome) {
  return MODELED_METHODS.flatMap((m) => {
    const o = outcome[m];
    return o?.ok ? [{ m, run: o.run }] : [];
  });
}

/**
 * The rows of the modeled levels table from what a project keeps of a solve (`SavedModeledLevels`), which
 * is also what the cleanup screen's own table is made from, so the screen file and the report print the
 * same rows. A level that is not reached is an empty cell with its reason in the note column, never zero;
 * a dissolved level above the chemical's solubility says so in its own column.
 */
export function savedLevelRows(
  entry: SavedModeledLevels,
  ceiling: SolubilityCeiling | null = null,
): CsvRow[] {
  const medium = entry.medium;
  return MODELED_METHODS.flatMap((m) => {
    const o = entry.methods[m];
    if (o === undefined || !o.ok) return [];
    const conc = o.endpoint === 'concentration';
    const mgL = medium === 'groundwater' && o.level !== null ? o.level * FROM_SI(medium) : null;
    return [
      {
        method: MODELED_METHOD_ID,
        basis: m,
        chemical: entry.chemical,
        level: scaled(o.level, medium),
        limiting: o.limiting,
        cancerLevel: scaled(o.cancerLevel, medium),
        noncancerLevel: scaled(o.noncancerLevel, medium),
        endpoint: o.endpoint,
        target: conc ? o.target * 1e3 : o.target,
        impliedTph: scaled(o.impliedTph, 'soil'),
        solvedBy: o.solvedBy,
        evaluations: o.evaluations,
        residual: o.residual,
        transport: o.transport,
        solubility: solubilityFlag(entry.chemical, mgL, ceiling) ?? '',
        note:
          o.level === null
            ? NOT_REACHED
            : o.cancerLevel === null
              ? `cancer level: ${LEVEL_GAP.noCancer}`
              : o.noncancerLevel === null
                ? `noncancer level: ${LEVEL_GAP.noNoncancer}`
                : '',
      },
    ];
  });
}

export function modeledResultRows(
  outcome: ModeledOutcome,
  chemicalName: string,
  ceiling: SolubilityCeiling | null = null,
): CsvRow[] {
  return savedLevelRows(
    summarizeModeledLevels(outcome, {
      chemicalId: '',
      chemical: chemicalName,
      fingerprint: '',
      source: 'dissolved',
      notes: [],
    }),
    ceiling,
  );
}

export function modeledCurveRows(outcome: ModeledOutcome, chemicalName = ''): CsvRow[] {
  const medium = outcome.medium;
  return modeledRuns(outcome).flatMap(({ m, run }) =>
    run.curve.conc.map((c, i) => ({
      method: MODELED_METHOD_ID,
      basis: m,
      chemical: chemicalName,
      conc: c * FROM_SI(medium),
      cancer: run.curve.cancer[i],
      hi: run.curve.hi[i],
      peak: run.curve.peak[i] === null ? null : run.curve.peak[i]! * 1e3,
    })),
  );
}

/** The modeled levels table alone, for a project's saved levels (the curve is not kept). */
export function savedLevelsTable(
  entry: SavedModeledLevels,
  ceiling: SolubilityCeiling | null = null,
): CsvTable {
  return {
    name: 'cleanup-modeled-levels',
    editions: ['rsl'],
    label: 'modeled level',
    rows: savedLevelRows(entry, ceiling),
    columns: modeledResultColumns(entry.medium),
    missing: MODELED_MISSING,
  };
}

const MODELED_MISSING = {
  keys: ['level', 'cancerLevel', 'noncancerLevel'],
  because: 'note',
} as const;

export function modeledCsvTables(
  outcome: ModeledOutcome,
  chemicalName: string,
  ceiling: SolubilityCeiling | null = null,
): CsvTable[] {
  return [
    {
      name: 'cleanup-modeled-levels',
      editions: ['rsl'],
      label: 'modeled level',
      rows: modeledResultRows(outcome, chemicalName, ceiling),
      columns: modeledResultColumns(outcome.medium),
      missing: MODELED_MISSING,
    },
    {
      name: 'cleanup-modeled-curve',
      editions: ['rsl'],
      label: 'metric curve',
      rows: modeledCurveRows(outcome, chemicalName),
      columns: modeledCurveColumns(outcome.medium),
    },
  ];
}

/**
 * The tables of a modeled run over several chemicals: the two tables of each chemical, solved and
 * named on its own (a file per chemical, so each carries only its own stale marks). One chemical gives
 * the plain tables; with several, each table name carries the chemical id and its label the chemical name.
 */
export function modeledCsvTablesAll(
  entries: readonly {
    id: string;
    name: string;
    outcome: ModeledOutcome;
    ceiling?: SolubilityCeiling | null;
  }[],
): (CsvTable & { chemicalId: string })[] {
  // each table carries the id of the chemical it was made for, so a caller never has to infer it
  // from the position of the table
  if (entries.length === 1) {
    const e = entries[0]!;
    return modeledCsvTables(e.outcome, e.name, e.ceiling ?? null).map((t) => ({
      ...t,
      chemicalId: e.id,
    }));
  }
  return entries.flatMap((e) =>
    modeledCsvTables(e.outcome, e.name, e.ceiling ?? null).map((t) => ({
      ...t,
      name: `${t.name}-${e.id}`,
      label: `${t.label}, ${e.name}`,
      chemicalId: e.id,
    })),
  );
}

/* ---------------------------------------------------------------- soil screening leaching */

const SSG_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'chemical', header: 'chemical' },
  { key: 'level', header: 'soil level', unit: 'mg/kg' },
  { key: 'governs', header: 'governed by' },
  { key: 'partition', header: 'partition level', unit: 'mg/kg' },
  { key: 'massLimit', header: 'mass-limit level', unit: 'mg/kg' },
  { key: 'target', header: 'groundwater target before the DAF', unit: 'ug/L' },
  { key: 'daf', header: 'dilution attenuation factor', unit: '-' },
  { key: 'leachate', header: 'leachate concentration', unit: 'ug/L' },
  { key: 'mixingDepth', header: 'mixing-zone depth', unit: 'm' },
  { key: 'note', header: 'not computed because' },
];

export function ssgRows(rows: readonly SsgRow[]): CsvRow[] {
  return rows.map((r) =>
    r.ok
      ? {
          method: SSG_METHOD_ID,
          chemical: r.name,
          level: r.result.level * 1e6,
          governs: r.result.governs,
          partition: r.result.partitionLevel * 1e6,
          massLimit: r.result.massLimitLevel === undefined ? null : r.result.massLimitLevel * 1e6,
          target: r.targetUgL,
          daf: r.result.daf,
          leachate: r.result.cw * 1e6,
          mixingDepth: r.result.mixingDepth ?? null,
          note: null,
        }
      : {
          method: SSG_METHOD_ID,
          chemical: r.name,
          level: null,
          governs: null,
          partition: null,
          massLimit: null,
          target: null,
          daf: null,
          leachate: null,
          mixingDepth: null,
          note: r.reason,
        },
  );
}

/* ---------------------------------------------------------------- total TPH level */

/** The two registered fraction sets the total TPH level can come from. */
export const TPH_METHOD_IDS = ['tph.tphcwg', 'tph.madep'] as const;

const TPH_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'item', header: 'item' },
  { key: 'family', header: 'family' },
  { key: 'massFraction', header: 'mass fraction', unit: '-' },
  { key: 'mapped', header: 'mapped to an RSL surrogate' },
  { key: 'levelMgPerKg', header: 'level', unit: 'mg/kg' },
  { key: 'targetHazardIndex', header: 'target hazard index', unit: '-' },
];

/** The total level first, then one row per fraction with the level the user entered for it. */
export function tphRows(feed: TphRiskFeed): CsvRow[] {
  return [
    {
      method: feed.methodId,
      item: 'Total TPH',
      family: null,
      massFraction: null,
      mapped: null,
      levelMgPerKg: feed.totalMgPerKg,
      targetHazardIndex: feed.targetHazardIndex,
    },
    ...feed.fractions.map((f) => ({
      method: feed.methodId,
      item: f.label,
      family: f.family,
      massFraction: f.massFraction,
      mapped: f.mapped ? 'yes' : 'no',
      levelMgPerKg: f.levelMgPerKg,
      targetHazardIndex: null,
    })),
  ];
}

export function tphCsvTables(feed: TphRiskFeed): CsvTable[] {
  return [
    {
      name: 'cleanup-tph',
      editions: ['rsl'],
      label: 'total TPH level',
      feeds: ['tph'],
      rows: tphRows(feed),
      columns: TPH_COLUMNS,
    },
  ];
}

export function ssgCsvTables(rows: readonly SsgRow[]): CsvTable[] {
  return [
    {
      name: 'cleanup-ssg',
      editions: ['rsl'],
      label: 'leaching levels',
      rows: ssgRows(rows),
      columns: SSG_COLUMNS,
      missing: { keys: ['level'], because: 'note' },
    },
  ];
}
