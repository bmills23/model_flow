import { convert, type Warning } from '@model-flow/engine';
import { csvHeader, type CsvCell } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import {
  chemicalsOf,
  feedEntry,
  modeledLevelsOf,
  overridesOf,
  screensOf,
  type Project,
  type Screens,
} from '../project';
import { decodeJson } from '../project/codec';
import { screenUsed, USED_SCREENS_ORDER, type FeedsLike, type ScreenKey } from './methodsRun';
import { effectiveDb, userCleanupProps } from '../overrides/userChemicals';
import { withProjectReceptorEdits } from './userValues';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { buildInputs } from '../risk/build';
import { runRisk } from '../risk/compute';
import { riskCsvTables, RISK_METHOD_IDS } from '../risk/csv';
import { buildCleanup } from '../cleanup/build';
import {
  chainFingerprint,
  modeledLevelsFingerprint,
  type SavedModeledLevels,
} from '../cleanup/modeledLevels';
import { solubilityCeiling, solubilityText } from '../cleanup/solubility';
import { runCleanup } from '../cleanup/compute';
import { sourceLevelCsvTables, surfaceSolveJobs } from '../cleanup/sourceLevelsCsv';
import { jobsOf } from '../cleanup/surfaceSolved';
import { solveSurfaceJobsAsync } from '../cleanup/surfaceSolveRunner';
import {
  surfaceTargetLevels,
  surfaceTargetTables,
  targetsOfChemicals,
} from '../cleanup/surfaceWaterTarget';
import { loadCriteriaDb } from '../surfaceWater/criteriaDb';
import { DEFAULT_CRITERIA_SET } from '../surfaceWater/criteriaSetChoice';
import { reportCriteria } from '../surfaceWater/reportCriteria';
import {
  cleanupCsvTables,
  CLEANUP_METHOD_IDS,
  MODELED_METHOD_ID,
  savedLevelsTable,
  ssgCsvTables,
  SSG_METHOD_ID,
  tphCsvTables,
} from '../cleanup/csv';
import { computeSsg, loadCleanupProps, type CleanupProps } from '../cleanup/ssg';
import { compute as computeTransport } from '../transport/compute';
import { toScenario as transportScenario } from '../transport/form';
import { transportCsvTables } from '../transport/csv';
import { compute as computeVadose } from '../vadose/compute';
import { toScenario as vadoseScenario } from '../vadose/form';
import { VADOSE_METHOD_IDS, vadoseCsvTables } from '../vadose/csv';
import { compute as computeSaturated } from '../saturated/compute';
import { toScenario as saturatedScenario } from '../saturated/form';
import { saturatedCsvTables } from '../saturated/csv';
import { runVapor } from '../vapor/compute';
import { toInputs as vaporInputs } from '../vapor/form';
import { vaporCsvTables } from '../vapor/csv';
import { INDOOR_ORIGIN, vaporEpcs, type SourceSeries, type VaporEpcs } from '../vapor/series';
import { compute as computeSurfaceWater } from '../surfaceWater/compute';
import { toRequest as surfaceWaterRequest } from '../surfaceWater/inputs';
import { surfaceWaterCsvTables, LEGACY_ID, MODERN_ID } from '../surfaceWater/csv';
import { computeHousehold } from '../household/compute';
import { householdCsvTables } from '../household/csv';
import { computeProduce } from '../plantsEco/produce';
import { computeEcossl, computeBenchmarks } from '../plantsEco/eco';
import { computeTph } from '../plantsEco/tph';
import { loadEcossl, substanceFor } from '../plantsEco/ecossl';
import { plantsEcoCsvTables } from '../plantsEco/csv';
import type { ChartItem } from './chartItems';
import {
  BLOCK_BUILDERS,
  SENT_TO,
  type ChemicalBlock,
  type CurrentRun,
  type NameOf,
} from './chemicalBlocks';
import {
  basisChoice,
  criteriaDisagreements,
  methodBasisOf,
  riskDisagreements,
  type MethodBasis,
} from './methodBasis';
import { saturatedSeries, saturatedVlines } from '../saturated/timeSeries';
import { profileCurves, layerBands } from '../vapor/chartData';
import type { VadoseFeed } from '../vadose/feed';
import type { SaturatedFeed } from '../saturated/feed';
import type { BankFeed } from '../transport/bankFeed';
import type { WellFeed } from '../transport/wellFeed';
import type { SurfaceWaterFeed } from '../surfaceWater/feed';
import type { VaporRiskFeed } from '../vapor/feeds';
import type { HouseholdRiskFeed } from '../household/feeds';
import type { ProduceRiskFeed, TphRiskFeed } from '../plantsEco/feeds';
import { pickSlot, slotOf, type FeedSlots } from '../project/feedSlots';
import { isChemicalFeed } from '../project/schema';
import { cleanupSourceKind, guidedCleanupGaps } from '../guided/cleanupForm';
import { MODEL_WORDS } from '../guided/derive';
import { OUTPUT_MODEL, outputHashes } from '../guided/hash';
import { outputSlots } from '../guided/slots';
import { guidedKeptLevels, guidedSolvePlan } from '../guided/solve';
import type { GuidedFormKey, GuidedOutputs, GuidedState } from '../guided/state';
import { guidedRiskGaps } from '../guided/riskForm';
import type { BasisChoice } from './methodBasis';
import {
  chemicalScreens,
  guidedScreens,
  guidedSectionKeys,
  individualFallback,
  isFateKey,
  loadGuidedReportData,
  targetWords,
  type GuidedReportData,
} from './guidedSource';

/** An engine warning with the method (or table) it came from. */
export interface ResultWarning {
  origin: string;
  code: string;
  message: string;
}

/** What one screen contributes to the report: the screen's own CSV tables, its warnings and notes. */
export interface SectionResults {
  tables: CsvTable[];
  /** The screen's main charts, drawn with the screen's own chart components. */
  charts: ChartItem[];
  warnings: ResultWarning[];
  notes: string[];
  /**
   * Which method the section's conclusions rest on and where legacy and modern disagree on an exceedance;
   * absent for a screen that does not show legacy against modern.
   */
  methodBasis?: MethodBasis;
  /**
   * A fate screen's results sent on, one block per chemical (see `chemicalBlocks.ts`): what the exposure,
   * risk and cleanup screens used. Absent for a screen that sends nothing per chemical.
   */
  chemicals?: ChemicalBlock[];
  /** The run the fate screen shows now (the tables of this section), and whether it was sent on. */
  current?: CurrentRun;
}

export type ProjectResults = Partial<Record<ScreenKey, SectionResults>>;

/** What the report prints in a value cell that is empty because the value could not be quantified. */
export const NOT_QUANTIFIED = 'not quantified';

export interface TableText {
  name: string;
  label: string;
  headers: string[];
  rows: string[][];
}

