import { resolveRiskTargets, type ModeledEndpoint, type SolveResult } from '@model-flow/engine';
import { buildCleanup, type CleanupBuildResult } from '../cleanup/build';
import { runCleanup, type CleanupOutcome } from '../cleanup/compute';
import type { SourceKind } from '../cleanup/form';
import type { ModeledSolved } from '../cleanup/ModeledCleanup';
import {
  NEEDS_SATURATED,
  NEEDS_TRANSPORT,
  NEEDS_VADOSE,
  buildModeled,
  type ModeledBuildResult,
} from '../cleanup/modeledBuild';
import {
  NOT_REACHED,
  summarizeModeledLevels,
  type SavedMethodLevel,
} from '../cleanup/modeledLevels';
import type { ModeledMethodOutcome, ModeledRequest } from '../cleanup/modeledTypes';
import { requestKey } from '../cleanup/useModeled';
import type { OverridesState } from '../overrides/model';
import { hashInputs } from '../project/hash';
import type { ChemicalDb } from '../risk/chemicalDb';
import { cleanupFormFor, cleanupSourceKind, deriveCleanupForm } from './cleanupForm';
import type { ChemicalData } from './derive';
import type { GuidedKeptLevel } from './levels';
import { cleanupFeedsOf, riskFeeds } from './slots';
import type { GuidedAllocation, GuidedState, SourceValueKey, StandardKind } from './state';
import { sourceNumber } from './units';

/**
 * Step 5's cleanup solve (plan section 2, "Steps 4 and 5 read the outputs as slots"). Where the chain
 * carries a source to a well (groundwater, soil above or soil below the water table), each chemical's level
 * is solved by re-running its step 3 models until its targets are met: one modeled request per chemical,
 * built from the derived per-chemical scenario (`cleanupFeedsOf`), so it needs no session-only run and works
 * after a reload. The levels are kept in `guided.levels` with the guided fingerprint, which is the identity
 * of everything the solve reads (the request itself, the target kind and, for chemicals solved together,
 * every member's request and source ratio). Pure: no store, no worker.
 */

export interface GuidedSolveContext {
  /** The project chemicals with their fate rows (`useGuidedChemicalData`). */
  chemicals: readonly ChemicalData[];
  /** The chemical database with the project's toxicity edits and user chemicals laid on. */
  db: ChemicalDb;
  /** The project overrides, for the step 4 receptor edits (`guided.a`, `guided.b`). */
  overrides?: OverridesState;
}

export interface GuidedSolveRow {
  id: string;
  name: string;
  /** What the level meets: the risk targets, a federal MCL or a state standard at the well. */
  target: StandardKind;
  /** The chemical's modeled request, or what is missing for it, in the words of the steps. */
  result: ModeledBuildResult;
  /** Solved with the others (all together, or the target split equally). */
  grouped: boolean;
  /** Why a grouped chemical has no level without any solve (not detected, no source value); else null. */
  excluded: string | null;
  /** The 3b source concentration in SI (kg/m3 or kg/kg); null when blank or unreadable. */
  ratio: number | null;
  /** The guided fingerprint its kept level must carry to be current; null when it cannot be solved. */
  fingerprint: string | null;
}

export interface GuidedSolvePlan {
  /** Where the level is solved; 'direct' means no modeled solve (the medium contacted is the level). */
  source: SourceKind;
  allocation: GuidedAllocation;
  rows: GuidedSolveRow[];
  /** Why the chemicals solved together cannot be solved now (one of them cannot be built); else null. */
  groupProblem: string | null;
}

/** What `guidedKeptLevels` returns for one chemical. */
export interface KeptLevelsRead {
  /** True when the chain solves this chemical's level through the step 3 models. */
  needed: boolean;
  /** The kept levels, current or not; null when none are kept. */
  levels: GuidedKeptLevel | null;
  /** The kept levels' fingerprint equals the live one. */
  current: boolean;
}

/** The 3b medium a modeled source starts from. */
const SOURCE_MEDIUM: Record<Exclude<SourceKind, 'direct'>, SourceValueKey> = {
  dissolved: 'groundwater',
  vadose: 'soilAbove',
  saturated: 'soilBelow',
};
const TO_SI: Record<Exclude<SourceKind, 'direct'>, number> = {
  dissolved: 1e-3,
  vadose: 1e-6,
  saturated: 1e-6,
};

