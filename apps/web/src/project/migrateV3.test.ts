import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEMPLATE_STRIPPED, GUIDED_FORM_KEYS } from '../guided/state';
import { buildProject, defaultScreens, parseProject } from './index';
import { CURRENT_VERSION, migrations } from './migrate';

const FIXTURES = `${process.cwd()}/src/project/fixtures/`;
const read = (name: string): string => readFileSync(`${FIXTURES}${name}`, 'utf8');
const json = (name: string): Record<string, unknown> =>
  JSON.parse(read(name)) as Record<string, unknown>;

describe('project file version 3: the guided key', () => {
  it('this build writes and reads version 3, with a step from version 2', () => {
    expect(CURRENT_VERSION).toBe(3);
    expect(typeof migrations[2]).toBe('function');
  });

  it('a saved version 2 file loads to the expected version 3 document', () => {
    const r = parseProject(read('project-v2-site.json'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project).toEqual(json('project-v3-site-expected.json'));
    expect(r.warnings).toEqual([]);
  });

  it('changes nothing but the version, the guided copies of the receptor edits and the guided key', () => {
    const before = json('project-v2-site.json');
    const after = migrations[2]!(before);
    const { guided: _g, version: _v, overrides: ov, ...rest } = after;
    const { version: _bv, overrides: bov, ...brest } = before;
    void _g;
    void _v;
    void _bv;
    expect(rest).toEqual(brest);
    expect((ov as { toxicity?: unknown }).toxicity).toEqual(
      (bov as { toxicity?: unknown }).toxicity,
    );
  });

  it('does not change its input', () => {
    const before = json('project-v2-site.json');
    const copy = structuredClone(before);
    migrations[2]!(before);
    expect(before).toEqual(copy);
  });

  it('a version 1 file goes through both steps and keeps every screen', () => {
    const v1 = read('project-v1.json');
    const r = parseProject(v1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { guided, ...rest } = r.project;
    expect(rest).toEqual({ ...json('project-v2-expected.json'), version: 3 });
    expect(guided).toBeDefined();
    // no site key in the file: the guided site stays at its defaults
    expect(guided?.site).toBeUndefined();
    expect(guided?.outputs).toBeUndefined();
    expect(guided?.forms?.transport).toBeDefined();
    expect(guided?.forms?.transport).not.toHaveProperty('chemicalId');
  });

  it('a file with no screens gets an empty guided key', () => {
    const doc = {
      format: 'model_flow.project',
      version: 2,
      createdWith: '0.0.0',
      savedAt: '2026-10-25T12:00:00.000Z',
      screens: {},
    };
    const r = parseProject(doc);
    expect(r.ok && r.project.version).toBe(3);
    expect(r.ok && r.project.guided).toEqual({});
  });

  it('measured basis: direct media become measured and the risk rows give the concentrations', () => {
    const doc = json('project-v2-site.json') as {
      site: Record<string, unknown>;
      screens: Record<string, unknown>;
    };
    doc.site = { ...doc.site, basis: 'direct', media: ['soil', 'groundwater'] };
    const out = migrations[2]!(doc) as {
      guided: {
        site: Record<string, unknown>;
        sources: Record<string, { values: Record<string, unknown> }>;
      };
    };
    expect(out.guided.site).toMatchObject({
      basis: 'measured',
      sources: [],
      measured: ['soil', 'groundwater'],
      paths: { leaching: false, well: false, building: false, stream: false },
    });
    expect(out.guided.sources['71-43-2']?.values).toEqual({
      soil: { value: '3', unit: 'mg/kg' },
      groundwater: { value: '0.02', unit: 'mg/L' },
    });
    expect(out.guided.sources['108-88-3']).toBeUndefined();
  });

  it('the modeled site answers map to sources and paths', () => {
    const base = json('project-v2-site.json') as { site: Record<string, unknown> };
    const map = (media: string[]): { sources: string[]; paths: Record<string, boolean> } => {
      const out = migrations[2]!({ ...base, site: { ...base.site, media } }) as {
        guided: { site: { sources: string[]; paths: Record<string, boolean> } };
      };
      return out.guided.site;
    };
    expect(map(['soil'])).toMatchObject({
      sources: ['soilAbove'],
      paths: { leaching: true, well: true, building: false },
    });
    expect(map(['groundwater'])).toMatchObject({
      sources: ['groundwater'],
      paths: { leaching: false, well: true, building: false },
    });
    expect(map(['soilToIndoorAir'])).toMatchObject({
      sources: ['soilAbove'],
      paths: { leaching: false, well: false, building: true },
    });
    expect(map(['soilGasToIndoorAir'])).toMatchObject({
      sources: ['soilGas'],
      paths: { building: true },
    });
  });

  it('a template holds every field of its form except the chemical and source fields', () => {
    const built = buildProject({ screens: defaultScreens(), createdWith: '0.0.0' });
    const v2 = { ...built, version: 2 } as unknown as Record<string, unknown>;
    const out = migrations[2]!(v2) as {
      guided: { forms: Record<string, Record<string, unknown>> };
    };
    const screens = built.screens as unknown as Record<string, { form: Record<string, unknown> }>;
    for (const key of GUIDED_FORM_KEYS) {
      const form = screens[key]!.form;
      const expected = Object.keys(form).filter((k) => !TEMPLATE_STRIPPED[key].includes(k));
      expect(Object.keys(out.guided.forms[key]!).sort(), key).toEqual(expected.sort());
    }
  });
});