function cellText(v: CsvCell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Number(v.toPrecision(6))) : '';
  return v;
}

/**
 * A CSV table as display text: headers with units, numbers to six significant digits, and every row (a
 * result table is never cut short in the report). An empty cell of a column the table lists in `missing`
 * reads "not quantified"; the reason is in the column `missing.because` names, which is printed too.
 */
export function tableText(t: CsvTable): TableText {
  const unquantified = new Set(t.missing?.keys ?? []);
  return {
    name: t.name,
    label: t.label,
    headers: t.columns.map(csvHeader),
    rows: t.rows.map((row) =>
      t.columns.map((c) => {
        const v = row[c.key];
        return unquantified.has(c.key) && (v === null || v === undefined || v === '')
          ? NOT_QUANTIFIED
          : cellText(v);
      }),
    ),
  };
}

type Method = 'legacy' | 'modern';
const METHOD_NAME: Record<Method, string> = { legacy: 'legacy method', modern: 'modern method' };

function empty(): SectionResults {
  return { tables: [], charts: [], warnings: [], notes: [] };
}

function notComputed(why: string | string[]): SectionResults {
  const text = Array.isArray(why) ? why.join('; ') : why;
  return { tables: [], charts: [], warnings: [], notes: [`Not computed: ${text}`] };
}

function addWarnings(
  sec: SectionResults,
  origin: string,
  ws: readonly Pick<Warning, 'code' | 'message'>[],
): void {
  for (const w of ws) {
    if (
      !sec.warnings.some((x) => x.origin === origin && x.code === w.code && x.message === w.message)
    ) {
      sec.warnings.push({ origin, code: w.code, message: w.message });
    }
  }
}

/**
 * Every stored slot of a feed as the screens hold it (decoded exactly as loading a project does), in
 * the saved order: one slot per chemical for a feed about one chemical, one untagged slot for TPH.
 */
export function feedSlotsOf<T>(project: Project, key: string): FeedSlots<T> {
  type Envelope = { value?: unknown } | undefined;
  const entry = (project.feeds as Record<string, unknown> | undefined)?.[key];
  if (entry === undefined || entry === null) return new Map();
  if (!isChemicalFeed(key)) {
    const v = (entry as Envelope)?.value;
    return v === undefined ? new Map() : new Map([['', decodeJson(v) as T]]);
  }
  const out = new Map<string, T>();
  for (const [slot, e] of Object.entries(entry as Record<string, Envelope>)) {
    if (e?.value !== undefined) out.set(slot, decodeJson(e.value) as T);
  }
  return out;
}

/**
 * The stored value a consumer for `chemicalId` reads (its own chemical's slot, see
 * `feedSlots.pickSlot`), or null. With no chemical, the untagged slot or the most recent.
 */
export function feedOf<T>(project: Project, key: string, chemicalId?: string): T | null {
  return pickSlot(feedSlotsOf<T>(project, key), chemicalId);
}

/**
 * The fingerprint of the sending screen's form recorded when the slot of `key` was sent (see
 * `feedEntry`), or null when the slot holds none.
 */
export function feedHashOf(project: Project, key: string, slot: string): string | null {
  const entry = (project.feeds as Record<string, unknown> | undefined)?.[key];
  if (entry === undefined || entry === null) return null;
  const e = (
    isChemicalFeed(key) ? (entry as Record<string, unknown>)[slot] : slot === '' ? entry : undefined
  ) as { inputsHash?: unknown } | undefined;
  return typeof e?.inputsHash === 'string' ? e.inputsHash : null;
}

/** A section's access to the stored feeds: one consumer's slot, or every slot of a feed. */
interface Feed {
  <T>(key: string, chemicalId?: string): T | null;
  slots: <T>(key: string) => FeedSlots<T>;
  /** The form fingerprint recorded when the slot was sent, or null. */
  hash: (key: string, slot: string) => string | null;
}

function transport(s: Screens, feed: Feed): SectionResults {
  const form = s.transport.form;
  const parsed = transportScenario(
    form,
    feed<VadoseFeed>('vadose', form.chemicalId),
    feed<SaturatedFeed>('saturated', form.chemicalId),
  );
  if (!parsed.ok) return notComputed(parsed.errors);
  const out = computeTransport({
    scenario: parsed.scenario,
    mapMethod: form.mapMethod,
    domenico: form.showDomenico,
  });
  if (!out.ok) return notComputed(out.error);
  const sec = empty();
  sec.tables = transportCsvTables(out.result, Number(form.timeYr));
  const rd = parsed.scenario.receptorDepths;
  sec.charts = [
    {
      kind: 'plume',
      result: out.result,
      scenario: parsed.scenario,
      scale: form.scale,
      methodLabel:
        form.mapMethod === 'legacy' ? 'legacy AT123D-class method' : 'modern Wexler (1992) method',
      timeLabel: `at ${form.timeYr} years`,
      depthLabel:
        rd.bottom > rd.top
          ? `screen average ${rd.top} to ${rd.bottom} m depth`
          : `at ${rd.top} m depth`,
    },
    { kind: 'breakthrough', result: out.result, scale: form.scale },
  ];
  addWarnings(sec, 'groundwater transport', out.result.warnings);
  return sec;
}

function vadose(s: Screens): SectionResults {
  const parsed = vadoseScenario(s.vadose.form);
  if (!parsed.ok) return notComputed(parsed.errors);
  const out = computeVadose({ scenario: parsed.scenario });
  if (!out.ok) return notComputed(out.error);
  const sec = empty();
  sec.tables = vadoseCsvTables(out.result);
  const vform = s.vadose.form;
  const vrun =
    out.result.runs[vform.method] ??
    out.result.runs[vform.method === 'legacy' ? 'modern' : 'legacy'];
  if (vrun) {
    sec.charts = [
      { kind: 'vadoseDepth', run: vrun, scale: vform.scale },
      {
        kind: 'vadoseWaterTable',
        runs: out.result.runs,
        measure: vform.measure,
        scale: vform.scale,
      },
      { kind: 'vadoseDepletion', run: vrun, scale: vform.scale },
    ];
  }
  for (const w of out.result.warnings) addWarnings(sec, VADOSE_METHOD_IDS[w.method], [w]);
  for (const [m, why] of Object.entries(out.result.unavailable)) {
    sec.notes.push(`The ${METHOD_NAME[m as Method]} did not run: ${why}`);
  }
  return sec;
}

