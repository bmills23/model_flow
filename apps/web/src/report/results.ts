import { convert, type Warning } from '@model-flow/engine';
import { csvHeader, type CsvCell } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import { chemicalsOf, overridesOf, screensOf, type Project, type Screens } from '../project';
import { decodeJson } from '../project/codec';
import { screenUsed, USED_SCREENS_ORDER, type FeedsLike, type ScreenKey } from './methodsRun';
import { effectiveDb } from '../overrides/userChemicals';
import { withProjectReceptorEdits } from './userValues';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { buildInputs } from '../risk/build';
import { runRisk } from '../risk/compute';
import { riskCsvTables, RISK_METHOD_IDS } from '../risk/csv';
import { buildCleanup } from '../cleanup/build';
import { buildModeled } from '../cleanup/modeledBuild';
import { runCleanup } from '../cleanup/compute';
import { sourceLevelCsvTables } from '../cleanup/sourceLevelsCsv';
import {
  surfaceTargetLevels,
  surfaceTargetTables,
  targetsOfChemicals,
} from '../cleanup/surfaceWaterTarget';
import { loadCriteriaDb } from '../surfaceWater/criteriaDb';
import {
  cleanupCsvTables,
  CLEANUP_METHOD_IDS,
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
import { pickSlot, type FeedSlots } from '../project/feedSlots';
import { isChemicalFeed } from '../project/schema';

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
}

export type ProjectResults = Partial<Record<ScreenKey, SectionResults>>;

/** Rows of one table the report prints; the screen's CSV download holds every row. */
export const MAX_ROWS = 40;

export interface TableText {
  name: string;
  label: string;
  headers: string[];
  rows: string[][];
  /** Rows the table has before the cap. */
  total: number;
}

function cellText(v: CsvCell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Number(v.toPrecision(6))) : '';
  return v;
}

