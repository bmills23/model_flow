import type { Screens } from './index';
import type { StaleFeedKey } from './store';
import { defaultUncertainty } from '../uncertainty/project';
import { stableStringify } from './hash';

type HeldFeeds = Record<string, unknown> | undefined;
type ChemicalFlags = {
  id?: string;
  groundwaterFromWell?: boolean;
  indoorFromVapor?: boolean;
  outdoorFromVapor?: boolean;
  surfaceWaterFromModel?: boolean;
  bathroomFromHousehold?: boolean;
  indoorFromHousehold?: boolean;
  outdoorFromHousehold?: string;
  produceFromPlantsEco?: boolean;
};

/** True when the held feed `k` is the one a row for chemical `id` can take values from. */
function heldFor(held: HeldFeeds, k: string, id: string | undefined): boolean {
  if (held === undefined) return true;
  const f = held[k] as { chemicalId?: unknown } | null | undefined;
  if (f === undefined || f === null) return false;
  return typeof f.chemicalId !== 'string' || id === undefined || f.chemicalId === id;
}

/**
 * The feeds a risk screen's chemical rows take their values from. A vapor or household feed is for
 * one chemical, so with `held` given it counts only for a flagged row of that chemical; without
 * `held` any flagged row counts.
 */
export function riskFeedsRead(rows: readonly ChemicalFlags[], held?: HeldFeeds): StaleFeedKey[] {
  const out: StaleFeedKey[] = [];
  if (rows.some((r) => r.groundwaterFromWell)) out.push('well');
  if (
    rows.some((r) => (r.indoorFromVapor || r.outdoorFromVapor) && heldFor(held, 'vaporRisk', r.id))
  ) {
    out.push('vaporRisk');
  }
  if (rows.some((r) => r.surfaceWaterFromModel)) out.push('surfaceWater');
  if (
    rows.some(
      (r) =>
        (r.bathroomFromHousehold ||
          r.indoorFromHousehold ||
          (r.outdoorFromHousehold ?? '') !== '') &&
        heldFor(held, 'household', r.id),
    )
  ) {
    out.push('household');
  }
  if (rows.some((r) => r.produceFromPlantsEco)) out.push('produce');
  return out;
}

/**
 * The feeds the cleanup screen reads: the groundwater run and the vadose or saturated source of a
 * modeled source, the produce factors of a chemical row, and each source level panel the held feeds
 * switch on (`held` has an entry for each feed that is held: household, vaporRisk, surfaceWater, tph).
 */
export function cleanupFeedsRead(
  form: { source: string; chemicals: readonly ChemicalFlags[] },
  held: HeldFeeds,
): StaleFeedKey[] {
  const out: StaleFeedKey[] = [];
  if (form.source !== 'direct') out.push('transportChain');
  if (form.source === 'vadose') out.push('vadose');
  if (form.source === 'saturated') out.push('saturated');
  if (form.chemicals.some((r) => r.produceFromPlantsEco)) out.push('produce');
  for (const k of ['household', 'vaporRisk', 'surfaceWater', 'tph'] as const) {
    if (held?.[k] === undefined || held[k] === null) continue;
    // a household or vapor feed is for one chemical: it matters only when that chemical is a row
    if (
      (k === 'household' || k === 'vaporRisk') &&
      !form.chemicals.some((c) => heldFor(held, k, c.id))
    ) {
      continue;
    }
    out.push(k);
  }
  return out;
}

/** The feeds the transport screen reads while its feed toggles are on. */
export function transportFeedsRead(
  form: { feedFromVadose: boolean; feedFromSaturated: boolean },
  held?: HeldFeeds,
): StaleFeedKey[] {
  const out: StaleFeedKey[] = [];
  // the saturated source wins over the vadose one when both are on and it is held
  const satOn = form.feedFromSaturated && (held === undefined || (held.saturated ?? null) !== null);
  if (form.feedFromVadose && !satOn) out.push('vadose');
  if (form.feedFromSaturated) out.push('saturated');
  return out;
}

/** The feeds the household screen reads from its water source choices. */
export function householdFeedsRead(form: {
  showerWaterSource: string;
  irrigationWaterSource: string;
}): StaleFeedKey[] {
  const out: StaleFeedKey[] = [];
  if (form.showerWaterSource === 'well' || form.irrigationWaterSource === 'well') out.push('well');
  if (form.irrigationWaterSource === 'surface') out.push('surfaceWater');
  return out;
}

/** The feed the vapor screen reads for its chosen source series. */
export function vaporFeedsRead(choice: string): StaleFeedKey[] {
  if (choice === 'waterTable') return ['vaporWaterTable'];
  if (choice === 'vadose') return ['vaporVadose'];
  if (choice === 'saturated') return ['vaporSaturated'];
  return [];
}

/**
 * The feeds each screen takes values from, given how the screens are set. A section of the report is
 * computed from a stale feed when one of these is stale. `held` is the project's stored feeds.
 */
export function feedsReadBy(
  screens: Screens,
  held?: HeldFeeds,
): Partial<Record<keyof Screens, StaleFeedKey[]>> {
  const out: Partial<Record<keyof Screens, StaleFeedKey[]>> = {};
  const set = (k: keyof Screens, v: StaleFeedKey[]): void => {
    if (v.length > 0) out[k] = v;
  };
  set('transport', transportFeedsRead(screens.transport.form, held));
  set('vapor', vaporFeedsRead(screens.vapor.choice));
  set('surfaceWater', screens.surfaceWater.form.linked ? ['bank'] : []);
  set('household', householdFeedsRead(screens.household.form));
  set('risk', riskFeedsRead(screens.risk.form.chemicals, held));
  set('cleanup', cleanupFeedsRead(screens.cleanup.form, held));
  // the uncertainty panels sample the risk and cleanup setups, so they read what those read (the
  // panels' own inputs only, not the source level panels of the cleanup screen)
  const u = screens.uncertainty;
  const d = defaultUncertainty();
  const changed = (k: 'risk' | 'cleanup' | 'modeled'): boolean =>
    stableStringify(u[k]) !== stableStringify(d[k]);
  const sampled: StaleFeedKey[] = [];
  if (changed('risk')) sampled.push(...riskFeedsRead(screens.risk.form.chemicals, held));
  if (changed('cleanup') || changed('modeled')) {
    sampled.push(...cleanupFeedsRead(screens.cleanup.form, {}));
  }
  set('uncertainty', [...new Set(sampled)]);
  return out;
}
