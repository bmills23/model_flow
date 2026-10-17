import { useState } from 'react';
import { scaleLog } from 'd3-scale';
import type { Medium, ModeledEndpoint } from '@model-flow/engine';
import { linePath } from '../transport/chartData';
import { useWidth } from '../transport/useWidth';
import { FROM_SI, MEDIUM_UNIT } from './build';
import { chartModel, metricOf } from './chartData';
import type { ModeledRun } from './modeledTypes';

const M = { l: 62, r: 14, t: 12, b: 40 };
const H = 260;

const ENDPOINT_AXIS: Record<ModeledEndpoint, { title: string; scale: number }> = {
  cancer: { title: 'cancer risk', scale: 1 },
  noncancer: { title: 'hazard index', scale: 1 },
  concentration: { title: 'concentration at the well (mg/L)', scale: 1e3 },
};

const tick = (t: number): string =>
  t >= 0.01 && t < 1e5 ? String(t) : t.toExponential(0).replace('e+', 'e');

/** The decades inside a log scale's domain. */
function decades(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.ceil(Math.log10(lo) - 1e-9); e <= Math.floor(Math.log10(hi) + 1e-9); e++) {
    out.push(Number((10 ** e).toPrecision(12)));
  }
  return out;
}

export function ModeledChart(props: {
  run: ModeledRun;
  medium: Extract<Medium, 'soil' | 'groundwater'>;
  method: 'legacy' | 'modern';
}) {
  const { run, medium, method } = props;
  const [ref, width] = useWidth();
  const [tableOpen, setTableOpen] = useState(false);
  const axis = ENDPOINT_AXIS[run.shown.endpoint];
  const level = run.result.levels[0]!.level;
  const unitScale = FROM_SI(medium);
  const model = chartModel({
    conc: run.curve.conc.map((c) => c * unitScale),
    metric: metricOf(run).map((m) => m * axis.scale),
    target: run.shown.target * axis.scale,
    level: level === null ? null : level * unitScale,
  });
  const plotW = Math.max(120, width - M.l - M.r);
  const plotH = H - M.t - M.b;
  const sx = scaleLog()
    .domain(model.xDomain)
    .range([M.l, M.l + plotW]);
  const sy = scaleLog()
    .domain(model.yDomain)
    .range([M.t + plotH, M.t]);
  const pts = model.points.map((p): [number, number] => [sx(p.x), sy(p.y)]);
  const cls = method === 'legacy' ? 's-legacy' : 's-modern';
  const xTitle = `source concentration (${MEDIUM_UNIT(medium)})`;
  const empty = model.points.length === 0;

  return (
    <figure className="chart" ref={ref}>
      <figcaption>
        {axis.title.replace(/ \(mg\/L\)$/, '')} versus source concentration, both axes logarithmic
      </figcaption>
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`${axis.title} against the source concentration on logarithmic axes, with the target line${level === null ? ' (the target is not reached)' : ' and the solution marked'}. A data table follows.`}
      >
        {decades(model.yDomain[0], model.yDomain[1]).map((t) => (
          <g key={`y${t}`} transform={`translate(0,${sy(t)})`}>
            <line x1={M.l} x2={M.l + plotW} className="grid" />
            <text x={M.l - 7} dy="0.32em" textAnchor="end" className="tick">
              {tick(t)}
            </text>
          </g>
        ))}
        {decades(model.xDomain[0], model.xDomain[1]).map((t) => (
          <g key={`x${t}`} transform={`translate(${sx(t)},${M.t + plotH})`}>
            <line y2={4} className="axis" />
            <text y={17} textAnchor="middle" className="tick">
              {tick(t)}
            </text>
          </g>
        ))}
        <line x1={M.l} x2={M.l + plotW} y1={M.t + plotH} y2={M.t + plotH} className="axis" />
        <text x={M.l + plotW / 2} y={H - 4} textAnchor="middle" className="axis-title">
          {xTitle}
        </text>
        <text
          transform={`translate(12,${M.t + plotH / 2}) rotate(-90)`}
          textAnchor="middle"
          className="axis-title"
        >
          {axis.title}
        </text>
        {!empty && <path d={linePath(pts)} className={`line ${cls}`} fill="none" />}
        <line
          x1={M.l}
          x2={M.l + plotW}
          y1={sy(model.target)}
          y2={sy(model.target)}
          className="target-line"
        />
        <text x={M.l + plotW - 4} y={sy(model.target) - 5} textAnchor="end" className="mark-label">
          target
        </text>
        {model.solution && (
          <>
            <line
              x1={sx(model.solution.x)}
              x2={sx(model.solution.x)}
              y1={sy(model.solution.y)}
              y2={M.t + plotH}
              className="solution-drop"
            />
            <circle
              cx={sx(model.solution.x)}
              cy={sy(model.solution.y)}
              r={5}
              className={`mark ${cls}`}
            />
          </>
        )}
      </svg>
      <p className="muted">
        {level === null
          ? 'The curve stays below the target over the whole search range: no cleanup level exists below the cap.'
          : 'The circle marks the solution, where the curve meets the target.'}
      </p>
      <div className="table-view">
        <button
          type="button"
          className="btn"
          aria-expanded={tableOpen}
          onClick={() => setTableOpen((o) => !o)}
        >
          {tableOpen ? 'Hide data table' : 'Show data table'}
        </button>
        {tableOpen && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Source ({MEDIUM_UNIT(medium)})</th>
                  <th scope="col">{axis.title}</th>
                </tr>
              </thead>
              <tbody>
                {run.curve.conc.map((c, i) => (
                  <tr key={i}>
                    <td>{Number((c * unitScale).toPrecision(3))}</td>
                    <td>{Number((metricOf(run)[i]! * axis.scale).toPrecision(3))}</td>
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
