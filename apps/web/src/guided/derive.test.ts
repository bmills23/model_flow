import { beforeAll, describe, expect, it } from 'vitest';
import { loadVaporChemicals, type VaporChemicalRow } from '../vapor/chemicals';
import { DEFAULT_FORM as TRANSPORT_DEFAULT } from '../transport/form';
import { kdText } from '../transport/chemicalFill';
import { defaultGuided, type GuidedState } from './state';
import { volatileVerdict } from '../household/compute';
import { deriveChemical, runPlan, type ChemicalData } from './derive';

let rows: VaporChemicalRow[] = [];
beforeAll(async () => {
  rows = await loadVaporChemicals();
});
const row = (id: string): VaporChemicalRow => rows.find((r) => r.id === id)!;
const BENZENE = '71-43-2';
const MTBE = '1634-04-4';
const chem = (id: string, name: string): ChemicalData => ({ id, name, fate: row(id) });

const guidedWith = (patch: (g: GuidedState) => void): GuidedState => {
  const g = defaultGuided();
  patch(g);
  return g;
};
const value = (g: GuidedState, id: string, medium: string, v: string, unit: string): void => {
  g.sources[id] ??= { values: {}, note: '', tph: '' };
  (g.sources[id].values as Record<string, { value: string; unit: string }>)[medium] = {
    value: v,
    unit,
  };
};

describe('runPlan', () => {
  it('is null while step 2 has a problem', () => {
    expect(runPlan(defaultGuided())).toBeNull();
  });

  it('follows the chain: groundwater to a well, downgradient building on the water table', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['groundwater'];
      x.site.paths.well = true;
      x.site.paths.building = true;
      x.site.location = 'downgradient';
    });
    const plan = runPlan(g)!;
    expect(plan.models).toEqual(['transport', 'vapor', 'household']);
    expect(plan.transportSource).toBe('groundwater');
    expect(plan.buildingSource).toBe('groundwater');
    expect(plan.outputs).toEqual(
      expect.arrayContaining(['well', 'vaporWaterTable', 'vaporRisk', 'household']),
    );
  });

  it('feeds transport from the vadose run on the leaching and well paths', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['soilAbove'];
      x.site.paths.leaching = true;
      x.site.paths.well = true;
    });
    expect(runPlan(g)!.transportSource).toBe('soilAbove');
  });

  it('maps the run settings: basis, curve steps, indoor model and surface water method', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['groundwater'];
      x.site.paths.well = true;
      x.run = { timeYr: '20', stepYr: '0.5', sourceYr: '5', basis: 'legacy' };
      x.site.indoorModel = 'oxygenLimited';
    });
    const s = runPlan(g)!.settings;
    expect(s.nCurve).toBe(40);
    expect(s.basis).toBe('legacy');
    expect(s.vaporMethod).toBe('devaull');
    expect(s.surfaceMethod).toBe('well-mixed');
  });
});

