import type { Screens } from './index';
import type { FeedRead, StaleFeedKey } from './store';
import { defaultUncertainty } from '../uncertainty/project';
import { stableStringify } from './hash';

/**
 * The project's held feeds, by feed key: a feed's slots (a Map, or the saved object of slots by
 * chemical), or one value. Only whether something is held is read here; which chemical a consumer
 * reads is in each `FeedRead`.
 */
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

/** True when `held` has anything under feed `k`. */
function isHeld(held: HeldFeeds, k: string): boolean {
  const f = held?.[k];
  if (f === undefined || f === null) return false;
  if (f instanceof Map) return f.size > 0;
  return true;
}

/** The reads in order, each feed and chemical once. */
function unique(reads: readonly FeedRead[]): FeedRead[] {
  const seen = new Set<string>();
  const out: FeedRead[] = [];
  for (const r of reads) {
    const key = `${r.feed}\u0000${r.chemicalId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r.chemicalId === undefined ? { feed: r.feed } : r);
  }
  return out;
}

const blankToUndefined = (id: string | undefined): string | undefined =>
  id !== undefined && id.trim() !== '' ? id : undefined;
const readOf = (feed: StaleFeedKey, chemicalId: string | undefined): FeedRead => {
  const id = blankToUndefined(chemicalId);
  return id === undefined ? { feed } : { feed, chemicalId: id };
};

/**
 * The feeds a risk screen's chemical rows take their values from: each flagged row reads its own
 * chemical's slot (one slot per chemical, wave O slice O4), so a slot for another chemical never
 * marks the row.
 */
export function riskFeedsRead(rows: readonly ChemicalFlags[]): FeedRead[] {
  const out: FeedRead[] = [];
  const by = (feed: StaleFeedKey, on: (r: ChemicalFlags) => boolean | undefined): void => {
    for (const r of rows) if (on(r)) out.push(readOf(feed, r.id));
  };
  by('well', (r) => r.groundwaterFromWell);
  by('vaporRisk', (r) => r.indoorFromVapor || r.outdoorFromVapor);
  by('surfaceWater', (r) => r.surfaceWaterFromModel);
  by(
    'household',
    (r) =>
      r.bathroomFromHousehold || r.indoorFromHousehold || (r.outdoorFromHousehold ?? '') !== '',
  );
  by('produce', (r) => r.produceFromPlantsEco);
  return unique(out);
}

/**
 * The feeds the cleanup screen reads: the groundwater run and the vadose or saturated source of a
 * modeled source, the produce factors of a chemical row, and each source level panel the held feeds
 * switch on (`held` has an entry for each feed that is held: household, vaporRisk, surfaceWater, tph).
 * Each chemical row reads its own chemical's slot.
 */
export function cleanupFeedsRead(
  form: { source: string; chemicals: readonly ChemicalFlags[] },
  held: HeldFeeds,
): FeedRead[] {
  const out: FeedRead[] = [];
  const perRow = (feed: StaleFeedKey): void => {
    if (form.chemicals.length === 0) out.push({ feed });
    for (const r of form.chemicals) out.push(readOf(feed, r.id));
  };
  if (form.source !== 'direct') perRow('transportChain');
  if (form.source === 'vadose') perRow('vadose');
  if (form.source === 'saturated') perRow('saturated');
  for (const r of form.chemicals) if (r.produceFromPlantsEco) out.push(readOf('produce', r.id));
  for (const k of ['household', 'vaporRisk', 'surfaceWater'] as const) {
    if (!isHeld(held, k)) continue;
    for (const r of form.chemicals) out.push(readOf(k, r.id));
  }
  if (isHeld(held, 'tph')) out.push({ feed: 'tph' });
  return unique(out);
}

/** The feeds the transport screen reads, for its own chemical, while its feed toggles are on. */
export function transportFeedsRead(
  form: { feedFromVadose: boolean; feedFromSaturated: boolean; chemicalId?: string },
  held?: HeldFeeds,
): FeedRead[] {
  const out: FeedRead[] = [];
  // the saturated source wins over the vadose one when both are on and it is held
  const satOn = form.feedFromSaturated && (held === undefined || isHeld(held, 'saturated'));
  if (form.feedFromVadose && !satOn) out.push(readOf('vadose', form.chemicalId));
  if (form.feedFromSaturated) out.push(readOf('saturated', form.chemicalId));
  return out;
}

/** The feeds the household screen reads, for its own chemical, from its water source choices. */
export function householdFeedsRead(form: {
  showerWaterSource: string;
  irrigationWaterSource: string;
  chemicalId?: string;
}): FeedRead[] {
  const out: FeedRead[] = [];
  if (form.showerWaterSource === 'well' || form.irrigationWaterSource === 'well') {
    out.push(readOf('well', form.chemicalId));
  }
  if (form.irrigationWaterSource === 'surface') out.push(readOf('surfaceWater', form.chemicalId));
  return out;
}

/** The feed the vapor screen reads, for its own chemical, for its chosen source series. */
export function vaporFeedsRead(choice: string, chemicalId?: string): FeedRead[] {
  if (choice === 'waterTable') return [readOf('vaporWaterTable', chemicalId)];
  if (choice === 'vadose') return [readOf('vaporVadose', chemicalId)];
  if (choice === 'saturated') return [readOf('vaporSaturated', chemicalId)];
  return [];
}

/**
 * The feeds each screen takes values from, given how the screens are set, each for the chemical it
 * reads. A section of the report is computed from a stale feed when one of these is stale. `held` is
 * the project's stored feeds.
 */
export function feedsReadBy(
  screens: Screens,
  held?: HeldFeeds,
): Partial<Record<keyof Screens, FeedRead[]>> {
  const out: Partial<Record<keyof Screens, FeedRead[]>> = {};
  const set = (k: keyof Screens, v: FeedRead[]): void => {
    if (v.length > 0) out[k] = v;
  };
  set('transport', transportFeedsRead(screens.transport.form, held));
  set('vapor', vaporFeedsRead(screens.vapor.choice, screens.vapor.form.chemicalId));
  const sw = screens.surfaceWater.form;
  set('surfaceWater', sw.linked ? [readOf('bank', sw.chemicalId)] : []);
  set('household', householdFeedsRead(screens.household.form));
  set('risk', riskFeedsRead(screens.risk.form.chemicals));
  set('cleanup', cleanupFeedsRead(screens.cleanup.form, held));
  // the uncertainty panels sample the risk and cleanup setups, so they read what those read (the
  // panels' own inputs only, not the source level panels of the cleanup screen)
  const u = screens.uncertainty;
  const d = defaultUncertainty();
  const changed = (k: 'risk' | 'cleanup' | 'modeled'): boolean =>
    stableStringify(u[k]) !== stableStringify(d[k]);
  const sampled: FeedRead[] = [];
  if (changed('risk')) sampled.push(...riskFeedsRead(screens.risk.form.chemicals));
  if (changed('cleanup') || changed('modeled')) {
    sampled.push(...cleanupFeedsRead(screens.cleanup.form, {}));
  }
  set('uncertainty', unique(sampled));
  return out;
}
