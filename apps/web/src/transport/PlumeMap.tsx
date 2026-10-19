import { useMemo, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import {
  colourFraction,
  contourBands,
  contourLevels,
  flattenGrid,
  formatConcentration,
  type ConcScale,
} from './chartData';
import type { ComputeResult } from './compute';
import type { Scenario } from './form';
import { useWidth } from './useWidth';
import { DataTable } from '../vadose/DataTable';

interface Props {
  result: ComputeResult;
  scenario: Scenario;
  scale: ConcScale;
  methodLabel: string;
  timeLabel: string;
  depthLabel: string;
}

const M = { l: 46, r: 10, t: 10, b: 36 };

export function PlumeMap({ result, scenario, scale, methodLabel, timeLabel, depthLabel }: Props) {
  const [ref, width] = useWidth();
  const [probe, setProbe] = useState<string>('');
  const { xs, ys, grid } = result;
  const nx = xs.length;
  const ny = ys.length;
  const { xMin, xMax, yHalf } = scenario.extent;

  const values = useMemo(() => flattenGrid(grid), [grid]);
  const max = useMemo(() => values.reduce((m, v) => (v > m ? v : m), 0), [values]);
  const levels = useMemo(() => contourLevels(max, scale), [max, scale]);

  const plotW = Math.max(120, width - M.l - M.r);
  const plotH = Math.round(Math.min(plotW * ((2 * yHalf) / (xMax - xMin)), 520));
  const height = plotH + M.t + M.b;
  const sx = scaleLinear()
    .domain([xMin, xMax])
    .range([M.l, M.l + plotW]);
  const sy = scaleLinear()
    .domain([-yHalf, yHalf])
    .range([M.t + plotH, M.t]);

  const bands = useMemo(() => {
    const dx = (xMax - xMin) / (nx - 1);
    const dy = (2 * yHalf) / (ny - 1);
    return contourBands(
      values,
      nx,
      ny,
      levels,
      scale,
      (cx) => sx(xMin + (cx - 0.5) * dx),
      (cy) => sy(-yHalf + (cy - 0.5) * dy),
    );
    // sx and sy are functions of the plot size and extent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, nx, ny, levels, scale, plotW, plotH, xMin, xMax, yHalf]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = sx.invert(e.clientX - rect.left);
    const y = sy.invert(e.clientY - rect.top);
    if (x < xMin || x > xMax || y < -yHalf || y > yHalf) {
      setProbe('');
      return;
    }
    const i = Math.round(((x - xMin) / (xMax - xMin)) * (nx - 1));
    const j = Math.round(((y + yHalf) / (2 * yHalf)) * (ny - 1));
    setProbe(
      `x ${x.toFixed(0)} m, y ${y.toFixed(0)} m: ${formatConcentration(values[j * nx + i]!)} mg/L`,
    );
  };

  const src = scenario.source;
  const rx = scenario.receptor.x;
  const ry = scenario.receptor.y;
  const rxIn = rx >= xMin && rx <= xMax && Math.abs(ry) <= yHalf;

  return (
    <figure className="chart" ref={ref}>
      <figcaption>
        Plan view, {methodLabel}, {timeLabel}, {depthLabel}. Peak {formatConcentration(max)} mg/L.
      </figcaption>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Plume map, ${methodLabel}, ${timeLabel}. Peak concentration ${formatConcentration(max)} milligrams per litre. A data table follows.`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setProbe('')}
      >
        <rect x={M.l} y={M.t} width={plotW} height={plotH} className="plot-bg" />
        {bands.map((b) => (
          <path
            key={b.level}
            d={b.d}
            className="band"
            style={{
              fill: `color-mix(in oklab, var(--ramp-hi) ${Math.round(colourFraction(b.level, levels, scale) * 100)}%, var(--ramp-lo))`,
            }}
          />
        ))}
        {bands.map((b) => (
          <path key={`i${b.level}`} d={b.d} className="iso" />
        ))}
        {sx.ticks(Math.max(2, Math.floor(plotW / 80))).map((t) => (
          <g key={`x${t}`} transform={`translate(${sx(t)},${M.t + plotH})`}>
            <line y2={4} className="axis" />
            <text y={17} textAnchor="middle" className="tick">
              {t}
            </text>
          </g>
        ))}
        {sy.ticks(Math.max(2, Math.floor(plotH / 40))).map((t) => (
          <g key={`y${t}`} transform={`translate(${M.l},${sy(t)})`}>
            <line x2={-4} className="axis" />
            <text x={-7} dy="0.32em" textAnchor="end" className="tick">
              {t}
            </text>
          </g>
        ))}
        <rect x={M.l} y={M.t} width={plotW} height={plotH} className="plot-frame" />
        <text x={M.l + plotW / 2} y={height - 4} textAnchor="middle" className="axis-title">
          x downgradient of the source face (m)
        </text>
        <text
          transform={`translate(11,${M.t + plotH / 2}) rotate(-90)`}
          textAnchor="middle"
          className="axis-title"
        >
          y (m)
        </text>
        <rect
          x={sx(Math.max(src.x1, xMin))}
          y={sy(src.y2)}
          width={Math.max(2, sx(Math.min(src.x2, xMax)) - sx(Math.max(src.x1, xMin)))}
          height={Math.max(2, sy(src.y1) - sy(src.y2))}
          className="source-mark"
        >
          <title>Source footprint</title>
        </rect>
        {rxIn && (
          <g transform={`translate(${sx(rx)},${sy(ry)})`}>
            <circle r={6} className="receptor-mark" />
            <path d="M-3.5,-3.5L3.5,3.5M-3.5,3.5L3.5,-3.5" className="receptor-x" />
            <text x={9} y={-8} className="mark-label">
              Receptor
            </text>
            <title>Receptor</title>
          </g>
        )}
      </svg>
      <DataTable
        caption={`Concentration along the plume centreline (y nearest 0), ${methodLabel}, ${timeLabel}, ${depthLabel}`}
        columns={['x downgradient (m)', 'y (m)', 'Concentration (mg/L)']}
        rows={xs.map((x, i) => {
          const jc = ys.reduce((best, y, j) => (Math.abs(y) < Math.abs(ys[best]!) ? j : best), 0);
          return [
            String(Number(x.toFixed(2))),
            String(Number(ys[jc]!.toFixed(2))),
            formatConcentration(values[jc * nx + i]!),
          ];
        })}
      />
      <p className="probe" aria-live="off">
        {probe || 'Move over or tap the map to read the concentration.'}
      </p>
      {levels.length > 0 ? (
        <ul className="legend" aria-label="Concentration levels in milligrams per litre">
          {bands.map((b) => (
            <li key={b.level}>
              <span
                className="swatch"
                style={{
                  background: `color-mix(in oklab, var(--ramp-hi) ${Math.round(colourFraction(b.level, levels, scale) * 100)}%, var(--ramp-lo))`,
                }}
              />
              {formatConcentration(b.level)}
            </li>
          ))}
          <li className="legend-unit">
            mg/L (filled regions at or above each level, {scale} scale)
          </li>
        </ul>
      ) : (
        <p className="muted">No concentration above zero in this view.</p>
      )}
      <p className="legend-key">
        <span className="source-key" /> Source footprint <span className="receptor-key" /> Receptor
      </p>
    </figure>
  );
}