describe('deriveChemical', () => {
  const wellSite = (x: GuidedState): void => {
    x.site.sources = ['groundwater'];
    x.site.paths.well = true;
    x.forms.transport = { K: '5', foc: '0.002', rx: '80' };
  };

  it('derives one transport form per chemical from the template, its database values and 3b', () => {
    const g = guidedWith((x) => {
      wellSite(x);
      value(x, BENZENE, 'groundwater', '1200', 'ug/L');
      value(x, MTBE, 'groundwater', '3', 'mg/L');
    });
    const plan = runPlan(g)!;
    const b = deriveChemical(g, plan, chem(BENZENE, 'Benzene'));
    const m = deriveChemical(g, plan, chem(MTBE, 'MTBE'));
    expect(b.problems).toEqual([]);
    const tb = b.forms.transport!;
    expect(tb.chemicalId).toBe(BENZENE);
    expect(tb.K).toBe('5');
    expect(tb.rx).toBe('80');
    expect(tb.c0).toBe('1.2');
    expect(tb.retardMode).toBe('kd');
    expect(tb.kd).toBe(kdText(row(BENZENE).rsl.koc!.value, '0.002', ''));
    expect(tb.halfLifeYr).toBe('');
    // run settings bind the run length and the source pulse
    expect(tb.timeYr).toBe('30');
    expect(tb.loading).toBe('pulse');
    expect(tb.pulseYr).toBe('10');
    expect(tb.feedFromVadose).toBe(false);
    expect(tb.feedFromSaturated).toBe(false);
    // the template keeps the screen default where it gives nothing
    expect(tb.porosity).toBe(TRANSPORT_DEFAULT.porosity);
    expect(m.forms.transport!.c0).toBe('3');
    expect(m.forms.transport!.kd).toBe(kdText(row(MTBE).rsl.koc!.value, '0.002', ''));
  });

  it('takes a blank source duration as a continuous source', () => {
    const g = guidedWith((x) => {
      wellSite(x);
      x.run.sourceYr = '';
      value(x, BENZENE, 'groundwater', '1', 'mg/L');
    });
    expect(deriveChemical(g, runPlan(g)!, chem(BENZENE, 'Benzene')).forms.transport!.loading).toBe(
      'continuous',
    );
  });

  it('names a source duration it cannot read as a run problem, and leaves a blank one continuous', () => {
    for (const bad of ['1O', '0,5', '0', '-3']) {
      const g = guidedWith((x) => {
        wellSite(x);
        x.run.sourceYr = bad;
      });
      expect(runPlan(g)!.problems).toEqual([
        'How long the source lasts must be a number of years above zero, or blank for a source that never ends.',
      ]);
    }
    const blank = guidedWith((x) => {
      wellSite(x);
      x.run.sourceYr = '';
    });
    expect(runPlan(blank)!.problems).toEqual([]);
    // a path that never reads the duration does not complain about it
    const leach = guidedWith((x) => {
      x.site.sources = ['soilAbove'];
      x.site.paths.leaching = true;
      x.run.sourceYr = '1O';
    });
    expect(runPlan(leach)!.problems).toEqual([]);
  });

  it('names a TPH value it cannot read as a problem of each model that would use it, not a silent drop', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['soilAbove'];
      x.site.paths.leaching = true;
      x.site.paths.well = true;
      value(x, BENZENE, 'soilAbove', '250', 'mg/kg');
      x.sources[BENZENE]!.tph = '1,200';
    });
    const d = deriveChemical(g, runPlan(g)!, chem(BENZENE, 'Benzene'));
    const tphProblems = d.problems.filter((p) => /TPH/.test(p.message));
    expect(tphProblems.map((p) => p.model)).toEqual(['vadose']);
    expect(tphProblems[0]!.message).toMatch(/Benzene/);
    // blank and ND are both fine
    for (const ok of ['', 'ND']) {
      g.sources[BENZENE]!.tph = ok;
      expect(
        deriveChemical(g, runPlan(g)!, chem(BENZENE, 'Benzene')).problems.filter((p) =>
          /TPH/.test(p.message),
        ),
      ).toEqual([]);
    }
  });

  it('reads ND as zero and names a missing value as a problem of the model that needs it', () => {
    const g = guidedWith((x) => {
      wellSite(x);
      value(x, BENZENE, 'groundwater', 'ND', 'mg/L');
    });
    const plan = runPlan(g)!;
    expect(deriveChemical(g, plan, chem(BENZENE, 'Benzene')).forms.transport!.c0).toBe('0');
    const m = deriveChemical(g, plan, chem(MTBE, 'MTBE'));
    expect(m.problems).toHaveLength(1);
    expect(m.problems[0]!.model).toBe('transport');
    expect(m.problems[0]!.message).toMatch(/MTBE/);
    expect(m.problems[0]!.message).toMatch(/groundwater/i);
  });

  it('blanks the chemical fields of a model whose chemical has no database row and says so', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['soilAbove'];
      x.site.paths.leaching = true;
      value(x, 'user-1', 'soilAbove', '10', 'mg/kg');
    });
    const d = deriveChemical(g, runPlan(g)!, { id: 'user-1', name: 'My solvent' });
    expect(d.forms.vadose!.M).toBe('');
    expect(d.forms.vadose!.Koc).toBe('');
    expect(d.problems.map((p) => p.model)).toEqual(['vadose']);
    expect(d.problems[0]!.message).toMatch(/My solvent/);
  });

  it('fills the vadose form: properties, soil value, TPH, basis and run length', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['soilAbove'];
      x.site.paths.leaching = true;
      x.site.paths.well = true;
      x.run.basis = 'modern';
      value(x, BENZENE, 'soilAbove', '250', 'mg/kg');
      x.sources[BENZENE]!.tph = '4000';
    });
    const plan = runPlan(g)!;
    const d = deriveChemical(g, plan, chem(BENZENE, 'Benzene'));
    const v = d.forms.vadose!;
    expect(v.chemicalId).toBe(BENZENE);
    expect(v.M).toBe(String(row(BENZENE).rsl.mw!.value));
    expect(v.Koc).toBe(String(row(BENZENE).rsl.koc!.value));
    expect(v.srcF).toBe('250');
    expect(v.tphOn).toBe(true);
    expect(v.srcFT).toBe('4000');
    expect(v.method).toBe('modern');
    expect(v.durationYr).toBe('30');
    expect(v.mu).toBe('0');
    expect(d.forms.transport!.feedFromVadose).toBe(true);
    // a chemical with no TPH entered runs without the mixture
    const m = deriveChemical(
      guidedWith((x) => {
        Object.assign(x, g);
        value(x, MTBE, 'soilAbove', '5', 'mg/kg');
      }),
      plan,
      chem(MTBE, 'MTBE'),
    );
    expect(m.forms.vadose!.tphOn).toBe(false);
  });

  it('lays a project edit (3c) over the database value through the row it is given', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['soilAbove'];
      x.site.paths.leaching = true;
      value(x, BENZENE, 'soilAbove', '1', 'mg/kg');
    });
    const edited: VaporChemicalRow = {
      ...row(BENZENE),
      rsl: { ...row(BENZENE).rsl, koc: { value: 80 } },
    };
    const d = deriveChemical(g, runPlan(g)!, { id: BENZENE, name: 'Benzene', fate: edited });
    expect(d.forms.vadose!.Koc).toBe('80');
  });

  it('sets the vapor source by precedence and the source series it reads', () => {
    const gas = guidedWith((x) => {
      x.site.sources = ['soilGas', 'groundwater'];
      x.site.paths.well = true;
      x.site.paths.building = true;
      value(x, BENZENE, 'soilGas', '50', 'ug/m3');
      value(x, BENZENE, 'groundwater', '1', 'mg/L');
    });
    const d = deriveChemical(gas, runPlan(gas)!, chem(BENZENE, 'Benzene'));
    expect(d.forms.vapor!.source).toBe('soilGas');
    expect(d.forms.vapor!.soilGas).toBe('0.05');
    expect(d.forms.vapor!.chemicalId).toBe(BENZENE);
    expect(d.forms.vapor!.TB).toBe('353.24');

    const onsite = guidedWith((x) => {
      x.site.sources = ['groundwater'];
      x.site.paths.building = true;
      value(x, BENZENE, 'groundwater', '2', 'mg/L');
    });
    const o = deriveChemical(onsite, runPlan(onsite)!, chem(BENZENE, 'Benzene'));
    expect(o.forms.vapor!.source).toBe('groundwater');
    expect(o.forms.vapor!.cgw).toBe('2');
    expect(o.forms.transport).toBeUndefined();
  });

  it('links surface water to the transport run and takes the bank distance from the receptor', () => {
    const g = guidedWith((x) => {
      x.site.sources = ['groundwater'];
      x.site.paths.stream = true;
      x.forms.transport = { rx: '120' };
      value(x, BENZENE, 'groundwater', '1', 'mg/L');
    });
    const d = deriveChemical(g, runPlan(g)!, chem(BENZENE, 'Benzene'));
    expect(d.forms.surfaceWater!.linked).toBe(true);
    expect(d.forms.surfaceWater!.bankX).toBe('120');
    expect(d.forms.surfaceWater!.koc).toBe(String(row(BENZENE).rsl.koc!.value));
    expect(d.forms.surfaceWater!.solubility).toBe(String(row(BENZENE).rsl.s!.value));
    expect(d.forms.surfaceWater!.durationYr).toBe('30');
  });

  it('points the household water at the well series', () => {
    const g = guidedWith((x) => {
      wellSite(x);
      value(x, BENZENE, 'groundwater', '1', 'mg/L');
    });
    const h = deriveChemical(g, runPlan(g)!, chem(BENZENE, 'Benzene')).forms.household!;
    expect(h.chemicalId).toBe(BENZENE);
    expect(h.chemicalName).toBe('Benzene');
    expect(h.showerWaterSource).toBe('well');
    expect(h.irrigationWaterSource).toBe('well');
    expect(h.henry).toBe(String(row(BENZENE).rsl.hPrime!.value));
    expect(h.molecularWeight).toBe(String(row(BENZENE).rsl.mw!.value));
  });

  it('fills the Henry constant in atm m3/mol so a volatile chemical reads as volatile', () => {
    const g = guidedWith((x) => {
      wellSite(x);
      value(x, BENZENE, 'groundwater', '1', 'mg/L');
    });
    const h = deriveChemical(g, runPlan(g)!, chem(BENZENE, 'Benzene')).forms.household!;
    expect(Number(h.henryAtm)).toBeCloseTo(row(BENZENE).rsl.hPrime!.value * 0.024465, 6);
    expect(volatileVerdict(h).volatile).toBe(true);
  });
});
