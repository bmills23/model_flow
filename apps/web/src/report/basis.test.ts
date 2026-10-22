import validation from '@model-flow/data/generated/validation/validation.json';
import { describe, expect, it } from 'vitest';
import { buildProject, defaultScreens, type Screens } from '../project';
import type { OverridesState } from '../overrides/model';
import type { ProjectChemical } from '../project';
import type { ChemicalDb } from '../risk/chemicalDb';
import type { StaleSlot } from '../project/store';
import type { CleanupProps } from '../cleanup/ssg';
import type { VaporChemicalRow } from '../vapor/chemicals';
import { buildReport } from './buildReport';
import { runBasis, BASIS_SCOPES, type BasisDefault, type BasisRow } from './basis';
import type { ProjectResults, ResultWarning, SectionResults } from './results';

const NOW = new Date('2026-10-22T12:00:00.000Z');

const DEFAULTS = validation.unverified.defaults as BasisDefault[];

const BENZENE: VaporChemicalRow = {
  id: '71-43-2',
  name: 'Benzene',
  rsl: {
    mw: { value: 78.11 },
    s: { value: 1790 },
    hPrime: { value: 0.228 },
    koc: { value: 146 },
    dia: { value: 0.088 },
    diw: { value: 0.0000098 },
  },
};

const emptyDb: ChemicalDb = {
  edition: 'test',
  sourceKeys: {},
  chemicals: [],
  byId: new Map(),
};

function sec(warnings: ResultWarning[] = []): SectionResults {
  return { tables: [], charts: [], warnings, notes: [] };
}
const warn = (code: string): ResultWarning => ({ origin: 'm', code, message: code });

interface Setup {
  edit?: (s: Screens) => void;
  overrides?: OverridesState;
  chemicals?: ProjectChemical[];
  results?: ProjectResults;
  stale?: StaleSlot[];
  db?: ChemicalDb;
  rows?: VaporChemicalRow[];
  cleanupProps?: CleanupProps;
  defaults?: BasisDefault[];
}

function run(o: Setup = {}) {
  const screens = defaultScreens();
  o.edit?.(screens);
  const project = buildProject({
    screens,
    createdWith: '0.1.0',
    now: NOW,
    ...(o.overrides !== undefined ? { overrides: o.overrides } : {}),
    ...(o.chemicals !== undefined ? { chemicals: o.chemicals } : {}),
  });
  const report = buildReport(project);
  return runBasis({
    report,
    results: o.results ?? {},
    project,
    db: o.db ?? emptyDb,
    fateRows: o.rows ?? [BENZENE],
    cleanupProps: o.cleanupProps ?? new Map(),
    defaults: o.defaults ?? DEFAULTS,
    stale: o.stale ?? [],
  });
}

const kinds = (rows: BasisRow[]) => rows.map((r) => r.kind);

const BENZENE_FORM = {
  M: '78.11',
  S: '1790',
  H: '0.228',
  Koc: '146',
  Da: '0.088',
  Dw: '0.0000098',
};

const vadose = (patch: Record<string, string>) => (s: Screens) => {
  s.vadose = { ...s.vadose, form: { ...s.vadose.form, ...patch } } as Screens['vadose'];
};

