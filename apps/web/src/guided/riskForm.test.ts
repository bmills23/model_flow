import { beforeAll, describe, expect, it } from 'vitest';
import { buildInputs } from '../risk/build';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { defaultForm, newChemicalRow } from '../risk/form';
import { emptyOverrides, setField, type OverridesState } from '../overrides/model';
import { receptorKey } from '../overrides/receptors';
import { loadVaporChemicals, type VaporChemicalRow } from '../vapor/chemicals';
import type { WellFeed } from '../transport/wellFeed';
import { buildGuidedInputs, deriveRiskForm } from './riskForm';
import { pathwayStatuses } from './pathways';
import { riskFeeds } from './slots';
import type { ChemicalData } from './derive';
import { BENZENE, MTBE, guidedWith, setValue, withRunOutputs } from './forms.testkit';

let db: ChemicalDb;
let rows: VaporChemicalRow[] = [];
beforeAll(async () => {
  db = await loadChemicalDb();
  rows = await loadVaporChemicals();
}, 30000);
const CHEMS = [
  { id: BENZENE, name: 'Benzene' },
  { id: MTBE, name: 'MTBE' },
];
const editOf = (screen: 'risk' | 'guided', which: 'a' | 'b', bw: string): OverridesState => ({
  ...emptyOverrides(),
  receptors: setField({}, receptorKey(screen, which), 'legacy.bwKg', { value: bw, note: 'mine' }),
});
const data = (id: string, name: string): ChemicalData => ({
  id,
  name,
  fate: rows.find((r) => r.id === id)!,
});

describe('the derived risk form for measured concentrations', () => {
  const measured = () =>
    guidedWith((g) => {
      g.site.basis = 'measured';
      g.site.measured = ['soil', 'groundwater'];
      setValue(g, BENZENE, 'soil', '5', 'mg/kg');
      setValue(g, BENZENE, 'groundwater', '20', 'ug/L');
      setValue(g, MTBE, 'soil', 'ND', 'mg/kg');
      setValue(g, MTBE, 'groundwater', '3', 'mg/L');
    });

  it('has a row per chemical with the 3b values in the screen units', () => {
    const f = deriveRiskForm(measured(), CHEMS, db);
    expect(f.chemicals.map((c) => c.id)).toEqual([BENZENE, MTBE]);
    expect(f.chemicals[0]!.conc).toEqual({ soil: '5', groundwater: '0.02' });
    expect(f.chemicals[1]!.conc).toEqual({ soil: '0', groundwater: '3' });
    expect(f.chemicals.every((c) => !c.groundwaterFromWell && !c.indoorFromVapor)).toBe(true);
  });

  it('leaves the pathways of unmeasured media off on the receptor', () => {
    const f = deriveRiskForm(measured(), CHEMS, db);
    expect(f.a.pathways.soilIngestion).toBe(true);
    expect(f.a.pathways.waterIngestion).toBe(true);
    expect(f.a.pathways.indoorInhalation).toBe(false);
    expect(f.a.pathways.swimIngestion).toBe(false);
  });

  it('builds the same scenario as the workbench form typed with the same values', () => {
    const g = measured();
    const mine = buildGuidedInputs(g, CHEMS, db);
    const form = defaultForm();
    form.chemicals = CHEMS.map((c) => newChemicalRow(db.byId.get(c.id)!));
    form.chemicals[0]!.conc = { soil: '5', groundwater: '0.02' };
    form.chemicals[1]!.conc = { soil: '0', groundwater: '3' };
    for (const p of ['indoorInhalation', 'outdoorInhalation', 'showerInhalation'] as const) {
      form.a.pathways[p] = false;
    }
    form.a.pathways.swimIngestion = false;
    form.a.pathways.swimDermal = false;
    const theirs = buildInputs(form, db, null);
    expect(mine.ok).toBe(true);
    expect(theirs.ok).toBe(true);
    if (mine.ok && theirs.ok) {
      expect(mine.legacy).toEqual(theirs.legacy);
      expect(mine.modern).toEqual(theirs.modern);
    }
  });

  it('carries a second receptor, the cancer sum, and the receptor edits keyed guided', () => {
    const g = measured();
    g.exposure.b = { ...g.exposure.a, preset: 'child' };
    g.exposure.additive = true;
    const o = editOf('guided', 'a', '55');
    const f = deriveRiskForm(g, CHEMS, db, o);
    expect(f.b?.preset).toBe('child');
    expect(f.additive).toBe(true);
    expect(f.a.edits?.values['legacy.bwKg']).toBe('55');
    expect(f.b?.edits).toBeUndefined();
    // a risk-screen edit is not the guided receptor's
    expect(deriveRiskForm(g, CHEMS, db, editOf('risk', 'a', '40')).a.edits).toBeUndefined();
  });

  it('names a chemical the database lacks instead of dropping it', () => {
    const r = buildGuidedInputs(measured(), [{ id: 'made-up', name: 'My own' }], db);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/My own: not in the chemical database/);
  });
});

