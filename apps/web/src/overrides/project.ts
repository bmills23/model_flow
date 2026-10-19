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
});
export type OverridesProject = z.infer<typeof overridesSchema>;

/** The saved form, or undefined when there is nothing to save so a file without overrides is unchanged. */
export function toProject(state: OverridesState): OverridesProject | undefined {
  return isEmpty(state) ? undefined : cloneData({ toxicity: state.toxicity });
}

export function fromProject(p: OverridesProject | undefined): OverridesState {
  const out = emptyOverrides();
  if (p?.toxicity !== undefined) out.toxicity = cloneData(p.toxicity);
  return out;
}