function saturated(s: Screens): SectionResults {
  const parsed = saturatedScenario(s.saturated.form);
  if (!parsed.ok) return notComputed(parsed.errors);
  const out = computeSaturated({ scenario: parsed.scenario });
  if (!out.ok) return notComputed(out.error);
  const sec = empty();
  sec.tables = saturatedCsvTables(out.result);
  const sform = s.saturated.form;
  const wanted: Method[] = sform.method === 'both' ? ['legacy', 'modern'] : [sform.method];
  const shown = wanted.filter((m) => out.result.runs[m]);
  const runs = shown.map((m) => out.result.runs[m]!);
  if (runs.length > 0) {
    const vlines = saturatedVlines(runs, parsed.scenario.input.tEnd / convert(1, 'yr', 's'));
    const timesYr = out.result.curves.timesYr;
    sec.charts = [
      {
        kind: 'saturatedRate',
        timesYr,
        series: saturatedSeries(out.result, shown, 'rate'),
        vlines,
      },
      {
        kind: 'saturatedRemaining',
        timesYr,
        series: saturatedSeries(out.result, shown, 'remaining'),
        vlines,
      },
    ];
  }
  for (const w of out.result.warnings) addWarnings(sec, METHOD_NAME[w.method], [w]);
  for (const [m, why] of Object.entries(out.result.unavailable)) {
    sec.notes.push(`The ${METHOD_NAME[m as Method]} did not run: ${why}`);
  }
  return sec;
}

function vapor(s: Screens, feed: Feed): SectionResults {
  const { form, outdoor, choice } = s.vapor;
  const parsed = vaporInputs(form);
  if (!parsed.ok) return notComputed(parsed.errors);
  const outcome = runVapor(parsed);
  const held: Record<string, string> = {
    waterTable: 'vaporWaterTable',
    vadose: 'vaporVadose',
    saturated: 'vaporSaturated',
  };
  const source = choice === 'entered' ? null : feed<SourceSeries>(held[choice]!, form.chemicalId);
  const epcs: VaporEpcs | null = source ? vaporEpcs(form, parsed, source, outdoor) : null;
  const sec = empty();
  sec.tables = vaporCsvTables(outcome, epcs);
  const curves = profileCurves(outcome);
  if (curves.length > 0) {
    const names = form.layers.map((l, i) => l.name || `Stratum ${i + 1}`);
    const cap =
      form.source === 'groundwater'
        ? (parsed.legacy.capillaryFringe?.thickness ?? parsed.modern.capillary?.height)
        : undefined;
    const bands = layerBands(parsed.modern.strata, names, parsed.modern.floorDepth, cap);
    sec.charts = [{ kind: 'vaporProfile', curves, bands }];
  }
  for (const m of ['legacy', 'modern'] as const) {
    const o = outcome[m];
    if (o.ok) addWarnings(sec, INDOOR_ORIGIN[m], o.result.warnings);
    else sec.notes.push(`The ${METHOD_NAME[m]} did not run: ${o.error}`);
  }
  const dv = outcome.devaull;
  if (dv) {
    if (dv.ok) addWarnings(sec, INDOOR_ORIGIN.devaull, dv.result.warnings);
    else sec.notes.push(`The oxygen-limited method did not run: ${dv.error}`);
  }
  return sec;
}

async function surfaceWater(s: Screens, feed: Feed): Promise<SectionResults> {
  const form = s.surfaceWater.form;
  const bank = feed<BankFeed>('bank', form.chemicalId);
  const parsed = surfaceWaterRequest(form, bank);
  if (!parsed.ok) return notComputed(parsed.errors);
  const out = computeSurfaceWater(parsed.request);
  if (!out.ok) return notComputed(out.error);
  const sec = empty();
  // the comparison with the criteria set saved in the project, for the chemical of the run
  const foc = form.sedimentOn && form.foc.trim() !== '' ? Number(form.foc) : undefined;
  const comparison = await reportCriteria(
    s.surfaceWater.criteriaSet ?? DEFAULT_CRITERIA_SET,
    form.linked && bank !== null ? (bank.chemicalId ?? '') : form.chemicalId,
    out.result,
    foc !== undefined && Number.isFinite(foc) ? foc : undefined,
  );
  sec.tables = surfaceWaterCsvTables(out.result, comparison ?? undefined);
  if (comparison !== null) sec.notes.push(comparison.note);
  const swScale = form.scale;
  sec.charts = [
    { kind: 'surfaceWater', result: out.result, scale: swScale },
    { kind: 'sediment', result: out.result, scale: swScale },
  ];
  addWarnings(sec, LEGACY_ID, out.result.legacy.warnings);
  addWarnings(sec, MODERN_ID, out.result.modern.warnings);
  return sec;
}

function risk(s: Screens, feed: Feed, db: ChemicalDb): SectionResults {
  const form = s.risk.form;
  const built = buildInputs(
    form,
    db,
    feed.slots<WellFeed>('well'),
    feed.slots<VaporRiskFeed>('vaporRisk'),
    feed.slots<SurfaceWaterFeed>('surfaceWater'),
    feed.slots<HouseholdRiskFeed>('household'),
    feed.slots<ProduceRiskFeed>('produce'),
  );
  if (!built.ok) return notComputed(built.errors);
  const outcome = runRisk(built);
  const names: Record<string, string> = {};
  for (const c of form.chemicals) names[c.id] = c.name;
  const sec = empty();
  sec.tables = riskCsvTables(outcome, names);
  sec.charts = [{ kind: 'risk', outcome, names }];
  for (const n of built.notes)
    addWarnings(sec, 'exposure screen', [{ code: 'ui.pathway-skipped', message: n }]);
  for (const m of ['legacy', 'modern'] as const) {
    const o = outcome[m];
    if (o.ok) addWarnings(sec, RISK_METHOD_IDS[m], o.result.warnings);
    else sec.notes.push(`The ${METHOD_NAME[m]} did not run: ${o.error}`);
  }
  return sec;
}

/**
 * The guided exposure and risk section: the risk computed for the chemicals the Run gave a result, then
 * each chemical pathway it did not (the Run's reason) as a note, and every total marked partial where a
 * gap pathway is left out, as the workbench marks a pathway that is not quantified.
 */
function guidedRisk(data: GuidedReportData, feed: Feed): SectionResults {
  const screens = guidedScreens(data);
  const refs = data.chemicals.map((c) => ({ id: c.id, name: c.name }));
  const gaps = guidedRiskGaps(data.guided, refs);
  const sec = risk(screens, feed, data.db);
  if (gaps.length === 0) return sec;
  sec.notes.unshift(...gaps.map((g) => g.note));
  const omits = [...new Set(gaps.map((g) => `${g.what} for ${g.chemical}`))].join(', ');
  const text = `partial total, omits ${omits} (not quantified)`;
  for (const t of sec.tables) {
    if (t.name !== 'risk-results') continue;
    t.rows = t.rows.map((r) => {
      const prior = typeof r.note === 'string' && r.note !== '' ? `${r.note}; ` : '';
      return { ...r, note: `${prior}${text}` };
    });
  }
  return sec;
}