describe('runBasis, unverified defaults', () => {
  it('lists a warning-scoped default only when its code is in the section warnings', () => {
    const edit = (s: Screens) => {
      s.household = { ...s.household, form: { ...s.household.form, waterConcentration: '1' } };
    };
    const without = run({ edit, results: { household: sec() } });
    expect(without.sections.household?.some((r) => r.defaultId === 'shower-household-k')).toBe(
      false,
    );
    const withCode = run({
      edit,
      results: { household: sec([warn('shower.household-factor-unverified')]) },
    });
    const row = withCode.sections.household!.find((r) => r.defaultId === 'shower-household-k')!;
    expect(row.kind).toBe('unverified-default');
    expect(row.referenceKey).toBe('epa2024rslug');
    expect(row.referenceStatus).toBe('used');
    expect(row.note).not.toBe('');
  });

  it('lists the vadose regression default when its warning code is in the section warnings', () => {
    const b = run({
      edit: vadose({ foc: '0.0123', dispersivityBasis: 'regression' }),
      results: { vadose: sec([warn('vadose.dispersivity-regression-unsourced')]) },
    });
    const ids = b.sections
      .vadose!.filter((r) => r.kind === 'unverified-default')
      .map((r) => r.defaultId);
    expect(ids).toContain('gelhar-vadose-regression');
    expect(ids).not.toContain('shower-household-k');
  });

  it('lists a default once per section', () => {
    const b = run({
      results: {
        cleanup: sec([
          warn('vadose.dispersivity-regression-unsourced'),
          warn('vadose.dispersivity-regression-unsourced'),
        ]),
      },
      edit: (s) => {
        vadose({ dispersivityBasis: 'regression' })(s);
        s.cleanup = { form: { ...s.cleanup.form, source: 'vadose' } };
      },
    });
    const rows = b.sections.cleanup!.filter((r) => r.defaultId === 'gelhar-vadose-regression');
    expect(rows.length).toBe(1);
  });
});

describe('runBasis, typed over database', () => {
  it('reports nothing for values equal to the database row', () => {
    const b = run({
      edit: vadose({ chemicalId: '71-43-2', ...BENZENE_FORM, foc: '0.01' }),
    });
    expect(kinds(b.sections.vadose!)).not.toContain('typed-over-database');
    expect(kinds(b.sections.vadose!)).not.toContain('entered-unsourced');
  });

  it('compares numerically, so 146.0 equals 146', () => {
    const b = run({ edit: vadose({ chemicalId: '71-43-2', ...BENZENE_FORM, Koc: '146.0' }) });
    expect(kinds(b.sections.vadose!)).not.toContain('typed-over-database');
  });

  it('reports a property typed over the database value with both values', () => {
    const b = run({ edit: vadose({ chemicalId: '71-43-2', ...BENZENE_FORM, Koc: '100' }) });
    const row = b.sections.vadose!.find((r) => r.kind === 'typed-over-database')!;
    expect(row.subject).toMatch(/Koc/);
    expect(row.value).toBe('100 mL/g');
    expect(row.detail).toMatch(/146 mL\/g/);
    expect(row.note).toBe('no note');
  });

  it('treats every entered property as entered by hand when the chemical id is blank', () => {
    const b = run({ edit: vadose({ chemicalId: '', M: '78.11', Koc: '146' }) });
    const subjects = b.sections
      .vadose!.filter((r) => r.kind === 'entered-unsourced')
      .map((r) => r.subject)
      .join(' ');
    expect(subjects).toMatch(/Molar mass/);
    expect(subjects).toMatch(/Koc/);
  });

  it('skips a blank property', () => {
    const b = run({
      edit: vadose({ chemicalId: '', foc: '0.0123', M: '', S: '', H: '', Koc: '', Da: '', Dw: '' }),
    });
    expect(kinds(b.sections.vadose!)).not.toContain('entered-unsourced');
  });

  it('compares the transport Kd with Koc times foc', () => {
    const edit = (kd: string) => (s: Screens) => {
      s.transport = {
        ...s.transport,
        form: { ...s.transport.form, chemicalId: '71-43-2', retardMode: 'kd', foc: '0.01', kd },
      } as Screens['transport'];
    };
    expect(kinds(run({ edit: edit('1.46') }).sections.transport!)).not.toContain(
      'typed-over-database',
    );
    const row = run({ edit: edit('3') }).sections.transport!.find(
      (r) => r.kind === 'typed-over-database',
    )!;
    expect(row.value).toBe('3 L/kg');
    expect(row.detail).toMatch(/1\.46 L\/kg/);
  });

  it('reports a hand-entered transport Kd as entered by hand', () => {
    const b = run({
      edit: (s) => {
        s.transport = {
          ...s.transport,
          form: { ...s.transport.form, chemicalId: '', retardMode: 'kd', kd: '2' },
        } as Screens['transport'];
      },
    });
    expect(b.sections.transport!.some((r) => r.kind === 'entered-unsourced')).toBe(true);
  });

  it('uses a user chemical row when the id names one', () => {
    const user: VaporChemicalRow = { id: 'user-1', name: 'Mine', rsl: { koc: { value: 50 } } };
    const b = run({
      rows: [BENZENE, user],
      edit: vadose({ chemicalId: 'user-1', Koc: '50', M: '', S: '', H: '', Da: '', Dw: '' }),
    });
    expect(kinds(b.sections.vadose!)).not.toContain('typed-over-database');
  });
});

