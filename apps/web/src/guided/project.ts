import { z } from 'zod';
import { householdProjectSchema } from '../household/project';
import { plantsEcoProjectSchema } from '../plantsEco/project';
import { receptorFrom, receptorSchema } from '../risk/project';
import { defaultReceptor } from '../risk/form';
import { saturatedProjectSchema } from '../saturated/project';
import { surfaceWaterProjectSchema } from '../surfaceWater/project';
import { transportProjectSchema } from '../transport/project';
import { vadoseProjectSchema } from '../vadose/project';
import { vaporProjectSchema } from '../vapor/project';
import { decodeJson, encodeJson } from '../project/codec';
import { flag, partialObject, text } from '../project/fields';
import { cloneData, mergeDefaults } from '../project/merge';
import { readGuidedLevels } from './levels';
import {
  GUIDED_FORM_KEYS,
  MEASURED_MEDIUM_KEYS,
  MODELED_SOURCE_KEYS,
  defaultGuided,
  isDefaultGuided,
  type GuidedExposure,
  type GuidedFormKey,
  type GuidedRunNote,
  type GuidedRunNotes,
  type GuidedOutputs,
  type GuidedSource,
  type GuidedState,
  type GuidedStandard,
  type SourceValueKey,
} from './state';

const sourceKey = z.enum([...MODELED_SOURCE_KEYS, ...MEASURED_MEDIUM_KEYS] as [
  string,
  ...string[],
]);
const sourceValue = z.object({ value: text, unit: text });

const siteSchema = partialObject({
  receptors: z.enum(['human', 'ecological']),
  basis: z.enum(['modeled', 'measured']),
  sources: z.array(z.enum(MODELED_SOURCE_KEYS)),
  measured: z.array(z.enum(MEASURED_MEDIUM_KEYS)),
  location: z.enum(['onsite', 'downgradient']),
  paths: partialObject({ leaching: flag, well: flag, building: flag, stream: flag }),
  indoorModel: z.enum(['legacy', 'modern', 'oxygenLimited']),
  produce: z.enum(['none', 'soil', 'irrigation']),
});

const standardSchema = z.object({
  kind: z.enum(['risk', 'mcl', 'state']),
  value: text,
  unit: text,
  source: text,
});

/**
 * The project-level `guided` key of format version 3 (optional; absent means the defaults). Every part
 * is optional and an absent field takes its default on load, as the screens do. The templates reuse each
 * screen's own form check. The outputs are held loose here and checked one slot at a time by
 * `readGuidedOutputs` (see `outputs.ts`), so one bad output never refuses the file.
 */
export const guidedProjectSchema = z.object({
  site: siteSchema.optional(),
  forms: z
    .object({
      transport: transportProjectSchema.shape.form,
      vadose: vadoseProjectSchema.shape.form,
      saturated: saturatedProjectSchema.shape.form,
      vapor: vaporProjectSchema.shape.form,
      surfaceWater: surfaceWaterProjectSchema.shape.form,
      household: householdProjectSchema.shape.form,
      plantsEco: plantsEcoProjectSchema.shape.form,
    })
    .optional(),
  sources: z
    .record(
      z.string(),
      partialObject({ values: z.record(z.string(), sourceValue), note: text, tph: text }),
    )
    .optional(),
  run: partialObject({
    timeYr: text,
    stepYr: text,
    sourceYr: text,
    basis: z.enum(['modern', 'legacy']),
  }).optional(),
  outputs: z.record(z.string(), z.unknown()).optional(),
  // held loose and read one note at a time by `fromProject`, like the outputs
  runNotes: z.record(z.string(), z.unknown()).optional(),
  exposure: partialObject({
    pathways: z.record(z.string(), flag),
    a: receptorSchema,
    b: receptorSchema.nullable(),
    additive: flag,
  }).optional(),
  targets: partialObject({
    mode: z.enum(['risk', 'cleanup']),
    allocation: z.enum(['individual', 'cumulative', 'equal']),
    targetRisk: text,
    targetHq: text,
    standards: z.record(z.string(), standardSchema),
  }).optional(),
  // the step 5 kept levels, held loose and read one entry at a time (`readGuidedLevels`)
  levels: z.record(z.string(), z.unknown()).optional(),
});
export type GuidedProject = z.infer<typeof guidedProjectSchema>;

