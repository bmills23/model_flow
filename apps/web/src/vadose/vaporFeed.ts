import type { SourceSeries } from '../vapor/series';
import type { RunSummary } from './compute';

/** The source pore water history of a vadose run, offered to the vapor screen as a soil source. */
export function vadoseVaporSource(run: RunSummary, label: string): SourceSeries {
  return {
    kind: 'poreWater',
    label,
    series: { times: [...run.series.times], values: [...run.series.sourcePoreWater] },
  };
}
