import {
  chemicalsOf,
  defaultScreens,
  guidedOf,
  overridesOf,
  type Project,
  type Screens,
} from '../project';
import type { OverridesState } from '../overrides/model';
import { effectiveDb, withUserFateRows } from '../overrides/userChemicals';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { loadVaporChemicals, type VaporChemicalRow } from '../vapor/chemicals';
import { loadCleanupProps, type CleanupProps } from '../cleanup/ssg';
import type { VaporState } from '../vapor/project';
import * as cleanupProject from '../cleanup/project';
import * as riskProject from '../risk/project';
import { chain, SOURCE_LABELS } from '../guided/chain';
import { cleanupSourceKind, deriveCleanupForm } from '../guided/cleanupForm';
import {
  deriveChemical,
  runPlan,
  type ChemicalData,
  type DerivedChemical,
  type RunPlan,
} from '../guided/derive';
import { propertyView } from '../guided/propertyCatalog';
import { deriveRiskForm } from '../guided/riskForm';
import {
  GUIDED_FORM_KEYS,
  TEMPLATE_STRIPPED,
  type GuidedFormKey,
  type GuidedState,
  type SourceValueKey,
} from '../guided/state';
import { guidedChemicalData } from '../guided/useOutputCheck';
import { runBasis, type BasisDefault, type ProjectBasis, type ReceptorFormRef } from './basis';
import { flattenInputs, NON_AFFILIATION, SCREEN_NAMES, type Report } from './buildReport';
import { dataEditionsFor, methodIdsFor, USED_SCREENS_ORDER, type ScreenKey } from './methodsRun';
import { buildMethodsStatement } from './methodsStatement';
import type { ProjectResults } from './results';
import type { SiteEntry } from './siteValues';
import { receptorEditRows, type ReceptorEditRow } from './userValues';

/**
 * The guided report's source (plan section 2, "The report"): the same report code run on the guided
 * project instead of the model screens. The screens it reads are derived (each chosen model's step 3a
 * template with a chemical's values, the step 4 and 5 forms), the feeds are the step 3d outputs, and the
 * sections are the models the chain uses, then exposure and risk or cleanup. Pure apart from the loader.
 */

/** The line today's report prints at `#/report` when the guided steps have no results. */
export const STEPS_NOT_RUN =
  'The guided steps have not been run for this project (step 3d has no results), so this report covers the model workbench screens.';

/** True when the project holds results of the step 3d Run. */
export function hasGuidedOutputs(project: Project): boolean {
  return Object.values(guidedOf(project).outputs).some((slots) => Object.keys(slots).length > 0);
}

/** Everything the guided report reads besides the project. */
export interface GuidedReportData {
  guided: GuidedState;
  /** The project chemicals with their fate rows (3c edits laid on) and cleanup properties. */
  chemicals: ChemicalData[];
  /** The chemical database with the project's toxicity edits and user chemicals laid on. */
  db: ChemicalDb;
  overrides: OverridesState;
  cleanupProps: CleanupProps;
  /** The chain and run settings; null while step 2 has a problem. */
  plan: RunPlan | null;
  /** Each chemical's derived forms, in project order (none while step 2 has a problem). */
  derived: DerivedChemical[];
  /** The name the project gives each chemical id. */
  names: Readonly<Record<string, string>>;
}

/** The files the guided report needs, as loaded (the base database, the fate rows, the cleanup properties). */
export interface GuidedFiles {
  db: ChemicalDb;
  fateRows: readonly VaporChemicalRow[];
  cleanupProps: CleanupProps;
}

export function guidedReportData(project: Project, files: GuidedFiles): GuidedReportData {
  const guided = guidedOf(project);
  const overrides = overridesOf(project);
  const list = chemicalsOf(project);
  const chemicals = guidedChemicalData(list, [...files.fateRows], overrides, files.cleanupProps);
  const plan = runPlan(guided);
  return {
    guided,
    chemicals,
    db: effectiveDb(files.db, overrides, list),
    overrides,
    cleanupProps: files.cleanupProps,
    plan,
    derived: plan === null ? [] : chemicals.map((c) => deriveChemical(guided, plan, c)),
    names: Object.fromEntries(chemicals.map((c) => [c.id, c.name])),
  };
}

