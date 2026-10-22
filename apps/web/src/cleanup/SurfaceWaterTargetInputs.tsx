import { Field, Seg, TextField } from '../ui/controls';
import type { CriteriaDb } from '../surfaceWater/criteriaDb';
import type { ChemicalRow } from '../risk/form';
import {
  choosableCriteria,
  criterionBasis,
  criterionSi,
  defaultCriterion,
  newSurfaceTarget,
  type SurfaceTargetKind,
  type SurfaceTargetRow,
} from './surfaceWaterTarget';

const KINDS: readonly { value: SurfaceTargetKind; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'nrwqc', label: 'NRWQC criterion' },
  { value: 'user', label: 'My value' },
];

const ugText = (si: number): string => `${Number((si * 1e6).toPrecision(4))} ug/L`;

/**
 * The surface water target of each cleanup chemical: a shipped National Recommended Water Quality
 * Criteria value (the kind is chosen; the default is the freshwater chronic criterion, else the human
 * health water and organism one) or the user's value with a required note.
 */
export function SurfaceWaterTargetInputs(props: {
  chemicals: readonly ChemicalRow[];
  targets: readonly SurfaceTargetRow[];
  db: CriteriaDb | null;
  onChange: (next: SurfaceTargetRow[]) => void;
}) {
  const { chemicals, targets, db, onChange } = props;
  if (chemicals.length === 0) return null;
  const rowOf = (id: string): SurfaceTargetRow =>
    targets.find((t) => t.chemicalId === id) ?? newSurfaceTarget(id);
  const set = (id: string, next: Partial<SurfaceTargetRow>): void => {
    const row = { ...rowOf(id), ...next };
    onChange([...targets.filter((t) => t.chemicalId !== id), row]);
  };
  return (
    <section className="panel" aria-label="Surface water targets">
      <h2>Surface water target</h2>
      <p className="muted">
        Optional. A target for the surface water concentration of a chemical gives the dissolved
        groundwater source level that just meets it, from the surface water run you sent for that
        chemical. It applies to a dissolved groundwater source only.
      </p>
      {chemicals.map((c) => {
        const t = rowOf(c.id);
        const list = db ? choosableCriteria(db, c.id) : [];
        const dflt = db ? defaultCriterion(db, c.id) : undefined;
        return (
          <div className="surface-target" key={c.id}>
            <h3>{c.name}</h3>
            <Seg
              legend="Kind of surface water target"
              name={`swTarget-${c.id}`}
              value={t.kind}
              onChange={(kind) => set(c.id, { kind })}
              options={KINDS}
            />
            {t.kind === 'nrwqc' && (
              <label className="field">
                <span className="field-label">Criterion</span>
                <select
                  value={t.criterionId}
                  onChange={(e) => set(c.id, { criterionId: e.target.value })}
                >
                  <option value="">
                    {dflt
                      ? `Default: ${criterionBasis(dflt)} (${ugText(criterionSi(dflt)!)})`
                      : db
                        ? 'No default criterion for this chemical'
                        : 'Loading the criteria...'}
                  </option>
                  {list.map((x) => (
                    <option key={x.id} value={x.id}>
                      {criterionBasis(x)} ({ugText(criterionSi(x)!)})
                    </option>
                  ))}
                </select>
                <small>
                  EPA National Recommended Water Quality Criteria. A criterion that needs hardness,
                  pH or other site inputs is not listed; enter your own value for it.
                </small>
              </label>
            )}
            {t.kind === 'user' && (
              <div className="fields">
                <Field
                  label="Surface water target (ug/L)"
                  value={t.value}
                  onChange={(value) => set(c.id, { value })}
                />
                <TextField
                  label="Note (required)"
                  value={t.note}
                  onChange={(note) => set(c.id, { note })}
                  hint="Where the value comes from, for example a permit or state standard."
                />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
