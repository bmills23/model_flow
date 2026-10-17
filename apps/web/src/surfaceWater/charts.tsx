import { convert } from '@model-flow/engine';
import type { ConcScale } from '../transport/chartData';
import { TimeLineChart, type TimeSeries } from '../vadose/TimeLineChart';
import type { SwResult } from './compute';

const MG_PER_L = 1e3;
const MG_PER_KG = 1e6;

const timesYr = (r: SwResult): number[] => r.times.map((t) => convert(t, 's', 'yr'));

/** Surface water concentration in the mixing zone against time, legacy and modern overlaid. */
export function SurfaceWaterChart({ result, scale }: { result: SwResult; scale: ConcScale }) {
  const series: TimeSeries[] = [
    {
      key: 'legacy',
      label: 'Legacy well-mixed box',
      short: 'Legacy',
      cls: 's-legacy',
      marker: 'legacy',
      values: result.legacy.surfaceWater.map((v) => v * MG_PER_L),
    },
    {
      key: 'modern',
      label: 'Modern mass discharge',
      short: 'Modern',
      cls: 's-modern',
      marker: 'modern',
      values: result.modern.surfaceWater.map((v) => v * MG_PER_L),
    },
  ];
  if (result.modern.downstream) {
    series.push({
      key: 'downstream',
      label: 'Modern, river receptor downstream',
      short: 'Downstream',
      cls: 's-domenico',
      marker: 'domenico',
      values: result.modern.downstream.map((v) => v * MG_PER_L),
    });
  }
  return (
    <TimeLineChart
      title="Surface water concentration versus time"
      ariaLabel="Surface water concentration in mg/L against time in years for the legacy and modern methods."
      timesYr={timesYr(result)}
      series={series}
      yLabel="surface water (mg/L)"
      scale={scale}
      tableUnit="mg/L"
    />
  );
}

/** Sediment concentration against time, legacy and modern overlaid; absent when not quantified. */
export function SedimentChart({ result, scale }: { result: SwResult; scale: ConcScale }) {
  const legacy = result.legacy.sediment.concentrations;
  const modern = result.modern.sediment.concentrations;
  const series: TimeSeries[] = [];
  if (legacy) {
    series.push({
      key: 'legacy',
      label: 'Legacy (groundwater pore water)',
      short: 'Legacy',
      cls: 's-legacy',
      marker: 'legacy',
      values: legacy.map((v) => v * MG_PER_KG),
    });
  }
  if (modern) {
    series.push({
      key: 'modern',
      label: `Modern (${result.modern.sediment.poreWater} pore water)`,
      short: 'Modern',
      cls: 's-modern',
      marker: 'modern',
      values: modern.map((v) => v * MG_PER_KG),
    });
  }
  if (series.length === 0) return null;
  return (
    <TimeLineChart
      title="Sediment concentration versus time"
      ariaLabel="Sediment concentration in mg/kg dry weight against time in years for the legacy and modern methods."
      timesYr={timesYr(result)}
      series={series}
      yLabel="sediment (mg/kg dw)"
      scale={scale}
      tableUnit="mg/kg"
    />
  );
}
