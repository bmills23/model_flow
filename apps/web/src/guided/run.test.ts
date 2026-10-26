import { beforeAll, describe, expect, it } from 'vitest';
import { loadVaporChemicals, type VaporChemicalRow } from '../vapor/chemicals';
import { toScenario as transportScenario } from '../transport/form';
import { compute as transportCompute } from '../transport/compute';
import { buildBankFeed, buildWaterTableFeed, buildWellFeed } from '../transport/sendBuild';
import { toScenario as saturatedScenario, isCaseA } from '../saturated/form';
import { compute as saturatedCompute } from '../saturated/compute';
import { buildSaturatedFeed, buildSaturatedVaporFeed } from '../saturated/sendBuild';
import { isR7Case, toScenario as vadoseScenario } from '../vadose/form';
import { compute as vadoseCompute } from '../vadose/compute';
import { buildVadoseFeed } from '../vadose/sendBuild';
import { toInputs } from '../vapor/form';
import { runVapor } from '../vapor/compute';
import { vaporEpcs } from '../vapor/series';
import { DEFAULT_OUTDOOR } from '../vapor/outdoor';
import { buildVaporRiskFeed } from '../vapor/sendBuild';
import { toRequest } from '../surfaceWater/inputs';
import { compute as surfaceCompute } from '../surfaceWater/compute';
import { buildSurfaceWaterFeed } from '../surfaceWater/sendBuild';
import { buildHouseholdFeed } from '../household/feed';
import type { HouseholdForm } from '../household/form';
import { stableStringify } from '../project/hash';
import { readGuidedOutputs } from './outputs';
import { fromProject, toProject, type GuidedProject } from './project';
import { defaultGuided, type GuidedState } from './state';
import { deriveChemical, runPlan, type ChemicalData, type DerivedChemical } from './derive';
import { jobsOf, runAll, runChemical, type ChemicalRun } from './run';

let rows: VaporChemicalRow[] = [];
beforeAll(async () => {
  rows = await loadVaporChemicals();
});
const BENZENE = '71-43-2';
const MTBE = '1634-04-4';
const chem = (id: string, name: string): ChemicalData => ({
  id,
  name,
  fate: rows.find((r) => r.id === id)!,
});
const CHEMS = (): ChemicalData[] => [chem(BENZENE, 'Benzene'), chem(MTBE, 'MTBE')];

