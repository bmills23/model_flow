import { seriesEpc, waterDrivenEpc, type EpcSpec } from '@model-flow/engine';
import { computeHousehold, type HeldSources, type Section } from './compute';
import { PARTICULATE_ORIGIN, SHOWER_ORIGIN, SPRINKLER_ORIGIN, type HouseholdForm } from './form';
import type { HouseholdRiskFeed } from './feeds';

export type FeedResult =
  { ok: true; feed: HouseholdRiskFeed; notes: string[] } | { ok: false; reasons: string[] };

/** The water source as an EPC spec: the entered value, or a held series (SI, as the feeds carry it). */
function waterSpec(
  source: 'entered' | 'well' | 'surface',
  entered: number,
  held: HeldSources,
): EpcSpec | null {
  if (source === 'entered') return { kind: 'constant', value: entered, origin: 'entered' };
  if (source === 'well') {
    return held.well === null
      ? null
      : seriesEpc(
          { times: held.well.times, values: held.well.values },
          `transport.${held.well.method}`,
        );
  }
  return held.surface === null
    ? null
    : seriesEpc({ times: held.surface.times, values: held.surface.values }, held.surface.origin);
}

const errorsOf = (s: Section<object>): string => (s.ok ? '' : s.errors.join('; '));

/**
 * The household results as EPCs for the risk screen and coefficients for cleanup. Every forward function
 * is linear in its source (ruling 11), so a series source gives the series EPC `coefficient * c(t)`
 * through the engine's `waterDrivenEpc`; a constant source is the screen's own value, unchanged.
 */
export function buildHouseholdFeed(form: HouseholdForm, held: HeldSources): FeedResult {
  const reasons: string[] = [];
  if (form.chemicalId.trim() === '') {
    reasons.push('Pick the chemical this result is for from the project list');
  }
  const out = computeHousehold(form, held);
  const notes: string[] = [];
  const feed: HouseholdRiskFeed = {
    chemicalId: form.chemicalId.trim(),
    label: `${form.chemicalName.trim() || form.chemicalId.trim()}, household run`,
    coefficients: {},
    methods: {},
  };

  const enteredWater = Number(form.waterConcentration) / 1000;

  const shower = { legacy: out.shower.legacy, little: out.shower.little, rsl: out.shower.rsl }[
    form.showerMethod
  ];
  if (shower.ok) {
    const origin = SHOWER_ORIGIN[form.showerMethod];
    const water = waterSpec(form.showerWaterSource, enteredWater, held);
    const epc: EpcSpec =
      water === null || water.kind === 'constant'
        ? { kind: 'constant', value: shower.concentration, origin }
        : waterDrivenEpc(water, (cw) => ({ concentration: shower.coefficient * cw }), origin);
    if (form.showerMethod === 'rsl') {
      // A whole-house concentration applies for 24 h/day (RSL User's Guide, Table 1), so it goes to
      // the indoor air pathway, never to the shower stall pathway whose time is the bathing time.
      feed.indoorAir = epc;
      feed.coefficients.householdAir = shower.coefficient;
      feed.methods.householdAir = origin;
    } else {
      feed.bathroomAir = epc;
      feed.coefficients.bathroomAir = shower.coefficient;
      feed.methods.bathroomAir = origin;
    }
  } else {
    notes.push(`Shower air not sent: ${errorsOf(shower)}`);
  }

  if (out.irrigation.ok) {
    const water = waterSpec(form.irrigationWaterSource, enteredWater, held);
    const sprayAir = out.irrigation.sprayAir;
    const coefficient = out.irrigation.sprayCoefficient;
    feed.outdoorSprinkler =
      water === null || water.kind === 'constant'
        ? { kind: 'constant', value: sprayAir, origin: SPRINKLER_ORIGIN }
        : waterDrivenEpc(water, (cw) => ({ concentration: coefficient * cw }), SPRINKLER_ORIGIN);
    feed.coefficients.sprayAir = coefficient;
    feed.methods.sprayAir = SPRINKLER_ORIGIN;
  } else {
    notes.push(`Sprinkler spray air not sent: ${errorsOf(out.irrigation)}`);
  }

  const part = {
    box: out.particulate.box,
    pef1996: out.particulate.pef1996,
    pef2002: out.particulate.pef2002,
  }[form.particulateMethod];
  if (part.ok) {
    feed.outdoorParticulate = {
      kind: 'constant',
      value: part.concentration,
      origin: PARTICULATE_ORIGIN[form.particulateMethod],
    };
    feed.coefficients.particulateAir = part.coefficient;
    feed.methods.particulateAir = PARTICULATE_ORIGIN[form.particulateMethod];
  } else {
    notes.push(`Particulate air not sent: ${errorsOf(part)}`);
  }

  if (
    feed.bathroomAir === undefined &&
    feed.indoorAir === undefined &&
    feed.outdoorSprinkler === undefined &&
    feed.outdoorParticulate === undefined
  ) {
    reasons.push('No household result computes yet; complete the inputs of at least one process');
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, feed, notes };
}
