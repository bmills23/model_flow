import type { HouseholdForm } from '../household/form';
import { jobsOf, runAll } from './run';
import type { ChemicalData } from './derive';
import { defaultGuided, type GuidedState } from './state';

export const BENZENE = '71-43-2';
export const MTBE = '1634-04-4';

// Test inputs only; none of these is a sourced default.
export const HOUSEHOLD: Partial<HouseholdForm> = {
  householdFactor: '0.5',
  showerDropletDiameter: '1',
  showerFallTime: '2',
  showerFlow: '8',
  showerMinutes: '10',
  stallVolume: '2',
  ventilation: '0.5',
  sprayDropletDiameter: '1.5',
  sprayFallTime: '3',
  sprinklerFlow: '20',
  windSpeed: '2',
  mixingHeight: '2',
  boxLength: '10',
  boxWidth: '4',
};
export const DISPERSIVITY = { alphaLOverride: '10', alphaTOverride: '1', alphaVOverride: '0.1' };
export const CAPILLARY = { capHeight: '0.2', capPorosity: '0.35', capMoisture: '0.25' };

export const setValue = (
  g: GuidedState,
  id: string,
  medium: string,
  v: string,
  unit: string,
): void => {
  g.sources[id] ??= { values: {}, note: '', tph: '' };
  (g.sources[id].values as Record<string, { value: string; unit: string }>)[medium] = {
    value: v,
    unit,
  };
};

export const guidedWith = (patch: (g: GuidedState) => void): GuidedState => {
  const g = defaultGuided();
  g.run = { timeYr: '32', stepYr: '1', sourceYr: '', basis: 'modern' };
  g.forms.household = HOUSEHOLD;
  g.forms.transport = DISPERSIVITY;
  g.forms.vapor = CAPILLARY;
  g.forms.vadose = { alphaL: '0.5' };
  patch(g);
  return g;
};

/** The state with the Run's real outputs recorded, as step 3d would leave them. */
export function withRunOutputs(g: GuidedState, chemicals: readonly ChemicalData[]): GuidedState {
  const outputs: GuidedState['outputs'] = {};
  for (const r of runAll(jobsOf(g, chemicals))) {
    for (const [feed, value] of Object.entries(r.outputs)) {
      (outputs[feed] ??= {})[r.chemicalId] = { inputsHash: 'test', value };
    }
  }
  return { ...g, outputs };
}
