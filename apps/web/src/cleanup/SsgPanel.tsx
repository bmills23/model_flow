import { useEffect, useMemo, useState } from 'react';
import { Field, Seg } from '../ui/controls';
import type { ChemicalDb } from '../risk/chemicalDb';
import { fmtLevel } from './format';
import { SSG_DAFS, SSG_TARGETS, type CleanupForm, type SsgForm } from './form';
import { computeSsg, loadCleanupProps, type CleanupProps, type SsgRow } from './ssg';

export function SsgInputs(props: { form: SsgForm; onChange: (next: Partial<SsgForm>) => void }) {
  const { form: f, onChange } = props;
  return (
    <section className="panel" aria-label="Soil screening leaching">
      <h2>Soil screening leaching level</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={f.on}
          onChange={(e) => onChange({ on: e.target.checked })}
        />
        <span>
          Also compute the soil concentration whose leachate meets a groundwater target (EPA Soil
          Screening Guidance, a screening check).
        </span>
      </label>
      {f.on && (
        <>
          <Seg
            legend="Dilution attenuation factor"
            name="ssgDaf"
            value={f.daf}
            onChange={(daf) => onChange({ daf })}
            options={SSG_DAFS}
          />
          <p className="muted">
            {f.daf === '1' &&
              'No dilution or attenuation, the choice of the RSL tables and for shallow water tables, fractured media, karst or sources above 30 acres.'}
            {f.daf === '20' &&
              'The guidance default for sources up to 0.5 acre, behind the generic soil screening levels.'}
            {f.daf === 'site' &&
              'Computed from the aquifer and source below; the mixing depth cannot exceed the aquifer thickness.'}
          </p>
          {f.daf === 'site' && (
            <div className="fields">
              <Field
                label="Hydraulic conductivity (m/d)"
                value={f.siteK}
                onChange={(siteK) => onChange({ siteK })}
              />
              <Field
                label="Hydraulic gradient (m/m)"
                value={f.siteGradient}
                onChange={(siteGradient) => onChange({ siteGradient })}
              />
              <Field
                label="Infiltration (cm/yr)"
                value={f.siteInfiltration}
                onChange={(siteInfiltration) => onChange({ siteInfiltration })}
              />
              <Field
                label="Source length along flow (m)"
                value={f.siteL}
                onChange={(siteL) => onChange({ siteL })}
              />
              <Field
                label="Aquifer thickness (m)"
                value={f.siteDa}
                onChange={(siteDa) => onChange({ siteDa })}
              />
            </div>
          )}
          <Seg
            legend="Groundwater target"
            name="ssgTarget"
            value={f.targetKind}
            onChange={(targetKind) => onChange({ targetKind })}
            options={SSG_TARGETS}
          />
          {f.targetKind === 'user' && (
            <Field
              label="Groundwater target (ug/L)"
              value={f.userTarget}
              onChange={(userTarget) => onChange({ userTarget })}
            />
          )}
          {f.targetKind === 'tap' && (
            <p className="muted">
              Drinking water plus bathing for receptor A with the modern method, at the target risk
              and hazard quotient above.
            </p>
          )}
          <div className="fields">
            <Field
              label="Source depth (m)"
              value={f.sourceDepth}
              onChange={(sourceDepth) => onChange({ sourceDepth })}
              placeholder="infinite source"
              hint="Optional: adds the mass-limit level and keeps the higher."
            />
            <Field
              label="Bulk density (kg/L)"
              value={f.rhoB}
              onChange={(rhoB) => onChange({ rhoB })}
            />
            <Field
              label="Organic carbon fraction"
              value={f.foc}
              onChange={(foc) => onChange({ foc })}
            />
            <Field
              label="Water-filled porosity"
              value={f.theta}
              onChange={(theta) => onChange({ theta })}
            />
          </div>
        </>
      )}
    </section>
  );
}

const fmtNum = (x: number): string => String(Number(x.toPrecision(3)));
const fmtUgL = (x: number): string => {
  if (x !== 0 && (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e6)) {
    const [m, e] = x.toExponential(2).split('e');
    return `${Number(m)}e${Number(e)}`;
  }
  return fmtNum(x);
};