describe('runBasis, project level', () => {
  const edit = vadose({ foc: '0.0123' });

  it('lists a toxicity override with its note and the database value', () => {
    const db: ChemicalDb = {
      edition: 't',
      sourceKeys: {},
      chemicals: [
        {
          id: '71-43-2',
          name: 'Benzene',
          cas: '71-43-2',
          tox: { id: '71-43-2', name: 'Benzene', sfo: { value: 0.055, source: 'I' } } as never,
          phys: undefined,
        },
      ],
      byId: new Map(),
    };
    const b = run({
      edit,
      db,
      overrides: {
        toxicity: { '71-43-2': { sfo: { value: '0.1', note: 'State value 2024' } } },
        receptors: {},
        receptorNames: {},
      },
    });
    const row = b.project.find((r) => r.kind === 'user-override')!;
    expect(row.subject).toMatch(/Benzene/);
    expect(row.value).toMatch(/0\.1/);
    expect(row.note).toBe('State value 2024');
    expect(row.detail).toMatch(/0\.055/);
  });

  it('lists user chemical values with notes and leaves out unusable ones', () => {
    const b = run({
      edit,
      chemicals: [
        {
          id: 'user-1',
          name: 'Mine',
          values: { koc: { value: '50', note: 'Lab report 7' }, s: { value: '3', note: '' } },
        },
      ],
    });
    const rows = b.project.filter((r) => r.kind === 'user-chemical');
    expect(rows.length).toBe(1);
    expect(rows[0]!.note).toBe('Lab report 7');
    expect(rows[0]!.value).toBe('50 mL/g');
  });

  it('lists receptor edits with their note, or "no note"', () => {
    const b = run({
      edit,
      overrides: {
        toxicity: {},
        receptors: {
          'risk.a': {
            'legacy.bwKg': { value: '70', note: 'Agency memo' },
            'legacy.efDaysPerYr': { value: '300', note: '' },
          },
        },
        receptorNames: {},
      },
    });
    const rows = b.project.filter((r) => r.kind === 'receptor-edit');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(['Agency memo', 'no note']).toContain(r.note);
  });
});

describe('runBasis, feeds', () => {
  const edit = (s: Screens) => {
    vadose({ chemicalId: '', Koc: '10' })(s);
    s.transport = {
      ...s.transport,
      form: { ...s.transport.form, feedFromVadose: true },
    } as Screens['transport'];
  };

  it('inherits the sender rows, marked via the sending screen', () => {
    const b = run({ edit });
    const inherited = b.sections.transport!.filter((r) => r.via === 'vadose');
    expect(inherited.length).toBeGreaterThan(0);
    expect(inherited.some((r) => r.kind === 'entered-unsourced')).toBe(true);
    expect(b.sections.vadose!.every((r) => r.via === null)).toBe(true);
    expect(inherited.every((r) => !r.stale)).toBe(true);
  });

  it('marks inherited rows stale when the feed is', () => {
    const b = run({ edit, stale: [{ feed: 'vadose', chemicalId: '' }] });
    const inherited = b.sections.transport!.filter((r) => r.via === 'vadose');
    expect(inherited.length).toBeGreaterThan(0);
    expect(inherited.every((r) => r.stale)).toBe(true);
  });
});

