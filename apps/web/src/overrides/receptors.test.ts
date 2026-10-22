import { beforeAll, describe, expect, it } from 'vitest';
import { loadChemicalDb, type ChemicalDb } from '../risk/chemicalDb';
import { buildInputs } from '../risk/build';
import { runRisk } from '../risk/compute';
import { riskCsvTables } from '../risk/csv';
import { defaultForm, newChemicalRow, type RiskForm } from '../risk/form';
import { exposureUncertainty } from '../risk/uncertaintySetup';
import { buildCleanup } from '../cleanup/build';
import { runCleanup } from '../cleanup/compute';
import { cleanupCsvTables } from '../cleanup/csv';
import { defaultCleanupForm } from '../cleanup/form';
import {
  currentProject,
  getOverrides,
  loadProject,
  newProject,
  setOverrides,
} from '../project/store';
import { CURRENT_VERSION, parseProject } from '../project';
import { emptyOverrides, resetField, setField, type OverridesState } from './model';
import { fromProject, overridesSchema, toProject } from './project';
import {
  clearReceptor,
  editCount,
  editsFor,
  LIFETIME_KEY,
  modernKey,
  receptorKey,
  withReceptorEdits,
} from './receptors';

let db: ChemicalDb;
beforeAll(async () => {
  db = await loadChemicalDb();
}, 30000);

const BENZENE = '71-43-2';

function stateWith(subject: string, values: Record<string, string>, name = ''): OverridesState {
  let receptors = {};
  for (const [k, v] of Object.entries(values)) {
    receptors = setField(receptors, subject, k, { value: v, note: '' });
  }
  return {
    ...emptyOverrides(),
    receptors,
    receptorNames: name === '' ? {} : { [subject]: name },
  };
}

function soilForm(preset: 'resident' | 'worker' | 'child'): RiskForm {
  const f = defaultForm();
  f.chemicals = [{ ...newChemicalRow(db.byId.get(BENZENE)!), conc: { soil: '10' } }];
  f.a = { ...f.a, preset };
  f.a.pathways = Object.fromEntries(Object.keys(f.a.pathways).map((p) => [p, false])) as never;
  f.a.pathways.soilIngestion = true;
  return f;
}

function soilRisk(form: RiskForm, method: 'legacy' | 'modern'): number {
  const b = buildInputs(form, db, null);
  if (!b.ok) throw new Error(b.errors.join('; '));
  const out = runRisk(b)[method];
  if (!out.ok) throw new Error(out.error);
  return out.result.summary.receptors[0]!.cancerRisk;
}

describe('receptor edits in the exposure build', () => {
  it('a legacy body weight scales the ingestion dose by the inverse ratio', () => {
    const base = soilRisk(soilForm('worker'), 'legacy');
    const edited = withReceptorEdits(
      soilForm('worker'),
      stateWith(receptorKey('risk', 'a'), { 'legacy.bwKg': '35' }),
      'risk',
    );
    expect(soilRisk(edited, 'legacy') / base).toBeCloseTo(2, 9);
  });

  it('a modern stage body weight scales the ingestion dose by the inverse ratio', () => {
    const base = soilRisk(soilForm('worker'), 'modern');
    const edited = withReceptorEdits(
      soilForm('worker'),
      stateWith(receptorKey('risk', 'a'), { [modernKey('worker', 'bwKg')]: '40' }),
      'risk',
    );
    expect(soilRisk(edited, 'modern') / base).toBeCloseTo(2, 9);
  });

  it('an edit to the modern resident adult stage changes the mutagen and non-mutagen stages alike', () => {
    const base = soilRisk(soilForm('resident'), 'modern');
    const edited = withReceptorEdits(
      soilForm('resident'),
      stateWith(receptorKey('risk', 'a'), { [modernKey('adult', 'efDaysPerYr')]: '175' }),
      'risk',
    );
    const r = soilRisk(edited, 'modern');
    expect(r).toBeLessThan(base);
    expect(r).toBeGreaterThan(base / 2);
  });

  it('exposure frequency and duration scale the legacy dose linearly', () => {
    const base = soilRisk(soilForm('worker'), 'legacy');
    const form = withReceptorEdits(
      soilForm('worker'),
      stateWith(receptorKey('risk', 'a'), {
        'legacy.efDaysPerYr': '125',
        'legacy.edYr': '12.5',
      }),
      'risk',
    );
    // 250 d/yr to 125, and 25 yr to 12.5 over the same 70 yr lifetime: a quarter
    expect(soilRisk(form, 'legacy') / base).toBeCloseTo(0.25, 9);
  });

  it('a different cancer averaging time scales the risk by the inverse ratio in both methods', () => {
    const state = stateWith(receptorKey('risk', 'a'), { [LIFETIME_KEY]: '35' });
    for (const m of ['legacy', 'modern'] as const) {
      const base = soilRisk(soilForm('worker'), m);
      expect(soilRisk(withReceptorEdits(soilForm('worker'), state, 'risk'), m) / base).toBeCloseTo(
        2,
        9,
      );
    }
  });

  it('legacy uncertainty sampling centres on the edited value', () => {
    const form = withReceptorEdits(
      soilForm('worker'),
      stateWith(receptorKey('risk', 'a'), { 'legacy.bwKg': '55', 'legacy.edYr': '12' }),
      'risk',
    );
    const b = buildInputs(form, db, null);
    if (!b.ok) throw new Error(b.errors.join('; '));
    const inputs = exposureUncertainty(b.legacy).uncertainInputs ?? [];
    expect(inputs.find((u) => u.id === 'exposure.receptor0.bw')!.get(b.legacy)).toBe(55);
    expect(inputs.find((u) => u.id === 'exposure.receptor0.ed')!.get(b.legacy)).toBeCloseTo(
      12 * 365 * 86400,
      3,
    );
  });

  it('refuses a bad entry by naming the receptor and the factor', () => {
    const form = withReceptorEdits(
      soilForm('worker'),
      stateWith(receptorKey('risk', 'a'), { 'legacy.bwKg': 'heavy' }),
      'risk',
    );
    const b = buildInputs(form, db, null);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.errors.join(' ')).toMatch(/receptor a, legacy body weight/i);
  });

  it('a receptor name replaces the default tag in the result labels and the CSV', () => {
    const form = withReceptorEdits(
      soilForm('worker'),
      stateWith(receptorKey('risk', 'a'), {}, 'North lot worker'),
      'risk',
    );
    const b = buildInputs(form, db, null);
    if (!b.ok) throw new Error(b.errors.join('; '));
    expect(b.legacy.receptors[0]!.label).toBe('North lot worker (Worker)');
    const csv = riskCsvTables(runRisk(b), { [BENZENE]: 'Benzene' });
    const text = JSON.stringify(csv);
    expect(text).toContain('North lot worker (Worker)');
    expect(text).not.toContain('Receptor A');
  });

  it('keeps the other receptor and the other screen unedited', () => {
    const state = stateWith(receptorKey('cleanup', 'a'), { 'legacy.bwKg': '35' });
    const form = withReceptorEdits(soilForm('worker'), state, 'risk');
    expect(form.a.edits).toBeUndefined();
    expect(editsFor(state, 'cleanup', 'a')?.values).toEqual({ 'legacy.bwKg': '35' });
  });
});