export const NOT_DETECTED_REASON =
  'not detected at the source (step 3b), so with all chemicals together keeping their ratios it adds nothing to the total and has no level; this is not a required level of zero';
export const NO_RATIO_REASON =
  'all chemicals together keep the ratios of the step 3b source values, and this chemical has none that can be read; enter one in step 3b';

/** The build errors of the workbench in the words of the steps (no screens, no send buttons). */
const STEP_WORDS: Record<string, string> = {
  [NEEDS_TRANSPORT]:
    'The groundwater transport inputs are incomplete: finish the aquifer and well values in step 3a and the source value in step 3b.',
  [NEEDS_VADOSE]:
    'There is no current soil leaching result for this chemical: run step 3d, then come back to this step.',
  [NEEDS_SATURATED]:
    'There is no current soil source result below the water table for this chemical: run step 3d, then come back to this step.',
};
const plainErrors = (errors: readonly string[]): string[] => [
  ...new Set(errors.map((e) => STEP_WORDS[e] ?? e)),
];
/** The workbench notes that name its screens; the steps say where the inputs came from on their own. */
const SCREEN_NOTE = /^(Soil source from the|Aquifer, source box and well from the)/;

function plainBuild(r: ModeledBuildResult): ModeledBuildResult {
  return r.ok
    ? { ...r, notes: r.notes.filter((n) => !SCREEN_NOTE.test(n)) }
    : { ok: false, errors: plainErrors(r.errors) };
}

const targetOf = (g: GuidedState, id: string): StandardKind =>
  g.targets.standards[id]?.kind ?? 'risk';

export function guidedSolvePlan(guided: GuidedState, ctx: GuidedSolveContext): GuidedSolvePlan {
  const source = cleanupSourceKind(guided);
  const allocation = guided.targets.allocation;
  if (source === 'direct' || ctx.chemicals.length === 0) {
    return { source, allocation, rows: [], groupProblem: null };
  }
  const form = deriveCleanupForm(guided, ctx.chemicals, ctx.db, ctx.overrides);
  const feedsOf = cleanupFeedsOf(guided, ctx.chemicals);
  const medium = SOURCE_MEDIUM[source];
  const rows: GuidedSolveRow[] = ctx.chemicals.map((c) => {
    const target = targetOf(guided, c.id);
    const one = cleanupFormFor(form, guided, c.id);
    const result = plainBuild(
      buildModeled({ ...one, allocation: 'individual' }, ctx.db, feedsOf(c.id), ctx.chemicals.length),
    );
    const v = guided.sources[c.id]?.values[medium];
    const n = v === undefined ? null : sourceNumber(v.value, v.unit, medium);
    const grouped = allocation !== 'individual' && target === 'risk';
    let excluded: string | null = null;
    if (grouped && allocation === 'cumulative') {
      if (n === null) excluded = NO_RATIO_REASON;
      else if (n === 0) excluded = NOT_DETECTED_REASON;
    }
    return {
      id: c.id,
      name: c.name,
      target,
      result,
      grouped,
      excluded,
      ratio: n === null ? null : n * TO_SI[source],
      fingerprint: null,
    };
  });

  const members = rows.filter((r) => r.grouped && r.excluded === null);
  const blocked = members.filter((r) => !r.result.ok);
  const groupProblem =
    blocked.length > 0
      ? `${allocation === 'cumulative' ? 'All chemicals together' : 'A target split equally'} needs every chemical's level, and ${blocked.map((r) => r.name).join(', ')} cannot be solved yet (see below).`
      : null;
  const keyOf = (r: GuidedSolveRow): string | null =>
    r.result.ok ? requestKey(r.result.request) : null;
  const groupPrint =
    groupProblem === null && members.length > 0
      ? hashInputs({
          v: 1,
          allocation,
          members: members.map((m) => ({
            id: m.id,
            request: keyOf(m),
            ratio: allocation === 'cumulative' ? m.ratio : null,
          })),
        })
      : null;
  for (const r of rows) {
    const key = keyOf(r);
    if (key === null) continue;
    if (!r.grouped) r.fingerprint = hashInputs({ v: 1, request: key, target: r.target });
    else if (r.excluded !== null)
      r.fingerprint = hashInputs({ v: 1, request: key, allocation, excluded: r.excluded });
    else r.fingerprint = groupPrint;
  }
  return { source, allocation, rows, groupProblem };
}

