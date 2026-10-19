import type { ConcScale } from '../transport/chartData';
import type { ComputeResult } from '../transport/compute';
import type { Scenario } from '../transport/form';
import type { Measure } from '../vadose/chartData';
import type { RunSummary as VadoseRun, VadoseMethod } from '../vadose/compute';
import type { TimeSeries } from '../vadose/TimeLineChart';
import type { SwResult } from '../surfaceWater/compute';
import type { ProfileCurve, Band } from '../vapor/chartData';
import type { RiskOutcome } from '../risk/compute';

/**
 * A chart a screen shows, held as the data the screen's own chart component takes, so the report draws
 * it with that same component. Charts are not saved in a project; they are rebuilt with the results.
 */
export type ChartItem =
  | {
      kind: 'plume';
      result: ComputeResult;
      scenario: Scenario;
      scale: ConcScale;
      methodLabel: string;
      timeLabel: string;
      depthLabel: string;
    }
  | { kind: 'breakthrough'; result: ComputeResult; scale: ConcScale }
  | { kind: 'vadoseDepth'; run: VadoseRun; scale: ConcScale }
  | {
      kind: 'vadoseWaterTable';
      runs: Partial<Record<VadoseMethod, VadoseRun>>;
      measure: Measure;
      scale: ConcScale;
    }
  | { kind: 'vadoseDepletion'; run: VadoseRun; scale: ConcScale }
  | {
      kind: 'saturatedRate' | 'saturatedRemaining';
      timesYr: number[];
      series: TimeSeries[];
      vlines: { tYr: number; label: string; cls?: string }[];
    }
  | { kind: 'surfaceWater'; result: SwResult; scale: ConcScale }
  | { kind: 'sediment'; result: SwResult; scale: ConcScale }
  | { kind: 'vaporProfile'; curves: ProfileCurve[]; bands: Band[] }
  | { kind: 'risk'; outcome: RiskOutcome; names: Record<string, string> };
