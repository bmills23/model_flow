import { describe, expect, it } from 'vitest';
import type { ChemicalRow } from '../risk/form';
import {
  buildProject,
  chemicalsOf,
  defaultScreens,
  parseProject,
  screensOf,
  type Screens,
} from './index';
import { chemicalIdsOf, deriveChemicals } from './chemicals';
import { unknownKeyPaths } from './merge';
import { projectSchema } from './schema';

const row = (id: string, name: string): ChemicalRow => ({
  id,
  name,
  dermalForm: undefined,
  conc: {},
  groundwaterFromWell: false,
  indoorFromVapor: false,
  outdoorFromVapor: false,
  surfaceWaterFromModel: false,
  bathroomFromHousehold: false,
  indoorFromHousehold: false,
  outdoorFromHousehold: '',
  produceFromPlantsEco: false,
});

/** Every screen holds a chemical; benzene is shared, so it must appear once. */
function fixture(): Screens {
  const s = defaultScreens();
  s.risk.form.chemicals = [row('71-43-2', 'Benzene'), row('108-88-3', 'Toluene')];
  s.cleanup.form.chemicals = [row('108-88-3', 'Toluene'), row('100-41-4', 'Ethylbenzene')];
  s.transport.form.chemicalId = '127-18-4';
  s.vadose.form.chemicalId = '79-01-6';
  s.saturated.form.chemicalId = '71-43-2';
  s.vapor.form.chemicalId = '75-01-4';
  s.household.form.chemicalId = '67-66-3';
  s.household.form.chemicalName = 'Chloroform';
  s.plantsEco.form.chemicalId = 'not-in-db';
  s.plantsEco.form.chemicalName = 'Typed name';
  return s;
}

describe('deriveChemicals', () => {
  it('is empty for a new project', () => {
    expect(deriveChemicals(defaultScreens())).toEqual([]);
  });

  it('collects risk, cleanup then each screen, de-duplicated in a stable order', () => {
    const list = deriveChemicals(fixture());
    expect(list.map((c) => c.id)).toEqual([
      '71-43-2',
      '108-88-3',
      '100-41-4',
      '127-18-4',
      '79-01-6',
      '75-01-4',
      '67-66-3',
      'not-in-db',
    ]);
    expect(deriveChemicals(fixture())).toEqual(list);
  });

  it('names an entry from a row, a typed name, or falls back to the id', () => {
    const byId = Object.fromEntries(deriveChemicals(fixture()).map((c) => [c.id, c.name]));
    expect(byId['71-43-2']).toBe('Benzene');
    expect(byId['67-66-3']).toBe('Chloroform');
    expect(byId['not-in-db']).toBe('Typed name');
    expect(byId['127-18-4']).toBe('127-18-4');
  });

  it('a name on a later row fills an entry first seen without one', () => {
    const s = defaultScreens();
    s.transport.form.chemicalId = '71-43-2';
    s.household.form.chemicalId = '71-43-2';
    s.household.form.chemicalName = 'Benzene';
    expect(deriveChemicals(s)).toEqual([{ id: '71-43-2', name: 'Benzene' }]);
  });

  it('skips blank ids and the vapor fixture risc4-benzene', () => {
    const s = defaultScreens();
    s.vapor.form.chemicalId = 'risc4-benzene';
    s.risk.form.chemicals = [row('  ', 'Blank')];
    s.transport.form.chemicalId = '';
    expect(deriveChemicals(s)).toEqual([]);
    expect(chemicalIdsOf(s)).toEqual([]);
  });
});

describe('the chemicals key in the file', () => {
  const createdWith = '0.0.0';

  it('round trips through build and parse', () => {
    const screens = fixture();
    const chemicals = deriveChemicals(screens);
    const doc = buildProject({ screens, chemicals, createdWith });
    expect(doc.chemicals).toEqual(chemicals);
    const r = parseProject(JSON.parse(JSON.stringify(doc)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.chemicals).toEqual(chemicals);
    expect(r.warnings).toEqual([]);
    expect(chemicalsOf(r.project)).toEqual(chemicals);
  });

  it('keeps an empty stored list as empty, without deriving', () => {
    const screens = fixture();
    const doc = buildProject({ screens, chemicals: [], createdWith });
    const r = parseProject(JSON.parse(JSON.stringify(doc)));
    if (!r.ok) throw new Error(r.error);
    expect(chemicalsOf(r.project)).toEqual([]);
  });

  it('an older file with no key derives the list from its screens', () => {
    const screens = fixture();
    const doc = buildProject({ screens, createdWith });
    expect('chemicals' in doc).toBe(false);
    const r = parseProject(JSON.parse(JSON.stringify(doc)));
    if (!r.ok) throw new Error(r.error);
    expect(r.project.chemicals).toBeUndefined();
    expect(chemicalsOf(r.project)).toEqual(deriveChemicals(screensOf(r.project)));
    expect(chemicalsOf(r.project)).toHaveLength(8);
  });

  it('refuses a list entry with no id', () => {
    const doc = JSON.parse(
      JSON.stringify(buildProject({ screens: defaultScreens(), chemicals: [], createdWith })),
    );
    doc.chemicals = [{ id: '', name: 'x' }];
    expect(parseProject(doc).ok).toBe(false);
  });

  it('an older build, whose schema lacks the key, strips it with its usual warning', () => {
    const doc = JSON.parse(
      JSON.stringify(buildProject({ screens: defaultScreens(), chemicals: [], createdWith })),
    );
    const older = projectSchema.omit({ chemicals: true }).parse(doc);
    expect(unknownKeyPaths(doc, older, '')).toEqual(['.chemicals']);
  });
});
