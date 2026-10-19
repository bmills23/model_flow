import { useContext } from 'react';
import { TablesAlwaysOpen } from '../vadose/tablesOpen';
import type { BarRow } from './chartData';

/**
 * Horizontal stacked bars, one row per receptor and method. Every row is drawn to the same scale (the
 * largest total), so rows compare; the segments of a row are its pathways or chemicals. The data is also
 * given as a table for screen readers.
 */
export function StackedBars(props: {
  title: string;
  rows: BarRow[];
  fmt: (x: number) => string;
  unit: string;
  ariaLabel: string;
  /** What the segments are, the first column header of the table. */
  by: string;
}) {
  const always = useContext(TablesAlwaysOpen);
  const by = props.by;
  const { rows, fmt } = props;
  const max = Math.max(0, ...rows.map((r) => r.total));
  const legend = new Map<number, { label: string; slot: number }[]>();
  for (const r of rows) {
    for (const s of r.segments) {
      const list = legend.get(s.slot) ?? [];
      if (!list.some((l) => l.label === s.label)) list.push({ label: s.label, slot: s.slot });
      legend.set(s.slot, list);
    }
  }
  const entries = [...legend.values()].flat().sort((a, b) => a.slot - b.slot);
  const allLabels = [...new Set(rows.flatMap((r) => r.segments.map((s) => s.label)))];
  return (
    <figure className="chart stacked">
      <figcaption>{props.title}</figcaption>
      <div className="stack-rows" role="img" aria-label={props.ariaLabel}>
        {rows.map((r) => (
          <div className="stack-row" key={r.label}>
            <div className="stack-label">{r.label}</div>
            <div className="stack-track">
              {r.total > 0 ? (
                <div className="stack-bar" style={{ width: `${(r.total / max) * 100}%` }}>
                  {r.segments.map((s) => (
                    <span
                      key={s.id}
                      className="stack-seg"
                      style={{
                        width: `${(s.value / r.total) * 100}%`,
                        background: `var(--r-${s.slot})`,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <span className="stack-none">none</span>
              )}
            </div>
            <div className="stack-total">{fmt(r.total)}</div>
          </div>
        ))}
      </div>
      {entries.length > 0 && (
        <ul className="legend" aria-label="Legend">
          {entries.map((e) => (
            <li key={`${e.slot}:${e.label}`}>
              <span className="swatch" style={{ background: `var(--r-${e.slot})` }} aria-hidden />
              {e.label}
            </li>
          ))}
        </ul>
      )}
      <details className="data-table" open={always || undefined}>
        <summary>Table of values</summary>
        <div className="sat-wrap">
          <table className="sat">
            <caption className="sr-only">
              {props.title} as a table, {props.unit}
            </caption>
            <thead>
              <tr>
                <th scope="col">{by}</th>
                {rows.map((r) => (
                  <th key={r.label} scope="col">
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allLabels.map((l) => (
                <tr key={l}>
                  <th scope="row">{l}</th>
                  {rows.map((r) => {
                    const s = r.segments.find((x) => x.label === l);
                    return <td key={r.label}>{s ? fmt(s.value) : '0'}</td>;
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row">Total</th>
                {rows.map((r) => (
                  <td key={r.label}>{fmt(r.total)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
