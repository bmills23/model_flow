import type { CsvColumn, CsvRow } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import type { HouseholdRiskFeed } from '../household/feeds';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import type { VaporRiskFeed } from '../vapor/feeds';
import { slotOfValue, slotValues, type FeedSlots } from '../project/feedSlots';
import type { CleanupOutcome } from './compute';
import { CLEANUP_METHOD_IDS } from './csv';
import { householdSourceLevels } from './householdLevels';
import { surfaceWaterSourceLevels } from './surfaceWaterLevels';
import type { SurfaceSolveJob, SurfaceSolves } from './surfaceSolve';
import { jobsOf, LEVEL_PATH_TEXT } from './surfaceSolved';
import { solubilityFlag, type SolubilityCeiling } from './solubility';
import { vaporSourceLevels } from './vaporLevels';

/**
 * The three feeds whose source level panels sit on the cleanup screen; each is optional, and each is
 * a feed's slots (one per chemical) or one value.
 */
export interface SourceLevelFeeds {
  household?: HouseholdRiskFeed | FeedSlots<HouseholdRiskFeed> | null;
  vapor?: VaporRiskFeed | FeedSlots<VaporRiskFeed> | null;
  surface?: SurfaceWaterFeed | FeedSlots<SurfaceWaterFeed> | null;
}

/**
 * The held results a source level panel is shown for, one panel each: every slot for a chemical of
 * the run (`ids`) or untagged; when none is, the most recent slot, so a result for another chemical
 * still shows why it gives no level.
 */
export function panelFeeds<T extends { chemicalId?: string }>(
  held: T | FeedSlots<T> | null | undefined,
  ids: readonly string[],
): T[] {
  const all = slotValues(held);
  const mine = all.filter((f) => slotOfValue(f) === '' || ids.includes(slotOfValue(f)));
  if (mine.length > 0) return mine;
  return all.length > 0 ? [all[all.length - 1]!] : [];
}

export const sourceLevelsHeld = (f: SourceLevelFeeds): boolean =>
  slotValues(f.household).length + slotValues(f.vapor).length + slotValues(f.surface).length > 0;

/** Where a vapor source level came from, as the table words it (empty when no level was tried). */
const VAPOR_BASIS = { linear: 'linear coefficient', solve: 'solve', none: null } as const;

const scaled = (si: number | null, fromSi: number): number | null =>
  si === null ? null : si * fromSi;

interface PanelRow {
  method: 'legacy' | 'modern';
  sourceMethod: string | null;
  what: string;
  level: number | null;
  cancerLevel: number | null;
  noncancerLevel: number | null;
  limiting: string | null;
  unit: string;
  fromSi: number;
  reason: string | null;
}

/** The level columns left empty when a source level is not quantified, and the column with the reason. */
const MISSING = {
  keys: ['level', 'cancerLevel', 'noncancerLevel'],
  because: 'reason',
} as const;

function columns(sourceMethodHeader: string, extra: CsvColumn[] = []): CsvColumn[] {
  return [
    { key: 'method', header: 'method' },
    { key: 'sourceMethod', header: sourceMethodHeader },
    { key: 'source', header: 'source' },
    { key: 'unit', header: 'unit' },
    { key: 'chemical', header: 'chemical' },
    { key: 'level', header: 'source level' },
    { key: 'limiting', header: 'limiting endpoint' },
    { key: 'cancerLevel', header: 'cancer level' },
    { key: 'noncancerLevel', header: 'noncancer level' },
    ...extra,
    { key: 'reason', header: 'not quantified because' },
  ];
}

function rowOf(r: PanelRow, chemical: string): CsvRow {
  return {
    method: CLEANUP_METHOD_IDS[r.method],
    sourceMethod: r.sourceMethod,
    source: r.what,
    unit: r.unit,
    chemical,
    level: scaled(r.level, r.fromSi),
    limiting: r.limiting,
    cancerLevel: scaled(r.cancerLevel, r.fromSi),
    noncancerLevel: scaled(r.noncancerLevel, r.fromSi),
    reason: r.reason,
  };
}

/**
 * The forward-run solves behind the surface water panels (see `panelFeeds`): the jobs a caller outside the
 * screen (the report) runs before it builds the CSV tables, which then read their results.
 */
export function surfaceSolveJobs(
  outcome: CleanupOutcome,
  names: Record<string, string>,
  feeds: SourceLevelFeeds,
): SurfaceSolveJob[] {
  return jobsOf(
    panelFeeds(feeds.surface, Object.keys(names)).flatMap((f) =>
      surfaceWaterSourceLevels(outcome, f, names),
    ),
  );
}