// Test inputs only; none of these is a sourced default.
const HOUSEHOLD: Partial<HouseholdForm> = {
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

// the transport screen asks for the three dispersivities; test values
const DISPERSIVITY = { alphaLOverride: '10', alphaTOverride: '1', alphaVOverride: '0.1' };

// a groundwater source under custom strata needs the capillary zone entered; test values
const CAPILLARY = { capHeight: '0.2', capPorosity: '0.35', capMoisture: '0.25' };

const value = (g: GuidedState, id: string, medium: string, v: string, unit: string): void => {
  g.sources[id] ??= { values: {}, note: '', tph: '' };
  (g.sources[id].values as Record<string, { value: string; unit: string }>)[medium] = {
    value: v,
    unit,
  };
};
const guidedWith = (patch: (g: GuidedState) => void): GuidedState => {
  const g = defaultGuided();
  // 32 one-year steps: the workbench's own curve, so a guided output can equal a workbench send
  g.run = { timeYr: '32', stepYr: '1', sourceYr: '', basis: 'modern' };
  g.forms.household = HOUSEHOLD;
  g.forms.transport = DISPERSIVITY;
  g.forms.vapor = CAPILLARY;
  patch(g);
  return g;
};
const derive = (g: GuidedState, c: ChemicalData): DerivedChemical =>
  deriveChemical(g, runPlan(g)!, c);
const runOne = (g: GuidedState, c: ChemicalData): ChemicalRun => runChemical(jobsOf(g, [c])[0]!);

const keys = (r: ChemicalRun): string[] => Object.keys(r.outputs).sort();

/** The outputs through the project file and back: each one a slot its feed accepts, unchanged. */
const expectStored = (g: GuidedState, r: ChemicalRun): void => {
  const withOutputs: GuidedState = { ...g, outputs: {} };
  for (const [feed, v] of Object.entries(r.outputs)) {
    withOutputs.outputs[feed] = { [r.chemicalId]: { inputsHash: '00000000', value: v } };
  }
  const saved = JSON.parse(JSON.stringify(toProject(withOutputs))) as GuidedProject;
  const read = readGuidedOutputs(saved.outputs);
  expect(read.dropped).toEqual([]);
  expect(Object.keys(read.kept).sort()).toEqual(keys(r));
  // equal as JSON (a stored -0 reads back as 0)
  expect(stableStringify(fromProject(saved).outputs)).toBe(stableStringify(withOutputs.outputs));
};

describe('the Run walks the chain for each chemical', () => {
  it('groundwater to a well and a downgradient building', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['groundwater'];
      x.site.paths.well = true;
      x.site.paths.building = true;
      x.site.location = 'downgradient';
      value(x, BENZENE, 'groundwater', '2', 'mg/L');
      value(x, MTBE, 'groundwater', '500', 'ug/L');
    });
    const runs = runAll(jobsOf(g, CHEMS()));
    for (const r of runs) {
      expect(r.problems).toEqual([]);
      expect(keys(r)).toEqual(['household', 'vaporRisk', 'vaporWaterTable', 'well']);
      expectStored(g, r);
    }
    expect(runs.map((r) => r.chemicalId)).toEqual([BENZENE, MTBE]);
  });

  it('soil below the water table to a well and a building', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['soilBelow'];
      x.site.paths.well = true;
      x.site.paths.building = true;
      value(x, BENZENE, 'soilBelow', '50', 'mg/kg');
    });
    const r = runOne(g, chem(BENZENE, 'Benzene'));
    expect(r.problems).toEqual([]);
    expect(keys(r)).toEqual(['household', 'saturated', 'vaporRisk', 'vaporSaturated', 'well']);
  });

  it('groundwater to a stream', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['groundwater'];
      x.site.paths.stream = true;
      value(x, BENZENE, 'groundwater', '1', 'mg/L');
    });
    const r = runOne(g, chem(BENZENE, 'Benzene'));
    expect(r.problems).toEqual([]);
    // the chain also keeps the receptor well series of the run that reaches the stream
    expect(keys(r)).toEqual(['bank', 'household', 'surfaceWater', 'well']);
    expectStored(g, r);
  }, 60_000);

  it('soil gas to an onsite building with groundwater to a well', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['groundwater', 'soilGas'];
      x.site.paths.well = true;
      x.site.paths.building = true;
      value(x, BENZENE, 'groundwater', '1', 'mg/L');
      value(x, BENZENE, 'soilGas', '20', 'mg/m3');
    });
    const r = runOne(g, chem(BENZENE, 'Benzene'));
    expect(r.problems).toEqual([]);
    expect(keys(r)).toEqual(['household', 'vaporRisk', 'well']);
    // the vapor screen sending its entered soil gas source
    const vf = derive(g, chem(BENZENE, 'Benzene')).forms.vapor!;
    const vp = toInputs(vf);
    if (!vp.ok) throw new Error(vp.errors.join('; '));
    expect(r.outputs['vaporRisk']).toEqual(
      buildVaporRiskFeed({
        form: vf,
        formValid: true,
        shownParsed: vp,
        shown: runVapor(vp),
        outdoorForm: DEFAULT_OUTDOOR,
        method: vf.method,
        chemical: { id: BENZENE, name: 'Benzene' },
        refusedChoice: false,
        active: null,
        feedEpcs: null,
      }),
    );
  });

  it('a missing value stops that chemical only, and names the model and the chemical', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['groundwater'];
      x.site.paths.well = true;
      value(x, BENZENE, 'groundwater', '1', 'mg/L');
    });
    const [b, m] = runAll(jobsOf(g, CHEMS()));
    expect(keys(b!)).toEqual(['household', 'well']);
    expect(keys(m!)).toEqual([]);
    expect(m!.problems.map((p) => p.model)).toEqual(['transport', 'household']);
    expect(m!.problems[0]!.message).toMatch(/MTBE/);
    expect(m!.problems[1]!.message).toMatch(/groundwater transport/);
  });

  it('a template the model refuses is reported with the model, not thrown', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['groundwater'];
      x.site.paths.well = true;
      x.forms.transport = { ...DISPERSIVITY, porosity: '2' };
      value(x, BENZENE, 'groundwater', '1', 'mg/L');
    });
    const r = runOne(g, chem(BENZENE, 'Benzene'));
    expect(keys(r)).toEqual([]);
    expect(r.problems[0]!.model).toBe('transport');
    expect(r.problems[0]!.message).toMatch(/Porosity/);
  });

  it('reports progress after each chemical', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['groundwater'];
      x.site.paths.building = true;
      value(x, BENZENE, 'groundwater', '1', 'mg/L');
      value(x, MTBE, 'groundwater', '1', 'mg/L');
    });
    const seen: string[] = [];
    runAll(jobsOf(g, CHEMS()), (p) => seen.push(`${p.done}/${p.total} ${p.chemicalId}`));
    expect(seen).toEqual([`1/2 ${BENZENE}`, `2/2 ${MTBE}`]);
  });

  it('every output stands on its own as a stored slot of its feed', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['soilBelow'];
      x.site.paths.well = true;
      x.site.paths.building = true;
      value(x, BENZENE, 'soilBelow', '50', 'mg/kg');
    });
    expectStored(g, runOne(g, chem(BENZENE, 'Benzene')));
  });
});

