import { useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { formatConcentration, type ConcScale } from '../transport/chartData';
import { useWidth } from '../transport/useWidth';
import { BUDGET_LABEL, budgetStack, spreadLabels } from './chartData';
import type { RunSummary } from './compute';
import { DataTable } from './DataTable';
import { TimeLineChart } from './TimeLineChart';
import { convert } from '@model-flow/engine';
import { METHOD_SERIES } from './series';

const H = 280;
const WIDE = 560;

const f1 = (v: number): string => String(Number(v.toFixed(1)));

function StackedBudget({ run }: { run: RunSummary }) {
  const [ref, width] = useWidth();
  const [probeIdx, setProbeIdx] = useState<number | null>(null);
  const stack = budgetStack(run);
  const wide = width >= WIDE;
  const M = { l: 62, r: wide ? 132 : 14, t: 12, b: 38 };
  const plotW = Math.max(120, width - M.l - M.r);
  const plotH = H - M.t - M.b;
  const total = run.budget.initial;
  const n = stack.timesYr.length;
  const sx = scaleLinear()
    .domain([0, stack.timesYr[n - 1] ?? 1])
    .range([M.l, M.l + plotW]);
  const sy = scaleLinear()
    .domain([0, total > 0 ? total : 1])
    .range([M.t + plotH, M.t])
    .nice();

  const areaPath = (lower: number[], upper: number[]): string => {
    let d = '';
    upper.forEach(
      (v, k) => (d += `${k === 0 ? 'M' : 'L'}${f1(sx(stack.timesYr[k]!))},${f1(sy(v))}`),
    );
    for (let k = n - 1; k >= 0; k--) d += `L${f1(sx(stack.timesYr[k]!))},${f1(sy(lower[k]!))}`;
    return `${d}Z`;
  };

  const ends = stack.bands.map((b) => ({
    mid: sy((b.lower[n - 1]! + b.upper[n - 1]!) / 2),
    height: sy(b.lower[n - 1]!) - sy(b.upper[n - 1]!),
  }));
  const labelled = stack.bands.map((_, i) => i).filter((i) => ends[i]!.height >= 10);
  const labelY = spreadLabels(
    labelled.map((i) => ends[i]!.mid),
    14,
    M.t + 6,
    M.t + plotH - 2,
  );

  const nearest = (clientX: number, left: number): number => {
    const t = sx.invert(clientX - left);
    let best = 0;
    stack.timesYr.forEach((v, i) => {
      if (Math.abs(v - t) < Math.abs(stack.timesYr[best]! - t)) best = i;
    });
    return best;
  };
  const onKey = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' ? 1 : -1;
    setProbeIdx((i) => Math.min(n - 1, Math.max(0, (i ?? 0) + step)));
  };

  return (
    <figure className="chart">
      <figcaption>Where the chemical in the source goes over time (cumulative mass)</figcaption>
      <ul className="legend legend-series" aria-label="Mass budget categories">
        {stack.categories.map((c) => (
          <li key={c.key}>
            <span className={`swatch b-${c.key}`} aria-hidden="true" />
            {c.label}
          </li>
        ))}
      </ul>
      <div ref={ref}>
        <svg
          width={width}
          height={H}
          role="img"
          aria-label="Stacked cumulative mass in the source, volatilized, in transit and delivered to the water table over time. Focus and use the left and right arrow keys to read values. A data table follows."
          tabIndex={0}
          onPointerMove={(e) =>
            setProbeIdx(nearest(e.clientX, e.currentTarget.getBoundingClientRect().left))
          }
          onPointerDown={(e) =>
            setProbeIdx(nearest(e.clientX, e.currentTarget.getBoundingClientRect().left))
          }
          onPointerLeave={() => setProbeIdx(null)}
          onKeyDown={onKey}
        >
          {sy.ticks(5).map((t) => (
            <g key={`y${t}`} transform={`translate(0,${sy(t)})`}>
              <line x1={M.l} x2={M.l + plotW} className="grid" />
              <text x={M.l - 7} dy="0.32em" textAnchor="end" className="tick">
                {t}
              </text>
            </g>
          ))}
          {sx.ticks(Math.max(2, Math.floor(plotW / 70))).map((t) => (
            <g key={`x${t}`} transform={`translate(${sx(t)},${M.t + plotH})`}>
              <line y2={4} className="axis" />
              <text y={17} textAnchor="middle" className="tick">
                {t}
              </text>
            </g>
          ))}
          {stack.bands.map((b) => (
            <path key={b.key} d={areaPath(b.lower, b.upper)} className={`area b-${b.key}`} />
          ))}
          <line x1={M.l} x2={M.l + plotW} y1={M.t + plotH} y2={M.t + plotH} className="axis" />
          <text x={M.l + plotW / 2} y={H - 4} textAnchor="middle" className="axis-title">
            time (years)
          </text>
          <text
            transform={`translate(12,${M.t + plotH / 2}) rotate(-90)`}
            textAnchor="middle"
            className="axis-title"
          >
            cumulative mass (kg)
          </text>
          {wide &&
            labelled.map((i, k) => (
              <text
                key={stack.bands[i]!.key}
                x={M.l + plotW + 8}
                y={labelY[k]}
                dy="0.32em"
                className="mark-label"
              >
                {shortLabel(stack.bands[i]!.key)}
              </text>
            ))}
          {probeIdx !== null && (
            <line
              x1={sx(stack.timesYr[probeIdx]!)}
              x2={sx(stack.timesYr[probeIdx]!)}
              y1={M.t}
              y2={M.t + plotH}
              className="crosshair"
            />
          )}
        </svg>
      </div>
      <p className="probe" aria-live="polite">
        {probeIdx === null
          ? 'Move over or tap the chart, or focus it and use the arrow keys, to read values.'
          : `t = ${stack.timesYr[probeIdx]!.toFixed(1)} yr: ${stack.categories
              .map((c) => `${shortLabel(c.key)} ${formatConcentration(c.values[probeIdx]!)}`)
              .join(', ')} kg`}
      </p>
      <DataTable
        caption="Cumulative mass by category"
        columns={['Time (yr)', ...stack.categories.map((c) => `${BUDGET_LABEL[c.key]} (kg)`)]}
        rows={stack.timesYr.map((t, i) => [
          t.toFixed(2),
          ...stack.categories.map((c) => formatConcentration(c.values[i]!)),
        ])}
      />
    </figure>
  );
}

const SHORT: Record<string, string> = {
  source: 'In source',
  volatilized: 'Volatilized',
  transit: 'In transit',
  delivered: 'Delivered',
  sourceDecayed: 'Decayed',
};
const shortLabel = (key: string): string => SHORT[key] ?? key;

/** The depleting source: its pore-water concentration over time, and where the lost mass went. */
export function SourceDepletionChart(props: { run: RunSummary; scale: ConcScale }) {
  const { run } = props;
  const timesYr = run.series.times.map((s) => convert(s, 's', 'yr'));
  const method = METHOD_SERIES[run.method];
  return (
    <>
      <TimeLineChart
        title="Pore-water concentration in the source versus time"
        timesYr={timesYr}
        series={[
          {
            key: 'source',
            label: 'Source pore water',
            short: 'Source',
            cls: method.cls,
            values: run.series.sourcePoreWater.map((c) => c * 1e3),
          },
        ]}
        yLabel="concentration (mg/L)"
        scale={props.scale}
        ariaLabel="Pore-water concentration in the depleting source over time."
        tableUnit="mg/L"
      />
      <StackedBudget run={run} />
    </>
  );
}