function Row({ row }: { row: SsgRow }) {
  if (!row.ok) {
    return (
      <tr>
        <th scope="row" data-label="Chemical">
          {row.name}
        </th>
        <td data-label="Soil level" className="level" colSpan={6}>
          <em>not computed:</em> {row.reason}
        </td>
      </tr>
    );
  }
  const r = row.result;
  const { compare, published } = row;
  const pub: string[] = [];
  if (published.mcl !== undefined) pub.push(`MCL-based ${published.mcl}`);
  if (published.risk !== undefined)
    pub.push(`risk-based ${published.risk.value} (${published.risk.key})`);
  return (
    <tr>
      <th scope="row" data-label="Chemical">
        {row.name}
      </th>
      <td data-label="Soil level (mg/kg)" className="level">
        <strong>{fmtLevel(r.level, 'soil')}</strong>
      </td>
      <td data-label="Governed by">{r.governs === 'mass-limit' ? 'mass limit' : 'partitioning'}</td>
      <td data-label="Partition level (mg/kg)">{fmtLevel(r.partitionLevel, 'soil')}</td>
      <td data-label="Mass-limit level (mg/kg)">
        {r.massLimitLevel === undefined ? '-' : fmtLevel(r.massLimitLevel, 'soil')}
      </td>
      <td data-label={`Leachate (ug/L), ${row.targetLabel} x DAF`}>
        {fmtUgL(r.cw * 1e6)} ({fmtUgL(row.targetUgL)} x {fmtNum(r.daf)})
      </td>
      <td data-label="Published RSL SSL at DAF 1 (mg/kg)">
        {pub.length === 0 ? 'none' : pub.join('; ')}
        {compare && (
          <>
            {' '}
            <small>
              computed/published {compare.ratio.toFixed(3)} ({compare.kind}-based)
            </small>
          </>
        )}
      </td>
    </tr>
  );
}

/** The soil screening leaching results: one row per chemical, the DAF and mixing depth read out, warnings listed. */
export function SsgResults(props: { form: CleanupForm; db: ChemicalDb | null }) {
  const { form, db } = props;
  const [cp, setCp] = useState<CleanupProps | null>(null);
  useEffect(() => {
    if (!form.ssg.on || cp !== null) return;
    let live = true;
    loadCleanupProps().then((p) => live && setCp(p));
    return () => {
      live = false;
    };
  }, [form.ssg.on, cp]);
  const out = useMemo(
    () => (form.ssg.on && db && cp ? computeSsg(form, db, cp) : null),
    [form, db, cp],
  );
  if (!form.ssg.on) return null;
  if (form.chemicals.length === 0) {
    return (
      <p className="muted">
        The soil screening leaching level appears here once a chemical is added.
      </p>
    );
  }
  if (out === null) return <p className="muted">Loading partition data...</p>;
  if (!out.ok) {
    return (
      <div className="alert" role="alert">
        <strong>Fix these inputs to update the leaching level:</strong>
        <ul>
          {out.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    );
  }
  const first = out.rows.find((r) => r.ok);
  const dafLine =
    first && first.ok
      ? `DAF ${fmtNum(first.result.daf)}${
          first.result.mixingDepth !== undefined
            ? `, mixing-zone depth ${fmtNum(first.result.mixingDepth)} m`
            : ''
        }.`
      : '';
  const warnings = out.rows.flatMap((r) =>
    r.ok ? r.warnings.map((w) => ({ key: `${r.id}:${w.code}`, name: r.name, w })) : [],
  );
  return (
    <section className="panel cleanup-medium" aria-label="Soil screening leaching results">
      <h2>Soil-to-groundwater leaching level</h2>
      <p className="muted">{dafLine}</p>
      <div className="cleanup-table-wrap">
        <table className="sat cleanup-table">
          <caption className="sr-only">Soil screening leaching levels, mg/kg</caption>
          <thead>
            <tr>
              <th scope="col">Chemical</th>
              <th scope="col">Soil level (mg/kg)</th>
              <th scope="col">Governed by</th>
              <th scope="col">Partition level (mg/kg)</th>
              <th scope="col">Mass-limit level (mg/kg)</th>
              <th scope="col">Leachate (ug/L)</th>
              <th scope="col">Published RSL SSL at DAF 1 (mg/kg)</th>
            </tr>
          </thead>
          <tbody>
            {out.rows.map((r) => (
              <Row key={r.id} row={r} />
            ))}
          </tbody>
        </table>
      </div>
      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map(({ key, name, w }) => (
            <li key={key}>
              {name}: {w.message}
            </li>
          ))}
        </ul>
      )}
      <ul className="muted">
        {out.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </section>
  );
}
