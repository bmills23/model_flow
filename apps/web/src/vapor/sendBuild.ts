import type { VaporCoefficients } from './coefficients';
import { vaporCoefficients } from './coefficients';
import type { VaporOutcome } from './compute';
import type { Parsed, VaporForm } from './form';
import type { VaporRiskFeed } from './feeds';
import type { OutdoorForm } from './outdoor';
import { VAPOR_METHOD_WORDS, vaporRunInputs } from './runInputs';
import { constantEpcs, type MethodKey, type SourceSeries, type VaporEpcs } from './series';

/**
 * What the vapor screen sends to the exposure and risk screen, built from its inputs alone so the screen's
 * send button and a guided run give the same feed for the same inputs. Returns null where the screen sends
 * nothing: the form has an error, there is no run, the chemical is not a database chemical, the chosen source
 * is refused, or the method gave no indoor air series.
 */
export function buildVaporRiskFeed(args: {
  form: VaporForm;
  /** True when the live form parses; an invalid form leaves the last good run on screen and sends nothing. */
  formValid: boolean;
  /** The parse of the run shown (the last good one while the live form is invalid). */
  shownParsed: Extract<Parsed, { ok: true }> | null;
  shown: VaporOutcome | null;
  outdoorForm: OutdoorForm;
  method: MethodKey;
  /** The chemical the air concentrations are for, or null when the form names none from the database. */
  chemical: { id: string; name: string } | null;
  /** True when the chosen source is for another chemical. */
  refusedChoice: boolean;
  /** The source series in use (a result of another screen), or null for the entered source. */
  active: SourceSeries | null;
  /** The air concentrations the active source gives, or null for the entered source. */
  feedEpcs: VaporEpcs | null;
}): VaporRiskFeed | null {
  const { form, shownParsed, shown, outdoorForm, method: riskMethod, chemical, active } = args;
  if (!args.formValid || !shownParsed || !shown || chemical === null || args.refusedChoice) {
    return null;
  }
  const r: Pick<VaporEpcs, 'indoor' | 'outdoor'> =
    args.feedEpcs ?? constantEpcs(form, shownParsed, shown, outdoorForm, riskMethod);
  const indoor = r.indoor[riskMethod];
  if (!indoor) return null;
  const outdoorSpec = riskMethod === 'devaull' ? undefined : r.outdoor[riskMethod];
  const coefficients: VaporCoefficients = vaporCoefficients(
    form,
    shownParsed,
    args.feedEpcs ? active : null,
    outdoorForm,
    riskMethod,
  );
  return {
    chemicalId: chemical.id,
    label: `${chemical.name}, ${VAPOR_METHOD_WORDS[riskMethod]}${active ? `, ${active.label}` : ', entered source'}`,
    indoor,
    ...(outdoorSpec ? { outdoor: outdoorSpec } : {}),
    coefficients: {
      ...(coefficients.indoor ? { indoor: coefficients.indoor } : {}),
      ...(outdoorSpec && coefficients.outdoor ? { outdoor: coefficients.outdoor } : {}),
    },
    runInputs: vaporRunInputs({
      form,
      outdoor: outdoorForm,
      method: riskMethod,
      fedBy: active ? active.label : null,
      withOutdoor: outdoorSpec !== undefined,
    }),
  };
}
