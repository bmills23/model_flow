import { describe, expect, it } from 'vitest';
import { buildProject, defaultScreens } from '../project';
import { exportCsv } from '../export/csv';
import { buildReport } from './buildReport';
import type { BasisRow, ProjectBasis } from './basis';
import {
  BASIS_CSV_NAME,
  basisCsvTable,
  basisSummary,
  KIND_LABEL,
  publishedExampleCount,
} from './basisView';
import { APP_VERSION, BUILD_COMMIT } from '../buildInfo';

const r = (over: Partial<BasisRow>): BasisRow => ({
  kind: 'entered-unsourced',
  subject: 'Koc',
  value: '10 mL/g',
  detail: 'entered by hand, no database chemical',
  note: 'no note',
  referenceKey: null,
  referenceStatus: null,
  defaultId: null,
  via: null,
  stale: false,
  ...over,
});

const DEFAULT_ROW = r({
  kind: 'unverified-default',
  subject: 'Gelhar regression',
  value: 'built-in default',
  defaultId: 'gelhar-vadose-regression',
  referenceKey: 'gelhar1985',
  referenceStatus: 'used',
  note: 'No primary source.',
});

const BASIS: ProjectBasis = {
  sections: {
    vadose: [DEFAULT_ROW, r({})],
    transport: [
      r({ via: 'vadose', stale: true }),
      r({ kind: 'typed-over-database', subject: 'H' }),
    ],
  },
  project: [r({ kind: 'receptor-edit', subject: 'Risk, Receptor A: Body weight', value: '60 kg' })],
};

describe('app version and commit', () => {
  it('starts at 0.1.0 and a saved project is stamped with it', () => {
    expect(APP_VERSION).toBe('0.1.0');
    const p = buildProject({ screens: defaultScreens(), createdWith: APP_VERSION });
    expect(p.createdWith).toBe('0.1.0');
  });
  it('has a commit string, "unknown" when git was unavailable', () => {
    expect(typeof BUILD_COMMIT).toBe('string');
    expect(BUILD_COMMIT.length).toBeGreaterThan(0);
  });
});

describe('publishedExampleCount', () => {
  it('counts reproduced examples that name the method', () => {
    expect(publishedExampleCount('groundwater.at123d')).toBeGreaterThan(0);
    expect(publishedExampleCount('no.such.method')).toBe(0);
  });
});

describe('basisSummary', () => {
  it('counts distinct rows by kind and names the unverified defaults', () => {
    const s = basisSummary(BASIS);
    expect(s.counts['unverified-default']).toBe(1);
    // the stale inherited copy of the same entered value is the same row
    expect(s.counts['entered-unsourced']).toBe(1);
    expect(s.counts['typed-over-database']).toBe(1);
    expect(s.counts['receptor-edit']).toBe(1);
    expect(s.counts['user-override']).toBe(0);
    expect(s.defaults).toEqual(['Gelhar regression']);
    expect(s.total).toBe(4);
  });
  it('has a label for every kind', () => {
    for (const k of Object.keys(basisSummary(BASIS).counts)) {
      expect(KIND_LABEL[k as keyof typeof KIND_LABEL]).toBeTruthy();
    }
  });
});

describe('basisCsvTable', () => {
  const report = buildReport(buildProject({ screens: defaultScreens(), createdWith: APP_VERSION }));
  const named = {
    ...report,
    sections: [
      { key: 'vadose' as const, name: 'Vadose leaching', inputs: [], methodIds: [], reads: [] },
      {
        key: 'transport' as const,
        name: 'Groundwater transport',
        inputs: [],
        methodIds: [],
        reads: [],
      },
    ],
  };
  it('writes one row per basis row with a screen column and the stale convention', () => {
    const t = basisCsvTable(named, BASIS);
    expect(t.name).toBe(`${BASIS_CSV_NAME}-stale-inputs`);
    expect(t.columns.map((c) => c.header)).toEqual([
      'screen',
      'kind',
      'subject',
      'value',
      'detail',
      'source note',
      'reference',
      'reference status',
      'default id',
      'via screen',
      'stale inputs',
    ]);
    expect(t.rows).toHaveLength(5);
    expect(t.rows[0]!.screen).toBe('Vadose leaching');
    expect(t.rows[2]!.via).toBe('Vadose leaching');
    expect(t.rows[2]!.staleInputs).not.toBe('');
    expect(t.rows[4]!.screen).toBe('Project');
    const text = exportCsv(t.rows, t.columns);
    expect(text.split('\r\n')[0]).toContain('stale inputs');
  });
  it('has no stale column or suffix when nothing is stale', () => {
    const clean: ProjectBasis = { sections: { vadose: [DEFAULT_ROW] }, project: [] };
    const t = basisCsvTable(named, clean);
    expect(t.name).toBe(BASIS_CSV_NAME);
    expect(t.columns.map((c) => c.header)).not.toContain('stale inputs');
  });
});
