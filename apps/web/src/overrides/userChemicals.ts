import type { ChemicalDb, ChemicalRecord } from '../risk/chemicalDb';
import type { ProjectChemical, UserValue } from '../project/chemicals';
import type { ToxEntry } from '@model-flow/data/rsl-types';
import type { VaporChemicalRow } from '../vapor/chemicals';
import type { BrowseRecord } from '../chemicals/browse';
import { usableValue } from './model';
import { applyToxOverrides, TOX_FIELDS, USER_SOURCE, USER_SOURCE_NAME } from './toxicity';
import type { OverridesState } from './model';

/**
 * User-defined chemicals: a project list entry with `values` (and optionally a `cas`). Only a name is
 * required; every entered value needs a source note, as a toxicity override does (`usableValue`). A
 * user chemical is laid into the chemical database (risk, cleanup and the report) and into the fate
 * rows (transport, vadose, saturated, vapor) with source `user`. It cites "User value (this project)"
 * and its note, never a references.json entry.
 */

export type FateKey = 'mw' | 's' | 'hPrime' | 'koc' | 'dia' | 'diw';

/** The fate and partition properties a user chemical can carry, in screen order. */
export const FATE_FIELDS: readonly { key: FateKey; label: string; unit: string }[] = [
  { key: 'mw', label: 'Molar mass', unit: 'g/mol' },
  { key: 's', label: 'Solubility', unit: 'mg/L' },
  { key: 'hPrime', label: "Henry's constant", unit: 'dimensionless' },
  { key: 'koc', label: 'Koc', unit: 'mL/g' },
  { key: 'dia', label: 'Diffusivity in air', unit: 'cm2/s' },
  { key: 'diw', label: 'Diffusivity in water', unit: 'cm2/s' },
];

/** Every field of a user chemical: toxicity first, then the fate properties. */
export const USER_FIELDS: readonly { key: string; label: string; unit: string }[] = [
  ...TOX_FIELDS,
  ...FATE_FIELDS,
];

export const isUserChemical = (c: ProjectChemical): boolean => c.values !== undefined;

/** The next free `user-<n>` id. */
export function nextUserId(list: readonly ProjectChemical[]): string {
  let max = 0;
  for (const c of list) {
    const m = /^user-(\d+)$/.exec(c.id);
    if (m !== null) max = Math.max(max, Number(m[1]));
  }
  return `user-${max + 1}`;
}

const valueOf = (c: ProjectChemical, key: string): number | null => {
  const e = c.values?.[key];
  return e === undefined ? null : usableValue(e);
};

/** A database record for a user chemical: its usable toxicity values with source `user`, no physical row. */
export function userRecord(c: ProjectChemical): ChemicalRecord {
  const tox: ToxEntry = {
    id: c.id,
    name: c.name,
    rslName: c.name,
    volatile: false,
    mutagen: false,
  };
  const cas = c.cas?.trim() ?? '';
  if (cas !== '') tox.cas = cas;
  for (const { key } of TOX_FIELDS) {
    const v = valueOf(c, key);
    if (v !== null) tox[key] = { value: v, source: USER_SOURCE };
  }
  const rec: ChemicalRecord = { id: c.id, name: c.name, tox, phys: undefined };
  if (tox.cas !== undefined) rec.cas = tox.cas;
  return rec;
}

/**
 * The database with the project's user chemicals added. A user id the database already holds is left
 * alone. With no user chemical the same database object comes back.
 */
export function applyUserChemicals(
  db: ChemicalDb,
  chemicals: readonly ProjectChemical[],
): ChemicalDb {
  const added = chemicals.filter((c) => isUserChemical(c) && !db.byId.has(c.id)).map(userRecord);
  if (added.length === 0) return db;
  const all = [...db.chemicals, ...added];
  return {
    ...db,
    sourceKeys: { ...db.sourceKeys, [USER_SOURCE]: USER_SOURCE_NAME },
    chemicals: all,
    byId: new Map(all.map((c) => [c.id, c])),
  };
}

/** The database as every screen and the report see it: user chemicals added, then the toxicity overrides. */
export const effectiveDb = (
  base: ChemicalDb,
  overrides: OverridesState,
  chemicals: readonly ProjectChemical[],
): ChemicalDb => applyToxOverrides(applyUserChemicals(base, chemicals), overrides);

/** Fate rows (the vapor database shape) for the user chemicals; a missing property is simply absent. */
export function userFateRows(chemicals: readonly ProjectChemical[]): VaporChemicalRow[] {
  return chemicals.filter(isUserChemical).map((c) => {
    const rsl: VaporChemicalRow['rsl'] = {};
    for (const { key } of FATE_FIELDS) {
      const v = valueOf(c, key);
      if (v !== null) rsl[key] = { value: v };
    }
    return { id: c.id, name: c.name, rsl };
  });
}

/** Rows to append to a loaded fate list: the user chemicals whose id the list does not hold. */
export const withUserFateRows = (
  rows: VaporChemicalRow[],
  chemicals: readonly ProjectChemical[],
): VaporChemicalRow[] => {
  const extra = userFateRows(chemicals).filter((u) => !rows.some((r) => r.id === u.id));
  return extra.length === 0 ? rows : [...rows, ...extra];
};

