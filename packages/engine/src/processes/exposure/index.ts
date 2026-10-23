import type { MethodDescriptor, UncertainInput, Warning } from '../../registry/index.js';
import {
  runLegacyScenario,
  runModernScenario,
  type LegacyScenarioInput,
  type LegacyScenarioResult,
  type ModernScenarioInput,
  type ModernScenarioResult,
} from './scenario.js';

export * from './units.js';
export * from './averaging.js';
export * from './epc.js';
export * from './checks.js';
export * from './legacy.js';
export * from './receptorsLegacy.js';
export * from './dermal.js';
export * from './lifeStages.js';
export * from './produce.js';
export * from './produceEfh.js';
export * from './modern.js';
export * from './receptorsModern.js';
export * from './scenario.js';

const COMMON_ASSUMPTIONS = [
  'Exposure point concentrations are those at the point of contact; no further fate and transport is modelled here.',
  'Chronic reference values and slope factors only; no subchronic or acute evaluation.',
  'Cancer risks add over pathways and chemicals within a receptor, and so do hazard quotients; no interaction between chemicals.',
  'Risk is the linear low-dose form, slope times dose; it is warned above 0.01.',
  'The hazard index is a total over all target organs (no target-organ segregation).',
  'The receptor is exposed for the whole averaging window chosen, with the exposure factors entered.',
  'Air and surface-water concentrations are user entered or fed from the vapor and surface-water screens; shower and outdoor particulate air are user entered or fed from the shower, sprinkler and particulate methods.',
  'A chemical without a value for a route contributes nothing to that route and is reported as not quantified, never as zero.',
  'The homegrown produce pathway reads the soil concentration through a fresh-weight plant factor per produce class (soil-derived uptake only; vapor and irrigation contributions to the plant are not added), with a user-entered homegrown fraction and no default.',
];

function legacyReceptorInputs(count: number): UncertainInput<LegacyScenarioInput>[] {
  const out: UncertainInput<LegacyScenarioInput>[] = [];
  const field = (
    idx: number,
    key: 'bw' | 'ed' | 'waterIngestionRate' | 'ef',
    name: string,
    unit: string,
    bounds: readonly [number, number] = [0, Number.POSITIVE_INFINITY],
  ): UncertainInput<LegacyScenarioInput> => ({
    id: `exposure.receptor${idx}.${key}`,
    label: `Receptor ${idx + 1} ${name}`,
    unit,
    category: 'exposure',
    bounds,
    get: (i) => i.receptors[idx]?.receptor[key] ?? Number.NaN,
    set: (i, v) => ({
      ...i,
      receptors: i.receptors.map((r, k) =>
        k === idx ? { ...r, receptor: { ...r.receptor, [key]: v } } : r,
      ),
    }),
  });
  for (let idx = 0; idx < count; idx++) {
    out.push(
      field(idx, 'bw', 'body weight', 'kg'),
      field(idx, 'ed', 'exposure duration', 's'),
      field(idx, 'waterIngestionRate', 'drinking-water ingestion rate', 'm^3/s'),
      field(idx, 'ef', 'exposure frequency', '1', [0, 1]),
    );
  }
  return out;
}

export const exposureLegacy: MethodDescriptor<LegacyScenarioInput, LegacyScenarioResult> = {
  id: 'exposure.rags-a-1989',
  process: 'exposure',
  kind: 'legacy',
  name: 'RAGS Part A doses for nine direct pathways, one or two receptors',
  summary:
    'Chronic and lifetime average daily doses from the RAGS Part A intake equations for soil and water ingestion, dermal contact, inhalation and surface-water contact, with the 1991 default exposure factors, turned into incremental cancer risk and hazard quotients and summed within each receptor.',
  citations: ['rags1989', 'epa1991sdef', 'epa1992dea'],
  assumptions: [
    ...COMMON_ASSUMPTIONS,
    'Dermal water uses the steady-state permeability with no lag time.',
    'Soil bioavailability is 1 unless entered; route-to-route extrapolation is off unless switched on.',
    'A concentration series is reduced to the largest 7-year average (noncancer, the duration when shorter) and the largest average over the exposure duration (cancer).',
  ],
  risc5Choice:
    'RISC5 uses dose-based inhalation with the slope factor and reference dose obtained from the unit risk and reference concentration at 20 m^3/d and 70 kg, evaluates two simultaneous receptors with cancer risks additive only on request and hazard indices never added, takes soil as a constant, and averages a time-varying groundwater concentration over the largest 7-year window for noncancer effects and the exposure duration for cancer.',
  validate: (input): Warning[] => runLegacyScenario(input).warnings,
  // The scenario allows at most two receptors, so two receptors' inputs are declared.
  uncertainInputs: legacyReceptorInputs(2),
  run: runLegacyScenario,
};

export const exposureModern: MethodDescriptor<ModernScenarioInput, ModernScenarioResult> = {
  id: 'exposure.rags-e-f-2014',
  process: 'exposure',
  kind: 'modern',
  name: 'RAGS Parts E and F with the 2014 default factors and age-dependent adjustment',
  summary:
    'Age-segmented intakes with the 2014 default exposure factors, the RAGS Part E dermal event model, RAGS Part F concentration-based inhalation and the age-dependent adjustment factors for mutagens, with the exposure starting when the cancer risk from a time-varying groundwater concentration is greatest.',
  citations: [
    'rags1989',
    'ragse2004',
    'ragsf2009',
    'epa2014ef',
    'epa2005adaf',
    'epa2005cancer',
    'epa2012asrba',
    'epa2011efh',
    'epa2024rslug',
  ],
  assumptions: [
    ...COMMON_ASSUMPTIONS,
    'A resident is one age-segmented receptor (child then adult); mutagens use the four age segments with the factors 10, 3, 3 and 1.',
    "Trichloroethylene and vinyl chloride follow the cancer equations of the RSL User's Guide for a receptor with early-life segments: trichloroethylene splits its slope factor and unit risk into a cancer part and a mutagenic part (the mutagenic part with the age segments), vinyl chloride adds the child's unaveraged dose to the lifetime-averaged dose; other receptors use the ordinary equation and are warned.",
    'The dermal event model and the dermal toxicity adjustment for low gastrointestinal absorption follow RAGS Part E; the cancer bathing event time is the time-weighted resident value.',
    'Inhalation uses the exposure concentration (no breathing rate or body weight).',
    'Life-stage hazard quotients are never added; the headline hazard index is the largest.',
    'A concentration series is averaged over each life stage starting at the exposure start that maximizes the cancer risk; each noncancer group uses the largest average over a window of its own duration.',
  ],
  validate: (input): Warning[] => runModernScenario(input).warnings,
  run: runModernScenario,
};
