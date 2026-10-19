import { describe, expect, it } from 'vitest';
import { buildProject, defaultScreens, type Screens } from '../project';
import { buildReport, flattenInputs, NON_AFFILIATION } from './buildReport';

const NOW = new Date('2026-10-18T12:00:00.000Z');

function project(edit?: (s: Screens) => void, title?: string) {
  const screens = defaultScreens();
  edit?.(screens);
  return buildProject({
    screens,
    createdWith: '0.0.1',
    now: NOW,
    ...(title !== undefined ? { title } : {}),
  });
}

describe('flattenInputs', () => {
  it('lists nested fields by path with values as typed', () => {
    const rows = flattenInputs({
      K: '12.5',
      steps: [{ start: '0', end: '5' }],
      a: { name: 'x', on: true },
      b: null,
      blank: '',
    });
    expect(rows).toEqual([
      { path: 'K', label: 'K', value: '12.5' },
      { path: 'steps[0].start', label: 'steps 1 start', value: '0' },
      { path: 'steps[0].end', label: 'steps 1 end', value: '5' },
      { path: 'a.name', label: 'a name', value: 'x' },
      { path: 'a.on', label: 'a on', value: 'yes' },
      { path: 'b', label: 'b', value: 'none' },
      { path: 'blank', label: 'blank', value: '(blank)' },
    ]);
  });

  it('splits camelCase words in labels', () => {
    expect(flattenInputs({ srcLength: '3' })[0]!.label).toBe('src length');
  });
});

describe('buildReport', () => {
  it('has no screen sections and no methods for a new project', () => {
    const r = buildReport(project());
    expect(r.sections).toEqual([]);
    expect(r.statement.methods).toEqual([]);
    expect(r.unused.length).toBe(7);
  });

  it('carries the title, saved date, app version and the non-affiliation statement', () => {
    const r = buildReport(project(undefined, 'Site 4'));
    expect(r.title).toBe('Site 4');
    expect(r.savedAt).toBe('2026-10-18T12:00:00.000Z');
    expect(r.createdWith).toBe('0.0.1');
    expect(r.nonAffiliation).toBe(NON_AFFILIATION);
    expect(NON_AFFILIATION).toMatch(/not affiliated with/);
  });

  it('adds a section with its inputs and methods for each edited screen', () => {
    const r = buildReport(
      project((s) => {
        s.vadose = { ...s.vadose, form: { ...s.vadose.form, foc: '0.0123' } } as Screens['vadose'];
      }),
    );
    expect(r.sections.map((x) => x.key)).toEqual(['vadose']);
    const sec = r.sections[0]!;
    expect(sec.name).toBe('Vadose leaching');
    expect(sec.inputs.find((i) => i.path === 'foc')?.value).toBe('0.0123');
    expect(sec.methodIds).toEqual(['vadose.vadsat', 'vadose.layered']);
    expect(r.statement.methods.map((m) => m.id).sort()).toEqual([
      'vadose.layered',
      'vadose.vadsat',
    ]);
    expect(r.unused).not.toContain('Vadose leaching');
  });

  it('prints the data editions only for datasets a used screen reads', () => {
    const r = buildReport(
      project((s) => {
        s.surfaceWater = {
          form: { ...s.surfaceWater.form, volume: '3.3' },
        } as Screens['surfaceWater'];
      }),
    );
    expect(r.statement.data.map((d) => d.kind)).toEqual(['nrwqc', 'sediment']);
  });

  it('prints no personal contact line', () => {
    const r = buildReport(project(undefined, 'T'));
    expect(JSON.stringify(r)).not.toMatch(/@[a-z0-9-]+\./i);
  });
});
