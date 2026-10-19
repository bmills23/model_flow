import type { CdfPoint, Fan, Histogram, SobolRow, TornadoRow } from './resultsData';
import { FAN_PROBABILITIES, fmtNum } from './resultsData';

/** Result charts for an uncertainty run: inline SVG, theme colours from CSS, no chart library. */

const W = 360;
const PAD_L = 8;
const PAD_R = 8;

interface Scale {
  log: boolean;
  to(x: number): number;
  ticks: number[];
}

/** Linear or log10 axis over [lo, hi] mapped to [x0, x1]; log is used only for positive spans over two decades. */
function makeScale(lo: number, hi: number, x0: number, x1: number, wantLog: boolean): Scale {
  const log = wantLog && lo > 0 && hi / lo > 100;
  const a = log ? Math.log10(lo) : lo;
  const b = log ? Math.log10(hi) : hi;
  const span = b - a || 1;
  const to = (x: number): number => x0 + (((log ? Math.log10(x) : x) - a) / span) * (x1 - x0);
  let ticks: number[];
  if (log) {
    const first = Math.ceil(a);
    const last = Math.floor(b);
    const step = Math.max(1, Math.ceil((last - first + 1) / 4));
    ticks = [];
    for (let e = first; e <= last; e += step) ticks.push(10 ** e);
    if (ticks.length < 2) ticks = [lo, hi];
  } else {
    ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  }
  return { log, to, ticks };
}