/** The entries the file holds under `modeledLevels`, parsed or not. */
function rawModeledLevels(project: Project): Record<string, unknown> {
  const raw = project.modeledLevels as unknown;
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/** What the cleanup section knows beyond the screens: the kept modeled levels and what judges them. */
interface KeptLevels {
  /** The levels the project carries, by chemical id. */
  saved: Record<string, SavedModeledLevels>;
  /** Chemical ids the file holds an entry for that could not be read. */
  unreadable: ReadonlySet<string>;
  /** The solubility the user entered for each user-defined chemical. */
  userProps: CleanupProps;
  /** The fingerprint of the groundwater run held for a chemical in this session, when there is one. */
  chainHash?: (chemicalId: string) => string | undefined;
}

/** What a caller who holds more than the saved project can tell the report. */
export interface ReportSession {
  /** The fingerprint of the groundwater run the session holds for a chemical (see `getChainHash`). */
  chainHash?: (chemicalId: string) => string | undefined;
}

/**
 * The fingerprint of the groundwater run the kept levels of `id` are judged against: the run this session
 * holds for the chemical, else, when the groundwater screen is set to this chemical (or to none), the run
 * that screen would send now. With the screen on another chemical and no run held the chain cannot be
 * told, and the levels cannot be confirmed.
 */
function chainOf(id: string, s: Screens, kept: KeptLevels): string | null {
  const live = kept.chainHash?.(id);
  if (live !== undefined) return live;
  const onScreen = slotOf(s.transport.form.chemicalId);
  return onScreen === '' || onScreen === id ? chainFingerprint(s.transport.form) : null;
}

/**
 * The modeled cleanup levels of a groundwater, vadose or saturated source (docs/DECISIONS.md, wave AA
 * ruling 2). The report does not solve them: the groundwater chain they go through holds a function and is
 * not saved. It prints the levels the cleanup screen solved and kept with the project, per chemical, while
 * the fingerprint of the inputs they came from still matches, and otherwise says they are out of date and
 * that the cleanup screen solves them again.
 */
function modeledCleanup(
  s: Screens,
  feed: Feed,
  db: ChemicalDb,
  props: CleanupProps,
  kept: KeptLevels,
): SectionResults {
  const saved = kept.saved;
  const form = s.cleanup.form;
  const sec = empty();
  const many = form.chemicals.length > 1;
  if (form.chemicals.length === 0) {
    sec.notes.push('No chemical is on the cleanup screen, so there are no modeled cleanup levels.');
    return sec;
  }
  for (const row of form.chemicals) {
    const who = many ? `${row.name}: ` : '';
    const held = saved[row.id];
    if (held === undefined && kept.unreadable.has(row.id)) {
      sec.notes.push(
        `${who}The modeled cleanup levels kept with this project could not be read. Open the cleanup screen with the groundwater run sent from the groundwater screen: it solves them again, and they are then kept with the project and printed here.`,
      );
      continue;
    }
    if (held === undefined) {
      sec.notes.push(
        `${who}The modeled cleanup levels have not been solved for this project. Open the cleanup screen with the groundwater run sent from the groundwater screen; the screen solves them and they are then kept with the project and printed here.`,
      );
      continue;
    }
    const chain = chainOf(row.id, s, kept);
    if (chain === null) {
      sec.notes.push(
        `${who}The modeled cleanup levels kept with this project cannot be confirmed: they were solved through a groundwater run that is not held now (a run is not saved with the project) and the groundwater screen is set to another chemical. Send the run for ${row.name} from the groundwater screen, then open the cleanup screen: it solves them again, and the report then prints the new levels.`,
      );
      continue;
    }
    const now = modeledLevelsFingerprint({
      cleanup: form,
      chemicalId: row.id,
      chain,
      vadose: feed<VadoseFeed>('vadose', row.id),
      saturated: feed<SaturatedFeed>('saturated', row.id),
      rec: db.byId.get(row.id),
      edition: db.edition,
    });
    if (now !== held.fingerprint) {
      sec.notes.push(
        `${who}The modeled cleanup levels kept with this project are out of date, because an input they were solved from has changed since. Open the cleanup screen: it solves them again, and the report then prints the new levels.`,
      );
      continue;
    }
    const ceiling = solubilityCeiling(form.solubility, row.id, props, db.edition, kept.userProps);
    const table = savedLevelsTable(held, ceiling);
    sec.tables.push(
      many
        ? { ...table, name: `${table.name}-${row.id}`, label: `${table.label}, ${row.name}` }
        : table,
    );
    for (const n of held.notes) {
      addWarnings(sec, 'cleanup screen', [{ code: 'ui.source-note', message: `${who}${n}` }]);
    }
    for (const m of ['legacy', 'modern'] as const) {
      const o = held.methods[m];
      if (o === undefined) continue;
      if (o.ok) addWarnings(sec, MODELED_METHOD_ID, o.warnings);
      else sec.notes.push(`${who}The ${METHOD_NAME[m]} did not run: ${o.error}`);
    }
  }
  noteSolubilities(sec, form, props, db.edition, kept.userProps);
  noteSolubilityFlags(sec);
  return sec;
}

/**
 * Says which solubility each cleanup chemical's dissolved levels are held against and where that value
 * came from (docs/DECISIONS.md, wave AA ruling 7), so a flag, or the absence of one, can be checked.
 */
function noteSolubilities(
  sec: SectionResults,
  form: Screens['cleanup']['form'],
  props: CleanupProps,
  edition: string,
  user: CleanupProps,
): void {
  for (const row of form.chemicals) {
    const c = solubilityCeiling(form.solubility, row.id, props, edition, user);
    if (c !== null) {
      sec.notes.push(`Solubility used for ${row.name}: ${solubilityText(c)}.`);
    }
  }
}

/** Says in the section's notes every level its tables flag as above the solubility (each sentence once). */
function noteSolubilityFlags(sec: SectionResults): void {
  for (const t of sec.tables) {
    for (const r of t.rows) {
      const flag = String(r['solubility'] ?? '');
      if (flag !== '' && !sec.notes.includes(flag)) sec.notes.push(flag);
    }
  }
}

async function cleanup(
  s: Screens,
  feed: Feed,
  db: ChemicalDb,
  props: () => Promise<CleanupProps>,
  kept: KeptLevels,
): Promise<SectionResults> {
  const form = s.cleanup.form;
  if (form.source !== 'direct') return modeledCleanup(s, feed, db, await props(), kept);
  const sec = empty();
  // the solubility a dissolved level is held against: the database value unless the user entered one
  const cleanupProps = await props();
  const ceilingOf = (id: string) =>
    solubilityCeiling(form.solubility, id, cleanupProps, db.edition, kept.userProps);
  const built = buildCleanup(form, db, { produce: feed.slots<ProduceRiskFeed>('produce') });
  const tphHeld = feed<TphRiskFeed>('tph');
  if (tphHeld !== null) {
    sec.tables.push(...tphCsvTables(tphHeld));
    addWarnings(sec, tphHeld.methodId, tphHeld.warnings);
  }
  if (built.ok) {
    const outcome = runCleanup(built);
    const names: Record<string, string> = {};
    for (const c of form.chemicals) names[c.id] = c.name;
    sec.tables.push(...cleanupCsvTables(outcome, names, ceilingOf));
    for (const n of built.notes)
      addWarnings(sec, 'cleanup screen', [{ code: 'ui.pathway-skipped', message: n }]);
    addWarnings(sec, 'plant uptake', built.feedWarnings);
    for (const m of ['legacy', 'modern'] as const) {
      const o = outcome[m];
      if (o.ok) addWarnings(sec, CLEANUP_METHOD_IDS[m], o.result.warnings);
      else sec.notes.push(`The ${METHOD_NAME[m]} did not run: ${o.error}`);
    }
    const levelFeeds = {
      household: feed.slots<HouseholdRiskFeed>('household'),
      vapor: feed.slots<VaporRiskFeed>('vaporRisk'),
      surface: feed.slots<SurfaceWaterFeed>('surfaceWater'),
    };
    const targets = targetsOfChemicals(
      form.surfaceTargets,
      form.chemicals.map((c) => c.id),
    );
    const targetArgs = {
      targets,
      db: targets.some((t) => t.kind !== 'none') ? await loadCriteriaDb() : null,
      slots: feed.slots<SurfaceWaterFeed>('surfaceWater'),
      names,
      source: form.source,
      runCount: form.chemicals.length,
    };
    // the surface water levels that are not linear in the source are solved in the worker
    const solves = await solveSurfaceJobsAsync(
      jobsOf([
        ...surfaceSolveJobs(outcome, names, levelFeeds).map((job) => ({ job })),
        ...surfaceTargetLevels(targetArgs),
      ]),
    );
    sec.tables.push(...sourceLevelCsvTables(outcome, names, levelFeeds, { solves, ceilingOf }));
    if (targets.some((t) => t.kind !== 'none')) {
      sec.tables.push(...surfaceTargetTables(surfaceTargetLevels({ ...targetArgs, solves })));
    }
  } else if (!form.ssg.on && tphHeld === null) {
    return notComputed(built.errors);
  } else {
    sec.notes.push(`Not computed: ${built.errors.join('; ')}`);
  }
  if (form.ssg.on) {
    const out = computeSsg(form, db, cleanupProps);
    if (out.ok) {
      sec.tables.push(...ssgCsvTables(out.rows));
      for (const r of out.rows) if (r.ok) addWarnings(sec, SSG_METHOD_ID, r.warnings);
      sec.notes.push(...out.notes);
    } else {
      sec.notes.push(`Leaching level not computed: ${out.errors.join('; ')}`);
    }
  }
  noteSolubilities(sec, form, cleanupProps, db.edition, kept.userProps);
  noteSolubilityFlags(sec);
  return sec;
}

function household(s: Screens, feed: Feed): SectionResults {
  const out = computeHousehold(s.household.form, {
    well: feed<WellFeed>('well', s.household.form.chemicalId),
    surface: feed<SurfaceWaterFeed>('surfaceWater', s.household.form.chemicalId),
  });
  const sec = empty();
  sec.tables = householdCsvTables(out);
  const parts: [string, { ok: boolean; warnings?: Warning[] }][] = [
    ['shower.fc-1986', out.shower.legacy],
    ['shower.little-1992', out.shower.little],
    ['shower.rsl-household', out.shower.rsl],
    ['irrigation.sprinkler-fc', out.irrigation],
    ['particulate.box-emission', out.particulate.box],
    ['particulate.ssg-pef-1996', out.particulate.pef1996],
    ['particulate.ssg-pef-2002', out.particulate.pef2002],
  ];
  for (const [origin, part] of parts) if (part.ok) addWarnings(sec, origin, part.warnings ?? []);
  return sec;
}

async function plantsEco(s: Screens): Promise<SectionResults> {
  const form = s.plantsEco.form;
  const [props, substances] = await Promise.all([loadCleanupProps(), loadEcossl()]);
  const produce = computeProduce(form);
  const ecossl = computeEcossl(
    form,
    form.chemicalId ? substanceFor(substances, form.chemicalId) : undefined,
  );
  const benchmarks = computeBenchmarks(form);
  const tph = computeTph(form, props);
  const sec = empty();
  sec.tables = plantsEcoCsvTables({ produce, ecossl, benchmarks, tph });
  if (produce.ok) addWarnings(sec, 'plant uptake', produce.row.warnings);
  if (ecossl.ok) addWarnings(sec, 'eco.ecossl-2005', ecossl.result.warnings);
  if (benchmarks.ok) addWarnings(sec, 'eco.benchmark-hq', benchmarks.warnings);
  if (tph.ok) addWarnings(sec, 'tph', tph.result.warnings);
  const missing: [string, typeof produce | typeof ecossl | typeof benchmarks | typeof tph][] = [
    ['Produce pathway', produce],
    ['Eco-SSL screen', ecossl],
    ['User benchmarks', benchmarks],
    ['TPH fractions', tph],
  ];
  for (const [label, part] of missing) {
    if (!part.ok) sec.notes.push(`${label} not computed: ${part.errors.join('; ')}`);
  }
  return sec;
}

function uncertainty(): SectionResults {
  return {
    tables: [],
    charts: [],
    warnings: [],
    notes: [
      'A project does not save uncertainty results. Each run is repeated from this setup and its seed, which gives the same numbers as the exposure and cleanup screens; tick "Include uncertainty results" below to run it for this report.',
    ],
  };
}

/** Which results a report prints: today's (the model screens and their sent feeds) or the guided steps'. */
export type ResultsSource = 'workbench' | 'guided';

/**
 * The results of every screen the project shows as used, computed from the saved forms with each
 * screen's own compute function and CSV table builders. Values passed between screens come from the
 * project's stored feeds, decoded as loading the project decodes them. A screen that cannot be
 * computed (a form that does not parse, an engine refusal) says why in its notes.
 *
 * With `source` 'guided' the same code runs on the guided project (`guidedSource.ts`): the derived forms,
 * the step 3d outputs as the feeds, and the sections the chain uses. `data` may be passed when it is
 * already loaded.
 */
export async function computeResults(
  project: Project,
  session: ReportSession = {},
  source: ResultsSource = 'workbench',
  data?: GuidedReportData,
): Promise<ProjectResults> {
  if (source === 'guided') {
    return computeGuidedResults(project, data ?? (await loadGuidedReportData(project)));
  }
  const saved = screensOf(project);
  const screens = withProjectReceptorEdits(saved, overridesOf(project));
  const feeds = project.feeds as FeedsLike | undefined;
  const feed: Feed = Object.assign(
    <T>(key: string, chemicalId?: string): T | null => feedOf<T>(project, key, chemicalId),
    {
      slots: <T>(key: string): FeedSlots<T> => feedSlotsOf<T>(project, key),
      hash: (key: string, slot: string): string | null => feedHashOf(project, key, slot),
    },
  );
  // used-ness is judged on the saved forms: a receptor edit alone does not make a screen used
  const used = USED_SCREENS_ORDER.filter((k) => screenUsed(k, saved, feeds));
  // the risk and cleanup screens need the database to compute; a fate screen needs it only to name a chemical
  const namesChemicals = (k: ScreenKey): boolean =>
    SENT_TO[k] !== undefined &&
    (currentChemicalId(k, saved, feed) !== '' ||
      Object.keys(SENT_TO[k]!).some((f) => feed.slots(f).size > 0));
  const needsDb = used.some((k) => k === 'risk' || k === 'cleanup' || namesChemicals(k));
  let db: ChemicalDb | null = null;
  let dbError = '';
  if (needsDb) {
    try {
      db = effectiveDb(await loadChemicalDb(), overridesOf(project), chemicalsOf(project));
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e);
    }
  }
  const nameOf = chemicalNamer(project, db);
  const keptLevels = modeledLevelsOf(project);
  const kept: KeptLevels = {
    saved: keptLevels,
    unreadable: new Set(Object.keys(rawModeledLevels(project)).filter((id) => !(id in keptLevels))),
    userProps: userCleanupProps(chemicalsOf(project)),
    ...(session.chainHash ? { chainHash: session.chainHash } : {}),
  };
  const out: ProjectResults = {};
  for (const key of used) {
    try {
      const sec = await computeOne(key, screens, feed, db, dbError, kept);
      if (sec.tables.length === 0 && sec.notes.length === 0) {
        sec.notes.push('No result yet: the inputs entered are not enough to compute one.');
      }
      const basis = sectionBasis(key, screens, feed, sec);
      if (basis !== null) sec.methodBasis = basis;
      attachChemicals(key, screens, feed, nameOf, sec);
      out[key] = sec;
    } catch (e) {
      out[key] = notComputed(e instanceof Error ? e.message : String(e));
    }
  }
  return out;
}

