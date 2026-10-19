import { convert } from '@model-flow/engine';
import type { TimeSeries } from '../vadose/TimeLineChart';
import { fmt } from './chartData';
import type { RunSummary, SaturatedComputeResult } from './compute';
import type { SaturatedMethod } from './feed';

const YR = convert(1, 'yr', 's');

export const SATURATED_METHODS: Record<
  SaturatedMethod,
  { label: string; short: string; cls: string; marker: SaturatedMethod }
> = {
  legacy: {
    label: 'Legacy two-region (constant until exhausted)',
    short: 'Legacy',
    cls: 's-legacy',
    marker: 'legacy',
  },
  modern: {
    label: 'Modern exponential (declines with the mass left)',
    short: 'Modern',
    cls: 's-modern',
    marker: 'modern',
  },
};

/** The release rate or remaining mass curves of the shown methods, as chart series. */
export function saturatedSeries(
  result: SaturatedComputeResult,
  shown: readonly SaturatedMethod[],
  kind: 'rate' | 'remaining',
): TimeSeries[] {
  return shown.map((m) => ({
    key: m,
    label: SATURATED_METHODS[m].label,
    short: SATURATED_METHODS[m].short,
    cls: SATURATED_METHODS[m].cls,
    marker: m,
    values: result.curves[kind][m]!,
  }));
}

/** Vertical lines at the time each run exhausts its source, when that falls inside the horizon. */
export function saturatedVlines(
  runs: readonly RunSummary[],
  horizonYr: number,
): { tYr: number; label: string; cls: string }[] {
  return runs
    .filter((r) => Number.isFinite(r.depletionTime) && r.depletionTime / YR <= horizonYr)
    .map((r) => ({
      tYr: r.depletionTime / YR,
      label: `${SATURATED_METHODS[r.method].short} t_d = ${fmt(r.depletionTime / YR)} yr`,
      cls: SATURATED_METHODS[r.method].cls,
    }));
}
