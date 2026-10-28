import { beforeAll, describe, expect, it } from 'vitest';
import { buildCleanup } from '../cleanup/build';
import { defaultCleanupForm } from '../cleanup/form';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { newChemicalRow } from '../risk/form';
import { buildGuidedCleanup, cleanupFormFor, deriveCleanupForm } from './cleanupForm';
import { BENZENE, MTBE, guidedWith, setValue } from './forms.testkit';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);
const CHEMS = [
  { id: BENZENE, name: 'Benzene' },
  { id: MTBE, name: 'MTBE' },
];

describe('the derived cleanup form', () => {
  it('picks the source kind from the chain', () => {
    const kind = (patch: Parameters<typeof guidedWith>[0]) =>
      deriveCleanupForm(guidedWith(patch), CHEMS, db).source;
    expect(
      kind((g) => {
        g.site.basis = 'measured';
        g.site.measured = ['soil'];
      }),
    ).toBe('direct');
    expect(
      kind((g) => {
        g.site.sources = ['groundwater'];
        g.site.paths.well = true;
      }),
    ).toBe('dissolved');
    expect(
      kind((g) => {
        g.site.sources = ['soilAbove'];
        g.site.paths.leaching = true;
        g.site.paths.well = true;
      }),
    ).toBe('vadose');
    expect(
      kind((g) => {
        g.site.sources = ['soilBelow'];
        g.site.paths.well = true;
      }),
    ).toBe('saturated');
  });

  it('carries targets, allocation, receptors and the 3b ratios', () => {
    const g = guidedWith((x) => {
      x.site.basis = 'measured';
      x.site.measured = ['soil', 'groundwater'];
      x.targets.allocation = 'cumulative';
      x.targets.targetRisk = '1e-5';
      x.targets.targetHq = '0.5';
      x.exposure.b = { ...x.exposure.a, preset: 'worker' };
      x.exposure.additive = true;
      setValue(x, BENZENE, 'soil', '10', 'mg/kg');
      setValue(x, BENZENE, 'groundwater', '5', 'ug/L');
      setValue(x, MTBE, 'soil', '30', 'mg/kg');
    });
    const f = deriveCleanupForm(g, CHEMS, db);
    expect(f).toMatchObject({
      allocation: 'cumulative',
      targetRisk: '1e-5',
      targetHq: '0.5',
      additive: true,
      surfaceTargets: [],
    });
    expect(f.b?.preset).toBe('worker');
    expect(f.chemicals[0]!.conc).toEqual({ soil: '10', groundwater: '0.005' });
    expect(f.chemicals[1]!.conc).toEqual({ soil: '30' });
  });

  it('builds the same back-calculation as the workbench form typed with the same values', () => {
    const g = guidedWith((x) => {
      x.site.basis = 'measured';
      x.site.measured = ['soil'];
      x.targets.allocation = 'cumulative';
      setValue(x, BENZENE, 'soil', '10', 'mg/kg');
    });
    const mine = buildGuidedCleanup(g, [CHEMS[0]!], db);
    const wb = defaultCleanupForm();
    wb.allocation = 'cumulative';
    wb.chemicals = [{ ...newChemicalRow(db.byId.get(BENZENE)!), conc: { soil: '10' } }];
    for (const p of Object.keys(wb.a.pathways)) {
      (wb.a.pathways as Record<string, boolean>)[p] = p === 'soilIngestion' || p === 'soilDermal';
    }
    const theirs = buildCleanup(wb, db);
    expect(mine.ok && theirs.ok).toBe(true);
    if (mine.ok && theirs.ok) {
      expect(mine.legacy).toEqual(theirs.legacy);
      expect(mine.modern).toEqual(theirs.modern);
    }
  });
});

describe('one chemical of the cleanup form with its water standard', () => {
  const g = guidedWith((x) => {
    x.site.sources = ['groundwater'];
    x.site.paths.well = true;
    x.targets.standards = {
      [BENZENE]: { kind: 'risk', value: '', unit: '', source: '' },
      [MTBE]: { kind: 'state', value: '20', unit: 'ug/L', source: 'State rule 12' },
    };
  });

  it('keeps one row, and the risk targets for a chemical on risk', () => {
    const f = cleanupFormFor(deriveCleanupForm(g, CHEMS, db), g, BENZENE);
    expect(f.chemicals.map((c) => c.id)).toEqual([BENZENE]);
    expect(f.targetKind).toBe('risk');
  });

  it('a state standard becomes a concentration at the well in mg/L', () => {
    const f = cleanupFormFor(deriveCleanupForm(g, CHEMS, db), g, MTBE);
    expect(f.targetKind).toBe('well');
    expect(f.wellTarget).toBe('0.02');
  });

  it('a federal MCL leaves the well target blank so the database value is used', () => {
    const h = guidedWith((x) => {
      x.site.sources = ['groundwater'];
      x.site.paths.well = true;
      x.targets.standards = { [BENZENE]: { kind: 'mcl', value: '', unit: '', source: '' } };
    });
    const f = cleanupFormFor(deriveCleanupForm(h, CHEMS, db), h, BENZENE);
    expect(f.targetKind).toBe('well');
    expect(f.wellTarget).toBe('');
  });

  it('a state standard with no usable value never falls back to the MCL', () => {
    const h = guidedWith((x) => {
      x.site.sources = ['groundwater'];
      x.site.paths.well = true;
      x.targets.standards = { [BENZENE]: { kind: 'state', value: '', unit: 'ug/L', source: '' } };
    });
    const f = cleanupFormFor(deriveCleanupForm(h, CHEMS, db), h, BENZENE);
    expect(f.targetKind).toBe('well');
    expect(Number(f.wellTarget) > 0).toBe(false);
    expect(f.wellTarget).not.toBe('');
  });

  it('a chemical with no standard is on risk', () => {
    const f = cleanupFormFor(deriveCleanupForm(g, CHEMS, db), g, 'other');
    expect(f.targetKind).toBe('risk');
  });
});