describe('receptor edits in the cleanup build', () => {
  function cleanupWith(state: OverridesState) {
    const f = defaultCleanupForm();
    f.chemicals = [{ ...newChemicalRow(db.byId.get(BENZENE)!), conc: {} }];
    f.a = { ...f.a, preset: 'worker' };
    f.a.pathways = Object.fromEntries(Object.keys(f.a.pathways).map((p) => [p, false])) as never;
    f.a.pathways.soilIngestion = true;
    const b = buildCleanup(withReceptorEdits(f, state, 'cleanup'), db);
    if (!b.ok) throw new Error(b.errors.join('; '));
    return b;
  }
  const level = (b: ReturnType<typeof cleanupWith>, m: 'legacy' | 'modern'): number => {
    const out = runCleanup(b)[m];
    if (!out.ok) throw new Error(out.error);
    return out.result.media.find((x) => x.medium === 'soil')!.levels[0]!.level!;
  };

  it('a body weight edit scales the soil cleanup level by the same ratio in both methods', () => {
    const base = cleanupWith(emptyOverrides());
    const key = receptorKey('cleanup', 'a');
    const edited = cleanupWith(
      stateWith(key, { 'legacy.bwKg': '35', [modernKey('worker', 'bwKg')]: '40' }),
    );
    expect(level(edited, 'legacy') / level(base, 'legacy')).toBeCloseTo(0.5, 9);
    expect(level(edited, 'modern') / level(base, 'modern')).toBeCloseTo(0.5, 9);
  });

  it('the name flows to the cleanup CSV', () => {
    const b = cleanupWith(stateWith(receptorKey('cleanup', 'a'), {}, 'Site worker'));
    const text = JSON.stringify(cleanupCsvTables(runCleanup(b), { [BENZENE]: 'Benzene' }));
    expect(text).toContain('Site worker (Worker)');
    expect(text).not.toContain('Receptor A');
  });
});

describe('receptor edit helpers and saved shape', () => {
  it('counts, resets and clears edits per receptor', () => {
    const key = receptorKey('risk', 'b');
    let s = stateWith(key, { 'legacy.bwKg': '60', 'legacy.edYr': '10' }, 'Neighbour');
    expect(editCount(s, key)).toBe(3);
    s = { ...s, receptors: resetField(s.receptors, key, 'legacy.bwKg') };
    expect(editCount(s, key)).toBe(2);
    expect(editCount(clearReceptor(s, key), key)).toBe(0);
  });

  it('round trips through the project file inside format version 1, and an empty set is absent', () => {
    const state = stateWith(receptorKey('risk', 'a'), { 'legacy.bwKg': '60' }, 'Resident north');
    const saved = toProject(state)!;
    expect(overridesSchema.parse(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    expect(fromProject(saved)).toEqual(state);
    expect(toProject(emptyOverrides())).toBeUndefined();
    // a file saved before this slice has no receptor keys and loads with none
    expect(fromProject({ toxicity: {} })).toEqual(emptyOverrides());
  });

  it('survives a whole project save and load without a version change', () => {
    newProject();
    const key = receptorKey('cleanup', 'a');
    const state = stateWith(key, { 'legacy.edYr': '10' }, 'Cleanup crew');
    setOverrides(state);
    const r = parseProject(JSON.stringify(currentProject()));
    expect(r.ok).toBe(true);
    expect(r.ok && r.warnings).toEqual([]);
    // the receptor keys needed no version of their own: the file is at the current version
    expect(r.ok && r.project.version).toBe(CURRENT_VERSION);
    newProject();
    expect(getOverrides()).toEqual(emptyOverrides());
    if (r.ok) loadProject(r.project);
    expect(getOverrides()).toEqual(state);
    newProject();
  });
});
