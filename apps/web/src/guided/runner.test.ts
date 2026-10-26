import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { forgetMemory, getGuided, setGuided } from '../project/store';
import { loadVaporChemicals, type VaporChemicalRow } from '../vapor/chemicals';
import { defaultGuided, type GuidedState } from './state';
import type { ChemicalData } from './derive';
import { outputHashes } from './hash';
import { fromProject, toProject } from './project';
import { hashOutputCheck } from './status';
import { runMessages, type RunMessage } from './run';
import { createGuidedRunner, prepareRun, runGuided, type GuidedRunner } from './runner';

let rows: VaporChemicalRow[] = [];
beforeAll(async () => {
  rows = await loadVaporChemicals();
});
let runner: GuidedRunner;
beforeEach(() => {
  forgetMemory();
  runner = createGuidedRunner();
});
afterEach(() => {
  runner.dispose();
  forgetMemory();
});

const BENZENE = '71-43-2';
const MTBE = '1634-04-4';
const data = (): ChemicalData[] => [
  { id: BENZENE, name: 'Benzene', fate: rows.find((r) => r.id === BENZENE) },
  { id: MTBE, name: 'MTBE', fate: rows.find((r) => r.id === MTBE) },
];

/** Groundwater under an onsite building: one indoor air output per chemical, quick to run. */
const building = (): GuidedState => {
  const g = defaultGuided();
  g.site.sources = ['groundwater'];
  g.site.paths.building = true;
  g.forms.vapor = { capHeight: '0.2', capPorosity: '0.35', capMoisture: '0.25' };
  for (const id of [BENZENE, MTBE]) {
    g.sources[id] = { values: { groundwater: { value: '1', unit: 'mg/L' } }, note: '', tph: '' };
  }
  return g;
};

describe('runGuided', () => {
  it('runs every chemical, reports progress after each, and records outputs with their hashes', async () => {
    setGuided(building());
    const progress: string[] = [];
    const runs = await runGuided(runner, data(), (p) =>
      progress.push(`${p.done} of ${p.total}: ${p.chemicalId}`),
    );
    expect(runs).not.toBeNull();
    expect(progress).toEqual([`1 of 2: ${BENZENE}`, `2 of 2: ${MTBE}`]);
    const g = getGuided();
    expect(Object.keys(g.outputs)).toEqual(['vaporRisk']);
    const check = hashOutputCheck(g.outputs, outputHashes(g, data()));
    expect(check('vaporRisk', BENZENE)).toBe('current');
    expect(check('vaporRisk', MTBE)).toBe('current');
  });

  it('drops outputs of a path the site model no longer uses, and of chemicals no longer listed', async () => {
    const g = building();
    g.outputs = {
      well: { [BENZENE]: { inputsHash: 'old00001', value: { chemicalId: BENZENE } } },
      vaporRisk: { 'gone-1': { inputsHash: 'old00002', value: { chemicalId: 'gone-1' } } },
    };
    setGuided(g);
    await runGuided(runner, data());
    const out = getGuided().outputs;
    expect(Object.keys(out)).toEqual(['vaporRisk']);
    expect(Object.keys(out['vaporRisk']!).sort()).toEqual([BENZENE, MTBE].sort());
  });

  it('records the hashes of the inputs it started from, so an edit made while it runs reads stale', async () => {
    setGuided(building());
    const pending = runGuided(runner, data());
    const edited = structuredClone(getGuided());
    edited.sources[BENZENE]!.values.groundwater = { value: '3', unit: 'mg/L' };
    setGuided(edited);
    await pending;
    const g = getGuided();
    expect(g.sources[BENZENE]!.values.groundwater!.value).toBe('3');
    const check = hashOutputCheck(g.outputs, outputHashes(g, data()));
    expect(check('vaporRisk', BENZENE)).toBe('stale');
    expect(check('vaporRisk', MTBE)).toBe('current');
  });

  it('a newer Run supersedes the older one, which writes nothing', async () => {
    setGuided(building());
    const first = runGuided(runner, data());
    const g = structuredClone(getGuided());
    g.site.indoorModel = 'legacy';
    setGuided(g);
    const second = runGuided(runner, data());
    expect(await first).toBeNull();
    const runs = await second;
    expect(runs?.map((r) => r.chemicalId)).toEqual([BENZENE, MTBE]);
    const out = getGuided().outputs['vaporRisk']![BENZENE]!.value as { label: string };
    expect(out.label).toMatch(/Legacy/);
  });

  it('a Run in which every chemical fails keeps the reasons with the project and reads blocked, not missing', async () => {
    const g = building();
    g.sources[BENZENE] = { values: {}, note: '', tph: '' };
    g.sources[MTBE] = { values: {}, note: '', tph: '' };
    setGuided(g);
    const runs = await runGuided(runner, data());
    expect(runs).not.toBeNull();
    const after = getGuided();
    expect(after.outputs).toEqual({});
    expect(after.runNotes[BENZENE]?.problems[0]?.message).toMatch(/no usable groundwater/);
    expect(after.runNotes[MTBE]?.problems).toHaveLength(1);
    const check = hashOutputCheck(after.outputs, outputHashes(after, data()), after.runNotes);
    expect(check('vaporRisk', BENZENE)).toBe('blocked');
    // the reasons survive a save and a load
    expect(fromProject(toProject(after)).runNotes).toEqual(after.runNotes);
    // an edit that changes the model's inputs makes the old reason stale
    after.sources[BENZENE] = {
      values: { groundwater: { value: '1', unit: 'mg/L' } },
      note: '',
      tph: '',
    };
    const edited = hashOutputCheck(after.outputs, outputHashes(after, data()), after.runNotes);
    expect(edited('vaporRisk', BENZENE)).toBe('missing');
  });

  it('starts nothing and changes nothing while step 2 or a run setting has a problem', async () => {
    const g = building();
    g.run.stepYr = '0';
    g.outputs = { vaporRisk: { [BENZENE]: { inputsHash: 'keep0001', value: {} } } };
    setGuided(g);
    expect(prepareRun(getGuided(), data()).problems).toEqual([
      'The time step must be a number of years above zero.',
    ]);
    expect(await runGuided(runner, data())).toBeNull();
    expect(getGuided().outputs).toEqual(g.outputs);
  });
});

describe('the worker protocol', () => {
  it('posts progress after each chemical, then the runs', () => {
    const posted: RunMessage[] = [];
    runMessages(prepareRun(building(), data()).jobs, (m) => posted.push(m));
    expect(posted.map((m) => ('progress' in m ? `progress ${m.progress.done}` : 'done'))).toEqual([
      'progress 1',
      'progress 2',
      'done',
    ]);
    const last = posted[2]!;
    expect('ok' in last && last.ok && last.runs.length).toBe(2);
  });
});