/** Cleanup partition properties (koc, hPrime, s) of the user chemicals, by id. */
export function userCleanupProps(
  chemicals: readonly ProjectChemical[],
): Map<string, { koc?: number; hPrime?: number; s?: number }> {
  const out = new Map<string, { koc?: number; hPrime?: number; s?: number }>();
  for (const c of chemicals.filter(isUserChemical)) {
    const e: { koc?: number; hPrime?: number; s?: number } = {};
    const koc = valueOf(c, 'koc');
    const h = valueOf(c, 'hPrime');
    const s = valueOf(c, 's');
    if (koc !== null) e.koc = koc;
    if (h !== null) e.hPrime = h;
    if (s !== null) e.s = s;
    out.set(c.id, e);
  }
  return out;
}

/** Labels of the listed fate properties a user chemical lacks (no usable value). */
export function missingFateLabels(c: ProjectChemical, keys: readonly FateKey[]): string[] {
  return FATE_FIELDS.filter((f) => keys.includes(f.key) && valueOf(c, f.key) === null).map(
    (f) => f.label,
  );
}

const CAS_FORMAT = /^\d{2,7}-\d{2}-\d$/;

/**
 * Why a CAS number cannot be used for a user chemical, or null. A number the database (or another
 * user chemical) already holds is refused: that chemical exists, and its toxicity values are edited
 * on the Overrides panel instead. Blank is allowed.
 */
export function casProblem(
  cas: string,
  known: readonly { cas?: string | undefined; name: string }[],
): string | null {
  const t = cas.trim();
  if (t === '') return null;
  if (!CAS_FORMAT.test(t))
    return 'A CAS number looks like 71-43-2: digits, then two digits, then one.';
  const hit = known.find((k) => k.cas?.trim() === t);
  if (hit !== undefined)
    return `CAS ${t} is already ${hit.name}. Add that chemical to the project and edit its toxicity values in the overrides instead.`;
  return null;
}

/** The fields a copy takes from a database chemical, with the numeric value from its browse row. */
const COPY_KEYS: readonly string[] = USER_FIELDS.map((f) => f.key);

/**
 * The values of a database chemical to start a user chemical from. The CAS is not copied (it would
 * be refused as a duplicate). Each copied value carries a note that says where it came from: the
 * RSL edition, the chemical, and the source the database gives for that value, so the entry stays
 * traceable; the user may edit the note.
 */
export function copiedValues(
  rec: BrowseRecord,
  edition: string,
): { values: Record<string, UserValue>; cas: undefined } {
  const values: Record<string, UserValue> = {};
  for (const key of COPY_KEYS) {
    const row = rec.rows.find((r) => r.key === key);
    if (row?.value === undefined) continue;
    const cas = rec.cas === undefined ? '' : ` (CAS ${rec.cas})`;
    values[key] = {
      value: String(row.value),
      note: `Copied from the EPA RSL tables, edition ${edition}, for ${rec.name}${cas}; source: ${row.source}.`,
    };
  }
  return { values, cas: undefined };
}

/** One value of a user chemical as the report and the CSV list it. */
export interface UserChemicalRow {
  chemical: string;
  cas: string;
  label: string;
  unit: string;
  value: number | null;
  /** The value as typed. */
  text: string;
  note: string;
  /** Always `user`. */
  source: typeof USER_SOURCE;
  /** False when the entry has no usable number or no note, so is left out of every run. */
  applied: boolean;
}

/** Every entered value of every user chemical, in list then field order. */
export function userChemicalRows(chemicals: readonly ProjectChemical[]): UserChemicalRow[] {
  const rows: UserChemicalRow[] = [];
  for (const c of chemicals.filter(isUserChemical)) {
    for (const { key, label, unit } of USER_FIELDS) {
      const e = c.values?.[key];
      if (e === undefined) continue;
      const v = usableValue(e);
      rows.push({
        chemical: c.name,
        cas: c.cas?.trim() ?? '',
        label,
        unit,
        value: v,
        text: e.value.trim(),
        note: e.note.trim(),
        source: USER_SOURCE,
        applied: v !== null,
      });
    }
  }
  return rows;
}

/** User chemicals as browse records (the chemicals page and its CSV): one row per entered value. */
export function userBrowseRecords(chemicals: readonly ProjectChemical[]): BrowseRecord[] {
  return chemicals.filter(isUserChemical).map((c) => {
    const rec: BrowseRecord = {
      id: c.id,
      name: c.name,
      rows: USER_FIELDS.flatMap(({ key, label, unit }) => {
        const e = c.values?.[key];
        if (e === undefined) return [];
        const v = usableValue(e);
        const group = TOX_FIELDS.some((t) => t.key === key) ? 'Toxicity' : 'Physical-chemical';
        return [
          {
            group,
            key,
            label,
            ...(v === null ? {} : { value: v }),
            text: e.value.trim(),
            unit,
            source: `${USER_SOURCE_NAME}: ${e.note.trim() === '' ? '(no note, not used)' : e.note.trim()}`,
          } as BrowseRecord['rows'][number],
        ];
      }),
    };
    if (c.cas !== undefined && c.cas.trim() !== '') rec.cas = c.cas.trim();
    return rec;
  });
}
