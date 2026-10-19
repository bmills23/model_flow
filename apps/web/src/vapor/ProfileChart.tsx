import { useMemo, useState } from 'react';
import { scaleLinear, scaleLog } from 'd3-scale';
import { formatConcentration, linePath } from '../transport/chartData';
import { useWidth } from '../transport/useWidth';
import { DataTable } from '../vadose/DataTable';
import type { Band, ProfileCurve, VaporMethod } from './chartData';

const H = 320;
const LABEL: Record<VaporMethod, string> = { legacy: 'Legacy J&E', modern: 'Modern EPA' };

/**
 * Vapor concentration against height above the top of the source, one curve per method, on a log
 * axis. The bands are the soil strata between the source and the base of the foundation. The
 * values are the engine's profile points, joined by straight lines between layer boundaries.
 */
export function ProfileChart(props: { curves: ProfileCurve[]; bands: Band[] }) {
  const { curves, bands } = props;
  const [ref, width] = useWidth();
  const [probe, setProbe] = useState<number | null>(null);
  const M = { l: 52, r: 14, t: 18, b: 44 };
  const plotW = Math.max(120, width - M.l - M.r);
  const plotH = H - M.t - M.b;
  const top = Math.max(0, ...curves.flatMap((c) => c.heights));
  const positive = curves.flatMap((c) => c.values).filter((v) => v > 0 && Number.isFinite(v));

  // The heights the curves share (both methods use the layer boundaries of the same column).
  const heights = useMemo(() => {
    const all = curves.flatMap((c) => c.heights);
    return [...new Set(all.map((h) => Number(h.toPrecision(12))))].sort((a, b) => a - b);
  }, [curves]);

  if (positive.length === 0 || !(top > 0)) {
    return (
      <p className="muted">
        The vapor concentration is zero throughout (a zero source), so there is nothing to plot on a
        log axis.
      </p>
    );
  }
  const lo = Math.min(...positive) / 2;
  const hi = Math.max(...positive) * 2;
  const sx = scaleLog()
    .domain([lo, hi])
    .range([M.l, M.l + plotW]);
  const sy = scaleLinear()
    .domain([0, top])
    .range([M.t + plotH, M.t]);
  const allTicks = sx.ticks();
  const maxTicks = Math.max(2, Math.floor(plotW / 80));
  const stride = Math.ceil(allTicks.length / maxTicks);
  const xTicks = allTicks.filter((_, i) => i % stride === 0);
  const atHeight = (c: ProfileCurve, h: number): number | undefined => {
    const i = c.heights.findIndex((x) => Math.abs(x - h) < 1e-9 * Math.max(1, top));
    return i < 0 ? undefined : c.values[i];
  };
  const nearest = (clientY: number, boxTop: number): number => {
    const h = sy.invert(clientY - boxTop);
    let best = 0;
    heights.forEach((v, i) => {
      if (Math.abs(v - h) < Math.abs(heights[best]! - h)) best = i;
    });
    return best;
  };
  const onKey = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const step = e.key === 'ArrowUp' ? 1 : -1;
    setProbe((i) => Math.min(heights.length - 1, Math.max(0, (i ?? 0) + step)));
  };
  const f = (v: number | undefined): string => (v === undefined ? 'n/a' : formatConcentration(v));

  return (
    <figure className="chart">
      <figcaption>Vapor concentration against height above the source</figcaption>
      <ul className="legend legend-series" aria-label="Methods">
        {curves.map((c) => (
          <li key={c.method}>
            <svg width="26" height="12" aria-hidden="true">
              <line x1="0" x2="22" y1="6" y2="6" className={`line s-${c.method}`} />
            </svg>
            {LABEL[c.method]}
          </li>
        ))}
      </ul>
      <div ref={ref}>
        <svg
          width={width}
          height={H}
          role="img"
          aria-label="Vapor concentration against height above the source on a log axis, one curve per method, with the soil strata shaded. Focus and use the up and down arrow keys to read values. A data table follows."
          tabIndex={0}
          onPointerMove={(e) =>
            setProbe(nearest(e.clientY, e.currentTarget.getBoundingClientRect().top))
          }
          onPointerDown={(e) =>
            setProbe(nearest(e.clientY, e.currentTarget.getBoundingClientRect().top))
          }
          onPointerLeave={() => setProbe(null)}
          onKeyDown={onKey}
        >
          {bands.map((b, i) => (
            <g key={b.name}>
              <rect
                x={M.l}
                y={sy(Math.min(b.top, top))}
                width={plotW}
                height={Math.max(0, sy(b.bottom) - sy(Math.min(b.top, top)))}
                className={i % 2 === 0 ? 'band band-a' : 'band band-b'}
              />
              <text
                x={M.l + plotW - 6}
                y={sy(Math.min(b.top, top)) + 14}
                textAnchor="end"
                className="tick"
              >
                {b.name}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={`x${t}`} transform={`translate(${sx(t)},0)`}>
              <line y1={M.t} y2={M.t + plotH} className="grid" />
              <text y={M.t + plotH + 16} textAnchor="middle" className="tick">
                {formatConcentration(t)}
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
          <line x1={M.l} x2={M.l + plotW} y1={M.t + plotH} y2={M.t + plotH} className="axis" />
          <text x={M.l + plotW / 2} y={H - 4} textAnchor="middle" className="axis-title">
            vapor concentration (mg/m3, log scale)
          </text>
          <text
            transform={`translate(12,${M.t + plotH / 2}) rotate(-90)`}
            textAnchor="middle"
            className="axis-title"
          >
            height above the source (m)
          </text>
          {curves.map((c) => (
            <path
              key={c.method}
              d={linePath(c.values.map((v, i) => [sx(Math.max(v, lo)), sy(c.heights[i]!)]))}
              className={`line s-${c.method}`}
              fill="none"
              strokeDasharray={c.method === 'modern' ? '6 3' : undefined}
            />
          ))}
          {probe !== null && (
            <line
              x1={M.l}
              x2={M.l + plotW}
              y1={sy(heights[probe]!)}
              y2={sy(heights[probe]!)}
              className="crosshair"
            />
          )}
        </svg>
      </div>
      <p className="probe" aria-live="polite">
        {probe === null
          ? 'Move over or tap the chart, or focus it and use the up and down arrow keys, to read values.'
          : `Height ${heights[probe]!.toFixed(2)} m: ${curves
              .map((c) => `${LABEL[c.method]} ${f(atHeight(c, heights[probe]!))}`)
              .join(', ')} mg/m3`}
      </p>
      <DataTable
        caption="Vapor concentration against height above the source"
        columns={['Height (m)', ...curves.map((c) => `${LABEL[c.method]} (mg/m3)`)]}
        rows={heights.map((h) => [h.toFixed(2), ...curves.map((c) => f(atHeight(c, h)))])}
      />
    </figure>
  );
}