describe('the derived risk form for modeled sources', () => {
  const wellFeed = (id: string): WellFeed => ({
    method: 'modern',
    label: 'Receptor well',
    times: [0, 1e8, 2e8],
    values: [0, 1e-6, 2e-6],
    chemicalId: id,
  });
  const wellGuided = () =>
    guidedWith((g) => {
      g.site.sources = ['groundwater'];
      g.site.paths.well = true;
      // the shower air comes from the household run, which this hand-made output leaves out
      g.exposure.pathways = { showerInhalation: false };
      g.outputs['well'] = { [BENZENE]: { inputsHash: 'h', value: wellFeed(BENZENE) } };
    });

  it('reads the well series of the output, equal to the workbench with the same series', () => {
    const g = wellGuided();
    const form = deriveRiskForm(g, [CHEMS[0]!], db);
    expect(form.chemicals[0]).toMatchObject({ groundwaterFromWell: true });
    const mine = buildGuidedInputs(g, [CHEMS[0]!], db);
    const wb = defaultForm();
    wb.chemicals = [{ ...newChemicalRow(db.byId.get(BENZENE)!), groundwaterFromWell: true }];
    const theirs = buildInputs(wb, db, wellFeed(BENZENE));
    expect([mine.ok ? [] : mine.errors, theirs.ok ? [] : theirs.errors]).toEqual([[], []]);
    if (mine.ok && theirs.ok) {
      expect(mine.legacy).toEqual(theirs.legacy);
      expect(mine.modern).toEqual(theirs.modern);
    }
  });

  it('says the well result is missing when the Run has not produced it', () => {
    const g = wellGuided();
    g.outputs = {};
    const r = buildGuidedInputs(g, [CHEMS[0]!], db);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/Benzene: no transport well result/);
  });

  it('turns the flags on from the chain and builds from a real Run for two chemicals', () => {
    const chems = [data(BENZENE, 'Benzene'), data(MTBE, 'MTBE')];
    const g = withRunOutputs(
      guidedWith((x) => {
        x.site.sources = ['groundwater'];
        x.site.paths.well = true;
        x.site.paths.building = true;
        setValue(x, BENZENE, 'groundwater', '2', 'mg/L');
        setValue(x, MTBE, 'groundwater', '500', 'ug/L');
      }),
      chems,
    );
    const form = deriveRiskForm(g, CHEMS, db);
    expect(form.chemicals[0]).toMatchObject({
      groundwaterFromWell: true,
      indoorFromVapor: true,
      // the indoor air model gave no outdoor air for a groundwater source
      outdoorFromVapor: false,
      bathroomFromHousehold: true,
      surfaceWaterFromModel: false,
      indoorFromHousehold: false,
      outdoorFromHousehold: '',
    });
    expect(riskFeeds(g.outputs).vapor.size).toBe(2);
    expect(pathwayStatuses(g).find((p) => p.id === 'outdoorInhalation')).toMatchObject({
      available: false,
      on: false,
    });
    const r = buildGuidedInputs(g, CHEMS, db);
    expect(r.ok ? [] : r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const paths = r.modern.receptors[0]!.pathways;
      expect(paths).toEqual(
        expect.arrayContaining([
          'waterIngestion',
          'waterDermal',
          'showerInhalation',
          'indoorInhalation',
        ]),
      );
      expect(paths).not.toContain('outdoorInhalation');
      expect(paths).not.toContain('soilIngestion');
      expect(r.modern.receptors[0]!.chemicals.map((c) => c.id)).toEqual([BENZENE, MTBE]);
    }
  });
  it('reads outdoor air from the indoor air model when a soil source gives it', () => {
    const chems = [data(BENZENE, 'Benzene')];
    const g = withRunOutputs(
      guidedWith((x) => {
        x.site.sources = ['soilAbove'];
        x.site.paths.building = true;
        setValue(x, BENZENE, 'soilAbove', '10', 'mg/kg');
      }),
      chems,
    );
    expect(pathwayStatuses(g).find((p) => p.id === 'outdoorInhalation')?.available).toBe(true);
    expect(deriveRiskForm(g, [CHEMS[0]!], db).chemicals[0]).toMatchObject({
      indoorFromVapor: true,
      outdoorFromVapor: true,
    });
    const r = buildGuidedInputs(g, [CHEMS[0]!], db);
    expect(r.ok ? [] : r.errors).toEqual([]);
    if (r.ok) expect(r.modern.receptors[0]!.pathways).toContain('outdoorInhalation');
  });
});