export async function loadGuidedReportData(project: Project): Promise<GuidedReportData> {
  const [db, fateRows, cleanupProps] = await Promise.all([
    loadChemicalDb(),
    loadVaporChemicals(),
    loadCleanupProps().catch((): CleanupProps => new Map()),
  ]);
  return guidedReportData(project, { db, fateRows, cleanupProps });
}

const FATE_KEYS: readonly ScreenKey[] = GUIDED_FORM_KEYS;
export const isFateKey = (k: ScreenKey): k is GuidedFormKey => FATE_KEYS.includes(k);

/** The sections of a guided report: the chain's models in report order, then exposure and risk or cleanup. */
export function guidedSectionKeys(guided: GuidedState): ScreenKey[] {
  const c = chain(guided.site);
  const models: readonly string[] = c.problems.length > 0 ? [] : c.models;
  const fate = USED_SCREENS_ORDER.filter((k) => models.includes(k));
  return [...fate, guided.targets.mode === 'cleanup' ? 'cleanup' : 'risk'];
}

/** The vapor screen's source choice that reads the series the Run fed indoor air with. */
function vaporChoice(plan: RunPlan | null): VaporState['choice'] {
  if (plan?.buildingSource === 'groundwater' && plan.downgradient) return 'waterTable';
  if (plan?.buildingSource === 'soilBelow') return 'saturated';
  return 'entered';
}

/** The screens with one set of model forms laid in, the transport map on the step 3d method. */
function withForms(data: GuidedReportData, forms: DerivedChemical['forms']): Screens {
  const s = defaultScreens();
  const any = s as unknown as Record<string, { form: unknown }>;
  for (const k of GUIDED_FORM_KEYS) {
    const f = forms[k];
    if (f !== undefined) any[k] = { ...any[k]!, form: f };
  }
  if (forms.transport !== undefined) {
    s.transport = {
      ...s.transport,
      form: { ...s.transport.form, mapMethod: data.guided.run.basis },
    };
  }
  s.vapor = { ...s.vapor, choice: vaporChoice(data.plan) };
  return s;
}

/** The screens one chemical's guided run reads: its derived forms. */
export function chemicalScreens(data: GuidedReportData, d: DerivedChemical): Screens {
  return withForms(data, d.forms);
}

/**
 * True when the cleanup levels in the media contacted are each chemical alone although all together was
 * chosen: on a modeled basis the media contacted have no measured ratios (as step 5 does).
 */
export const individualFallback = (g: GuidedState): boolean =>
  g.site.basis === 'modeled' && g.targets.allocation === 'cumulative';

/**
 * The screens of the guided report as a whole: each chosen model's step 3a template (the derived form with
 * every per-chemical field blank, so no chemical's values stand for all), and the derived exposure and
 * cleanup forms over every chemical.
 */
export function guidedScreens(data: GuidedReportData): Screens {
  const first = data.derived[0]?.forms ?? {};
  const templates: DerivedChemical['forms'] = {};
  for (const k of GUIDED_FORM_KEYS) {
    const f = first[k] as Record<string, unknown> | undefined;
    if (f === undefined) continue;
    const t = { ...f };
    for (const key of TEMPLATE_STRIPPED[k]) t[key] = typeof f[key] === 'boolean' ? false : '';
    (templates as Record<string, unknown>)[k] = t;
  }
  const s = withForms(data, templates);
  const refs = data.chemicals.map((c) => ({ id: c.id, name: c.name }));
  const g = data.guided;
  s.risk = { ...s.risk, form: deriveRiskForm(g, refs, data.db, data.overrides) };
  const cleanup = deriveCleanupForm(g, refs, data.db, data.overrides);
  s.cleanup = {
    ...s.cleanup,
    form: individualFallback(g) ? { ...cleanup, allocation: 'individual' } : cleanup,
  };
  return s;
}

