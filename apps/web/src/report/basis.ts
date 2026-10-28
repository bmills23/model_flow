import {
  defaultScreens,
  overridesOf,
  chemicalsOf,
  screensOf,
  type Project,
  type Screens,
} from '../project';
import { receptorKey, type ReceptorScreen } from '../overrides/receptors';
import type { ReceptorForm } from '../risk/form';
import { editableRows, shownValue } from '../risk/receptorRows';
import { overrideRows } from '../overrides/toxicity';
import { userChemicalRows } from '../overrides/userChemicals';
import type { ChemicalDb } from '../risk/chemicalDb';
import { staleAmong } from '../project/staleFeeds';
import type { FeedRead, StaleFeedKey, StaleSlot } from '../project/store';
import { userCleanupProps } from '../overrides/userChemicals';
import type { CleanupProps } from '../cleanup/ssg';
import { fateFill } from '../ui/chemicalFill';
import { chemicalFields, type VaporChemicalRow } from '../vapor/chemicals';
import type { Report, ReportSection } from './buildReport';
import type { ScreenKey } from './methodsRun';
import type { ProjectResults } from './results';
import { siteEntries, type SiteEntry } from './siteValues';

/**
 * What a run rests on. Pure: the report model, the section results, the project and the databases go
 * in; per section (and for the project as a whole) the rows that say which values are not backed by a
 * checked source come out. No markup here; the report page and the CSV read these rows.
 *
 * - `unverified-default`: a warned default of the validation catalog (see `validationCatalog.ts`) that
 *   the run used. A `warning`-scoped default is listed when its warning code is among the section's
 *   warnings, a `method`-scoped one when any of its method ids ran in the section.
 * - `entered-unsourced`: a fate property typed on a screen whose chemical was entered by hand (blank
 *   chemical id), or that names no database record; and every site value in use (see `siteValues.ts`),
 *   typed by the user or pre-filled with the program's example value. Nothing says where the number
 *   came from.
 * - `typed-over-database`: a fate property that differs numerically from the database row the screen's
 *   chemical id names.
 * - `user-override`, `user-chemical`, `receptor-edit`: project-level edits, each with its source note
 *   ("no note" when the stored note is empty).
 */

export type BasisKind =
  | 'unverified-default'
  | 'entered-unsourced'
  | 'typed-over-database'
  | 'user-override'
  | 'receptor-edit'
  | 'user-chemical';

export interface BasisRow {
  kind: BasisKind;
  subject: string;
  /** The value with its unit; for a default, the words "built-in default". */
  value: string;
  /** What else is worth saying beside the value: the database value, the preset, or nothing. */
  detail: string;
  /** The source note, or "no note". */
  note: string;
  /** A references.json key from the validation manifest, when the row has one. */
  referenceKey: string | null;
  referenceStatus: string | null;
  /** The catalog id of an `unverified-default` row. */
  defaultId: string | null;
  /** The screen that sent this row to the section, when the section inherits it from a feed. */
  via: ScreenKey | null;
  /** True for an inherited row while the feed it came through is out of date. */
  stale: boolean;
}

export const NO_NOTE = 'no note';

/** The scopes of a warned default this module handles; a catalog scope outside this list is a defect. */
export const BASIS_SCOPES = ['warning', 'method'] as const;

/** The slice of a validation.json default the basis reads. */
export interface BasisDefault {
  id: string;
  scope: (typeof BASIS_SCOPES)[number];
  subject: string;
  methodIds: string[];
  warningCode: string | null;
  referenceKey: string | null;
  referenceStatus: string | null;
  note: string;
}

export interface ProjectBasis {
  /** Rows per used section, own rows first and then those inherited through feeds. */
  sections: Partial<Record<ScreenKey, BasisRow[]>>;
  /** Overrides, user chemicals and receptor edits. */
  project: BasisRow[];
}

export interface BasisInput {
  report: Report;
  results: ProjectResults;
  project: Project;
  /** The chemical database with the project's overrides laid on it (for the override rows). */
  db: ChemicalDb;
  /** The fate rows (see `loadVaporChemicals`), with the user chemicals laid in. */
  fateRows: readonly VaporChemicalRow[];
  /** The cleanup properties (see `loadCleanupProps`), which the plants and eco screen fills Koc and log Kow from. */
  cleanupProps: CleanupProps;
  defaults: readonly BasisDefault[];
  stale: readonly (StaleSlot | StaleFeedKey)[];
  /**
   * The forms the sections were computed from; the project's saved screens when absent. A guided report
   * passes its derived screens, whose fate forms are the step 3a templates.
   */
  screens?: Screens;
  /** Further site values in use per section (a guided report's step 3b concentrations). */
  siteRows?: Partial<Record<ScreenKey, readonly SiteEntry[]>>;
  /** The receptors whose factor edits are listed; the exposure and cleanup screens' when absent. */
  receptorForms?: readonly ReceptorFormRef[];
}