/**
 * How a chemical id is named in the report: the name the project list gives it, else the database's, so a
 * chemical is never called by its CAS number or id while a name is known.
 */
function chemicalNamer(project: Project, db: ChemicalDb | null): NameOf {
  const listed = new Map(chemicalsOf(project).map((c) => [c.id, c.name]));
  return (id) => {
    const name = listed.get(id);
    if (name !== undefined && name.trim() !== '' && name !== id) return name;
    if (id === FIXTURE_ID) return 'Benzene (the built-in validation case)';
    return db?.byId.get(id)?.name ?? name ?? id;
  };
}

/** The vapor screen's built-in fixture chemical (see `project/chemicals.ts`). */
const FIXTURE_ID = 'risc4-benzene';

/** The id of the chemical a fate screen's form is set to now (blank when typed by hand). */
function currentChemicalId(key: ScreenKey, s: Screens, feed: Feed): string {
  switch (key) {
    case 'transport':
      return s.transport.form.chemicalId;
    case 'vadose':
      return s.vadose.form.chemicalId;
    case 'saturated':
      return s.saturated.form.chemicalId;
    case 'vapor':
      return s.vapor.form.chemicalId;
    case 'household':
      return s.household.form.chemicalId;
    case 'plantsEco':
      return s.plantsEco.form.chemicalId;
    case 'surfaceWater': {
      const form = s.surfaceWater.form;
      const bank = form.linked ? feed<BankFeed>('bank', form.chemicalId) : null;
      return bank?.chemicalId ?? form.chemicalId;
    }
    default:
      return '';
  }
}