/** The requests to send to the worker: those whose kept levels are not current (all members of a group together). */
export function requestsToSolve(
  plan: GuidedSolvePlan,
  kept: Readonly<Record<string, GuidedKeptLevel>>,
): ModeledRequest[] {
  const stale = (r: GuidedSolveRow): boolean => kept[r.id]?.fingerprint !== r.fingerprint;
  const solvable = plan.rows.filter(
    (r) => r.result.ok && r.fingerprint !== null && r.excluded === null,
  );
  const group = solvable.filter((r) => r.grouped);
  const groupStale = group.some(stale);
  return solvable
    .filter((r) => (r.grouped ? groupStale : stale(r)))
    .map((r) => (r.result as Extract<ModeledBuildResult, { ok: true }>).request);
}

// ---------------------------------------------------------------- the kept entries

const ALLOCATION_NOTE: Record<Exclude<GuidedAllocation, 'individual'>, string> = {
  cumulative:
    'All chemicals together: one common scale on the step 3b source values makes the summed cancer risk and hazard index meet their targets. It is found from each chemical solved alone, which holds while each level is proportional to its source (the solve verified it). The hazard index adds every chemical, over all target organs.',
  equal:
    'Target split equally: each endpoint target is divided among the chemicals that carry it, from each chemical solved alone, which holds while each level is proportional to its source (the solve verified it).',
};

const NOT_LINEAR = (name: string): string =>
  `${name}: its level is not proportional to its source (the solve needed an iteration), so a level shared with other chemicals is not computed here; set its targets per chemical, or solve each chemical alone`;

function baseEntry(
  plan: GuidedSolvePlan,
  row: GuidedSolveRow,
  allocation: GuidedAllocation,
): Omit<GuidedKeptLevel, 'methods' | 'notes'> {
  return {
    chemicalId: row.id,
    chemical: row.name,
    fingerprint: row.fingerprint!,
    source: plan.source as GuidedKeptLevel['source'],
    medium: plan.source === 'dissolved' ? 'groundwater' : 'soil',
    target: row.target,
    allocation,
    reason: null,
  };
}

function aloneEntry(plan: GuidedSolvePlan, row: GuidedSolveRow, s: ModeledSolved): GuidedKeptLevel {
  const notes = row.result.ok ? row.result.notes : [];
  if (!s.item.ok) {
    return {
      ...baseEntry(plan, row, 'individual'),
      methods: {},
      notes: [...notes],
      reason: `the solve failed: ${s.item.error}`,
    };
  }
  const summary = summarizeModeledLevels(s.item.outcome, {
    chemicalId: row.id,
    chemical: row.name,
    fingerprint: row.fingerprint!,
    source: plan.source as GuidedKeptLevel['source'],
    notes,
  });
  return { ...summary, target: row.target, allocation: 'individual', reason: null };
}

interface Endpoints {
  cancer: number | null;
  noncancer: number | null;
  linear: boolean;
}

/** One method's levels alone of a member, and whether they are proportional to the source. */
function endpointsOf(o: ModeledMethodOutcome): Endpoints {
  if (!o.ok) return { cancer: null, noncancer: null, linear: false };
  const lv = o.run.result.levels[0]!;
  let linear = true;
  const one = (s: SolveResult | undefined): number | null => {
    if (s === undefined || s.maxMetric === 0) return null;
    if (!s.reachable || s.method !== 'linear' || s.level === null || !(s.level > 0)) {
      linear = false;
      return null;
    }
    return s.level;
  };
  return { cancer: one(lv.solves.cancer), noncancer: one(lv.solves.noncancer), linear };
}

