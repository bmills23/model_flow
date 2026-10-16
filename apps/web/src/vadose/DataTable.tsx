import { useState } from 'react';

/** The chart's values as a table, collapsed by default, so nothing depends on hover or colour. */
export function DataTable(props: {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="table-view">
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide data table' : 'Show data table'}
      </button>
      {open && (
        <div className="table-scroll">
          <table>
            <caption className="sr-only">{props.caption}</caption>
            <thead>
              <tr>
                {props.columns.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, k) => (
                    <td key={k}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