/** The per-chemical blocks of a fate screen's section and the label of the run the screen shows now. */
function attachChemicals(
  key: ScreenKey,
  screens: Screens,
  feed: Feed,
  nameOf: NameOf,
  sec: SectionResults,
): void {
  const build = BLOCK_BUILDERS[key];
  const sentTo = SENT_TO[key];
  if (build === undefined || sentTo === undefined) return;
  const blocks = build(feed.slots, nameOf);
  if (blocks.length > 0) sec.chemicals = blocks;
  const id = currentChemicalId(key, screens, feed);
  const typed = (screens[key] as { form?: { chemicalName?: string } }).form?.chemicalName?.trim();
  // a result counts as the screen's run only while the screen's inputs still match the ones recorded
  // when it was sent; otherwise it is an earlier run, printed in the block above, and the tables of
  // this section are a different run that was not sent
  const now = feedEntry(
    key as keyof Screens,
    (screens[key] as { form?: unknown }).form,
    0,
  ).inputsHash;
  const sentSlots = Object.entries(sentTo).filter(([f]) => feed.slots(f).has(slotOf(id)));
  const destinations = (match: boolean): string | null => {
    const to = [
      ...new Set(
        sentSlots.filter(([f]) => (feed.hash(f, slotOf(id)) === now) === match).map(([, s]) => s),
      ),
    ];
    return to.length === 0 ? null : to.join(' and ');
  };
  const changed = destinations(false);
  sec.current = {
    chemical: id === '' ? (typed ? typed : 'a chemical entered by hand') : nameOf(id),
    sentTo: destinations(true),
    ...(changed === null ? {} : { changedSince: changed }),
  };
}

/**
 * The method basis of a section that shows legacy against modern results: the screen's method shown (see
 * `basisChoice`), the other method as a sensitivity, and the exceedances the two disagree on, read from
 * the section's own tables. Null for a section with no table to rest on.
 */
function sectionBasis(
  key: ScreenKey,
  screens: Screens,
  feed: Feed,
  sec: SectionResults,
): MethodBasis | null {
  if (sec.tables.length === 0) return null;
  // the method sent for the chemical the screen shows (a linked run takes the bank run's chemical), from
  // that chemical's own slot only: another chemical's sent method is not this chemical's basis
  const sent =
    key === 'surfaceWater'
      ? (feed
          .slots<SurfaceWaterFeed>('surfaceWater')
          .get(slotOf(currentChemicalId(key, screens, feed)))?.method ?? null)
      : null;
  const choice = basisChoice(key, screens, sent);
  if (choice === null) return null;
  const rowsOf = (match: (name: string) => boolean) =>
    sec.tables.filter((t) => match(t.name)).flatMap((t) => t.rows);
  const disagreements =
    key === 'surfaceWater'
      ? criteriaDisagreements(rowsOf((n) => n.startsWith('surface-water-criteria')))
      : key === 'risk'
        ? riskDisagreements(rowsOf((n) => n === 'risk-results'))
        : [];
  return methodBasisOf(choice, disagreements);
}