function Axis(props: { s: Scale; y: number }) {
  return (
    <g className="chart-axis">
      <line x1={PAD_L} y1={props.y} x2={W - PAD_R} y2={props.y} />
      {props.s.ticks.map((t, i) => (
        <g key={`${i}-${t}`}>
          <line x1={props.s.to(t)} y1={props.y} x2={props.s.to(t)} y2={props.y + 4} />
          <text
            x={Math.min(W - 28, Math.max(28, props.s.to(t)))}
            y={props.y + 16}
            textAnchor="middle"
          >
            {fmtNum(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

function Figure(props: {
  label: string;
  caption: React.ReactNode;
  height: number;
  children: React.ReactNode;
}) {
  return (
    <figure className="uchart">
      <svg viewBox={`0 0 ${W} ${props.height}`} role="img" aria-label={props.label}>
        {props.children}
      </svg>
      <figcaption>{props.caption}</figcaption>
    </figure>
  );
}

export function CdfChart(props: { points: CdfPoint[]; base: number | undefined; unit: string }) {
  const H = 200;
  const pts = props.points;
  if (pts.length === 0) return null;
  const lo = pts[0]!.x;
  const hi = pts[pts.length - 1]!.x;
  const s = makeScale(lo, hi, PAD_L + 24, W - PAD_R, true);
  const sy = (p: number): number => 10 + (1 - p) * (H - 50);
  let d = `M${s.to(lo).toFixed(1)} ${sy(0).toFixed(1)}`;
  pts.forEach((q, i) => {
    const prev = i === 0 ? 0 : pts[i - 1]!.p;
    d += ` L${s.to(q.x).toFixed(1)} ${sy(prev).toFixed(1)} L${s.to(q.x).toFixed(1)} ${sy(q.p).toFixed(1)}`;
  });
  const baseInRange = props.base !== undefined && props.base >= lo && props.base <= hi;
  return (
    <Figure
      label="Cumulative distribution of the output"
      height={H}
      caption={
        <>
          Cumulative probability against the output ({props.unit}
          {s.log ? ', log scale' : ''}).
          {baseInRange ? ' The dashed line is the deterministic base value.' : ''}
        </>
      }
    >
      <line className="chart-grid" x1={PAD_L + 24} y1={sy(0.5)} x2={W - PAD_R} y2={sy(0.5)} />
      <text className="chart-tick" x={PAD_L} y={sy(1) + 4}>
        1
      </text>
      <text className="chart-tick" x={PAD_L} y={sy(0.5) + 4}>
        .5
      </text>
      <text className="chart-tick" x={PAD_L} y={sy(0) + 4}>
        0
      </text>
      <path className="chart-line" d={d} />
      {baseInRange && (
        <line
          className="chart-base"
          x1={s.to(props.base!)}
          y1={sy(1)}
          x2={s.to(props.base!)}
          y2={sy(0)}
        />
      )}
      <Axis s={s} y={sy(0)} />
    </Figure>
  );
}

export function HistogramChart(props: { hist: Histogram; base: number | undefined; unit: string }) {
  const H = 200;
  const { edges, counts } = props.hist;
  const lo = edges[0]!;
  const hi = edges[edges.length - 1]!;
  const s = makeScale(lo, hi, PAD_L, W - PAD_R, props.hist.log);
  const top = Math.max(1, ...counts);
  const sy = (c: number): number => H - 40 - (c / top) * (H - 60);
  const baseInRange = props.base !== undefined && props.base >= lo && props.base <= hi;
  const x = (e: number): number =>
    props.hist.log ? s.to(e) : PAD_L + ((e - lo) / (hi - lo || 1)) * (W - PAD_L - PAD_R);
  return (
    <Figure
      label="Histogram of the output"
      height={H}
      caption={
        <>
          Iterations per bin ({props.unit}
          {props.hist.log ? ', log scale because the output spans more than two decades' : ''}).
          {baseInRange ? ' The dashed line is the deterministic base value.' : ''}
        </>
      }
    >
      {counts.map((c, i) => (
        <rect
          key={i}
          className="chart-bar"
          x={x(edges[i]!) + 0.5}
          y={sy(c)}
          width={Math.max(1, x(edges[i + 1]!) - x(edges[i]!) - 1)}
          height={Math.max(0, H - 40 - sy(c))}
        />
      ))}
      {baseInRange && (
        <line
          className="chart-base"
          x1={x(props.base!)}
          y1={sy(top)}
          x2={x(props.base!)}
          y2={H - 40}
        />
      )}
      <Axis s={s} y={H - 40} />
    </Figure>
  );
}

export function FanChart(props: {
  fan: Fan;
  base: readonly number[] | undefined;
  timeLabel: string;
  unit: string;
}) {
  const H = 220;
  const { times, bands } = props.fan;
  if (times.length < 2) return null;
  const all = [...bands.flat(), ...(props.base ?? [])].filter(Number.isFinite);
  const yLo = Math.min(...all);
  const yHi = Math.max(...all);
  const sx = makeScale(times[0]!, times[times.length - 1]!, PAD_L + 6, W - PAD_R, false);
  const sy = makeScale(yLo, yHi, H - 40, 10, true);
  const line = (ys: readonly number[]): string =>
    ys
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${sx.to(times[i]!).toFixed(1)} ${sy.to(v).toFixed(1)}`)
      .join(' ');
  const area = (lo: readonly number[], hi: readonly number[]): string =>
    `${line(hi)} ${[...lo]
      .map((v, i) => [sx.to(times[i]!), sy.to(v)] as const)
      .reverse()
      .map(([px, py]) => `L${px.toFixed(1)} ${py.toFixed(1)}`)
      .join(' ')} Z`;
  return (
    <Figure
      label="Percentile fan of the output over time"
      height={H}
      caption={
        <>
          Bands: 5th to 95th and 25th to 75th percentiles; solid line the median
          {props.base ? '; dashed line the deterministic base curve' : ''} ({props.unit}
          {sy.log ? ', log scale' : ''}). {props.timeLabel}. Based on {props.fan.used} iterations.
        </>
      }
    >
      <path className="fan-band fan-outer" d={area(bands[0]!, bands[4]!)} />
      <path className="fan-band fan-inner" d={area(bands[1]!, bands[3]!)} />
      <path className="fan-median" d={line(bands[FAN_PROBABILITIES.indexOf(0.5)]!)} />
      {props.base && <path className="fan-base" d={line(props.base)} />}
      <Axis s={sx} y={H - 40} />
      <text className="chart-tick" x={PAD_L} y={8}>
        {fmtNum(yHi)}
      </text>
      <text className="chart-tick" x={PAD_L} y={H - 44}>
        {fmtNum(yLo)}
      </text>
    </Figure>
  );
}

export function TornadoChart(props: { rows: TornadoRow[]; base: number; unit: string }) {
  const ran = props.rows.filter((r) => r.ok);
  const failed = props.rows.filter((r) => !r.ok);
  if (ran.length === 0)
    return <p className="muted">The one-at-a-time runs did not run for any input.</p>;
  const vals = [props.base, ...ran.flatMap((r) => [r.low, r.high])];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const rowH = 38;
  const H = ran.length * rowH + 40;
  const s = makeScale(lo, hi, PAD_L, W - PAD_R, true);
  return (
    <>
      <Figure
        label="Tornado chart of one-at-a-time output swings"
        height={H}
        caption={
          <>
            One input at a time at its 5th and 95th percentile, the others at their base values; the
            bar spans the two outputs ({props.unit}
            {s.log ? ', log scale' : ''}). This is a local view; the Sobol bars below are the global
            one.
          </>
        }
      >
        {ran.map((r, i) => {
          const y = i * rowH + 4;
          const a = s.to(Math.min(r.low, r.high));
          const b = s.to(Math.max(r.low, r.high));
          return (
            <g key={r.label}>
              <text className="chart-label" x={PAD_L} y={y + 11}>
                {r.label}
              </text>
              <rect
                className="tornado-bar"
                x={a}
                y={y + 16}
                width={Math.max(2, b - a)}
                height={14}
                rx={2}
              />
            </g>
          );
        })}
        <line
          className="chart-base"
          x1={s.to(props.base)}
          y1={0}
          x2={s.to(props.base)}
          y2={ran.length * rowH + 4}
        />
        <Axis s={s} y={ran.length * rowH + 6} />
      </Figure>
      {failed.length > 0 && (
        <p className="muted">
          One or both runs did not run for: {failed.map((f) => f.label).join(', ')}.
        </p>
      )}
    </>
  );
}

export function SobolChart(props: { rows: SobolRow[] }) {
  const rowH = 56;
  const H = props.rows.length * rowH + 30;
  const x0 = PAD_L;
  const x1 = W - PAD_R;
  const sx = (v: number): number => x0 + Math.max(0, Math.min(1, v)) * (x1 - x0);
  const unconverged = props.rows.filter((r) => !r.converged).map((r) => r.label);
  return (
    <>
      <Figure
        label="Sobol sensitivity indices with 95 percent intervals"
        height={H}
        caption="First order index (share of output variance an input explains alone) and total index (including interactions), with bootstrap 95 percent intervals."
      >
        {props.rows.map((r, i) => {
          const y = i * rowH + 4;
          const bar = (cls: string, v: number, iv: [number, number], dy: number) => (
            <g>
              <rect
                className={cls}
                x={x0}
                y={y + dy}
                width={Math.max(1, sx(v) - x0)}
                height={10}
                rx={2}
              />
              <line
                className="sobol-whisker"
                x1={sx(iv[0])}
                y1={y + dy + 5}
                x2={sx(iv[1])}
                y2={y + dy + 5}
              />
            </g>
          );
          return (
            <g key={r.label}>
              <text className="chart-label" x={PAD_L} y={y + 11}>
                {r.label}
              </text>
              {bar('sobol-first', r.first, r.firstInterval, 16)}
              {bar('sobol-total', r.total, r.totalInterval, 30)}
            </g>
          );
        })}
        <g className="chart-axis">
          <line x1={x0} y1={H - 24} x2={x1} y2={H - 24} />
          {[0, 0.5, 1].map((t) => (
            <text key={t} x={Math.min(W - 10, Math.max(10, sx(t)))} y={H - 8} textAnchor="middle">
              {t}
            </text>
          ))}
        </g>
      </Figure>
      <p className="legend">
        <span className="swatch sobol-first-sw" /> First order{' '}
        <span className="swatch sobol-total-sw" /> Total
      </p>
      {unconverged.length > 0 && (
        <p className="muted">
          Not converged (an interval half-width above 0.05): {unconverged.join(', ')}. Double the
          sample size N to tighten them.
        </p>
      )}
    </>
  );
}

export function SpearmanChart(props: { rows: { label: string; rho: number }[] }) {
  const rowH = 38;
  const H = props.rows.length * rowH + 30;
  const mid = W / 2;
  const half = W / 2 - PAD_R - 6;
  return (
    <Figure
      label="Spearman rank correlation of each input with the output"
      height={H}
      caption="Spearman rank correlation of each input with the output, from the sample: a global view that sees monotone effects only."
    >
      {props.rows.map((r, i) => {
        const y = i * rowH + 4;
        const w = Math.abs(r.rho) * half;
        return (
          <g key={r.label}>
            <text className="chart-label" x={PAD_L} y={y + 11}>
              {r.label} ({fmtNum(r.rho)})
            </text>
            {Number.isFinite(r.rho) && (
              <rect
                className={r.rho >= 0 ? 'spearman-pos' : 'spearman-neg'}
                x={r.rho >= 0 ? mid : mid - w}
                y={y + 16}
                width={Math.max(1, w)}
                height={12}
                rx={2}
              />
            )}
          </g>
        );
      })}
      <line className="chart-base" x1={mid} y1={0} x2={mid} y2={props.rows.length * rowH + 4} />
      <g className="chart-axis">
        <line x1={PAD_L} y1={H - 24} x2={W - PAD_R} y2={H - 24} />
        {[-1, 0, 1].map((t) => (
          <text
            key={t}
            x={Math.min(W - 10, Math.max(10, mid + t * half))}
            y={H - 8}
            textAnchor="middle"
          >
            {t}
          </text>
        ))}
      </g>
    </Figure>
  );
}

export function SummaryTable(props: { rows: { label: string; value: number }[]; unit: string }) {
  return (
    <div className="sat-wrap">
      <table className="sat">
        <caption>Summary of the output ({props.unit})</caption>
        <thead>
          <tr>
            <th scope="col">Statistic</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{fmtNum(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