describe('exhaustiveness', () => {
  it('every catalog default has a scope the basis handles', () => {
    expect(DEFAULTS.length).toBeGreaterThan(0);
    for (const d of DEFAULTS) expect(BASIS_SCOPES).toContain(d.scope);
  });

  it('every catalog default id resolves to a row when its trigger is present', () => {
    for (const d of DEFAULTS) {
      const project = buildProject({ screens: defaultScreens(), createdWith: '0.1.0', now: NOW });
      const report = buildReport(project);
      report.sections.push({
        key: 'transport',
        name: 'T',
        inputs: [],
        methodIds: d.scope === 'method' ? d.methodIds : [],
        reads: [],
      });
      const b = runBasis({
        report,
        results: { transport: sec(d.scope === 'warning' ? [warn(d.warningCode!)] : []) },
        project,
        db: emptyDb,
        fateRows: [],
        cleanupProps: new Map(),
        defaults: DEFAULTS,
        stale: [],
      });
      const ids = (b.sections.transport ?? []).map((r) => r.defaultId);
      expect(ids, d.id).toContain(d.id);
    }
  });
});

describe('runBasis, uncertainty setup', () => {
  it('handles the uncertainty screen, which has no fate form', () => {
    const edit = (s: Screens) => {
      s.uncertainty = { ...s.uncertainty, risk: { ...s.uncertainty.risk, seed: 'g2' } };
    };
    const b = run({ edit });
    expect(b.sections.uncertainty).toBeDefined();
  });
});

describe('runBasis, plants and eco compares against the cleanup properties', () => {
  const plants = (patch: Record<string, string>) => (s: Screens) => {
    s.plantsEco = {
      ...s.plantsEco,
      form: { ...s.plantsEco.form, soilConcentration: '12', ...patch },
    } as Screens['plantsEco'];
  };
  const ACRYL: CleanupProps = new Map([['79-06-1', { koc: 4.6, logKow: -0.67 }]]);
  const plantRows = (b: ReturnType<typeof run>) => b.sections.plantsEco ?? [];

  it('lists nothing for values filled from a cleanup-property chemical absent from the fate rows', () => {
    const b = run({
      edit: plants({ chemicalId: '79-06-1', koc: '4.6', logKow: '-0.67' }),
      cleanupProps: ACRYL,
    });
    expect(plantRows(b).filter((r) => r.kind !== 'unverified-default')).toEqual([]);
  });

  it('flags a Koc typed over the cleanup value and a log Kow the record lacks', () => {
    const b = run({
      edit: plants({ chemicalId: '79-06-1', koc: '9', logKow: '1.2' }),
      cleanupProps: new Map([['79-06-1', { koc: 4.6 }]]),
    });
    const rows = plantRows(b).filter((r) => r.kind !== 'unverified-default');
    expect(rows.map((r) => [r.kind, r.subject])).toEqual([
      ['typed-over-database', 'Koc'],
      ['entered-unsourced', 'Log Kow'],
    ]);
    expect(rows[0]!.detail).toMatch(/4\.6/);
  });

  it('flags a log Kow typed over the cleanup value', () => {
    const b = run({
      edit: plants({ chemicalId: '79-06-1', koc: '4.6', logKow: '2' }),
      cleanupProps: ACRYL,
    });
    const rows = plantRows(b).filter((r) => r.kind !== 'unverified-default');
    expect(rows.map((r) => [r.kind, r.subject])).toEqual([['typed-over-database', 'Log Kow']]);
  });

  it('still reports a chemical with no record anywhere as unsourced', () => {
    const b = run({ edit: plants({ chemicalId: '0-0-0', koc: '4.6' }) });
    const rows = plantRows(b).filter((r) => r.kind !== 'unverified-default');
    expect(rows.map((r) => r.kind)).toEqual(['entered-unsourced']);
    expect(rows[0]!.detail).toMatch(/no database record/);
  });

  it('takes the Koc of a user chemical from its own values', () => {
    const user: ProjectChemical = {
      id: 'user-1',
      name: 'Mine',
      values: { koc: { value: '50', note: 'Lab' } },
    } as ProjectChemical;
    const b = run({
      chemicals: [user],
      edit: plants({ chemicalId: 'user-1', koc: '50' }),
    });
    expect(plantRows(b).filter((r) => r.kind !== 'unverified-default')).toEqual([]);
  });
});