async function computeOne(
  key: ScreenKey,
  s: Screens,
  feed: Feed,
  db: ChemicalDb | null,
  dbError: string,
  kept: KeptLevels,
): Promise<SectionResults> {
  switch (key) {
    case 'transport':
      return transport(s, feed);
    case 'vadose':
      return vadose(s);
    case 'saturated':
      return saturated(s);
    case 'vapor':
      return vapor(s, feed);
    case 'surfaceWater':
      return surfaceWater(s, feed);
    case 'risk':
      return db
        ? risk(s, feed, db)
        : notComputed(`the chemical database did not load (${dbError})`);
    case 'cleanup':
      return db
        ? cleanup(s, feed, db, loadCleanupProps, kept)
        : notComputed(`the chemical database did not load (${dbError})`);
    case 'household':
      return household(s, feed);
    case 'plantsEco':
      return plantsEco(s);
    case 'uncertainty':
      return uncertainty();
  }
}

/* ------------------------------------------------------------------ the guided report */

/** The step 3d outputs as a section's feeds: a chemical reads only its own slot. */
function outputsFeed(outputs: GuidedOutputs): Feed {
  return Object.assign(
    <T>(key: string, chemicalId?: string): T | null =>
      outputSlots<T>(outputs, key).get(chemicalId ?? '') ?? null,
    {
      slots: <T>(key: string): FeedSlots<T> => outputSlots<T>(outputs, key),
      hash: (key: string, slot: string): string | null => outputs[key]?.[slot]?.inputsHash ?? null,
    },
  );
}

/** The workbench's words in a block, as the steps say them (no screens, nothing sent). */
const GUIDED_WORDS: readonly [RegExp, string][] = [
  [
    /^The inputs of the (.+) that was sent were not recorded.*$/,
    'The inputs of the $1 were not recorded; run step 3d again to record them.',
  ],
  [/ sent to the exposure and risk screen/g, ' kept by the step 3d Run for exposure and risk'],
  [/ sent to the surface water screen/g, ' kept by the step 3d Run for the surface water model'],
  [
    / sent to the groundwater screen as its source/g,
    " kept by the step 3d Run as the groundwater transport model's source",
  ],
  [/the groundwater screen/g, 'the groundwater transport model'],
  [/ was sent\./g, ' was used.'],
  [/^Method sent$/, 'Method used'],
];

export function guidedWords(text: string): string {
  return GUIDED_WORDS.reduce((t, [re, to]) => t.replace(re, to), text);
}

/** The warning origins of the workbench screens, as the steps name them. */
const GUIDED_ORIGIN: Readonly<Record<string, string>> = {
  'exposure screen': 'step 4',
  'cleanup screen': 'step 5',
};

const slugOf = (id: string): string => id.replace(/[^A-Za-z0-9]+/g, '-');

/** One model's section for one chemical's derived screens (the chemical's own run). */
async function fateSection(key: GuidedFormKey, s: Screens, feed: Feed): Promise<SectionResults> {
  switch (key) {
    case 'transport':
      return transport(s, feed);
    case 'vadose':
      return vadose(s);
    case 'saturated':
      return saturated(s);
    case 'vapor':
      return vapor(s, feed);
    case 'surfaceWater':
      return surfaceWater(s, feed);
    case 'household':
      return household(s, feed);
    case 'plantsEco':
      return plantsEco(s);
  }
}

/** A table of one chemical's run, named and labelled for that chemical. */
const forChemical = (t: CsvTable, id: string, name: string): CsvTable => ({
  ...t,
  name: `${t.name}-${slugOf(id)}`,
  label: `${t.label}, ${name}`,
});

/**
 * A fate model's guided section: one block per chemical the model runs for, with the result the Run kept
 * (the blocks of `chemicalBlocks.ts`, in the words of the steps) and the inputs it used, then that
 * chemical's full tables and charts computed on its derived forms. A result whose inputs changed since the
 * Run says it is out of date; a chemical with no result says why, as not quantified.
 */