/** The step 3a values a model reads, in the words and units of step 3a. */
function templateInputs(g: GuidedState, key: GuidedFormKey): Report['sections'][number]['inputs'] {
  const rows: Report['sections'][number]['inputs'] = [];
  for (const group of propertyView(g).groups) {
    for (const v of group.fields) {
      if (!v.field.bindings.some((b) => b.model === key)) continue;
      const unit = v.field.unit === '' ? '' : ` (${v.field.unit})`;
      if (v.items !== null) {
        for (const it of v.items) {
          rows.push({
            path: `${v.field.id}[${it.index}]`,
            label: `${it.label}${unit}`,
            value: it.value === '' ? '(blank)' : it.value,
          });
        }
      } else {
        rows.push({
          path: v.field.id,
          label: `${v.field.label}${unit}`,
          value: v.value === '' ? '(blank)' : v.value,
        });
      }
    }
  }
  return rows;
}

const dropFormPrefix = (r: { path: string; label: string; value: string }) => ({
  ...r,
  path: r.path.replace(/^form\./, ''),
  label: r.label.replace(/^form /, ''),
});

/** The report model of a guided project: its sections with their inputs, then the methods statement. */
export function buildGuidedReport(project: Project, data: GuidedReportData): Report {
  const g = data.guided;
  const screens = guidedScreens(data);
  const keys = guidedSectionKeys(g);
  const byScreen: Partial<Record<ScreenKey, string[]>> = {};
  const ids: string[] = [];
  const sections: Report['sections'] = keys.map((key) => {
    const list = methodIdsFor(key, screens);
    byScreen[key] = list;
    for (const id of list) if (!ids.includes(id)) ids.push(id);
    const inputs = isFateKey(key)
      ? templateInputs(g, key)
      : flattenInputs(
          key === 'risk'
            ? riskProject.toProject(screens.risk)
            : cleanupProject.toProject(screens.cleanup),
        ).map(dropFormPrefix);
    return { key, name: SCREEN_NAMES[key], inputs, methodIds: list, reads: [] };
  });
  const unused = USED_SCREENS_ORDER.filter((k) => !keys.includes(k)).map((k) => SCREEN_NAMES[k]);
  return {
    title: project.title ?? '',
    savedAt: project.savedAt,
    createdWith: project.createdWith,
    nonAffiliation: NON_AFFILIATION,
    site: null,
    sections,
    unused,
    statement: buildMethodsStatement({
      methodIds: ids,
      dataEditions: dataEditionsFor(byScreen, project.data, 'us'),
      criteriaKeys: [],
    }),
  };
}

/** What the guided report prints before its sections: the site model, the run settings and the Run's notes. */
export interface GuidedSummary {
  /** One line per path of the step 2 site model. */
  paths: string[];
  settings: { label: string; value: string }[];
  /** The Run's notes per chemical (non-detect substitutions, then why a model did not run). */
  runNotes: { chemical: string; lines: string[] }[];
}

const METHOD_WORDS = { legacy: 'legacy method', modern: 'modern method' } as const;
const INDOOR_WORDS = {
  legacy: 'legacy Johnson and Ettinger method',
  modern: 'modern Johnson and Ettinger method',
  oxygenLimited: 'oxygen-limited method',
} as const;

export function guidedSummary(data: GuidedReportData): GuidedSummary {
  const g = data.guided;
  const c = chain(g.site);
  const paths = c.paths.map((p) =>
    p.source === null ? p.label : `${p.label}, from ${p.sourceLabel.toLowerCase()}`,
  );
  const years = (t: string): string => `${t.trim()} yr`;
  const settings: GuidedSummary['settings'] = [];
  if (g.site.basis === 'measured') {
    settings.push({ label: 'Concentrations', value: 'measured where the receptors contact them' });
  } else {
    settings.push({ label: 'Simulation time', value: years(g.run.timeYr) });
    settings.push({ label: 'Time step', value: years(g.run.stepYr) });
    if (data.plan?.transportSource === 'groundwater') {
      settings.push({
        label: 'How long the source lasts',
        value: g.run.sourceYr.trim() === '' ? 'never ends' : years(g.run.sourceYr),
      });
    }
  }
  settings.push({ label: 'Method the conclusions rest on', value: METHOD_WORDS[g.run.basis] });
  if (c.models.includes('vapor')) {
    settings.push({ label: 'Indoor air method', value: INDOOR_WORDS[g.site.indoorModel] });
  }
  const runNotes = data.chemicals.flatMap((chem) => {
    const n = g.runNotes[chem.id];
    if (n === undefined) return [];
    const lines = [...(n.substitutions ?? []), ...n.problems.map((p) => p.message)];
    return lines.length === 0 ? [] : [{ chemical: chem.name, lines }];
  });
  return { paths, settings, runNotes };
}

