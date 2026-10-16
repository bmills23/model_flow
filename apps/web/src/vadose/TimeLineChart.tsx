import { useState } from 'react';
import { scaleLinear, scaleLog } from 'd3-scale';
import { formatConcentration, linePath, type ConcScale } from '../transport/chartData';
import type { MethodKey } from '../transport/compute';
import { Marker } from '../transport/Marker';
import { useWidth } from '../transport/useWidth';
import { spreadLabels } from './chartData';
import { DataTable } from './DataTable';

export interface TimeSeries {
  key: string;
  label: string;
  /** Short name for the direct label and the probe line. */
  short: string;
  /** Colour class (stroke and fill from the shared series tokens). */
  cls: string;
  marker?: MethodKey;
  values: number[];
}

const H = 260;
const WIDE = 560;

/**
 * One or more series against time in years on a single y axis. A legend is shown for two or more
 * series, the last point of each is marked and (on wide screens) labelled, a crosshair snaps to the
 * nearest time, and the data table is one click away.
 */
export function TimeLineChart(props: {
  title: string;
  timesYr: number[];
  series: TimeSeries[];
  yLabel: string;
  scale: ConcScale;
  ariaLabel: string;
  tableUnit: string;
  /** Optional vertical reference lines, such as the time a source is exhausted. */
  vlines?: { tYr: number; label: string; cls?: string }[];
}) {
  const { timesYr, series, scale } = props;
  const [ref, width] = useWidth();
  const [probeIdx, setProbeIdx] = useState<number | null>(null);
  const wide = width >= WIDE;
  const M = { l: 62, r: wide ? 92 : 14, t: 12, b: 38 };
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const plotW = Math.max(120, width - M.l - M.r);
  const plotH = H - M.t - M.b;
  const sx = scaleLinear()
    .domain([0, timesYr[timesYr.length - 1] ?? 1])
    .range([M.l, M.l + plotW]);
  const yMaxDomain = max > 0 ? max * 1.08 : 1;
  const logLo = yMaxDomain * 1e-4;
  const sy =
    scale === 'log'
      ? scaleLog()
          .domain([logLo, yMaxDomain])
          .range([M.t + plotH, M.t])
      : scaleLinear()
          .domain([0, yMaxDomain])
          .range([M.t + plotH, M.t])
          .nice();

  const pts = (s: TimeSeries): [number, number][] =>
    s.values.map((v, i) => [sx(timesYr[i]!), scale === 'log' && !(v >= logLo) ? NaN : sy(v)]);

  const lastPoints = series.map((s) => pts(s)[s.values.length - 1]!);
  const labelY = spreadLabels(
    lastPoints.map((p) => (Number.isFinite(p[1]) ? p[1] : M.t + plotH)),
    14,
    M.t + 6,
    M.t + plotH - 2,
  );

  const nearest = (clientX: number, left: number): number => {
    const t = sx.invert(clientX - left);
    let best = 0;
    timesYr.forEach((v, i) => {
      if (Math.abs(v - t) < Math.abs(timesYr[best]! - t)) best = i;
    });
    return best;
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>): void =>
    setProbeIdx(nearest(e.clientX, e.currentTarget.getBoundingClientRect().left));
  const onKey = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' ? 1 : -1;
    setProbeIdx((i) => Math.min(timesYr.length - 1, Math.max(0, (i ?? 0) + step)));
  };

  const yTicks =
    scale === 'log'
      ? sy.ticks().filter((t) => Math.abs(Math.log10(t) - Math.round(Math.log10(t))) < 1e-9)
      : sy.ticks(5);

  return (
    <figure className="chart">
      <figcaption>{props.title}</figcaption>
      {series.length >= 2 && (
        <ul className="legend legend-series" aria-label="Series">
          {series.map((s) => (
            <li key={s.key}>
              <svg width="30" height="12" aria-hidden="true">
                <line x1="0" x2="22" y1="6" y2="6" className={`line ${s.cls}`} />
                {s.marker && <Marker k={s.marker} x={24} y={6} />}
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={ref}>
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={`${props.ariaLabel} A data table follows.`}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setProbeIdx(null)}
          onKeyDown={onKey}
        >
          {yTicks.map((t) => (
            <g key={`y${t}`} transform={`translate(0,${sy(t)})`}>
              <line x1={M.l} x2={M.l + plotW} className="grid" />
              <text x={M.l - 7} dy="0.32em" textAnchor="end" className="tick">
                {scale === 'log' ? (t >= 0.01 ? String(t) : t.toExponential(0)) : t}
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
          <line x1={M.l} x2={M.l + plotW} y1={M.t + plotH} y2={M.t + plotH} className="axis" />
          <text x={M.l + plotW / 2} y={H - 4} textAnchor="middle" className="axis-title">
            time (years)
          </text>
          <text
            transform={`translate(12,${M.t + plotH / 2}) rotate(-90)`}
            textAnchor="middle"
            className="axis-title"
          >
            {props.yLabel}
          </text>
          {(props.vlines ?? [])
            .filter((v) => v.tYr > 0 && v.tYr <= (timesYr[timesYr.length - 1] ?? 0))
            .map((v, i) => {
              const x = sx(v.tYr);
              const flip = x > M.l + plotW * 0.7;
              return (
                <g key={`v${i}`}>
                  <line
                    x1={x}
                    x2={x}
                    y1={M.t}
                    y2={M.t + plotH}
                    className={`vline ${v.cls ?? ''}`.trim()}
                  />
                  <text
                    x={flip ? x - 5 : x + 5}
                    y={M.t + 11 + i * 14}
                    textAnchor={flip ? 'end' : 'start'}
                    className="mark-label"
                  >
                    {v.label}
                  </text>
                </g>
              );
            })}
          {series.map((s) => (
            <path key={s.key} d={linePath(pts(s))} className={`line ${s.cls}`} fill="none" />
          ))}
          {series.map((s, i) => {
            const p = lastPoints[i]!;
            if (!Number.isFinite(p[1])) return null;
            return s.marker ? <Marker key={s.key} k={s.marker} x={p[0]} y={p[1]} /> : null;
          })}
          {wide &&
            series.length >= 2 &&
            series.map((s, i) => (
              <text
                key={s.key}
                x={lastPoints[i]![0] + 10}
                y={labelY[i]}
                dy="0.32em"
                className="mark-label"
              >
                {s.short}
              </text>
            ))}
          {probeIdx !== null && (
            <line
              x1={sx(timesYr[probeIdx]!)}
              x2={sx(timesYr[probeIdx]!)}
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
          : `t = ${timesYr[probeIdx]!.toFixed(1)} yr: ${series
              .map((s) => `${s.short} ${formatConcentration(s.values[probeIdx]!)}`)
              .join(', ')} ${props.tableUnit}`}
      </p>
      <DataTable
        caption={props.title}
        columns={['Time (yr)', ...series.map((s) => `${s.short} (${props.tableUnit})`)]}
        rows={timesYr.map((t, i) => [
          t.toFixed(2),
          ...series.map((s) => formatConcentration(s.values[i]!)),
        ])}
      />
    </figure>
  );
}
