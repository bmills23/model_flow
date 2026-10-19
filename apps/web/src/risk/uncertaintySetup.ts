import { DAY_S, YEAR_S, exposureLegacy, type LegacyScenarioInput } from '@model-flow/engine';
import type { PanelModel, PanelOutput } from '../uncertainty/UncertaintyPanel';
import type { UnitDisplay } from '../uncertainty/DistributionEditor';

/** Registry id the uncertainty workers resolve for the legacy exposure scenario. */
export const EXPOSURE_MODEL_ID = exposureLegacy.id;

/**
 * The legacy exposure method restricted to what this scenario carries: only receptors that are
 * present, and only inputs that have a base value (an unset water ingestion rate has none).
 */
export function exposureUncertainty(base: LegacyScenarioInput): PanelModel<LegacyScenarioInput> {
  const count = base.receptors.length;
  const inputs = (exposureLegacy.uncertainInputs ?? []).filter((u) => {
    const m = /^exposure\.receptor(\d+)\./.exec(u.id);
    return m !== null && Number(m[1]) < count && Number.isFinite(u.get(base));
  });
  return { uncertainInputs: inputs, run: exposureLegacy.run };
}

/** Entered units; the factor multiplies an entered value into SI (exposure years are 365 days). */
export const EXPOSURE_DISPLAYS: Record<string, UnitDisplay> = Object.fromEntries(
  [0, 1].flatMap((i) => [
    [`exposure.receptor${i}.ed`, { unit: 'yr', factor: YEAR_S }],
    [`exposure.receptor${i}.waterIngestionRate`, { unit: 'L/day', factor: 1e-3 / DAY_S }],
  ]),
);

/** Cancer risk and headline hazard index of each receptor, as output choices. */
export function exposureOutputs(base: LegacyScenarioInput): PanelOutput[] {
  return base.receptors.flatMap((r, i) => [
    {
      id: `risk${i}`,
      label: `${r.label}: cancer risk`,
      unit: 'unitless',
      path: ['summary', 'receptors', String(i), 'cancerRisk'],
    },
    {
      id: `hi${i}`,
      label: `${r.label}: hazard index`,
      unit: 'unitless',
      path: ['summary', 'receptors', String(i), 'hi'],
    },
  ]);
}