/** The models that read a modeled source's step 3b value, in the order its rows are filed under. */
const READ_BY: Partial<Record<SourceValueKey, readonly ScreenKey[]>> = {
  groundwater: ['transport', 'vapor'],
  soilAbove: ['vadose', 'vapor', 'household', 'plantsEco'],
  soilBelow: ['saturated'],
  soilGas: ['vapor'],
};

/** Each chemical's step 3b value of a modeled source, as a site value without a source, by section. */
function sourceEntries(
  data: GuidedReportData,
  keys: readonly ScreenKey[],
): Partial<Record<ScreenKey, SiteEntry[]>> {
  const out: Partial<Record<ScreenKey, SiteEntry[]>> = {};
  const g = data.guided;
  for (const medium of chain(g.site).valuesNeeded) {
    const key = READ_BY[medium]?.find((k) => keys.includes(k));
    if (key === undefined) continue;
    for (const c of data.chemicals) {
      const v = g.sources[c.id]?.values[medium];
      if (v === undefined || v.value.trim() === '') continue;
      (out[key] ??= []).push({
        subject: `${c.name}, ${SOURCE_LABELS[medium].toLowerCase()} concentration`,
        value: v.unit === '' ? v.value.trim() : `${v.value.trim()} ${v.unit}`,
        typed: true,
      });
    }
  }
  return out;
}

/** The step 4 receptors, whose factor edits the project keeps under the guided key. */
function guidedReceptorForms(data: GuidedReportData): ReceptorFormRef[] {
  const refs = data.chemicals.map((c) => ({ id: c.id, name: c.name }));
  return [
    {
      screen: 'guided',
      title: 'Exposure (step 4)',
      form: deriveRiskForm(data.guided, refs, data.db),
    },
  ];
}

/** The receptor factors the user edited in step 4, as the report lists them. */
export function guidedReceptorEditRows(
  project: Project,
  data: GuidedReportData,
): ReceptorEditRow[] {
  return receptorEditRows(project, guidedReceptorForms(data));
}

export interface GuidedBasisInput {
  report: Report;
  results: ProjectResults;
  project: Project;
  data: GuidedReportData;
  /** The fate rows as loaded (`loadVaporChemicals`). */
  fateRows: readonly VaporChemicalRow[];
  cleanupProps: CleanupProps;
  defaults: readonly BasisDefault[];
}

/**
 * What the guided report rests on: the step 3a templates and the step 3b concentrations as entries without
 * a source, the warned defaults of the methods run, and the project's edits (the step 4 receptor edits in
 * place of the screens').
 */
export function guidedRunBasis(input: GuidedBasisInput): ProjectBasis {
  const { data, project } = input;
  const keys = input.report.sections.map((s) => s.key);
  return runBasis({
    report: input.report,
    results: input.results,
    project,
    db: data.db,
    fateRows: withUserFateRows([...input.fateRows], chemicalsOf(project)),
    cleanupProps: input.cleanupProps,
    defaults: input.defaults,
    stale: [],
    screens: guidedScreens(data),
    siteRows: sourceEntries(data, keys),
    receptorForms: guidedReceptorForms(data),
  });
}

/** Where step 5 solves its levels: the medium contacted, or a modeled source. */
export const guidedCleanupSource = (g: GuidedState) => cleanupSourceKind(g);