/**
 * The source level panels of the cleanup screen as CSV tables, one per panel (see `panelFeeds`): the
 * same rows the panel prints, in the screen unit at full precision. A level that is not quantified is
 * an empty cell with its reason beside it, never zero. With two or more panels of one kind, each file
 * name ends with its chemical id.
 */
export function sourceLevelCsvTables(
  outcome: CleanupOutcome,
  names: Record<string, string>,
  feeds: SourceLevelFeeds,
  solve: {
    solves?: SurfaceSolves;
    csat?: Record<string, number>;
    /** The solubility ceiling of a chemical; a vapor source level in water above it is flagged. */
    ceilingOf?: (chemicalId: string) => SolubilityCeiling | null;
  } = {},
): CsvTable[] {
  const name = (id: string): string => names[id] ?? id;
  const ids = Object.keys(names);
  const tables: CsvTable[] = [];
  const suffixed = (stem: string, f: { chemicalId?: string }, many: boolean): string =>
    many && slotOfValue(f) !== '' ? `${stem}-${slotOfValue(f)}` : stem;
  const household = panelFeeds(feeds.household, ids);
  for (const f of household) {
    tables.push({
      name: suffixed('cleanup-household-levels', f, household.length > 1),
      editions: ['rsl'],
      label: `household source levels${household.length > 1 ? `, ${name(f.chemicalId)}` : ''}`,
      feeds: [{ feed: 'household', chemicalId: f.chemicalId }],
      rows: householdSourceLevels(outcome, f).map((r) =>
        rowOf({ ...r, sourceMethod: r.householdMethod }, name(f.chemicalId)),
      ),
      columns: columns('household method'),
      missing: MISSING,
    });
  }
  const vapor = panelFeeds(feeds.vapor, ids);
  for (const f of vapor) {
    tables.push({
      name: suffixed('cleanup-vapor-levels', f, vapor.length > 1),
      editions: ['rsl'],
      label: `vapor source levels${vapor.length > 1 ? `, ${name(f.chemicalId)}` : ''}`,
      feeds: [{ feed: 'vaporRisk', chemicalId: f.chemicalId }],
      rows: vaporSourceLevels(outcome, f).map((r) => ({
        ...rowOf({ ...r, sourceMethod: r.vaporMethod }, name(f.chemicalId)),
        basis: VAPOR_BASIS[r.basis ?? 'none'],
        solubility:
          r.unit === 'mg/L' && r.level !== null
            ? (solubilityFlag(
                name(f.chemicalId),
                r.level * r.fromSi,
                solve.ceilingOf?.(f.chemicalId) ?? null,
              ) ?? '')
            : '',
      })),
      columns: columns('vapor method', [
        { key: 'basis', header: 'level from' },
        { key: 'solubility', header: 'above the solubility' },
      ]),
      missing: MISSING,
    });
  }
  const surface = panelFeeds(feeds.surface, ids);
  for (const f of surface) {
    const tagged = slotOfValue(f) !== '';
    tables.push({
      name: suffixed('cleanup-surface-water-levels', f, surface.length > 1),
      editions: ['rsl'],
      label: `surface water source levels${surface.length > 1 && tagged ? `, ${name(slotOfValue(f))}` : ''}`,
      feeds: [
        tagged ? { feed: 'surfaceWater', chemicalId: slotOfValue(f) } : { feed: 'surfaceWater' },
      ],
      rows: surfaceWaterSourceLevels(outcome, f, names, solve.solves, solve.csat).map((r) => ({
        ...rowOf(
          {
            ...r,
            sourceMethod: r.surfaceMethod,
            what: `${r.sourceMedium === 'soil' ? 'Soil source' : 'Groundwater source'} (surface water)`,
          },
          name(r.chemical),
        ),
        // the surface water level is a concentration in water, whatever the source medium
        surfaceWaterLevel: scaled(r.mediumLevel, 1e3),
        path: r.path,
        solver: r.solver ?? (r.path === 'linear' ? LEVEL_PATH_TEXT.linear : null),
      })),
      columns: columns('surface water method', [
        { key: 'surfaceWaterLevel', header: 'surface water level' },
        { key: 'path', header: 'level path' },
        { key: 'solver', header: 'solve detail' },
      ]),
      missing: { keys: [...MISSING.keys, 'surfaceWaterLevel'], because: 'reason' },
    });
  }
  return tables;
}