function groupEntries(
  plan: GuidedSolvePlan,
  members: readonly GuidedSolveRow[],
  solved: ReadonlyMap<string, ModeledSolved>,
): GuidedKeptLevel[] {
  const allocation = plan.allocation as Exclude<GuidedAllocation, 'individual'>;
  const methods: Record<string, GuidedKeptLevel['methods']> = {};
  for (const m of members) methods[m.id] = {};
  for (const method of ['legacy', 'modern'] as const) {
    const outs = members.map((m) => {
      const item = solved.get(m.id)!.item;
      return item.ok ? item.outcome[method] : { ok: false as const, error: item.error };
    });
    if (outs.every((o) => o === undefined)) continue;
    const failed = members.flatMap((m, i) => {
      const o = outs[i];
      return o === undefined ? [`${m.name}: this method did not run`] : o.ok ? [] : [`${m.name}: ${o.error}`];
    });
    const ends = outs.map((o) => (o === undefined ? null : endpointsOf(o)));
    const notLinear = members.flatMap((m, i) => (ends[i]?.linear === false && outs[i]?.ok ? [NOT_LINEAR(m.name)] : []));
    const problems = [...failed, ...notLinear];

    const req = solved.get(members[0]!.id)!.req;
    const { risk, hq } = resolveRiskTargets(req.targets);
    let kc: number | null = null;
    let kn: number | null = null;
    let nC = 0;
    let nN = 0;
    if (problems.length === 0) {
      let sc = 0;
      let sn = 0;
      members.forEach((m, i) => {
        const e = ends[i]!;
        if (e.cancer !== null) {
          sc += (m.ratio ?? 0) / e.cancer;
          nC += 1;
        }
        if (e.noncancer !== null) {
          sn += (m.ratio ?? 0) / e.noncancer;
          nN += 1;
        }
      });
      kc = sc > 0 ? 1 / sc : null;
      kn = sn > 0 ? 1 / sn : null;
    }
    members.forEach((m, i) => {
      const o = outs[i];
      if (o === undefined) return;
      if (problems.length > 0) {
        methods[m.id]![method] = {
          ok: false,
          error:
            allocation === 'cumulative'
              ? `the level shared by all chemicals is not computed: ${problems.join('; ')}`
              : `the split level is not computed: ${problems.join('; ')}`,
        };
        return;
      }
      if (!o.ok) return;
      const e = ends[i]!;
      let cancer: number | null;
      let noncancer: number | null;
      if (allocation === 'cumulative') {
        cancer = kc === null ? null : kc * m.ratio!;
        noncancer = kn === null ? null : kn * m.ratio!;
      } else {
        cancer = e.cancer === null ? null : e.cancer / nC;
        noncancer = e.noncancer === null ? null : e.noncancer / nN;
      }
      const limiting: ModeledEndpoint | null =
        cancer === null && noncancer === null
          ? null
          : noncancer === null || (cancer !== null && cancer <= noncancer)
            ? 'cancer'
            : 'noncancer';
      const level = limiting === null ? null : limiting === 'cancer' ? cancer : noncancer;
      const run = o.run;
      methods[m.id]![method] = {
        ok: true,
        level,
        cancerLevel: cancer,
        noncancerLevel: noncancer,
        limiting,
        impliedTph: null,
        endpoint: limiting ?? 'cancer',
        target: limiting === 'noncancer' ? hq : risk,
        solvedBy: 'linear',
        evaluations: run.convergence.evaluations,
        residual: Number.isFinite(run.convergence.residual) ? run.convergence.residual : null,
        transport: run.transportLabel,
        warnings: run.result.warnings.map((w) => ({ code: w.code, message: w.message })),
      };
    });
  }
  return members.map((m) => ({
    ...baseEntry(plan, m, allocation),
    methods: methods[m.id]!,
    notes: [...(m.result.ok ? m.result.notes : []), ALLOCATION_NOTE[allocation]],
  }));
}

/**
 * The levels to keep from the solves now held: a chemical alone once its solve answers its request as it
 * stands, the chemicals solved together once every member's does, and a chemical left out of an all
 * together set (not detected) at once, with its reason. Each entry carries the row's fingerprint.
 */
export function keptLevelsFrom(
  plan: GuidedSolvePlan,
  solved: ReadonlyMap<string, ModeledSolved>,
): GuidedKeptLevel[] {
  const answers = (r: GuidedSolveRow): ModeledSolved | null => {
    const s = solved.get(r.id);
    return s !== undefined && r.result.ok && requestKey(s.req) === requestKey(r.result.request)
      ? s
      : null;
  };
  const out: GuidedKeptLevel[] = [];
  const members = plan.rows.filter((r) => r.grouped && r.excluded === null);
  const groupReady =
    plan.groupProblem === null &&
    members.length > 0 &&
    members.every((m) => m.fingerprint !== null && answers(m) !== null);
  const group = groupReady ? groupEntries(plan, members, solved) : [];
  for (const r of plan.rows) {
    if (r.fingerprint === null) continue;
    if (r.excluded !== null) {
      out.push({
        ...baseEntry(plan, r, plan.allocation),
        methods: {},
        notes: [],
        reason: r.excluded,
      });
    } else if (r.grouped) {
      const e = group.find((x) => x.chemicalId === r.id);
      if (e !== undefined) out.push(e);
    } else {
      const s = answers(r);
      if (s !== null) out.push(aloneEntry(plan, r, s));
    }
  }
  return out;
}

