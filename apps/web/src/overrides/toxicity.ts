import type { ToxEntry } from '@model-flow/data/rsl-types';
import type { ChemicalDb, ChemicalRecord, ToxRow } from '../risk/chemicalDb';
import { usableValue, type OverridesState } from './model';

/** The source key an overridden value carries; `db.sourceKeys` names it. */
export const USER_SOURCE = 'user';
const USER_SOURCE_NAME = 'User value (this project)';

export type ToxField = ToxRow['key'];

/** The toxicity values a project can override, in screen order. */
export const TOX_FIELDS: readonly { key: ToxField; label: string; unit: string }[] = [
  { key: 'sfo', label: 'Oral slope factor', unit: '(mg/kg-d)^-1' },
  { key: 'iur', label: 'Inhalation unit risk', unit: '(ug/m3)^-1' },
  { key: 'rfdo', label: 'Oral reference dose', unit: 'mg/kg-d' },
  { key: 'rfci', label: 'Inhalation reference concentration', unit: 'mg/m3' },
];

/**
 * The chemical database with this project's usable toxicity overrides laid over it. Every screen and
 * the report build from this database, so an edit shows the same value everywhere. The master data is
 * never changed. An overridden record keeps the unedited values in `dbTox`. With nothing usable the
 * same database object comes back.
 */
export function applyToxOverrides(db: ChemicalDb, state: OverridesState): ChemicalDb {
  const changed = new Map<string, ChemicalRecord>();
  for (const [id, fields] of Object.entries(state.toxicity)) {
    const rec = db.byId.get(id);
    if (rec === undefined) continue;
    const tox: ToxEntry = { ...rec.tox };
    let any = false;
    for (const { key } of TOX_FIELDS) {
      const entry = fields[key];
      const v = entry === undefined ? null : usableValue(entry);
      if (v === null) continue;
      tox[key] = { value: v, source: USER_SOURCE };
      any = true;
    }
    if (any) changed.set(id, { ...rec, tox, dbTox: rec.dbTox ?? rec.tox });
  }
  if (changed.size === 0) return db;
  const chemicals = db.chemicals.map((c) => changed.get(c.id) ?? c);
  return {
    ...db,
    sourceKeys: { ...db.sourceKeys, [USER_SOURCE]: USER_SOURCE_NAME },
    chemicals,
    byId: new Map(chemicals.map((c) => [c.id, c])),
  };
}

/** One override as the report lists it. */
export interface OverrideRow {
  chemical: string;
  cas: string;
  label: string;
  unit: string;
  dbValue: number | null;
  userValue: number | null;
  note: string;
  /** False when the entry is incomplete (no usable number or no note) and so left out of the run. */
  applied: boolean;
}

/** Every saved toxicity edit, in database order, with the unedited value beside it. */
export function overrideRows(db: ChemicalDb, state: OverridesState): OverrideRow[] {
  const rows: OverrideRow[] = [];
  for (const rec of db.chemicals) {
    const fields = state.toxicity[rec.id];
    if (fields === undefined) continue;
    for (const { key, label, unit } of TOX_FIELDS) {
      const entry = fields[key];
      if (entry === undefined) continue;
      const user = usableValue(entry);
      rows.push({
        chemical: rec.name,
        cas: rec.cas ?? '',
        label,
        unit,
        dbValue: (rec.dbTox ?? rec.tox)[key]?.value ?? null,
        userValue: user,
        note: entry.note.trim(),
        applied: user !== null,
      });
    }
  }
  return rows;
}