/** A receptor pair whose edits the project keeps under one screen's key, with the title the rows carry. */
export interface ReceptorFormRef {
  screen: ReceptorScreen;
  title: string;
  form: { a: ReceptorForm; b: ReceptorForm | null };
}

const row = (
  kind: BasisKind,
  subject: string,
  value: string,
  extra: Partial<BasisRow>,
): BasisRow => ({
  kind,
  subject,
  value,
  detail: '',
  note: NO_NOTE,
  referenceKey: null,
  referenceStatus: null,
  defaultId: null,
  via: null,
  stale: false,
  ...extra,
});

const withUnit = (text: string, unit: string): string => (unit === '' ? text : `${text} ${unit}`);

/** Which screen sends each feed. */
const FEED_SENDER: Record<StaleFeedKey, ScreenKey> = {
  well: 'transport',
  bank: 'transport',
  transportChain: 'transport',
  vaporWaterTable: 'transport',
  surfaceWater: 'surfaceWater',
  vadose: 'vadose',
  vaporVadose: 'vadose',
  saturated: 'saturated',
  vaporSaturated: 'saturated',
  vaporRisk: 'vapor',
  household: 'household',
  produce: 'plantsEco',
  tph: 'plantsEco',
};

interface FateField {
  /** Key of the form field. */
  key: string;
  label: string;
  unit: string;
  /** The database row's value as typed text, or undefined when the row has none. */
  fromRow: (r: VaporChemicalRow) => string | undefined;
  /** For a screen that fills from the cleanup properties: that record's value as typed text. */
  fromProps?: (p: CleanupProps extends Map<string, infer V> ? V : never) => string | undefined;
}

const fill = (k: 'M' | 'S' | 'H' | 'Koc' | 'Da' | 'Dw') => (r: VaporChemicalRow) => fateFill(r)[k];
const thermo = (k: 'TB' | 'TC' | 'dHvb') => (r: VaporChemicalRow) => {
  const v = chemicalFields(r)[k];
  return v === '' ? undefined : v;
};

const M_F: FateField = { key: 'M', label: 'Molar mass', unit: 'g/mol', fromRow: fill('M') };
const S_F: FateField = { key: 'S', label: 'Solubility', unit: 'mg/L', fromRow: fill('S') };
const H_F: FateField = { key: 'H', label: "Henry's constant", unit: '', fromRow: fill('H') };
const KOC_F: FateField = { key: 'Koc', label: 'Koc', unit: 'mL/g', fromRow: fill('Koc') };
const DA_F: FateField = {
  key: 'Da',
  label: 'Diffusivity in air',
  unit: 'cm2/s',
  fromRow: fill('Da'),
};
const DW_F: FateField = {
  key: 'Dw',
  label: 'Diffusivity in water',
  unit: 'cm2/s',
  fromRow: fill('Dw'),
};

/** The fate properties each screen types or fills from a database row. */
const FATE_FIELDS: Partial<Record<ScreenKey, FateField[]>> = {
  vadose: [M_F, S_F, H_F, KOC_F, DA_F, DW_F],
  saturated: [M_F, S_F, H_F, KOC_F],
  vapor: [
    M_F,
    S_F,
    H_F,
    KOC_F,
    DA_F,
    DW_F,
    { key: 'TB', label: 'Boiling point', unit: 'K', fromRow: thermo('TB') },
    { key: 'TC', label: 'Critical temperature', unit: 'K', fromRow: thermo('TC') },
    { key: 'dHvb', label: 'Enthalpy of vaporization', unit: 'cal/mol', fromRow: thermo('dHvb') },
  ],
  household: [
    { ...M_F, key: 'molecularWeight' },
    { ...H_F, key: 'henry' },
  ],
  plantsEco: [
    { ...KOC_F, key: 'koc', fromProps: (p) => (p.koc === undefined ? undefined : String(p.koc)) },
    {
      key: 'logKow',
      label: 'Log Kow',
      unit: '',
      fromRow: () => undefined,
      fromProps: (p) => (p.logKow === undefined ? undefined : String(p.logKow)),
    },
  ],
};

const typed = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const same = (a: string, b: string): boolean => {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return a === b;
  return Math.abs(x - y) <= 1e-9 * Math.max(Math.abs(x), Math.abs(y));
};