describe('a guided output equals the workbench send of the same inputs', () => {
  it('well, water table and indoor air from the water table series', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['groundwater'];
      x.site.paths.well = true;
      x.site.paths.building = true;
      x.site.location = 'downgradient';
      x.forms.transport = {
        ...DISPERSIVITY,
        rx: '60',
        thicknessMode: 'finite',
        thickness: '12',
        width: '80',
      };
      value(x, BENZENE, 'groundwater', '3', 'mg/L');
    });
    const c = chem(BENZENE, 'Benzene');
    const d = derive(g, c);
    const r = runOne(g, c);

    // the groundwater screen with the derived form: its scenario, run and send buttons
    const tf = d.forms.transport!;
    const parsed = transportScenario(tf);
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    const out = transportCompute({
      scenario: parsed.scenario,
      mapMethod: tf.mapMethod,
      domenico: tf.showDomenico,
    });
    if (!out.ok) throw new Error(out.error);
    const well = buildWellFeed({
      method: 'modern',
      result: out.result,
      scenario: parsed.scenario,
      timeYr: tf.timeYr,
      chemicalId: tf.chemicalId,
    });
    expect(r.outputs['well']).toEqual(well);
    const table = buildWaterTableFeed({
      scenario: parsed.scenario,
      method: 'modern',
      timeYr: tf.timeYr,
      chemicalId: tf.chemicalId,
    });
    expect(r.outputs['vaporWaterTable']).toEqual(table);

    // the vapor screen with the derived form and the water table source chosen
    const vf = d.forms.vapor!;
    const vp = toInputs(vf);
    if (!vp.ok) throw new Error(vp.errors.join('; '));
    const shown = runVapor(vp);
    const risk = buildVaporRiskFeed({
      form: vf,
      formValid: true,
      shownParsed: vp,
      shown,
      outdoorForm: DEFAULT_OUTDOOR,
      method: vf.method,
      chemical: { id: BENZENE, name: 'Benzene' },
      refusedChoice: false,
      active: table,
      feedEpcs: vaporEpcs(vf, vp, table, DEFAULT_OUTDOOR),
    });
    expect(risk).not.toBeNull();
    expect(r.outputs['vaporRisk']).toEqual(risk);

    // the household screen holding the well series
    const hh = buildHouseholdFeed(d.forms.household!, { well, surface: null });
    if (!hh.ok) throw new Error(hh.reasons.join('; '));
    expect(r.outputs['household']).toEqual(hh.feed);
  });

  it('saturated source, its pore water as the vapor source, and the well it feeds', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['soilBelow'];
      x.site.paths.well = true;
      x.site.paths.building = true;
      x.run.basis = 'legacy';
      value(x, BENZENE, 'soilBelow', '80', 'mg/kg');
    });
    const c = chem(BENZENE, 'Benzene');
    const d = derive(g, c);
    const r = runOne(g, c);

    const sf = d.forms.saturated!;
    const sp = saturatedScenario(sf);
    if (!sp.ok) throw new Error(sp.errors.join('; '));
    const so = saturatedCompute({ scenario: sp.scenario });
    if (!so.ok) throw new Error(so.error);
    const sat = buildSaturatedFeed({
      input: sp.scenario.input,
      method: 'legacy',
      caseA: isCaseA(sf),
      chemicalId: BENZENE,
    });
    expect(r.outputs['saturated']).toEqual(sat);
    const satVapor = buildSaturatedVaporFeed({
      run: so.result.runs.legacy!,
      method: 'legacy',
      caseA: isCaseA(sf),
      chemicalId: BENZENE,
    });
    expect(r.outputs['vaporSaturated']).toEqual(satVapor);

    const tf = d.forms.transport!;
    const tp = transportScenario(tf, null, sat);
    if (!tp.ok) throw new Error(tp.errors.join('; '));
    const to = transportCompute({ scenario: tp.scenario, mapMethod: 'legacy', domenico: false });
    if (!to.ok) throw new Error(to.error);
    expect(r.outputs['well']).toEqual(
      buildWellFeed({
        method: 'legacy',
        result: to.result,
        scenario: tp.scenario,
        timeYr: tf.timeYr,
        chemicalId: BENZENE,
      }),
    );
  });

  it('the vadose leaching result and the well it feeds', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['soilAbove'];
      x.site.paths.leaching = true;
      x.site.paths.well = true;
      x.forms.vadose = { alphaL: '0.5' };
      value(x, MTBE, 'soilAbove', '100', 'mg/kg');
    });
    const c = chem(MTBE, 'MTBE');
    const d = derive(g, c);
    const r = runOne(g, c);
    expect(r.problems).toEqual([]);
    expect(keys(r)).toEqual(['household', 'vadose', 'well']);
    expectStored(g, r);

    // the vadose screen: its run, then "use as source" for the method shown
    const vf = d.forms.vadose!;
    const vp = vadoseScenario(vf);
    if (!vp.ok) throw new Error(vp.errors.join('; '));
    const vo = vadoseCompute({ scenario: vp.scenario });
    if (!vo.ok) throw new Error(vo.error);
    const vadose = buildVadoseFeed({
      scenario: vp.scenario,
      method: vo.result.runs[vf.method]!.method,
      r7: isR7Case(vf),
      chemicalId: MTBE,
    });
    expect(r.outputs['vadose']).toEqual(vadose);

    const tf = d.forms.transport!;
    const tp = transportScenario(tf, vadose);
    if (!tp.ok) throw new Error(tp.errors.join('; '));
    const to = transportCompute({ scenario: tp.scenario, mapMethod: 'modern', domenico: false });
    if (!to.ok) throw new Error(to.error);
    expect(r.outputs['well']).toEqual(
      buildWellFeed({
        method: 'modern',
        result: to.result,
        scenario: tp.scenario,
        timeYr: tf.timeYr,
        chemicalId: MTBE,
      }),
    );
  }, 120_000);

  it('surface water linked to the transport run at the bank', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['groundwater'];
      x.site.paths.stream = true;
      x.run.basis = 'legacy';
      value(x, MTBE, 'groundwater', '4', 'mg/L');
    });
    const c = chem(MTBE, 'MTBE');
    const d = derive(g, c);
    const r = runOne(g, c);
    const tp = transportScenario(d.forms.transport!);
    if (!tp.ok) throw new Error(tp.errors.join('; '));
    const bank = buildBankFeed({ scenario: tp.scenario, timeYr: '32', chemicalId: MTBE });
    expect(r.outputs['bank']).toEqual(bank);
    const req = toRequest(d.forms.surfaceWater!, bank);
    if (!req.ok) throw new Error(req.errors.join('; '));
    const so = surfaceCompute(req.request);
    if (!so.ok) throw new Error(so.error);
    expect(r.outputs['surfaceWater']).toEqual(
      buildSurfaceWaterFeed({
        result: so.result,
        request: req.request,
        method: 'well-mixed',
        chemicalId: MTBE,
      }),
    );
  }, 60_000);
});
