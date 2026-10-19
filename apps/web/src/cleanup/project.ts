import { z } from 'zod';
import { cloneData, mergeDefaults } from '../project/merge';
import { flag, partialObject, text, texts } from '../project/fields';
import { chemicalRowSchema, receptorFrom, receptorSchema } from '../risk/project';
import { defaultCleanupForm, type CleanupForm } from './form';

/** The cleanup levels screen's saved state: its form. */
export interface CleanupState {
  form: CleanupForm;
}

const ssgSchema = partialObject({
  on: flag,
  daf: z.enum(['1', '20', 'site']),
  targetKind: z.enum(['mcl', 'user', 'tap']),
  ...texts('userTarget', 'sourceDepth', 'rhoB', 'foc', 'theta', 'siteK', 'siteGradient'),
  ...texts('siteInfiltration', 'siteL', 'siteDa'),
});

const formSchema = partialObject({
  ssg: ssgSchema,
  source: z.enum(['direct', 'dissolved', 'vadose', 'saturated']),
  targetKind: z.enum(['risk', 'well']),
  ...texts('wellTarget', 'windowYr', 'startConc', 'solubility'),
  secantParity: flag,
  tphHeld: flag,
  chemicals: z.array(chemicalRowSchema),
  a: receptorSchema,
  b: receptorSchema.nullable(),
  additive: flag,
  routeExtrapolation: flag,
  allocation: z.enum(['individual', 'cumulative', 'equal']),
  targetRisk: text,
  targetHq: text,
});

export const cleanupProjectSchema = z.object({ form: formSchema.optional() });
export type CleanupProject = z.infer<typeof cleanupProjectSchema>;

export function toProject(state: CleanupState): CleanupProject {
  return cloneData({ form: state.form });
}

export function fromProject(p: CleanupProject | undefined): CleanupState {
  const d = defaultCleanupForm();
  const { a, b, ...rest } = p?.form ?? {};
  const merged = mergeDefaults(
    { ...d, a: undefined, b: undefined },
    rest,
  ) as unknown as CleanupForm;
  return {
    form: {
      ...merged,
      a: mergeDefaults(d.a, a),
      b: b === undefined ? d.b : receptorFrom(b),
    },
  };
}