function fateRowsFor(
  key: ScreenKey,
  form: Record<string, unknown>,
  byId: Map<string, VaporChemicalRow>,
  propsById: Map<string, CleanupProps extends Map<string, infer V> ? V : never>,
): BasisRow[] {
  const out: BasisRow[] = [];
  const id = typed(form.chemicalId);
  // Each screen is compared against the source it fills from: the plants and eco screen fills Koc and
  // log Kow from the cleanup properties, the others from the fate rows.
  const dbRow = id === '' ? undefined : byId.get(id);
  const propsRec = id === '' ? undefined : propsById.get(id);
  const fromProps = key === 'plantsEco';
  const known = fromProps ? propsRec !== undefined : dbRow !== undefined;
  const handNote =
    id === '' ? 'entered by hand, no database chemical' : `no database record for ${id}`;
  for (const f of FATE_FIELDS[key] ?? []) {
    const text = typed(form[f.key]);
    if (text === '') continue;
    const value = withUnit(text, f.unit);
    if (!known) {
      out.push(row('entered-unsourced', f.label, value, { detail: handNote }));
      continue;
    }
    const dbText = fromProps
      ? f.fromProps?.(propsRec!)
      : dbRow !== undefined
        ? f.fromRow(dbRow)
        : undefined;
    if (dbText === undefined) {
      out.push(row('entered-unsourced', f.label, value, { detail: 'the database has no value' }));
    } else if (!same(text, dbText)) {
      out.push(
        row('typed-over-database', f.label, value, {
          detail: `database value ${withUnit(dbText, f.unit)}`,
        }),
      );
    }
  }
  if (key === 'transport') {
    const kd = typed(form.kd);
    if (form.retardMode === 'kd' && kd !== '') {
      const value = withUnit(kd, 'L/kg');
      const koc = dbRow === undefined ? undefined : Number(fateFill(dbRow).Koc);
      const foc = Number(typed(form.foc));
      if (dbRow === undefined) {
        out.push(row('entered-unsourced', 'Kd', value, { detail: handNote }));
      } else if (koc === undefined || !Number.isFinite(koc) || !Number.isFinite(foc)) {
        out.push(row('entered-unsourced', 'Kd', value, { detail: 'the database has no Koc' }));
      } else if (!same(kd, String(koc * foc))) {
        out.push(
          row('typed-over-database', 'Kd', value, {
            detail: `database value ${withUnit(String(Number((koc * foc).toPrecision(10))), 'L/kg')} (Koc times foc)`,
          }),
        );
      }
    }
  }
  return out;
}

/** What a site value row says about where the number came from. */
export const SITE_TYPED = 'typed by the user; no source is cited';
export const SITE_PREFILLED = 'pre-filled example value, not changed; no source is cited';

/** Every site value of the screen in use, as an entry without a source. */
function siteRowsFor(
  key: ScreenKey,
  form: Record<string, unknown>,
  defaults: Record<string, unknown>,
): BasisRow[] {
  return siteEntries(key, form, defaults).map((e) =>
    row('entered-unsourced', e.subject, e.value, { detail: e.typed ? SITE_TYPED : SITE_PREFILLED }),
  );
}

function defaultRows(
  sec: ReportSection,
  warningCodes: ReadonlySet<string>,
  defaults: readonly BasisDefault[],
): BasisRow[] {
  const out: BasisRow[] = [];
  for (const d of defaults) {
    const hit =
      d.scope === 'warning'
        ? d.warningCode !== null && warningCodes.has(d.warningCode)
        : d.methodIds.some((m) => sec.methodIds.includes(m));
    if (!hit) continue;
    out.push(
      row('unverified-default', d.subject, 'built-in default', {
        note: d.note,
        referenceKey: d.referenceKey,
        referenceStatus: d.referenceStatus,
        defaultId: d.id,
      }),
    );
  }
  return out;
}

/** The exposure and cleanup screens' receptors, whose edits today's report lists. */
export function screenReceptorForms(project: Project): ReceptorFormRef[] {
  const screens = screensOf(project);
  return [
    { screen: 'risk', title: 'Exposure and risk', form: screens.risk.form },
    { screen: 'cleanup', title: 'Cleanup', form: screens.cleanup.form },
  ];
}

function receptorRows(project: Project, forms: readonly ReceptorFormRef[]): BasisRow[] {
  const state = overridesOf(project);
  const out: BasisRow[] = [];
  for (const { screen, title, form } of forms) {
    for (const which of ['a', 'b'] as const) {
      const rf = which === 'a' ? form.a : form.b;
      const k = receptorKey(screen, which);
      const edits = state.receptors[k];
      if (rf === null || edits === undefined) continue;
      const name = (state.receptorNames[k] ?? '').trim();
      const tag = name === '' ? `Receptor ${which.toUpperCase()}` : name;
      const all = editableRows(rf.preset);
      for (const r of [...all.legacy, ...all.modern, all.lifetime]) {
        const e = edits[r.key];
        if (e === undefined) continue;
        const method = r.key.startsWith('legacy.')
          ? ' (legacy)'
          : r.key.startsWith('modern.')
            ? ' (modern)'
            : '';
        out.push(
          row(
            'receptor-edit',
            `${title}, ${tag}: ${r.label}${method}`,
            withUnit(e.value.trim(), r.unit),
            {
              detail: `preset value ${withUnit(shownValue(r.preset), r.unit)}`,
              note: e.note.trim() === '' ? NO_NOTE : e.note.trim(),
            },
          ),
        );
      }
    }
  }
  return out;
}

