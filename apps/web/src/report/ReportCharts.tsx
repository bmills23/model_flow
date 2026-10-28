import { BreakthroughChart } from '../transport/BreakthroughChart';
import { PlumeMap } from '../transport/PlumeMap';
import { DepthProfileChart } from '../vadose/DepthProfileChart';
import { TablesAlwaysOpen } from '../vadose/tablesOpen';
import { SourceDepletionChart } from '../vadose/SourceDepletionChart';
import { TimeLineChart } from '../vadose/TimeLineChart';
import { WaterTableFluxChart } from '../vadose/WaterTableFluxChart';
import { ProfileChart } from '../vapor/ProfileChart';
import { SedimentChart, SurfaceWaterChart } from '../surfaceWater/charts';
import { Charts as RiskCharts } from '../risk/Results';
import type { ChartItem } from './chartItems';
import './reportCharts.css';

/** Rows kept in the printed plume table (about half a page); the screen table holds every row. */
const PLUME_TABLE_ROWS = 20;

function Chart({ item }: { item: ChartItem }) {
  switch (item.kind) {
    case 'plume':
      return (
        <PlumeMap
          result={item.result}
          scenario={item.scenario}
          scale={item.scale}
          methodLabel={item.methodLabel}
          timeLabel={item.timeLabel}
          depthLabel={item.depthLabel}
          tableMaxRows={PLUME_TABLE_ROWS}
        />
      );
    case 'breakthrough':
      return <BreakthroughChart result={item.result} scale={item.scale} />;
    case 'vadoseDepth':
      return <DepthProfileChart run={item.run} scale={item.scale} />;
    case 'vadoseWaterTable':
      return <WaterTableFluxChart runs={item.runs} measure={item.measure} scale={item.scale} />;
    case 'vadoseDepletion':
      return <SourceDepletionChart run={item.run} scale={item.scale} />;
    case 'saturatedRate':
      return (
        <TimeLineChart
          title="Release rate to the aquifer versus time"
          timesYr={item.timesYr}
          series={item.series}
          yLabel="release rate (kg/d)"
          scale="linear"
          ariaLabel="Release rate to the aquifer over time, as a step for the legacy method and an exponential decline for the modern method."
          tableUnit="kg/d"
          vlines={item.vlines}
        />
      );
    case 'saturatedRemaining':
      return (
        <TimeLineChart
          title="Mass left in the source versus time"
          timesYr={item.timesYr}
          series={item.series}
          yLabel="remaining mass (kg)"
          scale="linear"
          ariaLabel="Remaining mass in the source over time."
          tableUnit="kg"
          vlines={item.vlines}
        />
      );
    case 'surfaceWater':
      return <SurfaceWaterChart result={item.result} scale={item.scale} />;
    case 'sediment':
      return <SedimentChart result={item.result} scale={item.scale} />;
    case 'vaporProfile':
      return <ProfileChart curves={item.curves} bands={item.bands} />;
    case 'risk':
      return <RiskCharts outcome={item.outcome} names={item.names} />;
  }
}

/**
 * The charts of one report section, each with its data table open (the table is the print and
 * screen-reader form of the chart, so it is never hidden behind a button here).
 */
export function ReportCharts({
  charts,
  level = 3,
  title = 'Charts',
}: {
  charts: ChartItem[];
  /** The heading level: 3 for a section's charts, 5 for a chemical block's. */
  level?: 3 | 5;
  title?: string;
}) {
  if (charts.length === 0) return null;
  const Heading = level === 3 ? 'h3' : 'h5';
  return (
    <TablesAlwaysOpen.Provider value={true}>
      <div className="report-charts">
        <Heading>{title}</Heading>
        {charts.map((c, i) => (
          <div key={`${c.kind}:${i}`} className="report-chart">
            <Chart item={c} />
          </div>
        ))}
      </div>
    </TablesAlwaysOpen.Provider>
  );
}