/** The saved form, or undefined at the defaults so a file without guided answers is unchanged. */
export function toProject(g: GuidedState): GuidedProject | undefined {
  if (isDefaultGuided(g)) return undefined;
  const outputs: Record<string, unknown> = {};
  for (const [key, slots] of Object.entries(g.outputs)) {
    outputs[key] = Object.fromEntries(
      Object.entries(slots).map(([chemical, o]) => [
        chemical,
        { inputsHash: o.inputsHash, value: encodeJson(o.value) },
      ]),
    );
  }
  return cloneData({
    site: g.site,
    forms: g.forms,
    sources: g.sources,
    run: g.run,
    ...(Object.keys(outputs).length > 0 ? { outputs } : {}),
    ...(Object.keys(g.runNotes).length > 0 ? { runNotes: g.runNotes } : {}),
    exposure: g.exposure,
    targets: g.targets,
    ...(g.levels !== undefined && Object.keys(g.levels).length > 0 ? { levels: g.levels } : {}),
  }) as GuidedProject;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function sourceOf(p: NonNullable<GuidedProject['sources']>[string]): GuidedSource {
  const values: GuidedSource['values'] = {};
  for (const [k, v] of Object.entries(p.values ?? {})) {
    if (sourceKey.safeParse(k).success) values[k as SourceValueKey] = { ...v };
  }
  return { values, note: p.note ?? '', tph: p.tph ?? '' };
}

const formKeys: readonly string[] = GUIDED_FORM_KEYS;

/** One saved run note, or null when it is not in the shape (one bad note never refuses the file). */
function readRunNote(n: unknown): GuidedRunNote | null {
  if (!isObj(n) || !Array.isArray(n['problems']) || !isObj(n['feeds'])) return null;
  const problems: GuidedRunNote['problems'] = [];
  for (const p of n['problems']) {
    if (!isObj(p) || typeof p['model'] !== 'string' || typeof p['message'] !== 'string') continue;
    if (!formKeys.includes(p['model'])) continue;
    problems.push({ model: p['model'] as GuidedFormKey, message: p['message'] });
  }
  const feeds: Record<string, string> = {};
  for (const [k, v] of Object.entries(n['feeds'])) if (typeof v === 'string') feeds[k] = v;
  const substitutions = Array.isArray(n['substitutions'])
    ? n['substitutions'].filter((x): x is string => typeof x === 'string')
    : [];
  return substitutions.length > 0 ? { problems, feeds, substitutions } : { problems, feeds };
}

/** The live guided state of a loaded project; an absent key or part gives the defaults. */
export function fromProject(p: GuidedProject | undefined): GuidedState {
  const d = defaultGuided();
  if (p === undefined) return d;
  const exposure: GuidedExposure = {
    pathways: { ...d.exposure.pathways, ...(p.exposure?.pathways ?? {}) },
    a: mergeDefaults(defaultReceptor('resident'), p.exposure?.a),
    b: p.exposure?.b === undefined ? d.exposure.b : receptorFrom(p.exposure.b),
    additive: p.exposure?.additive ?? d.exposure.additive,
  };
  const outputs: GuidedOutputs = {};
  for (const [key, slots] of Object.entries(p.outputs ?? {})) {
    if (!isObj(slots)) continue;
    for (const [chemical, o] of Object.entries(slots)) {
      if (!isObj(o) || typeof o['inputsHash'] !== 'string') continue;
      (outputs[key] ??= {})[chemical] = {
        inputsHash: o['inputsHash'],
        value: decodeJson(o['value']),
      };
    }
  }
  const runNotes: GuidedRunNotes = {};
  for (const [chemical, n] of Object.entries(p.runNotes ?? {})) {
    const note = readRunNote(n);
    if (note !== null) runNotes[chemical] = note;
  }
  const levels = readGuidedLevels(p.levels);
  return {
    ...(Object.keys(levels).length > 0 ? { levels } : {}),
    site: mergeDefaults(d.site, p.site),
    forms: cloneData(p.forms ?? {}) as GuidedState['forms'],
    sources: Object.fromEntries(Object.entries(p.sources ?? {}).map(([k, v]) => [k, sourceOf(v)])),
    run: mergeDefaults(d.run, p.run),
    outputs,
    runNotes,
    exposure,
    targets: {
      ...mergeDefaults(d.targets, { ...p.targets, standards: undefined }),
      standards: cloneData((p.targets?.standards ?? {}) as Record<string, GuidedStandard>),
    },
  };
}

/** The guided state of a loaded project (the key is read with `fromProject`). */
export const guidedOf = (project: { guided?: GuidedProject | undefined }): GuidedState =>
  fromProject(project.guided);