/** A CSV table as display text: headers with units, numbers to six significant digits, at most MAX_ROWS rows. */
export function tableText(t: CsvTable): TableText {
  return {
    name: t.name,
    label: t.label,
    headers: t.columns.map(csvHeader),
    rows: t.rows.slice(0, MAX_ROWS).map((row) => t.columns.map((c) => cellText(row[c.key]))),
    total: t.rows.length,
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

/** A section's access to the stored feeds: one consumer's slot, or every slot of a feed. */
interface Feed {
  <T>(key: string, chemicalId?: string): T | null;
  slots: <T>(key: string) => FeedSlots<T>;
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
  return sec;
}

function surfaceWater(s: Screens, feed: Feed): SectionResults {
  const parsed = surfaceWaterRequest(
    s.surfaceWater.form,
    feed<BankFeed>('bank', s.surfaceWater.form.chemicalId),
  );
  if (!parsed.ok) return notComputed(parsed.errors);
  const out = computeSurfaceWater(parsed.request);
  if (!out.ok) return notComputed(out.error);
  const sec = empty();
  sec.tables = surfaceWaterCsvTables(out.result);
  const swScale = s.surfaceWater.form.scale;
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

async function cleanup(
  s: Screens,
  feed: Feed,
  db: ChemicalDb,
  props: () => Promise<CleanupProps>,
): Promise<SectionResults> {
  const form = s.cleanup.form;
  if (form.source !== 'direct') {
    const modeled = buildModeled(form, db, { transport: null, vadose: null, saturated: null });
    return notComputed([
      'a modeled source is solved through the groundwater chain, which holds a function and is not saved with a project; open the cleanup screen after sending the chain from the groundwater screen to see the level',
      ...(modeled.ok ? [] : modeled.errors.filter((e) => !/groundwater screen|transport/i.test(e))),
    ]);
  }
  const sec = empty();
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
    sec.tables.push(...cleanupCsvTables(outcome, names));
    for (const n of built.notes)
      addWarnings(sec, 'cleanup screen', [{ code: 'ui.pathway-skipped', message: n }]);
    addWarnings(sec, 'plant uptake', built.feedWarnings);
    for (const m of ['legacy', 'modern'] as const) {
      const o = outcome[m];
      if (o.ok) addWarnings(sec, CLEANUP_METHOD_IDS[m], o.result.warnings);
      else sec.notes.push(`The ${METHOD_NAME[m]} did not run: ${o.error}`);
    }
    sec.tables.push(
      ...sourceLevelCsvTables(outcome, names, {
        household: feed.slots<HouseholdRiskFeed>('household'),
        vapor: feed.slots<VaporRiskFeed>('vaporRisk'),
        surface: feed.slots<SurfaceWaterFeed>('surfaceWater'),
      }),
    );
    const targets = targetsOfChemicals(
      form.surfaceTargets,
      form.chemicals.map((c) => c.id),
    );
    if (targets.some((t) => t.kind !== 'none')) {
      sec.tables.push(
        ...surfaceTargetTables(
          surfaceTargetLevels({
            targets,
            db: await loadCriteriaDb(),
            slots: feed.slots<SurfaceWaterFeed>('surfaceWater'),
            names,
            source: form.source,
            runCount: form.chemicals.length,
          }),
        ),
      );
    }
  } else if (!form.ssg.on && tphHeld === null) {
    return notComputed(built.errors);
  } else {
    sec.notes.push(`Not computed: ${built.errors.join('; ')}`);
  }
  if (form.ssg.on) {
    const out = computeSsg(form, db, await props());
    if (out.ok) {
      sec.tables.push(...ssgCsvTables(out.rows));
      for (const r of out.rows) if (r.ok) addWarnings(sec, SSG_METHOD_ID, r.warnings);
      sec.notes.push(...out.notes);
    } else {
      sec.notes.push(`Leaching level not computed: ${out.errors.join('; ')}`);
    }
  }
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

/**
 * The results of every screen the project shows as used, computed from the saved forms with each
 * screen's own compute function and CSV table builders. Values passed between screens come from the
 * project's stored feeds, decoded as loading the project decodes them. A screen that cannot be
 * computed (a form that does not parse, an engine refusal) says why in its notes.
 */
export async function computeResults(project: Project): Promise<ProjectResults> {
  const saved = screensOf(project);
  const screens = withProjectReceptorEdits(saved, overridesOf(project));
  const feeds = project.feeds as FeedsLike | undefined;
  const feed: Feed = Object.assign(
    <T>(key: string, chemicalId?: string): T | null => feedOf<T>(project, key, chemicalId),
    { slots: <T>(key: string): FeedSlots<T> => feedSlotsOf<T>(project, key) },
  );
  // used-ness is judged on the saved forms: a receptor edit alone does not make a screen used
  const used = USED_SCREENS_ORDER.filter((k) => screenUsed(k, saved, feeds));
  const needsDb = used.includes('risk') || used.includes('cleanup');
  let db: ChemicalDb | null = null;
  let dbError = '';
  if (needsDb) {
    try {
      db = effectiveDb(await loadChemicalDb(), overridesOf(project), chemicalsOf(project));
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e);
    }
  }
  const out: ProjectResults = {};
  for (const key of used) {
    try {
      const sec = await computeOne(key, screens, feed, db, dbError);
      if (sec.tables.length === 0 && sec.notes.length === 0) {
        sec.notes.push('No result yet: the inputs entered are not enough to compute one.');
      }
      out[key] = sec;
    } catch (e) {
      out[key] = notComputed(e instanceof Error ? e.message : String(e));
    }
  }
  return out;
}

async function computeOne(
  key: ScreenKey,
  s: Screens,
  feed: Feed,
  db: ChemicalDb | null,
  dbError: string,
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
        ? cleanup(s, feed, db, loadCleanupProps)
        : notComputed(`the chemical database did not load (${dbError})`);
    case 'household':
      return household(s, feed);
    case 'plantsEco':
      return plantsEco(s);
    case 'uncertainty':
      return uncertainty();
  }
}
