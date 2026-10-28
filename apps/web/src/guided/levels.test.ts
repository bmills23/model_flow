import { describe, expect, it } from 'vitest';
import { buildProject, defaultScreens, parseProject } from '../project';
import { readGuidedLevels, type GuidedKeptLevel } from './levels';
import { fromProject, guidedOf, toProject } from './project';
import { defaultGuided, withoutGuidedChemical, type GuidedState } from './state';

const BENZENE = '71-43-2';
const MTBE = '1634-04-4';

const kept = (id: string, name: string): GuidedKeptLevel => ({
  chemicalId: id,
  chemical: name,
  fingerprint: 'f1',
  source: 'dissolved',
  medium: 'groundwater',
  methods: {
    modern: {
      ok: true,
      level: 1e-3,
      cancerLevel: 1e-3,
      noncancerLevel: 2e-3,
      limiting: 'cancer',
      impliedTph: null,
      endpoint: 'cancer',
      target: 1e-6,
      solvedBy: 'linear',
      evaluations: 2,
      residual: 0,
      transport: 'Modern',
      warnings: [],
    },
    legacy: { ok: false, error: 'refused' },
  },
  notes: [],
  target: 'risk',
  allocation: 'individual',
  reason: null,
});

function sample(): GuidedState {
  const g = defaultGuided();
  g.site = { ...g.site, sources: ['groundwater'], paths: { ...g.site.paths, well: true } };
  g.targets = { ...g.targets, mode: 'cleanup' };
  g.levels = { [BENZENE]: kept(BENZENE, 'Benzene'), [MTBE]: kept(MTBE, 'MTBE') };
  return g;
}

const project = (g: GuidedState) =>
  buildProject({ screens: defaultScreens(), guided: g, createdWith: '0.0.0' });

describe('the kept step 5 levels in the project file', () => {
  it('round trip through the file text', () => {
    const r = parseProject(JSON.stringify(project(sample())));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(guidedOf(r.project).levels).toEqual(sample().levels);
  });

  it('a malformed entry is dropped alone and the file still opens', () => {
    const doc = JSON.parse(JSON.stringify(project(sample()))) as {
      guided: { levels: Record<string, unknown> };
    };
    doc.guided.levels[MTBE] = { chemicalId: MTBE, fingerprint: 3 };
    const r = parseProject(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const levels = guidedOf(r.project).levels ?? {};
    expect(Object.keys(levels)).toEqual([BENZENE]);
  });

  it('an entry filed under another chemical is dropped', () => {
    expect(readGuidedLevels({ [MTBE]: kept(BENZENE, 'Benzene') })).toEqual({});
    expect(readGuidedLevels('nonsense')).toEqual({});
  });

  it('a file without the key opens with no kept levels, and none writes no key', () => {
    const g = defaultGuided();
    g.targets.mode = 'cleanup';
    expect(fromProject(toProject(g)).levels).toBeUndefined();
    expect(toProject({ ...g, levels: {} })).not.toHaveProperty('levels');
  });

  it('a chemical that leaves the project takes its kept level with it', () => {
    const g = withoutGuidedChemical(sample(), MTBE);
    expect(Object.keys(g.levels ?? {})).toEqual([BENZENE]);
  });
});