function projectRows(
  project: Project,
  db: ChemicalDb,
  receptors: readonly ReceptorFormRef[],
): BasisRow[] {
  const out: BasisRow[] = [];
  for (const o of overrideRows(db, overridesOf(project))) {
    if (!o.applied || o.userValue === null) continue;
    out.push(
      row('user-override', `${o.chemical}: ${o.label}`, withUnit(String(o.userValue), o.unit), {
        detail:
          o.dbValue === null
            ? 'no database value'
            : `database value ${withUnit(String(o.dbValue), o.unit)}`,
        note: o.note === '' ? NO_NOTE : o.note,
      }),
    );
  }
  for (const u of userChemicalRows(chemicalsOf(project))) {
    if (!u.applied) continue;
    out.push(
      row('user-chemical', `${u.chemical}: ${u.label}`, withUnit(u.text, u.unit), {
        note: u.note === '' ? NO_NOTE : u.note,
      }),
    );
  }
  out.push(...receptorRows(project, receptors));
  return out;
}

const keyOf = (r: BasisRow): string => `${r.kind}|${r.subject}|${r.value}|${r.via ?? ''}`;

/** What a run rests on, per section and for the project. */
export function runBasis(input: BasisInput): ProjectBasis {
  const { report, results, project, defaults, stale } = input;
  const screens = input.screens ?? screensOf(project);
  const byId = new Map(input.fateRows.map((r) => [r.id, r]));
  const propsById = new Map([...userCleanupProps(chemicalsOf(project)), ...input.cleanupProps]);
  const own = new Map<ScreenKey, BasisRow[]>();
  const fresh = defaultScreens();
  for (const sec of report.sections) {
    const codes = new Set((results[sec.key]?.warnings ?? []).map((w) => w.code));
    // The uncertainty setup screen has no `form`; it types no fate property.
    const form = (screens[sec.key] as unknown as { form?: Record<string, unknown> }).form ?? {};
    const freshForm = (fresh[sec.key] as unknown as { form?: Record<string, unknown> }).form ?? {};
    own.set(sec.key, [
      ...defaultRows(sec, codes, defaults),
      ...fateRowsFor(sec.key, form, byId, propsById),
      ...siteRowsFor(sec.key, form, freshForm),
      ...(input.siteRows?.[sec.key] ?? []).map((e) =>
        row('entered-unsourced', e.subject, e.value, {
          detail: e.typed ? SITE_TYPED : SITE_PREFILLED,
        }),
      ),
    ]);
  }
  const sectionKeys = new Set(report.sections.map((s) => s.key));
  const readsOf = (key: ScreenKey): FeedRead[] =>
    report.sections.find((s) => s.key === key)?.reads ?? [];

  /** The rows a section gets through its feeds, to any depth, stale when any link of the chain is. */
  const inherited = (key: ScreenKey, seen: Set<ScreenKey>, upstreamStale: boolean): BasisRow[] => {
    const out: BasisRow[] = [];
    for (const read of readsOf(key)) {
      const sender = FEED_SENDER[read.feed];
      if (sender === key || seen.has(sender) || !sectionKeys.has(sender)) continue;
      const isStale = upstreamStale || staleAmong([read], stale).length > 0;
      const next = new Set(seen).add(sender);
      for (const r of own.get(sender) ?? [])
        out.push({ ...r, via: r.via ?? sender, stale: isStale || r.stale });
      out.push(...inherited(sender, next, isStale));
    }
    return out;
  };

  const sections: ProjectBasis['sections'] = {};
  for (const sec of report.sections) {
    const rows: BasisRow[] = [...(own.get(sec.key) ?? [])];
    const seenKeys = new Set(rows.map(keyOf));
    for (const r of inherited(sec.key, new Set([sec.key]), false)) {
      const k = keyOf(r);
      if (seenKeys.has(k)) continue;
      seenKeys.add(k);
      rows.push(r);
    }
    sections[sec.key] = rows;
  }
  return {
    sections,
    project: projectRows(project, input.db, input.receptorForms ?? screenReceptorForms(project)),
  };
}
