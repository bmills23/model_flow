import { slotOfValue } from '../project/feedSlots';
import { feedShapes } from '../project/schema';

export interface OutputsRead {
  /** The outputs that stand on their own: a known feed, a slot holding its own chemical's value. */
  kept: Record<string, Record<string, unknown>>;
  /** The paths (`guided.outputs.<feed>[.<chemical>]`) of what was dropped. */
  dropped: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The feeds a 3d output can stand for: the chemical-scoped ones, whose value shapes the screens send. */
const CHECKED: Record<string, { shape: { safeParse: (v: unknown) => { success: boolean } } }> = {};
for (const key of [
  'well',
  'surfaceWater',
  'vadose',
  'saturated',
  'bank',
  'vaporVadose',
  'vaporWaterTable',
  'vaporSaturated',
  'vaporRisk',
  'household',
  'produce',
] as const) {
  const envelope = feedShapes[key].unwrap();
  CHECKED[key] = { shape: envelope.shape.value as never };
}

/**
 * Check each output slot of a stored `guided.outputs` on its own, the way `parseProject` checks feeds:
 * a slot whose value does not fit its feed's shape, or names another chemical, is dropped and reported,
 * and never refuses the file or the other slots.
 */
export function readGuidedOutputs(raw: unknown): OutputsRead {
  const kept: OutputsRead['kept'] = {};
  const dropped: string[] = [];
  if (!isObj(raw)) return { kept, dropped };
  for (const [key, slots] of Object.entries(raw)) {
    const checker = CHECKED[key];
    if (checker === undefined || !isObj(slots)) {
      dropped.push(`guided.outputs.${key}`);
      continue;
    }
    for (const [chemical, slot] of Object.entries(slots)) {
      const ok =
        isObj(slot) &&
        typeof slot['inputsHash'] === 'string' &&
        checker.shape.safeParse(slot['value']).success &&
        slotOfValue(slot['value']) === chemical;
      if (!ok) {
        dropped.push(`guided.outputs.${key}.${chemical}`);
        continue;
      }
      (kept[key] ??= {})[chemical] = slot;
    }
  }
  return { kept, dropped };
}