/**
 * A chemical's kept step 5 levels and whether they are current: the one function step 6 and the guided
 * report read them through. `plan` may be passed when it is already built for the same state and context.
 */
export function guidedKeptLevels(
  guided: GuidedState,
  chemicalId: string,
  ctx: GuidedSolveContext,
  plan: GuidedSolvePlan = guidedSolvePlan(guided, ctx),
): KeptLevelsRead {
  if (plan.source === 'direct') return { needed: false, levels: null, current: false };
  const row = plan.rows.find((r) => r.id === chemicalId);
  const levels = guided.levels?.[chemicalId] ?? null;
  const current =
    row !== undefined &&
    row.fingerprint !== null &&
    levels !== null &&
    levels.fingerprint === row.fingerprint;
  return { needed: row !== undefined, levels, current };
}

/** The step list's check of step 5: each chemical's kept level current, out of date, or not kept. */
export type LevelState = 'current' | 'stale' | 'missing';
export function levelsCheckFor(
  guided: GuidedState,
  ctx: GuidedSolveContext,
): (chemicalId: string) => LevelState {
  const plan = guidedSolvePlan(guided, ctx);
  return (id) => {
    const k = guidedKeptLevels(guided, id, ctx, plan);
    return k.levels === null ? 'missing' : k.current ? 'current' : 'stale';
  };
}

// ---------------------------------------------------------------- the levels in the medium contacted

export interface GuidedDirectCleanup {
  built: CleanupBuildResult;
  outcome: CleanupOutcome | null;
  /**
   * True when all chemicals together was chosen on a modeled basis: the media contacted (air, tap water,
   * surface water) have no measured ratios, so their levels are each chemical alone.
   */
  individualFallback: boolean;
}

/**
 * The cleanup levels in the media the receptors contact (soil, tap water, indoor and outdoor air, surface
 * water), from the derived cleanup form over the Run's produce results. The vapor and surface water source
 * levels are read off these (`cleanup/vaporLevels.ts`, `cleanup/surfaceWaterLevels.ts`), as today.
 */
export function guidedDirectCleanup(
  guided: GuidedState,
  chemicals: readonly { id: string; name: string }[],
  db: ChemicalDb,
  overrides?: OverridesState,
): GuidedDirectCleanup {
  const form = deriveCleanupForm(guided, chemicals, db, overrides);
  const individualFallback =
    guided.site.basis === 'modeled' && form.allocation === 'cumulative';
  const built = buildCleanup(
    individualFallback ? { ...form, allocation: 'individual' } : form,
    db,
    { produce: riskFeeds(guided.outputs).produce },
  );
  return { built, outcome: built.ok ? runCleanup(built) : null, individualFallback };
}

// ---------------------------------------------------------------- plain words

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** An engine or build message with each chemical's CAS number replaced by its name. */
export function plainMessage(text: string, names: Readonly<Record<string, string>>): string {
  let out = text;
  for (const [id, name] of Object.entries(names)) {
    if (id === '' || id === name) continue;
    out = out.replace(new RegExp(`(^|[^0-9-])${escape(id)}(?![0-9-])`, 'g'), `$1${name}`);
  }
  return out;
}

/** Why one method's kept level is empty, in words for a reader; null when it has a level. */
export function levelReason(m: SavedMethodLevel): string | null {
  if (!m.ok) return `Not quantified: ${m.error}`;
  if (m.level !== null) return null;
  if (m.warnings.some((w) => w.code === 'cleanup.target-not-reachable')) {
    return `Not quantified: ${NOT_REACHED}.`;
  }
  return 'Not quantified: no toxicity value for the pathways switched on, or nothing reaches the receptor, so there is no risk-based level.';
}
