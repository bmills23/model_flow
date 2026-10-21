import type { Screens } from './index';
import type { StaleFeedKey } from './store';

type HeldFeeds = Record<string, unknown> | undefined;
type ChemicalFlags = {
  groundwaterFromWell?: boolean;
  indoorFromVapor?: boolean;
  outdoorFromVapor?: boolean;
  surfaceWaterFromModel?: boolean;
  bathroomFromHousehold?: boolean;
  indoorFromHousehold?: boolean;
  outdoorFromHousehold?: string;
  produceFromPlantsEco?: boolean;
};

/** The feeds a risk screen's chemical rows take their values from. */
export function riskFeedsRead(rows: readonly ChemicalFlags[]): StaleFeedKey[] {
  const out: StaleFeedKey[] = [];
  if (rows.some((r) => r.groundwaterFromWell)) out.push('well');
  if (rows.some((r) => r.indoorFromVapor || r.outdoorFromVapor)) out.push('vaporRisk');
  if (rows.some((r) => r.surfaceWaterFromModel)) out.push('surfaceWater');
  if (
    rows.some(
      (r) =>
        r.bathroomFromHousehold || r.indoorFromHousehold || (r.outdoorFromHousehold ?? '') !== '',
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
    if (held?.[k] !== undefined && held[k] !== null) out.push(k);
  }
  return out;
}

/** The feeds the transport screen reads while its feed toggles are on. */
export function transportFeedsRead(form: {
  feedFromVadose: boolean;
  feedFromSaturated: boolean;
}): StaleFeedKey[] {
  const out: StaleFeedKey[] = [];
  if (form.feedFromVadose) out.push('vadose');
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
  set('transport', transportFeedsRead(screens.transport.form));
  set('vapor', vaporFeedsRead(screens.vapor.choice));
  set('surfaceWater', screens.surfaceWater.form.linked ? ['bank'] : []);
  set('household', householdFeedsRead(screens.household.form));
  set('risk', riskFeedsRead(screens.risk.form.chemicals));
  set('cleanup', cleanupFeedsRead(screens.cleanup.form, held));
  return out;
}
