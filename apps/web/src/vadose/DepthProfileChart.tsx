import { useMemo, useState } from 'react';
import { scaleLinear, scaleLog } from 'd3-scale';
import { formatConcentration, linePath, type ConcScale } from '../transport/chartData';
import { useWidth } from '../transport/useWidth';
import { layerBands, profileCurves, spreadLabels } from './chartData';
import type { RunSummary } from './compute';
import { DataTable } from './DataTable';

const H = 340;

/**
 * Leachate concentration against depth below the base of the source, one curve per profile time.
 * Depth runs downward; the bands are the layers below the source and the water table is the floor.
 * Time is ordered, so its curves share one hue and darken (or, in dark mode, brighten) with time.
 */
export function DepthProfileChart(props: { run: RunSummary; scale: ConcScale }) {
  const { run, scale } = props;
  const [ref, width] = useWidth();
  const [probeIdx, setProbeIdx] = useState<number | null>(null);
  const { depths, curves } = useMemo(() => profileCurves(run), [run]);
  const bands = useMemo(() => layerBands(run), [run]);
  const Lu = depths[depths.length - 1] ?? 1;
  const M = { l: 52, r: 14, t: 26, b: 40 };
  const max = Math.max(0, ...curves.flatMap((c) => c.values));
  const plotW = Math.max(120, width - M.l - M.r);
  const plotH = H - M.t - M.b;
  const xMaxDomain = max > 0 ? max * 1.05 : 1;
  const logLo = xMaxDomain * 1e-4;
  const sx =
    scale === 'log'
      ? scaleLog()
          .domain([logLo, xMaxDomain])
          .range([M.l, M.l + plotW])
      : scaleLinear()
          .domain([0, xMaxDomain])
          .range([M.l, M.l + plotW])
          .nice();
  const sy = scaleLinear()
    .domain([0, Lu])
    .range([M.t, M.t + plotH]);

  const path = (values: number[]): string =>
    linePath(
      values.map((v, i) => [scale === 'log' && !(v >= logLo) ? NaN : sx(v), sy(depths[i]!)]),
    );

  // direct label where each curve falls to half of its inlet value (or at its deepest point)
  const labelAt = curves.map((c) => {
    const top = c.values[0] ?? 0;
    let k = c.values.findIndex((v) => v <= top / 2);
    if (k < 0) k = c.values.length - 1;
    if (top <= 0) k = 0;
    return k;
  });
  const labelY = spreadLabels(
    labelAt.map((k) => sy(depths[k]!)),
    14,
    M.t + 8,
    M.t + plotH - 8,
  );

  const nearest = (clientY: number, top: number): number => {
    const d = sy.invert(clientY - top);
    let best = 0;
    depths.forEach((v, i) => {
      if (Math.abs(v - d) < Math.abs(depths[best]! - d)) best = i;
    });
    return best;
  };
  const onKey = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const step = e.key === 'ArrowDown' ? 1 : -1;
    setProbeIdx((i) => Math.min(depths.length - 1, Math.max(0, (i ?? 0) + step)));
  };

  const xTicks =
    scale === 'log'
      ? sx.ticks().filter((t) => Math.abs(Math.log10(t) - Math.round(Math.log10(t))) < 1e-9)
      : sx.ticks(Math.max(2, Math.floor(plotW / 80)));

  return (
    <figure className="chart">
      <figcaption>Concentration against depth below the source</figcaption>
      <ul className="legend legend-series" aria-label="Profile times">
        {curves.map((c, i) => (
          <li key={c.label}>
            <svg width="26" height="12" aria-hidden="true">
              <line x1="0" x2="22" y1="6" y2="6" className={`line t-${i}`} />
            </svg>
            {c.label}
          </li>
        ))}
      </ul>
      <div ref={ref}>
        <svg
          width={width}
          height={H}
          role="img"
          aria-label="Leachate concentration against depth below the base of the source at several times, with the layers below the source shaded and the water table at the bottom. Focus and use the up and down arrow keys to read values. A data table follows."
          tabIndex={0}
          onPointerMove={(e) =>
            setProbeIdx(nearest(e.clientY, e.currentTarget.getBoundingClientRect().top))
          }
          onPointerDown={(e) =>
            setProbeIdx(nearest(e.clientY, e.currentTarget.getBoundingClientRect().top))
          }
          onPointerLeave={() => setProbeIdx(null)}
          onKeyDown={onKey}
        >
          {bands.map((b, i) => (
            <g key={b.name}>
              <rect
                x={M.l}
                y={sy(b.top)}
                width={plotW}
                height={Math.max(0, sy(b.bottom) - sy(b.top))}
                className={i % 2 === 0 ? 'band band-a' : 'band band-b'}
              />
              {bands.length > 1 && (
                <text x={M.l + plotW - 6} y={sy(b.top) + 14} textAnchor="end" className="tick">
                  {`Layer ${i + 1}`}
                </text>
              )}
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={`x${t}`} transform={`translate(${sx(t)},0)`}>
              <line y1={M.t} y2={M.t + plotH} className="grid" />
              <text y={M.t + plotH + 16} textAnchor="middle" className="tick">
                {scale === 'log' ? (t >= 0.01 ? String(t) : t.toExponential(0)) : t}
              </text>
            </g>
          ))}
          {sy.ticks(5).map((t) => (
            <g key={`y${t}`} transform={`translate(0,${sy(t)})`}>
              <line x1={M.l - 4} x2={M.l} className="axis" />
              <text x={M.l - 8} dy="0.32em" textAnchor="end" className="tick">
                {t}
              </text>
            </g>
          ))}
          <line x1={M.l} x2={M.l} y1={M.t} y2={M.t + plotH} className="axis" />
          <line x1={M.l} x2={M.l + plotW} y1={M.t} y2={M.t} className="axis" />
          <line
            x1={M.l}
            x2={M.l + plotW}
            y1={M.t + plotH}
            y2={M.t + plotH}
            className="water-table"
          />
          <text x={M.l + 6} y={M.t - 8} className="tick">
            Base of the source
          </text>
          <text x={M.l + 6} y={M.t + plotH - 7} className="tick">
            Water table
          </text>
          <text x={M.l + plotW / 2} y={H - 4} textAnchor="middle" className="axis-title">
            concentration (mg/L)
          </text>
          <text
            transform={`translate(12,${M.t + plotH / 2}) rotate(-90)`}
            textAnchor="middle"
            className="axis-title"
          >
            depth below source (m)
          </text>
          {curves.map((c, i) => (
            <path key={c.label} d={path(c.values)} className={`line t-${i}`} fill="none" />
          ))}
          {curves.map((c, i) => {
            const x = sx(Math.max(c.values[labelAt[i]!] ?? 0, scale === 'log' ? logLo : 0));
            const flip = x + 50 > M.l + plotW;
            return (
              <text
                key={c.label}
                x={flip ? x - 8 : x + 8}
                y={labelY[i]}
                dy="0.32em"
                textAnchor={flip ? 'end' : 'start'}
                className="mark-label"
              >
                {c.label}
              </text>
            );
          })}
          {probeIdx !== null && (
            <line
              x1={M.l}
              x2={M.l + plotW}
              y1={sy(depths[probeIdx]!)}
              y2={sy(depths[probeIdx]!)}
              className="crosshair"
            />
          )}
        </svg>
      </div>
      <p className="probe" aria-live="polite">
        {probeIdx === null
          ? 'Move over or tap the chart, or focus it and use the up and down arrow keys, to read values.'
          : `Depth ${depths[probeIdx]!.toFixed(2)} m: ${curves
              .map((c) => `${c.label} ${formatConcentration(c.values[probeIdx]!)}`)
              .join(', ')} mg/L`}
      </p>
      <DataTable
        caption="Concentration against depth below the source"
        columns={['Depth (m)', ...curves.map((c) => `${c.label} (mg/L)`)]}
        rows={depths.map((d, i) => [
          d.toFixed(2),
          ...curves.map((c) => formatConcentration(c.values[i]!)),
        ])}
      />
    </figure>
  );
}
