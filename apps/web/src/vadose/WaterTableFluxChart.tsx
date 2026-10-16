import type { ConcScale } from '../transport/chartData';
import type { RunSummary, VadoseMethod } from './compute';
import { waterTableSeries, type Measure } from './chartData';
import { METHOD_SERIES } from './series';
import { TimeLineChart, type TimeSeries } from './TimeLineChart';

/** What reaches the water table over time, for each method that ran. */
export function WaterTableFluxChart(props: {
  runs: Partial<Record<VadoseMethod, RunSummary>>;
  measure: Measure;
  scale: ConcScale;
}) {
  const data = waterTableSeries(props.runs, props.measure);
  const series: TimeSeries[] = (['legacy', 'modern'] as const).flatMap((m) => {
    const values = data.values[m];
    return values ? [{ key: m, ...METHOD_SERIES[m], values }] : [];
  });
  const conc = props.measure === 'concentration';
  return (
    <TimeLineChart
      title={
        conc
          ? 'Concentration at the water table versus time'
          : 'Mass flux through the water table versus time'
      }
      timesYr={data.timesYr}
      series={series}
      yLabel={conc ? 'concentration (mg/L)' : 'flux (g/m2/d)'}
      scale={props.scale}
      ariaLabel={
        conc
          ? 'Leachate concentration at the water table over time.'
          : 'Mass flux through the water table over time.'
      }
      tableUnit={conc ? 'mg/L' : 'g/m2/d'}
    />
  );
}
