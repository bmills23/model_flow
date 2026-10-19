import { z } from 'zod';
import { cloneData } from '../project/merge';
import { text } from '../project/fields';
import { emptyOverrides, isEmpty, type OverridesState } from './model';

const entrySchema = z.object({ value: text, note: text });
const fieldOverridesSchema = z.record(z.string(), z.record(z.string(), entrySchema));

/**
 * The project-level `overrides` key of format version 1 (optional; absent means no overrides). A new
 * kind of override is a new optional key here.
 */
export const overridesSchema = z.object({
  toxicity: fieldOverridesSchema.optional(),
  receptors: fieldOverridesSchema.optional(),
  receptorNames: z.record(z.string(), text).optional(),
});
export type OverridesProject = z.infer<typeof overridesSchema>;

/** The saved form, or undefined when there is nothing to save so a file without overrides is unchanged. */
export function toProject(state: OverridesState): OverridesProject | undefined {
  if (isEmpty(state)) return undefined;
  const out: OverridesProject = {};
  if (Object.keys(state.toxicity).length > 0) out.toxicity = state.toxicity;
  if (Object.keys(state.receptors).length > 0) out.receptors = state.receptors;
  if (Object.keys(state.receptorNames).length > 0) out.receptorNames = state.receptorNames;
  return cloneData(out);
}

export function fromProject(p: OverridesProject | undefined): OverridesState {
  const out = emptyOverrides();
  if (p?.toxicity !== undefined) out.toxicity = cloneData(p.toxicity);
  if (p?.receptors !== undefined) out.receptors = cloneData(p.receptors);
  if (p?.receptorNames !== undefined) out.receptorNames = cloneData(p.receptorNames);
  return out;
}
