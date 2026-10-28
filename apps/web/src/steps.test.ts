import { describe, expect, it } from 'vitest';
import { STEPS, stepForHash } from './steps';

const ALL_ROUTES = [
  '#/site',
  '#/chemicals',
  '#/transport',
  '#/vadose',
  '#/saturated',
  '#/vapor',
  '#/surface-water',
  '#/household',
  '#/plants-eco',
  '#/risk',
  '#/cleanup',
  '#/report',
];

describe('step bar model', () => {
  it('lists six steps in order, each with a real target route', () => {
    expect(STEPS.map((s) => s.label)).toEqual([
      'Chemicals',
      'Site model',
      'Transport',
      'Receptors',
      'Risk & cleanup',
      'Results',
    ]);
    for (const step of STEPS) expect(step.href).toMatch(/^#\/[a-z-]+$/);
  });

  it('maps every screen route to exactly one step', () => {
    for (const route of ALL_ROUTES) {
      const owners = STEPS.filter((s) => s.owns.includes(route));
      expect(owners, route).toHaveLength(1);
      expect(stepForHash(route)?.label).toBe(owners[0]!.label);
    }
  });

  it('puts the fate screens under Transport and the others where the plan says', () => {
    for (const r of ['#/transport', '#/vadose', '#/saturated', '#/vapor', '#/surface-water'])
      expect(stepForHash(r)?.label).toBe('Transport');
    expect(stepForHash('#/risk')?.label).toBe('Receptors');
    expect(stepForHash('#/cleanup')?.label).toBe('Risk & cleanup');
    expect(stepForHash('#/report')?.label).toBe('Results');
  });

  it('gives no step to the home, methods and documentation pages', () => {
    for (const r of ['', '#/', '#/methods', '#/docs', '#/docs/user-guide'])
      expect(stepForHash(r)).toBeUndefined();
  });
});

describe('guided step list', () => {
  it('lists the steps in order with a route each, steps 4 to 6 marked as arriving', async () => {
    const { GUIDED_STEPS, guidedHref, guidedStepForHash } = await import('./steps');
    expect(GUIDED_STEPS.map((s) => s.id)).toEqual([
      'chemicals',
      'site',
      'properties',
      'sources',
      'run',
      'pathways',
      'receptors',
      'toxicity',
      'targets',
      'results',
    ]);
    expect(GUIDED_STEPS.filter((s) => s.arrives).map((s) => s.number)).toEqual([
      '4a',
      '4b',
      '4c',
      '6',
    ]);
    for (const s of GUIDED_STEPS) {
      expect(guidedHref(s.id)).toBe(`#/step/${s.id}`);
      expect(guidedStepForHash(`#/step/${s.id}`)).toBe(s);
    }
    expect(guidedStepForHash('#/step/nope')).toBeUndefined();
    expect(guidedStepForHash('#/site')).toBeUndefined();
  });
});
