import { describe, expect, it } from 'vitest';
import { buildProject, defaultScreens, parseProject } from '../project';
import { MAX_SHARE_LINK_LENGTH, decodeShare, makeShareLink } from '../project/share';
import { fromProject, guidedOf, toProject } from './project';
import { defaultGuided, isDefaultGuided, type GuidedState } from './state';

const goodWell = {
  inputsHash: 'h1',
  value: {
    method: 'modern',
    label: 'Well',
    times: [0, 1, 2],
    values: [0, 1, 2],
    chemicalId: '71-43-2',
  },
};

function sample(): GuidedState {
  const g = defaultGuided();
  g.site = {
    ...g.site,
    sources: ['groundwater'],
    paths: { ...g.site.paths, well: true },
  };
  g.sources = {
    '71-43-2': { values: { groundwater: { value: '5', unit: 'mg/L' } }, note: 'MW-1', tph: '' },
  };
  g.run = { ...g.run, timeYr: '50' };
  g.outputs = {
    well: { '71-43-2': goodWell },
    // a scenario can hold a non-finite number, which the file carries as a tagged object
    vadose: {
      '71-43-2': {
        inputsHash: 'h3',
        value: {
          scenario: { endYr: Infinity },
          method: 'modern',
          label: 'Vadose',
          chemicalId: '71-43-2',
        },
      },
    },
  };
  return g;
}

const project = (g: GuidedState) =>
  buildProject({ screens: defaultScreens(), guided: g, createdWith: '0.0.0' });

describe('guided project key', () => {
  it('the default state writes no key and reads back as the default', () => {
    expect(toProject(defaultGuided())).toBeUndefined();
    expect(isDefaultGuided(fromProject(undefined))).toBe(true);
    expect(project(defaultGuided()).guided).toBeUndefined();
  });

  it('round trips through the file text, a non-finite output number included', () => {
    const g = sample();
    const text = JSON.stringify(project(g));
    const r = parseProject(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(guidedOf(r.project)).toEqual(g);
    expect(r.warnings).toEqual([]);
  });

  it('a malformed output is dropped alone and reported', () => {
    const doc = JSON.parse(JSON.stringify(project(sample()))) as {
      guided: { outputs: Record<string, Record<string, unknown>> };
    };
    doc.guided.outputs['well']!['108-88-3'] = {
      inputsHash: 'h2',
      value: {
        method: 'modern',
        label: 'Well',
        times: [0, 1],
        values: [0],
        chemicalId: '108-88-3',
      },
    };
    doc.guided.outputs['bank'] = { '71-43-2': 'not an output' };
    const r = parseProject(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const g = guidedOf(r.project);
    expect(Object.keys(g.outputs['well'] ?? {})).toEqual(['71-43-2']);
    expect(g.outputs['bank']).toBeUndefined();
    expect(g.sources['71-43-2']?.note).toBe('MW-1');
    expect(r.warnings.map((w) => w.path).sort()).toEqual([
      'guided.outputs.bank.71-43-2',
      'guided.outputs.well.108-88-3',
    ]);
  });

  it('an output whose value names another chemical is dropped', () => {
    const doc = JSON.parse(JSON.stringify(project(sample()))) as {
      guided: { outputs: Record<string, Record<string, unknown>> };
    };
    doc.guided.outputs['well'] = { '108-88-3': doc.guided.outputs['well']!['71-43-2'] };
    const r = parseProject(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(guidedOf(r.project).outputs['well']).toBeUndefined();
  });

  it('an unknown output feed key is dropped and reported', () => {
    const doc = JSON.parse(JSON.stringify(project(sample()))) as {
      guided: { outputs: Record<string, unknown> };
    };
    doc.guided.outputs['mystery'] = { x: { inputsHash: 'h', value: {} } };
    const r = parseProject(doc);
    expect(r.ok && r.warnings.some((w) => w.path === 'guided.outputs.mystery')).toBe(true);
  });

  it('a share link keeps the answers and leaves the outputs out', async () => {
    const r = await makeShareLink(project(sample()), 'https://example.org/model_flow/');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.link.length).toBeLessThan(MAX_SHARE_LINK_LENGTH);
    const back = await decodeShare(r.link.slice(r.link.indexOf('#/p=') + 4));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const g = guidedOf(back.project);
    expect(g.outputs).toEqual({});
    expect(g.sources['71-43-2']?.note).toBe('MW-1');
    expect(g.run.timeYr).toBe('50');
  });
});
