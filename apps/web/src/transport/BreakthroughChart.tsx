import { useContext, useMemo, useState } from 'react';
import { TablesAlwaysOpen } from '../vadose/tablesOpen';
import { scaleLinear, scaleLog } from 'd3-scale';
import { formatConcentration, linePath, type ConcScale } from './chartData';
import type { ComputeResult, MethodKey } from './compute';
import { convert } from '@model-flow/engine';
import { Marker } from './Marker';
import { SERIES } from './series';
import { useWidth } from './useWidth';

const M = { l: 62, r: 14, t: 12, b: 38 };
const H = 260;

const toYr = (s: number): number => convert(s, 's', 'yr');

export function BreakthroughChart({ result, scale }: { result: ComputeResult; scale: ConcScale }) {
  const [ref, width] = useWidth();
  const [probeIdx, setProbeIdx] = useState<number | null>(null);
  const always = useContext(TablesAlwaysOpen);
  const [tableOpen0, setTableOpen] = useState(false);
  const tableOpen = always || tableOpen0;
  const keys = (['legacy', 'modern', 'domenico'] as const).filter((k) => result.series[k]);
  const tYr = result.times.map(toYr);
  const data = useMemo(
    () =>
      Object.fromEntries(keys.map((k) => [k, result.series[k]!.map((v) => v * 1e3)])) as Record<
        MethodKey,
        number[]
      >,
    // keys derives from result.series
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result],
  );
  const max = Math.max(0, ...keys.flatMap((k) => data[k]));
  const plotW = Math.max(120, width - M.l - M.r);
  const plotH = H - M.t - M.b;
  const sx = scaleLinear()
    .domain([0, tYr[tYr.length - 1] ?? 1])
    .range([M.l, M.l + plotW]);
  const yMaxDomain = max > 0 ? max * 1.08 : 1;
  const logLo = yMaxDomain * 1e-4;
  const sy =
    scale === 'log'
      ? scaleLog()
          .domain([logLo, yMaxDomain])
          .range([M.t + plotH, M.t])
          .clamp(false)
      : scaleLinear()
          .domain([0, yMaxDomain])
          .range([M.t + plotH, M.t])
          .nice();

  const pts = (k: MethodKey): [number, number][] =>
    data[k].map((v, i) => [sx(tYr[i]!), scale === 'log' && !(v >= logLo) ? NaN : sy(v)]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = sx.invert(e.clientX - rect.left);
    let best = 0;
    tYr.forEach((v, i) => {
      if (Math.abs(v - t) < Math.abs(tYr[best]! - t)) best = i;
    });
    setProbeIdx(best);
  };
  const onKey = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    const last = tYr.length - 1;
    if (e.key === 'Home') setProbeIdx(0);
    else if (e.key === 'End') setProbeIdx(last);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const step = e.key === 'ArrowRight' ? 1 : -1;
      setProbeIdx((i) => Math.min(last, Math.max(0, (i ?? 0) + step)));
    } else return;
    e.preventDefault();
  };

  return (
    <figure className="chart" ref={ref}>
      <figcaption>Concentration at the receptor versus time</figcaption>
      <ul className="legend legend-series" aria-label="Series">
        {keys.map((k) => (
          <li key={k}>
            <svg width="30" height="12" aria-hidden="true">
              <line
                x1="0"
                x2="22"
                y1="6"
                y2="6"
                className={`line ${SERIES[k].cls}`}
                strokeDasharray={SERIES[k].dash}
              />
              <Marker k={k} x={24} y={6} />
            </svg>
            {SERIES[k].label}
          </li>
        ))}
      </ul>
      <svg
        width={width}
        height={H}
        role="img"
        aria-label="Breakthrough curves at the receptor. A data table follows."
        tabIndex={0}
        onKeyDown={onKey}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setProbeIdx(null)}
      >
        {(scale === 'log'
          ? sy.ticks().filter((t) => Math.abs(Math.log10(t) - Math.round(Math.log10(t))) < 1e-9)
          : sy.ticks(5)
        ).map((t) => (
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
          concentration (mg/L)
        </text>
        {keys.map((k) => (
          <path
            key={k}
            d={linePath(pts(k))}
            className={`line ${SERIES[k].cls}`}
            strokeDasharray={SERIES[k].dash}
            fill="none"
          />
        ))}
        {keys.map((k) => {
          const p = pts(k)[pts(k).length - 1]!;
          return Number.isFinite(p[1]) ? <Marker key={k} k={k} x={p[0]} y={p[1]} /> : null;
        })}
        {probeIdx !== null && (
          <line
            x1={sx(tYr[probeIdx]!)}
            x2={sx(tYr[probeIdx]!)}
            y1={M.t}
            y2={M.t + plotH}
            className="crosshair"
          />
        )}
      </svg>
      <p className="probe" aria-live="polite">
        {probeIdx === null
          ? 'Move over or tap the chart, or focus it and use the arrow keys, to read values.'
          : `t = ${tYr[probeIdx]!.toFixed(1)} yr: ${keys
              .map(
                (k) =>
                  `${SERIES[k].label.split(' ')[0]} ${formatConcentration(data[k][probeIdx]!)}`,
              )
              .join(', ')} mg/L`}
      </p>
      <div className="table-view">
        {!always && (
          <button
            type="button"
            className="btn"
            aria-expanded={tableOpen}
            onClick={() => setTableOpen((o) => !o)}
          >
            {tableOpen ? 'Hide data table' : 'Show data table'}
          </button>
        )}
        {tableOpen && (
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Breakthrough data table, scrollable"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Time (yr)</th>
                  {keys.map((k) => (
                    <th key={k} scope="col">
                      {SERIES[k].label.split(' ')[0]} (mg/L)
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tYr.map((t, i) => (
                  <tr key={i}>
                    <td>{t.toFixed(2)}</td>
                    {keys.map((k) => (
                      <td key={k}>{formatConcentration(data[k][i]!)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </figure>
  );
}
