import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { forgetMemory, getGuided, setGuided } from '../project/store';
import { loadVaporChemicals, type VaporChemicalRow } from '../vapor/chemicals';
import { defaultGuided, type GuidedState } from './state';
import { deriveChemical, runPlan, type ChemicalData } from './derive';
import { outputHashes } from './hash';
import { fromProject, toProject } from './project';
import { hashOutputCheck } from './status';
import { propertiesComplete, propertyView, setProperty } from './propertyCatalog';
import { jobsOf, runChemical } from './run';
import { createGuidedRunner, prepareRun, runGuided, type GuidedRunner } from './runner';

/** Wave AC2 polish A: non-detects, household blanks, simulation time and the missing Koc message. */

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
const row = (id: string): VaporChemicalRow => rows.find((r) => r.id === id)!;
const data = (): ChemicalData[] => [
  { id: BENZENE, name: 'Benzene', fate: row(BENZENE) },
  { id: MTBE, name: 'MTBE', fate: row(MTBE) },
];

const put = (g: GuidedState, id: string, medium: string, value: string, unit: string): void => {
  g.sources[id] ??= { values: {}, note: '', tph: '' };
  (g.sources[id].values as Record<string, { value: string; unit: string }>)[medium] = {
    value,
    unit,
  };
};

/** Groundwater under an onsite building: one indoor air output per chemical, quick to run. */
const building = (): GuidedState => {
  const g = defaultGuided();
  g.site.sources = ['groundwater'];
  g.site.paths.building = true;
  g.forms.vapor = { capHeight: '0.2', capPorosity: '0.35', capMoisture: '0.25' };
  put(g, BENZENE, 'groundwater', '1', 'mg/L');
  put(g, MTBE, 'groundwater', '1', 'mg/L');
  return g;
};

/** A groundwater well with the transport screen's own dispersivities, and no household values. */
const well = (): GuidedState => {
  const g = defaultGuided();
  g.run = { timeYr: '32', stepYr: '1', sourceYr: '', basis: 'modern' };
  g.site.sources = ['groundwater'];
  g.site.paths.well = true;
  g.forms.transport = { alphaLOverride: '10', alphaTOverride: '1', alphaVOverride: '0.1' };
  put(g, BENZENE, 'groundwater', '1', 'mg/L');
  put(g, MTBE, 'groundwater', '1', 'mg/L');
  return g;
};

describe('non-detects in the Run', () => {
  it('counts a value below the reporting limit as half the limit, and ND as zero', () => {
    const g = building();
    put(g, BENZENE, 'groundwater', '<0.5', 'ug/L');
    put(g, MTBE, 'groundwater', 'ND', 'ug/L');
    const plan = runPlan(g)!;
    const b = deriveChemical(g, plan, data()[0]!);
    expect(b.forms.vapor!.cgw).toBe('0.00025');
    expect(b.problems).toEqual([]);
    const m = deriveChemical(g, plan, data()[1]!);
    expect(m.forms.vapor!.cgw).toBe('0');
  });

  it('lists each substitution per chemical and medium in plain words with the unit', () => {
    const g = building();
    put(g, BENZENE, 'groundwater', '<0.5', 'ug/L');
    put(g, MTBE, 'groundwater', 'ND', 'ug/L');
    const plan = runPlan(g)!;
    expect(deriveChemical(g, plan, data()[0]!).substitutions).toEqual([
      'Benzene in groundwater was below the reporting limit of 0.5 ug/L and was counted as 0.25 ug/L, half the limit.',
    ]);
    expect(deriveChemical(g, plan, data()[1]!).substitutions).toEqual([
      'MTBE in groundwater was not detected and was counted as zero.',
    ]);
    // a medium the chain does not read is not listed
    put(g, BENZENE, 'soilAbove', '<10', 'ug/kg');
    expect(deriveChemical(g, plan, data()[0]!).substitutions).toHaveLength(1);
  });

  it('keeps the substitutions in the Run notes, saved with the project', async () => {
    const g = building();
    put(g, BENZENE, 'groundwater', '<0.5', 'ug/L');
    setGuided(g);
    await runGuided(runner, data());
    const after = getGuided();
    expect(Object.keys(after.outputs['vaporRisk']!)).toEqual([BENZENE, MTBE]);
    expect(after.runNotes[BENZENE]?.substitutions).toEqual([
      'Benzene in groundwater was below the reporting limit of 0.5 ug/L and was counted as 0.25 ug/L, half the limit.',
    ]);
    expect(after.runNotes[BENZENE]?.problems).toEqual([]);
    // MTBE had a plain number: no note
    expect(after.runNotes[MTBE]).toBeUndefined();
    expect(fromProject(toProject(after)).runNotes).toEqual(after.runNotes);
  });

  it('a changed limit marks that chemical to run again; a changed limit text with the same half does not', () => {
    const base = building();
    put(base, BENZENE, 'groundwater', '<0.5', 'ug/L');
    const before = outputHashes(base, data());
    const changed = structuredClone(base);
    put(changed, BENZENE, 'groundwater', '<1', 'ug/L');
    const after = outputHashes(changed, data());
    expect(after['vaporRisk']![BENZENE]).not.toBe(before['vaporRisk']![BENZENE]);
    expect(after['vaporRisk']![MTBE]).toBe(before['vaporRisk']![MTBE]);
    // ND (zero) is not the same input as a limit
    const nd = structuredClone(base);
    put(nd, BENZENE, 'groundwater', 'ND', 'ug/L');
    expect(outputHashes(nd, data())['vaporRisk']![BENZENE]).not.toBe(before['vaporRisk']![BENZENE]);
  });

  it('a below-the-limit TPH value stops the models that read it, like any unreadable TPH', () => {
    const g = defaultGuided();
    g.site.sources = ['soilAbove'];
    g.site.paths.leaching = true;
    put(g, BENZENE, 'soilAbove', '<5', 'mg/kg');
    g.sources[BENZENE]!.tph = '<5';
    const d = deriveChemical(g, runPlan(g)!, data()[0]!);
    expect(d.problems.some((p) => /TPH/.test(p.message))).toBe(true);
    expect(d.forms.vadose!.srcF).toBe('2.5');
  });
});

