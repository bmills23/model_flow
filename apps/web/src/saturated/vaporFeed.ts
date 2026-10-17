import { saturatedRegion1Source } from '@model-flow/engine';
import type { SourceSeries } from '../vapor/series';
import type { RunSummary } from './compute';

/**
 * The pore water of region 1 (above the water table) of a saturated source run, as a vapor source.
 * Null when the source has no region above the water table: region 2 reaches vapor only through the
 * groundwater series of the transport screen.
 */
export function saturatedVaporSource(run: RunSummary, label: string): SourceSeries | null {
  try {
    const r = saturatedRegion1Source({ regions: run.regions });
    return { kind: 'poreWater', label, constant: r.poreWater };
  } catch {
    return null;
  }
}
