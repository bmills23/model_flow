import { z } from 'zod';
import { modeledLevelsSchema } from '../cleanup/modeledLevels';

/**
 * The cleanup levels step 5 kept for each chemical whose level is solved through the step 3d models (the
 * groundwater path from a groundwater, soil above or soil below source). They are kept with the project in
 * `guided.levels`, one entry per chemical, in the shape the workbench keeps its modeled levels
 * (`cleanup/modeledLevels.ts`) with the target and allocation they were solved for. Each entry carries the
 * guided fingerprint of the inputs it was solved from (`guided/solve.ts`); it is current while that
 * fingerprint equals the live one. An optional key: a file without it opens with no kept levels, and an
 * entry that does not parse is dropped alone.
 */

export const guidedLevelSchema = modeledLevelsSchema.extend({
  /** What the level was solved to meet: the risk targets, a federal MCL or a state standard at the well. */
  target: z.enum(['risk', 'mcl', 'state']),
  /** Each chemical alone, all together keeping the step 3b ratios, or the target split equally. */
  allocation: z.enum(['individual', 'cumulative', 'equal']),
  /** Why the chemical has no level at all (for example not detected at the source); null when it has one. */
  reason: z.string().nullable(),
});
export type GuidedKeptLevel = z.infer<typeof guidedLevelSchema>;

/** The kept levels of a saved file, each entry read on its own: one that does not parse is dropped. */
export function readGuidedLevels(raw: unknown): Record<string, GuidedKeptLevel> {
  const out: Record<string, GuidedKeptLevel> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, entry] of Object.entries(raw)) {
    const r = guidedLevelSchema.safeParse(entry);
    if (r.success && r.data.chemicalId === id) out[id] = r.data;
  }
  return out;
}
