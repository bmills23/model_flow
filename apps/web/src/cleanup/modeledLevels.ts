import type { ModeledEndpoint } from '@model-flow/engine';
import { z } from 'zod';
import { hashInputs, fingerprintForm } from '../project/hash';
import type { ChemicalRecord } from '../risk/chemicalDb';
import type { SaturatedFeed } from '../saturated/feed';
import type { VadoseFeed } from '../vadose/feed';
import type { CleanupForm } from './form';
import type { ModeledMethodOutcome, ModeledOutcome } from './modeledTypes';

/**
 * The deterministic modeled cleanup levels the cleanup screen solved, kept with the project (docs/DECISIONS.md,
 * wave AA ruling 2). The groundwater chain they were solved through holds a function and is not saved, so
 * the report cannot solve them again; it prints these while `fingerprint` still matches the inputs they came
 * from, and otherwise says they are out of date. The per-chemical shape follows the modeled uncertainty
 * summary of wave J (`modeledSummary.ts`), which stays in memory; these levels are small and are saved.
 */

const finite = z.number().refine(Number.isFinite);
const level = finite.nullable();
const warning = z.object({ code: z.string(), message: z.string() });

const methodLevelSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    /** The cleanup level, SI (kg/m3 or kg/kg); null when the target is not reached. */
    level,
    cancerLevel: level,
    noncancerLevel: level,
    limiting: z.enum(['cancer', 'noncancer', 'concentration']).nullable(),
    /** Implied TPH, kg/kg; null when the source has none. */
    impliedTph: level,
    /** The endpoint solved and its target in the endpoint's own unit (SI for a concentration). */
    endpoint: z.enum(['cancer', 'noncancer', 'concentration']),
    target: finite,
    solvedBy: z.enum(['linear', 'brent', 'cap', 'none']),
    evaluations: finite,
    residual: level,
    transport: z.string(),
    warnings: z.array(warning),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type SavedMethodLevel = z.infer<typeof methodLevelSchema>;

export const modeledLevelsSchema = z.object({
  chemicalId: z.string(),
  chemical: z.string(),
  /** `modeledLevelsFingerprint` of the inputs the levels were solved from. */
  fingerprint: z.string(),
  source: z.enum(['dissolved', 'vadose', 'saturated']),
  /** The medium the level is in: groundwater (mg/L) for a dissolved source, soil (mg/kg) otherwise. */
  medium: z.enum(['soil', 'groundwater']),
  methods: z.object({
    legacy: methodLevelSchema.optional(),
    modern: methodLevelSchema.optional(),
  }),
  notes: z.array(z.string()),
});
export type SavedModeledLevels = z.infer<typeof modeledLevelsSchema>;

const orNull = (x: number | null | undefined): number | null =>
  x === null || x === undefined || !Number.isFinite(x) ? null : x;

function summarizeMethod(o: ModeledMethodOutcome): SavedMethodLevel {
  if (!o.ok) return { ok: false, error: o.error };
  const run = o.run;
  const lv = run.result.levels[0]!;
  return {
    ok: true,
    level: orNull(lv.level),
    cancerLevel: orNull(lv.cancerLevel),
    noncancerLevel: orNull(lv.noncancerLevel),
    limiting: lv.limiting,
    impliedTph: orNull(lv.impliedTph),
    endpoint: run.shown.endpoint as ModeledEndpoint,
    target: run.shown.target,
    solvedBy: run.convergence.method,
    evaluations: run.convergence.evaluations,
    residual: orNull(run.convergence.residual),
    transport: run.transportLabel,
    warnings: run.result.warnings.map((w) => ({ code: w.code, message: w.message })),
  };
}

/** What is kept of one chemical's solved outcome. */
export function summarizeModeledLevels(
  outcome: ModeledOutcome,
  ctx: {
    chemicalId: string;
    chemical: string;
    fingerprint: string;
    source: SavedModeledLevels['source'];
    notes: readonly string[];
  },
): SavedModeledLevels {
  const methods: SavedModeledLevels['methods'] = {};
  if (outcome.legacy) methods.legacy = summarizeMethod(outcome.legacy);
  if (outcome.modern) methods.modern = summarizeMethod(outcome.modern);
  return {
    chemicalId: ctx.chemicalId,
    chemical: ctx.chemical,
    fingerprint: ctx.fingerprint,
    source: ctx.source,
    medium: outcome.medium,
    methods,
    notes: [...ctx.notes],
  };
}

/**
 * The fingerprint of a groundwater run, as the project records it when the run is sent: a hash of the
 * groundwater screen's form (see `feedEntry`). It is what the session's chain feed carries for a
 * chemical, and what a run sent now from a screen set to that chemical would carry.
 */
export const chainFingerprint = (transportForm: unknown): string =>
  hashInputs(fingerprintForm('transport', transportForm));

/**
 * The inputs a modeled level depends on, as a short fingerprint. The groundwater run itself is not saved
 * and the groundwater screen's form is shared by every chemical (picking a chemical there rewrites its
 * Kd), so the run is stood for by `chain`: the fingerprint recorded when this chemical's own run was
 * sent. The vadose or saturated source is the run that was sent. Equal fingerprints mean the cleanup
 * screen would solve the same levels. Inputs the levels do not depend on are left out: the starting
 * concentration (the answer does not depend on it), the solubility ceiling for a soil source (it caps a
 * dissolved source's search only), the entered concentrations, the allocation, the soil screening panel
 * and the surface water targets.
 */
export function modeledLevelsFingerprint(i: {
  /** The cleanup form with the project's receptor names and factor edits laid on. */
  cleanup: CleanupForm;
  chemicalId: string;
  /** `chainFingerprint` of this chemical's own groundwater run. */
  chain: string;
  vadose: VadoseFeed | null;
  saturated: SaturatedFeed | null;
  rec: ChemicalRecord | undefined;
  edition: string;
}): string {
  const {
    chemicals,
    ssg: _ssg,
    surfaceTargets: _st,
    allocation: _al,
    startConc: _start,
    solubility,
    ...rest
  } = i.cleanup;
  void _ssg;
  void _st;
  void _al;
  void _start;
  const row = chemicals.find((c) => c.id === i.chemicalId);
  const { conc: _conc, ...rowRest } = row ?? { conc: {} };
  void _conc;
  return hashInputs({
    form: rest,
    // the ceiling stops the search of a dissolved source only
    solubility: i.cleanup.source === 'dissolved' ? solubility : null,
    row: rowRest,
    chain: i.chain,
    vadose: i.cleanup.source === 'vadose' ? (i.vadose?.scenario ?? null) : null,
    saturated: i.cleanup.source === 'saturated' ? (i.saturated?.input ?? null) : null,
    tox: i.rec?.tox ?? null,
    phys: i.rec?.phys ?? null,
    edition: i.edition,
  });
}

/** The saved levels of a project file, each entry read on its own: one that does not parse is dropped. */
export function readSavedModeledLevels(raw: unknown): Record<string, SavedModeledLevels> {
  const out: Record<string, SavedModeledLevels> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, entry] of Object.entries(raw)) {
    const r = modeledLevelsSchema.safeParse(entry);
    if (r.success) out[id] = r.data;
  }
  return out;
}

/** The reason a level cell is empty: the same words the cleanup screen gives under its table. */
export const NOT_REACHED =
  'the target is not reached: the metric stays below it for every source concentration up to the search ceiling, so there is no cleanup level to report';
