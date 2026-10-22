import type { CsvColumn, CsvRow } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import type { HouseholdRiskFeed } from '../household/feeds';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import type { VaporRiskFeed } from '../vapor/feeds';
import type { CleanupOutcome } from './compute';
import { CLEANUP_METHOD_IDS } from './csv';
import { householdSourceLevels } from './householdLevels';
import { surfaceWaterSourceLevels } from './surfaceWaterLevels';
import { vaporSourceLevels } from './vaporLevels';

/** The three feeds whose source level panels sit on the cleanup screen; each is optional. */
export interface SourceLevelFeeds {
  household?: HouseholdRiskFeed | null;
  vapor?: VaporRiskFeed | null;
  surface?: SurfaceWaterFeed | null;
}

export const sourceLevelsHeld = (f: SourceLevelFeeds): boolean =>
  Boolean(f.household || f.vapor || f.surface);

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
 * The source level panels of the cleanup screen as CSV tables, one per held feed: the same rows the
 * panel prints, in the screen unit at full precision. A level that is not quantified is an empty cell
 * with its reason beside it, never zero.
 */
export function sourceLevelCsvTables(
  outcome: CleanupOutcome,
  names: Record<string, string>,
  feeds: SourceLevelFeeds,
): CsvTable[] {
  const name = (id: string): string => names[id] ?? id;
  const tables: CsvTable[] = [];
  if (feeds.household) {
    const f = feeds.household;
    tables.push({
      name: 'cleanup-household-levels',
      editions: ['rsl'],
      label: 'household source levels',
      feeds: ['household'],
      rows: householdSourceLevels(outcome, f).map((r) =>
        rowOf({ ...r, sourceMethod: r.householdMethod }, name(f.chemicalId)),
      ),
      columns: columns('household method'),
    });
  }
  if (feeds.vapor) {
    const f = feeds.vapor;
    tables.push({
      name: 'cleanup-vapor-levels',
      editions: ['rsl'],
      label: 'vapor source levels',
      feeds: ['vaporRisk'],
      rows: vaporSourceLevels(outcome, f).map((r) =>
        rowOf({ ...r, sourceMethod: r.vaporMethod }, name(f.chemicalId)),
      ),
      columns: columns('vapor method'),
    });
  }
  if (feeds.surface) {
    tables.push({
      name: 'cleanup-surface-water-levels',
      editions: ['rsl'],
      label: 'surface water source levels',
      feeds: ['surfaceWater'],
      rows: surfaceWaterSourceLevels(outcome, feeds.surface, names).map((r) => ({
        ...rowOf(
          { ...r, sourceMethod: r.surfaceMethod, what: 'Groundwater source (surface water)' },
          name(r.chemical),
        ),
        surfaceWaterLevel: scaled(r.mediumLevel, r.fromSi),
      })),
      columns: columns('surface water method', [
        { key: 'surfaceWaterLevel', header: 'surface water level' },
      ]),
    });
  }
  return tables;
}
