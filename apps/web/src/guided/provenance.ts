import { applyTexture as saturatedTexture, type SaturatedForm } from '../saturated/form';
import { applyTexture as vadoseTexture, type LayerForm as VadoseLayer } from '../vadose/form';
import {
  applyTexture as vaporTexture,
  type LayerForm as VaporLayer,
  type TextureChoice,
} from '../vapor/form';
import type { GuidedFormKey } from './state';

/**
 * Where a step 3a value came from, in the words the step shows. No site value carries a cited source in
 * the program (the report says the same, `report/siteValues.ts`), except a soil property still at the
 * value its soil type filled: those are EPA class averages.
 */

export type Provenance = 'soilType' | 'default' | 'entered' | 'needed' | 'optional';

export const PROVENANCE_TEXT: Record<Provenance, string> = {
  soilType: 'From the soil type',
  default: 'A default with no source',
  entered: 'Entered with no source',
  needed: 'Needed: a chosen model uses this value and it is blank',
  optional: 'Optional, left blank',
};

type Form = Record<string, unknown>;

/** Two entries are the same number (ignoring formatting and float noise), or the same text. */
export function sameNumber(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (x === '' || y === '') return x === y;
  const p = Number(x);
  const q = Number(y);
  if (!Number.isFinite(p) || !Number.isFinite(q)) return x === y;
  if (p === q) return true;
  return Math.abs(p - q) <= 1e-9 * Math.max(Math.abs(p), Math.abs(q));
}

const UNFILLED = 'not filled by the soil type';

/**
 * The value a soil type fills into `field` of `parent` (a layer of the leaching or vapor column, or the
 * saturated form), or undefined when the parent has no soil type or the soil type does not fill it.
 */
export function texturePreset(
  model: GuidedFormKey,
  parent: Form,
  field: string,
): string | undefined {
  const texture = parent['texture'];
  if (typeof texture !== 'string' || texture === 'custom') return undefined;
  const t = texture as TextureChoice;
  // a field the soil type does not fill comes back as it went in
  const probe = { ...parent, [field]: UNFILLED };
  let filled: Form;
  if (model === 'vadose') filled = vadoseTexture(probe as unknown as VadoseLayer, t) as never;
  else if (model === 'vapor') filled = vaporTexture(probe as unknown as VaporLayer, t) as never;
  else if (model === 'saturated')
    filled = saturatedTexture(probe as unknown as SaturatedForm, t) as never;
  else return undefined;
  const v = filled[field];
  return typeof v === 'string' && v !== UNFILLED ? v : undefined;
}

export interface ProvenanceInput {
  /** The value in the template. */
  value: unknown;
  /** The value at the same place in the blank start, when it has one. */
  base: unknown;
  /** The value the place's soil type fills, when it fills this field. */
  preset?: string | undefined;
  /** True when a chosen model reads the value and a blank would stop it. */
  required: boolean;
}

export function provenanceOf({ value, base, preset, required }: ProvenanceInput): Provenance {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') return required ? 'needed' : 'optional';
  if (preset !== undefined && sameNumber(preset, text)) return 'soilType';
  if (typeof base === 'string' && sameNumber(base, text)) return 'default';
  return 'entered';
}

const RANK: readonly Provenance[] = ['optional', 'soilType', 'default', 'entered', 'needed'];

/** The tag of a field that stands for several places: the weakest claim wins, a needed blank above all. */
export function strongest(tags: readonly Provenance[]): Provenance {
  let best = 0;
  for (const t of tags) best = Math.max(best, RANK.indexOf(t));
  return RANK[best]!;
}
