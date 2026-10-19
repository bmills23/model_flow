import { PATHWAY_IDS, type Medium, type PathwayId } from '@model-flow/engine';
import { z } from 'zod';
import { cloneData, mergeDefaults } from '../project/merge';
import { flag, partialObject, text, texts } from '../project/fields';
import { defaultForm, defaultReceptor, type PresetId, type RiskForm } from './form';

/** The exposure and risk screen's saved state: its form. */
export interface RiskState {
  form: RiskForm;
}

const MEDIA_KEYS = [
  'soil',
  'groundwater',
  'bathroomAir',
  'indoorAir',
  'outdoorAir',
  'surfaceWater',
] as const satisfies readonly Medium[];
const PRESETS = ['resident', 'worker', 'child'] as const satisfies readonly PresetId[];

const optionalOf = <K extends string, S extends z.ZodType>(keys: readonly K[], schema: S) =>
  z.object(
    Object.fromEntries(keys.map((k) => [k, schema.optional()])) as Record<K, z.ZodOptional<S>>,
  );

/** One receptor; every field optional, absent ones take the receptor defaults. */
export const receptorSchema = partialObject({
  preset: z.enum(PRESETS),
  pathways: optionalOf<PathwayId, z.ZodBoolean>(PATHWAY_IDS, flag),
  ...texts(
    'soilSkinArea',
    'soilAdherence',
    'waterIngestion',
    'waterSkinArea',
    'inhalationRate',
    'bathTime',
    'swimTime',
    'swimDays',
    'outdoorTime',
  ),
});

/** One chemical row. A flag an older file lacks reads as false. */
export const chemicalRowSchema = z.object({
  id: text,
  name: text,
  dermalForm: z.enum(['organic', 'inorganic']).optional(),
  conc: optionalOf<Medium, z.ZodString>(MEDIA_KEYS, text),
  groundwaterFromWell: flag.default(false),
  indoorFromVapor: flag.default(false),
  outdoorFromVapor: flag.default(false),
  surfaceWaterFromModel: flag.default(false),
  bathroomFromHousehold: flag.default(false),
  indoorFromHousehold: flag.default(false),
  outdoorFromHousehold: z.enum(['', 'sprinkler', 'particulate']).default(''),
});

const formSchema = partialObject({
  chemicals: z.array(chemicalRowSchema),
  a: receptorSchema,
  b: receptorSchema.nullable(),
  additive: flag,
  routeExtrapolation: flag,
  startMode: z.enum(['max-risk', 'pinned']),
  startYr: text,
});

export const riskProjectSchema = z.object({ form: formSchema.optional() });
export type RiskProject = z.infer<typeof riskProjectSchema>;
type ReceptorPart = z.infer<typeof receptorSchema>;

/** A saved second receptor laid over the receptor defaults; null stays null. */
export function receptorFrom(saved: ReceptorPart | null) {
  return saved === null ? null : mergeDefaults(defaultReceptor(), saved);
}

export function toProject(state: RiskState): RiskProject {
  return cloneData({ form: state.form });
}

export function fromProject(p: RiskProject | undefined): RiskState {
  const d = defaultForm();
  const f = p?.form;
  const { a, b, ...rest } = f ?? {};
  const merged = mergeDefaults({ ...d, a: undefined, b: undefined }, rest) as unknown as RiskForm;
  return {
    form: {
      ...merged,
      a: mergeDefaults(d.a, a),
      b: b === undefined ? d.b : receptorFrom(b),
    },
  };
}