async function guidedFate(
  key: GuidedFormKey,
  data: GuidedReportData,
  feed: Feed,
  live: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Promise<SectionResults> {
  const g = data.guided;
  const sec = empty();
  const feeds = Object.entries(OUTPUT_MODEL)
    .filter(([f, m]) => m === key && (data.plan?.outputs.includes(f) ?? false))
    .map(([f]) => f);
  const nameOf: NameOf = (id) => data.names[id] ?? id;
  const built = new Map(
    (BLOCK_BUILDERS[key]?.(feed.slots, nameOf) ?? []).map((b) => [b.chemicalId, b]),
  );
  const blocks: ChemicalBlock[] = [];
  for (const d of data.derived) {
    if (d.forms[key] === undefined) continue;
    const id = d.chemicalId;
    const name = d.chemicalName;
    const held = built.get(id);
    const block: ChemicalBlock = {
      chemicalId: id,
      name,
      sent: (held?.sent ?? []).map(guidedWords),
      inputs: (held?.inputs ?? []).map((r) => ({ ...r, label: guidedWords(r.label) })),
      notes: (held?.notes ?? []).map(guidedWords),
      tables: (held?.tables ?? []).map((t) => ({ ...t, label: guidedWords(t.label) })),
    };
    const present = feeds.filter((f) => g.outputs[f]?.[id] !== undefined);
    if (present.some((f) => g.outputs[f]![id]!.inputsHash !== live[f]?.[id])) {
      block.notes.unshift(
        'This result is out of date: an input it was run from has changed since the step 3d Run. Run step 3d again to bring it up to date.',
      );
    }
    const problems = (g.runNotes[id]?.problems ?? []).filter((p) => p.model === key);
    for (const p of problems) block.notes.push(`Not quantified: ${p.message}`);
    if (present.length === 0) {
      if (problems.length === 0) {
        block.notes.push(
          `Not quantified: the step 3d Run holds no result of the ${MODEL_WORDS[key]} for ${name}. Run step 3d.`,
        );
      }
      blocks.push(block);
      continue;
    }
    const one = await fateSection(key, chemicalScreens(data, d), feed);
    // the vadose and saturated blocks already repeat the run with both methods in full
    if (key !== 'vadose' && key !== 'saturated') {
      block.tables.push(...one.tables.map((t) => forChemical(t, id, name)));
    }
    if (one.charts.length > 0) block.charts = one.charts;
    for (const n of one.notes) if (!block.notes.includes(n)) block.notes.push(n);
    for (const w of one.warnings) addWarnings(sec, `${w.origin}, ${name}`, [w]);
    blocks.push(block);
  }
  if (blocks.length > 0) sec.chemicals = blocks;
  else sec.notes.push(`No chemical of the project runs the ${MODEL_WORDS[key]}.`);
  return sec;
}

const TARGET_WORDS: Record<string, string> = {
  risk: 'the risk and hazard targets',
  mcl: 'the federal MCL at the well',
  state: 'the state standard at the well',
};
const ALLOCATION_WORDS: Record<string, string> = {
  individual: 'each chemical alone',
  cumulative: 'all chemicals together, keeping the step 3b ratios',
  equal: 'with the target split equally among the chemicals',
};

/**
 * The guided cleanup section: where the chain carries a source to a well, the step 5 levels kept with the
 * project, printed while the guided fingerprint is current (`guidedKeptLevels`); then the levels in the
 * media the receptors contact, from the derived cleanup form over the Run's results.
 */
async function guidedCleanup(
  project: Project,
  data: GuidedReportData,
  feed: Feed,
): Promise<SectionResults> {
  const g = data.guided;
  const sec = empty();
  const userProps = userCleanupProps(chemicalsOf(project));
  const source = cleanupSourceKind(g);
  if (source !== 'direct') {
    const ctx = { chemicals: data.chemicals, db: data.db, overrides: data.overrides };
    const plan = guidedSolvePlan(g, ctx);
    for (const c of data.chemicals) {
      const k = guidedKeptLevels(g, c.id, ctx, plan);
      if (!k.needed) continue;
      const who = `${c.name}: `;
      const row = plan.rows.find((r) => r.id === c.id);
      if (k.levels === null) {
        sec.notes.push(
          row !== undefined && !row.result.ok
            ? `${who}the cleanup level at the source is not quantified: ${row.result.errors.join(' ')}`
            : `${who}the cleanup level at the source has not been solved yet. Open step 5: it solves the level and keeps it with the project, and the report then prints it.`,
        );
        continue;
      }
      if (!k.current && row !== undefined && !row.result.ok) {
        sec.notes.push(
          `${who}the cleanup level at the source is not quantified: ${row.result.errors.join(' ')}`,
        );
        continue;
      }
      if (!k.current) {
        sec.notes.push(
          `${who}the cleanup level kept with this project is out of date, because an input it was solved from has changed since. Open step 5: it solves it again, and the report then prints the new level.`,
        );
        continue;
      }
      const levels = k.levels;
      if (levels.reason !== null) {
        sec.notes.push(`${who}not quantified: ${levels.reason}.`);
        continue;
      }
      const ceiling = solubilityCeiling('', c.id, data.cleanupProps, data.db.edition, userProps);
      sec.tables.push(forChemical(savedLevelsTable(levels, ceiling), c.id, c.name));
      sec.notes.push(
        `${who}the level at the source is solved to meet ${levels.target === 'state' ? targetWords(g, c.id) : TARGET_WORDS[levels.target]}, ${ALLOCATION_WORDS[levels.allocation]}.`,
      );
      for (const n of levels.notes) {
        addWarnings(sec, 'step 5', [{ code: 'ui.source-note', message: `${who}${n}` }]);
      }
      for (const m of ['legacy', 'modern'] as const) {
        const o = levels.methods[m];
        if (o === undefined) continue;
        if (o.ok) addWarnings(sec, MODELED_METHOD_ID, o.warnings);
        else sec.notes.push(`${who}the ${METHOD_NAME[m]} level is not quantified: ${o.error}`);
      }
    }
    sec.notes.push(
      'The levels that follow are in the media the receptors contact (soil, tap water, indoor and outdoor air, surface water).',
    );
  }
  for (const gap of guidedCleanupGaps(
    g,
    data.chemicals.map((c) => ({ id: c.id, name: c.name })),
  )) {
    sec.notes.push(`${gap.note} Its level in soil leaves homegrown produce out.`);
  }
  if (individualFallback(g)) {
    sec.notes.push(
      'All chemicals together was chosen, but the media the receptors contact have no measured ratios on a modeled basis, so their levels are each chemical alone.',
    );
  }
  const screens = guidedScreens(data);
  const direct = await cleanup(
    {
      ...screens,
      cleanup: { ...screens.cleanup, form: { ...screens.cleanup.form, source: 'direct' } },
    },
    feed,
    data.db,
    () => Promise.resolve(data.cleanupProps),
    { saved: {}, unreadable: new Set(), userProps },
  );
  sec.tables.push(...direct.tables);
  sec.charts.push(...direct.charts);
  for (const n of direct.notes) if (!sec.notes.includes(n)) sec.notes.push(n);
  for (const w of direct.warnings) addWarnings(sec, w.origin, [w]);
  noteSolubilityFlags(sec);
  return sec;
}

/** The method a guided section rests on: the step 3d choice, or the indoor air model of step 2. */
function guidedBasisChoice(key: ScreenKey, g: GuidedState): BasisChoice | null {
  if (key === 'household' || key === 'plantsEco' || key === 'uncertainty') return null;
  if (key === 'vapor') {
    const m = g.site.indoorModel;
    return { basis: m === 'oxygenLimited' ? 'oxygen-limited' : m, from: 'site' };
  }
  return { basis: g.run.basis, from: 'run' };
}

async function computeGuidedResults(
  project: Project,
  data: GuidedReportData,
): Promise<ProjectResults> {
  const g = data.guided;
  const feed = outputsFeed(g.outputs);
  const live = outputHashes(g, data.chemicals);
  const out: ProjectResults = {};
  for (const key of guidedSectionKeys(g)) {
    try {
      const sec = isFateKey(key)
        ? await guidedFate(key, data, feed, live)
        : key === 'risk'
          ? guidedRisk(data, feed)
          : await guidedCleanup(project, data, feed);
      for (const w of sec.warnings) w.origin = GUIDED_ORIGIN[w.origin] ?? w.origin;
      if (sec.tables.length === 0 && sec.notes.length === 0 && sec.chemicals === undefined) {
        sec.notes.push('No result yet: the inputs entered are not enough to compute one.');
      }
      const choice = guidedBasisChoice(key, g);
      const tables = [...sec.tables, ...(sec.chemicals ?? []).flatMap((b) => b.tables)];
      if (choice !== null && tables.length > 0) {
        const rowsOf = (match: (name: string) => boolean) =>
          tables.filter((t) => match(t.name)).flatMap((t) => t.rows);
        sec.methodBasis = methodBasisOf(
          choice,
          key === 'surfaceWater'
            ? criteriaDisagreements(rowsOf((n) => n.startsWith('surface-water-criteria')))
            : key === 'risk'
              ? riskDisagreements(rowsOf((n) => n === 'risk-results'))
              : [],
        );
      }
      out[key] = sec;
    } catch (e) {
      out[key] = notComputed(e instanceof Error ? e.message : String(e));
    }
  }
  return out;
}
