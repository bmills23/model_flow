import { fmt, sectionLevels } from './chartData';
import type { RunSummary } from './compute';

const W = 300;
const H = 170;
const X0 = 14;
const X1 = 190;
const Y0 = 34;
const Y1 = 134;

/** One panel: the source column at one water level, split into region 1 above and region 2 below. */
function Panel(props: { title: string; unsat: number; sat: number; thickness: number }) {
  const { unsat, sat, thickness } = props;
  const wt = Y0 + (unsat / thickness) * (Y1 - Y0);
  const h1 = wt - Y0;
  const h2 = Y1 - wt;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="section-svg" aria-hidden="true">
      <text x={X0} y="14" className="tick section-title">
        {props.title}
      </text>
      {[X0 + 30, X0 + 88, X0 + 146].map((x) => (
        <g key={x}>
          <line x1={x} x2={x} y1="20" y2={Y0 - 2} className="flow-arrow" />
          <path d={`M${x - 4},${Y0 - 8}L${x},${Y0 - 1}L${x + 4},${Y0 - 8}`} className="flow-head" />
        </g>
      ))}
      <text x={X1 + 8} y="30" className="tick">
        infiltration
      </text>
      {h1 > 0 && <rect x={X0} y={Y0} width={X1 - X0} height={h1} className="soil-1" />}
      {h2 > 0 && <rect x={X0} y={wt} width={X1 - X0} height={h2} className="soil-2" />}
      <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} className="section-frame" />
      <line x1={X0 - 6} x2={X1 + 6} y1={wt} y2={wt} className="water-line" />
      {h2 >= 12 && (
        <g>
          <line
            x1={X0 + 24}
            x2={X1 - 30}
            y1={wt + h2 / 2}
            y2={wt + h2 / 2}
            className="flow-arrow"
          />
          <path
            d={`M${X1 - 36},${wt + h2 / 2 - 4}L${X1 - 29},${wt + h2 / 2}L${X1 - 36},${wt + h2 / 2 + 4}`}
            className="flow-head"
          />
        </g>
      )}
      <text x={X1 + 8} y={Y0 + Math.max(h1 / 2, 6)} dy="0.32em" className="tick">
        {h1 > 0 ? `Region 1, ${fmt(unsat)} m` : 'Region 1: none'}
      </text>
      <text
        x={X1 + 8}
        y={wt + Math.max(h2 / 2, 8) + (h1 > 0 && h1 < 12 ? 6 : 0)}
        dy="0.32em"
        className="tick"
      >
        {h2 > 0 ? `Region 2, ${fmt(sat)} m` : 'Region 2: none'}
      </text>
      <text x={X1 + 8} y={Y1 + 18} className="tick">
        {`thickness ${fmt(thickness)} m`}
      </text>
    </svg>
  );
}

/**
 * Section through the source at low and high water. Region 1 is the part above the water table,
 * flushed downward by infiltration; region 2 is the part below, flushed by groundwater flowing
 * through it. Both release into one shared pool of chemical.
 */
export function CrossSection(props: {
  levels: RunSummary['levels'];
  thickness: number;
  length: number;
}) {
  const lv = sectionLevels(props.levels, props.thickness);
  const label = `Cross-section of the ${fmt(props.length)} m long source, ${fmt(props.thickness)} m thick, at low water (region 1 ${fmt(lv.low.unsat)} m, region 2 ${fmt(lv.low.sat)} m) and at high water (region 1 ${fmt(lv.high.unsat)} m, region 2 ${fmt(lv.high.sat)} m).`;
  return (
    <figure className="chart">
      <figcaption>Cross-section of the source at low and high water</figcaption>
      <div className="section-row" role="img" aria-label={label}>
        <Panel title="Low water" {...lv.low} thickness={props.thickness} />
        <Panel title="High water" {...lv.high} thickness={props.thickness} />
      </div>
      <p className="muted chart-note">
        Region 1 (above the water table) is flushed by infiltration; region 2 (below it) by
        groundwater flowing through the source. Both draw on one shared pool of chemical.
        {props.levels.capped && ' The high-water level is capped at the source thickness.'}
      </p>
    </figure>
  );
}
