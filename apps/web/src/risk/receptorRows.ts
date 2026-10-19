import { LEGACY_PRESETS } from '@model-flow/engine';
import {
  LEGACY_FIELDS,
  LIFETIME_KEY,
  LIFETIME_LABEL,
  MODERN_FIELDS,
  modernKey,
} from '../overrides/receptors';
import { LEGACY_PRESET, MODERN_PRESET } from './build';
import type { PresetId } from './form';

const LIFETIME_PRESET_YR = 70;

/** A preset value as shown: six significant figures at most, or "none" when the preset has none. */
export const shownValue = (v: number | undefined): string =>
  v === undefined ? 'none' : String(Number(v.toPrecision(6)));

export interface EditableRow {
  key: string;
  label: string;
  unit: string;
  preset: number | undefined;
}

/** The factors of the chosen preset that can be edited, with the preset's value for each. */
export function editableRows(preset: PresetId): {
  legacy: EditableRow[];
  modern: EditableRow[];
  lifetime: EditableRow;
} {
  const lb = LEGACY_PRESETS[LEGACY_PRESET[preset]];
  const legacy = LEGACY_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    unit: f.unit,
    preset: lb[f.prop],
  }));
  const stages = MODERN_PRESET[preset].stages;
  const groups = [...new Set(stages.map((s) => s.group))];
  const modern = groups.flatMap((g) =>
    MODERN_FIELDS.map((f) => ({
      key: modernKey(g, f.prop),
      label: `${f.label}, ${g}`,
      unit: f.unit,
      preset: stages.find((s) => s.group === g)?.[f.prop],
    })),
  );
  const lifetime = {
    key: LIFETIME_KEY,
    label: LIFETIME_LABEL,
    unit: 'yr',
    preset: MODERN_PRESET[preset].lifetimeYr ?? LIFETIME_PRESET_YR,
  };
  return { legacy, modern, lifetime };
}
