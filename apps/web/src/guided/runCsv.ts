import { convert } from '@model-flow/engine';
import type { CsvTable } from '../export/DownloadCsv';
import type { VaporRiskFeed } from '../vapor/feeds';
import type { WellFeed } from '../transport/wellFeed';
import type { GuidedOutputs } from './state';

/**
 * The one CSV of step 3d: every project chemical and every time step the Run computed. Each row is one
 * chemical, one result and one time. The unit is a column of its own because the groundwater rows are in
 * mg/L and the indoor air rows in mg/m3. Times are years from the start of the release.
 */

export interface RunChemical {
  id: string;
  name: string;
}

const WELL = 'Groundwater at the well';
const INDOOR = 'Indoor air';

export const RUN_CSV_COLUMNS = [
  { key: 'chemical', header: 'Chemical' },
  { key: 'id', header: 'Chemical id' },
  { key: 'result', header: 'Result' },
  { key: 'timeYr', header: 'Time', unit: 'yr' },
  { key: 'concentration', header: 'Concentration' },
  { key: 'unit', header: 'Concentration unit' },
] as const;

const toYr = (s: number): number => convert(s, 's', 'yr');

/** Indoor air peak and the series behind it, in mg/m3 (the feed holds kg/m3). */
export function indoorSeries(
  feed: VaporRiskFeed,
): { timesYr: number[] | null; mgPerM3: number[] } | null {
  const epc = feed.indoor;
  if (epc === undefined) return null;
  if (epc.kind === 'constant') return { timesYr: null, mgPerM3: [epc.value * 1e6] };
  return {
    timesYr: epc.series.times.map(toYr),
    mgPerM3: epc.series.values.map((v) => v * 1e6),
  };
}

export function runCsvTable(outputs: GuidedOutputs, chemicals: readonly RunChemical[]): CsvTable {
  const rows: Record<string, string | number | null>[] = [];
  for (const c of chemicals) {
    const well = outputs['well']?.[c.id]?.value as WellFeed | undefined;
    if (well !== undefined) {
      well.times.forEach((t, i) =>
        rows.push({
          chemical: c.name,
          id: c.id,
          result: WELL,
          timeYr: toYr(t),
          concentration: (well.values[i] ?? NaN) * 1e3,
          unit: 'mg/L',
        }),
      );
    }
    const air = outputs['vaporRisk']?.[c.id]?.value as VaporRiskFeed | undefined;
    const series = air === undefined ? null : indoorSeries(air);
    if (series !== null) {
      series.mgPerM3.forEach((v, i) =>
        rows.push({
          chemical: c.name,
          id: c.id,
          result: INDOOR,
          timeYr: series.timesYr?.[i] ?? null,
          concentration: v,
          unit: 'mg/m3',
        }),
      );
    }
  }
  return {
    name: 'guided-run-results',
    label: 'every chemical and time step',
    rows,
    columns: RUN_CSV_COLUMNS,
  };
}