describe('household shower inputs', () => {
  it('step 3a lists them as needed while blank, and is not done until they are entered', () => {
    const g = well();
    g.forms.transport = { alphaLOverride: '10', alphaTOverride: '1', alphaVOverride: '0.1' };
    const household = propertyView(g).groups.find((x) => x.id === 'household')!;
    const needed = household.fields.filter((f) => f.needed).map((f) => f.field.label);
    expect(needed).toContain('Shower droplet diameter');
    expect(needed).toContain('Shower duration');
    expect(propertiesComplete(g)).toBe(false);
    let filled = g;
    for (const f of household.fields) if (f.needed) filled = setProperty(filled, f.field.id, '1');
    for (const f of propertyView(filled).groups.flatMap((x) => x.fields)) {
      if (f.needed) filled = setProperty(filled, f.field.id, '1');
    }
    expect(propertiesComplete(filled)).toBe(true);
    expect(runPlan(filled)!.householdBlanks).toEqual([]);
  });

  it('a blank household input blocks the household output with a reason naming the blank inputs', () => {
    const g = well();
    const r = runChemical(jobsOf(g, data().slice(0, 1))[0]!);
    expect(Object.keys(r.outputs)).toEqual(['well']);
    const p = r.problems.filter((x) => x.model === 'household');
    expect(p).toHaveLength(1);
    expect(p[0]!.message).toMatch(/Benzene/);
    expect(p[0]!.message).toMatch(/step 3a/);
    expect(p[0]!.message).toMatch(/Shower droplet diameter/);
    expect(p[0]!.message).toMatch(/Shower duration/);
    expect(p[0]!.message).not.toMatch(/No household result computes/);
  });

  it('reads blocked, with an alert-able note, not "no result yet"', async () => {
    setGuided(well());
    await runGuided(runner, data());
    const after = getGuided();
    expect(after.runNotes[BENZENE]?.problems.map((p) => p.model)).toEqual(['household']);
    expect(Object.keys(after.runNotes[BENZENE]!.feeds)).toEqual(['household']);
    expect(prepareRun(after, data()).jobs[0]!.problems[0]!.message).toMatch(/Shower water flow/);
    const check = hashOutputCheck(after.outputs, outputHashes(after, data()), after.runNotes);
    expect(check('household', BENZENE)).toBe('blocked');
  });

  it('runs the household model once the inputs are entered', () => {
    const g = well();
    g.forms.household = {
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
    const r = runChemical(jobsOf(g, data().slice(0, 1))[0]!);
    expect(r.problems).toEqual([]);
    expect(Object.keys(r.outputs).sort()).toEqual(['household', 'well']);
  });
});

describe('the run plan validates the simulation time', () => {
  it.each(['', '  ', '0', '-5', 'abc', '1,5'])('stops the Run for %j', (time) => {
    const g = building();
    g.run.timeYr = time;
    const plan = runPlan(g)!;
    expect(plan.problems).toEqual(['The simulation time must be a number of years above zero.']);
    expect(prepareRun(g, data()).problems).toEqual(plan.problems);
    expect(jobsOf(g, data())).toEqual([]);
  });

  it('names both settings when both are unreadable', () => {
    const g = building();
    g.run.timeYr = '0';
    g.run.stepYr = '0';
    expect(runPlan(g)!.problems).toHaveLength(2);
  });

  it('accepts a number', () => {
    const g = building();
    g.run.timeYr = '30';
    expect(runPlan(g)!.problems).toEqual([]);
  });
});

describe('a missing Koc for transport', () => {
  it('says what is missing, for which chemical and where to enter it', () => {
    const g = well();
    const rest = { ...row(BENZENE).rsl };
    delete rest.koc;
    const d = deriveChemical(g, runPlan(g)!, {
      id: BENZENE,
      name: 'Benzene',
      fate: { ...row(BENZENE), rsl: rest },
    });
    const t = d.problems.find((p) => p.model === 'transport');
    expect(t?.message).toBe(
      'Benzene has no organic carbon partition coefficient (Koc) in the database, so the groundwater transport model cannot run for it. Enter the value in step 3c.',
    );
  });

  it('the indoor air message from soil uses the same words, not the internal key', () => {
    const g = defaultGuided();
    g.site.sources = ['soilAbove'];
    g.site.paths.building = true;
    put(g, BENZENE, 'soilAbove', '10', 'mg/kg');
    const rest = { ...row(BENZENE).rsl };
    delete rest.koc;
    const d = deriveChemical(g, runPlan(g)!, {
      id: BENZENE,
      name: 'Benzene',
      fate: { ...row(BENZENE), rsl: rest },
    });
    const v = d.problems.find((p) => p.model === 'vapor');
    expect(v?.message).toMatch(/organic carbon partition coefficient \(Koc\)/);
    expect(v?.message).not.toMatch(/ no koc /);
  });
});
