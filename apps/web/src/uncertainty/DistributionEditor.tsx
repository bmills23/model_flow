import { useEffect, useMemo, useState } from 'react';
import type { UncertainInput } from '@model-flow/engine';
import { Field } from '../ui/controls';
import {
  KIND_OPTIONS,
  buildDistribution,
  buildEditorSpec,
  cdfCurve,
  emptyRow,
  pairKey,
  paramFields,
  type DistRow,
  type EditorSpec,
  type LognormalForm,
  type RowKind,
} from './editor';
import './uncertainty.css';

export interface UnitDisplay {
  unit: string;
  /** Multiplies an entered value into SI. */
  factor: number;
}

export interface DistributionEditorProps {
  inputs: readonly UncertainInput<unknown>[];
  /** Optional entered units per input id; the default is the input's SI unit. */
  displays?: Readonly<Record<string, UnitDisplay>>;
  /** Called with the built specification whenever any field changes (and once on mount). */
  onChange?: (spec: EditorSpec) => void;
}

const CATEGORY_LABEL: Record<string, string> = {
  exposure: 'Exposure',
  transport: 'Transport',
  site: 'Site',
  chemical: 'Chemical',
};

function CdfPreview(props: { row: DistRow; factor: number }) {
  const built = buildDistribution(props.row, props.factor);
  if (!built.ok || built.dist === null) return null;
  const dist = built.dist;
  let pts;
  try {
    pts = cdfCurve(dist, 60);
  } catch {
    return null;
  }
  if (!pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.p))) return null;
  const x0 = pts[0]!.x;
  const x1 = pts[pts.length - 1]!.x;
  const span = x1 - x0 || 1;
  const W = 240;
  const H = 80;
  const sx = (x: number) => 4 + ((x - x0) / span) * (W - 8);
  const sy = (p: number) => H - 4 - p * (H - 8);
  const d = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)} ${sy(p.p).toFixed(1)}`)
    .join(' ');
  const fmt = (v: number) =>
    Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-2)
      ? v.toExponential(2)
      : String(Number(v.toPrecision(3)));
  const f = props.factor || 1;
  return (
    <figure className="cdf">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Cumulative distribution preview"
        preserveAspectRatio="xMidYMid meet"
      >
        <line className="cdf-axis" x1="4" y1={H - 4} x2={W - 4} y2={H - 4} />
        <line className="cdf-axis" x1="4" y1="4" x2="4" y2={H - 4} />
        <line className="cdf-mid" x1="4" y1={sy(0.5)} x2={W - 4} y2={sy(0.5)} />
        <path className="cdf-line" d={d} />
      </svg>
      <figcaption>
        <span>{fmt(x0 / f)}</span>
        <span>cumulative probability 0 to 1</span>
        <span>{fmt(x1 / f)}</span>
      </figcaption>
    </figure>
  );
}

function InputRow(props: {
  input: UncertainInput<unknown>;
  row: DistRow;
  unit: string;
  factor: number;
  error: string | undefined;
  onChange: (r: DistRow) => void;
}) {
  const { input, row } = props;
  const id = `dist-${input.id}`;
  const fields = paramFields(row.kind, row.lnForm);
  const patch = (p: Partial<DistRow>) => props.onChange({ ...row, ...p });
  return (
    <fieldset className="dist-row" aria-label={input.label}>
      <legend>{input.label}</legend>
      <div className="dist-top">
        <label className="field" htmlFor={id}>
          <span className="field-label">Distribution</span>
          <select
            id={id}
            value={row.kind}
            onChange={(e) => patch({ kind: e.target.value as RowKind })}
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {row.kind === 'lognormal' && (
          <label className="field">
            <span className="field-label">Lognormal given by</span>
            <select
              value={row.lnForm}
              onChange={(e) => patch({ lnForm: e.target.value as LognormalForm })}
            >
              <option value="geometric">Geometric mean and GSD</option>
              <option value="arithmetic">Arithmetic mean and SD</option>
            </select>
          </label>
        )}
      </div>
      {row.kind !== 'point' && (
        <>
          <div className="fields">
            {fields.map((f) => (
              <Field
                key={f.key}
                label={f.key === 'gsd' ? f.label : `${f.label} (${props.unit})`}
                value={row.params[f.key] ?? ''}
                onChange={(v) => patch({ params: { ...row.params, [f.key]: v } })}
              />
            ))}
          </div>
          {row.kind === 'empirical' && (
            <label className="field">
              <span className="field-label">
                Table: value, cumulative probability (one pair per line)
              </span>
              <textarea
                rows={4}
                value={row.table}
                onChange={(e) => patch({ table: e.target.value })}
                spellCheck={false}
              />
            </label>
          )}
          {row.kind !== 'constant' && (
            <div className="fields">
              <Field
                label={`Lower truncation (${props.unit})`}
                value={row.lo}
                onChange={(v) => patch({ lo: v })}
                hint="Optional."
              />
              <Field
                label={`Upper truncation (${props.unit})`}
                value={row.hi}
                onChange={(v) => patch({ hi: v })}
                hint="Optional."
              />
            </div>
          )}
          <CdfPreview row={row} factor={props.factor} />
        </>
      )}
      {props.error && (
        <p className="dist-error" role="alert">
          {props.error}
        </p>
      )}
    </fieldset>
  );
}

function CorrelationPanel(props: {
  choices: readonly { id: string; label: string }[];
  entries: Record<string, string>;
  setEntries: (e: Record<string, string>) => void;
  issues: readonly string[];
  spec: EditorSpec;
}) {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [value, setValue] = useState('');
  const label = (id: string) => props.choices.find((c) => c.id === id)?.label ?? id;
  const canAdd = first !== '' && second !== '' && first !== second && value.trim() !== '';
  const shown = Object.entries(props.entries);
  const corr = props.spec.correlation;
  return (
    <section className="panel" aria-label="Rank correlation">
      <h2>Rank correlation</h2>
      <p className="muted">
        Optional Spearman rank correlation between sampled inputs, applied by the Latin hypercube
        method. Inputs left out stay independent. The matrix must be positive definite.
      </p>
      {props.choices.length < 2 ? (
        <p className="muted">Give at least two inputs a distribution to correlate them.</p>
      ) : (
        <div className="corr-add">
          <label className="field">
            <span className="field-label">First input</span>
            <select value={first} onChange={(e) => setFirst(e.target.value)}>
              <option value="">Choose</option>
              {props.choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Second input</span>
            <select value={second} onChange={(e) => setSecond(e.target.value)}>
              <option value="">Choose</option>
              {props.choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <Field label="Correlation" value={value} onChange={setValue} hint="Between -1 and 1." />
          <button
            type="button"
            className="button"
            disabled={!canAdd}
            onClick={() => {
              props.setEntries({ ...props.entries, [pairKey(first, second)]: value.trim() });
              setValue('');
            }}
          >
            Add pair
          </button>
        </div>
      )}
      {shown.length > 0 && (
        <ul className="corr-list">
          {shown.map(([key, v]) => {
            const [a, b] = key.split('|') as [string, string];
            return (
              <li key={key}>
                <span>
                  {label(a)} and {label(b)}: <strong>{v}</strong>
                </span>
                <button
                  type="button"
                  className="button button-quiet"
                  aria-label={`Remove ${label(a)} and ${label(b)}`}
                  onClick={() => {
                    const next = { ...props.entries };
                    delete next[key];
                    props.setEntries(next);
                  }}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {corr && props.issues.length === 0 && (
        <div className="corr-matrix" tabIndex={0} role="group" aria-label="Target matrix">
          <table className="sat">
            <thead>
              <tr>
                <th />
                {corr.ids.map((id) => (
                  <th key={id}>{label(id)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {corr.matrix.map((r, i) => (
                <tr key={corr.ids[i]}>
                  <th>{label(corr.ids[i] as string)}</th>
                  {r.map((x, j) => (
                    <td key={corr.ids[j]}>{Number(x.toFixed(3))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">Positive definite.</p>
        </div>
      )}
      {props.issues.length > 0 && (
        <div className="dist-error" role="alert">
          {props.issues.map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
      )}
    </section>
  );
}

export function DistributionEditor(props: DistributionEditorProps) {
  const [rows, setRows] = useState<Record<string, DistRow>>({});
  const [entries, setEntries] = useState<Record<string, string>>({});
  const factors = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, d] of Object.entries(props.displays ?? {})) out[id] = d.factor;
    return out;
  }, [props.displays]);
  const spec = useMemo(
    () => buildEditorSpec(props.inputs, rows, factors, entries),
    [props.inputs, rows, factors, entries],
  );
  const { onChange } = props;
  useEffect(() => {
    onChange?.(spec);
  }, [spec, onChange]);

  const categories = [...new Set(props.inputs.map((u) => u.category))];
  const choices = props.inputs
    .filter((u) => {
      const r = rows[u.id];
      return r !== undefined && r.kind !== 'point' && r.kind !== 'constant';
    })
    .map((u) => ({ id: u.id, label: u.label }));

  return (
    <div className="dist-editor">
      {categories.map((cat) => (
        <section className="panel" key={cat} aria-label={`${CATEGORY_LABEL[cat] ?? cat} inputs`}>
          <h2>{CATEGORY_LABEL[cat] ?? cat} inputs</h2>
          {props.inputs
            .filter((u) => u.category === cat)
            .map((u) => (
              <InputRow
                key={u.id}
                input={u}
                row={rows[u.id] ?? emptyRow()}
                unit={props.displays?.[u.id]?.unit ?? u.unit}
                factor={factors[u.id] ?? 1}
                error={spec.rowIssues[u.id]}
                onChange={(r) => setRows({ ...rows, [u.id]: r })}
              />
            ))}
        </section>
      ))}
      <CorrelationPanel
        choices={choices}
        entries={entries}
        setEntries={setEntries}
        issues={spec.correlationIssues}
        spec={spec}
      />
    </div>
  );
}
