import { buildProject, defaultScreens, type Project } from '../project';
import type { ChemicalData } from '../guided/derive';
import { BENZENE, MTBE, guidedWith, setValue } from '../guided/forms.testkit';
import { outputHashes } from '../guided/hash';
import { jobsOf, runAll } from '../guided/run';
import type { GuidedState } from '../guided/state';
import type { VaporChemicalRow } from '../vapor/chemicals';

export { BENZENE, MTBE };

const NOW = new Date('2026-10-27T12:00:00.000Z');

export const chemicalData = (rows: readonly VaporChemicalRow[]): ChemicalData[] => [
  { id: BENZENE, name: 'Benzene', fate: rows.find((r) => r.id === BENZENE) },
  { id: MTBE, name: 'MTBE', fate: rows.find((r) => r.id === MTBE) },
];

/**
 * Groundwater with benzene below a reporting limit of 0.5 mg/L and MTBE at 4 mg/L, carried to a well (the
 * groundwater transport model, then the shower and irrigation model), for forward risk.
 */
export const wellSite = (patch?: (g: GuidedState) => void): GuidedState =>
  guidedWith((x) => {
    x.site.sources = ['groundwater'];
    x.site.paths.well = true;
    setValue(x, BENZENE, 'groundwater', '<0.5', 'mg/L');
    setValue(x, MTBE, 'groundwater', '4', 'mg/L');
    patch?.(x);
  });

/**
 * The state as step 3d leaves it after a Run: each output with the live hash of its inputs, and the Run's
 * notes (problems, the hash of each output it could not produce, and each non-detect it substituted).
 */
export function afterRun(g: GuidedState, chemicals: readonly ChemicalData[]): GuidedState {
  const live = outputHashes(g, chemicals);
  const jobs = jobsOf(g, chemicals);
  const outputs: GuidedState['outputs'] = {};
  const runNotes: GuidedState['runNotes'] = {};
  runAll(jobs).forEach((r, i) => {
    const feeds: Record<string, string> = {};
    for (const feed of jobs[i]!.plan.outputs) {
      const value = r.outputs[feed];
      const hash = live[feed]?.[r.chemicalId] ?? '';
      if (value === undefined) feeds[feed] = hash;
      else (outputs[feed] ??= {})[r.chemicalId] = { inputsHash: hash, value };
    }
    const subs = jobs[i]!.substitutions;
    runNotes[r.chemicalId] = {
      problems: r.problems,
      feeds,
      ...(subs.length > 0 ? { substitutions: subs } : {}),
    };
  });
  return { ...g, outputs, runNotes };
}

export function guidedProject(g: GuidedState): Project {
  return buildProject({
    screens: defaultScreens(),
    guided: g,
    chemicals: [
      { id: BENZENE, name: 'Benzene' },
      { id: MTBE, name: 'MTBE' },
    ],
    createdWith: '0.0.1',
    now: NOW,
  });
}
