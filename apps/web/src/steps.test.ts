import { describe, expect, it } from 'vitest';
import {
  GUIDED_STEPS,
  ROUTE_REDIRECTS,
  STEPS,
  WORKBENCH_HASH,
  WORKBENCH_REPORT_HASH,
  WORKBENCH_ROUTES,
  guidedHref,
  guidedStepForHash,
  isWorkbenchHash,
  redirectedHash,
  stepForHash,
} from './steps';

describe('step bar model', () => {
  it('lists the six steps in order, each opening a guided step', () => {
    expect(STEPS.map((s) => s.label)).toEqual([
      'Chemicals',
      'Site model',
      'Site values and run',
      'Pathways and receptors',
      'Risk or cleanup',
      'Results',
    ]);
    for (const step of STEPS) expect(guidedStepForHash(step.href), step.label).toBeDefined();
  });

  it('maps every guided step to exactly one of the six', () => {
    for (const g of GUIDED_STEPS) {
      const owners = STEPS.filter((s) => s.owns.includes(guidedHref(g.id)));
      expect(owners, g.id).toHaveLength(1);
      expect(stepForHash(guidedHref(g.id))).toBe(owners[0]);
    }
  });

  it('groups 3a to 3d and 4a to 4c under one step each', () => {
    for (const id of ['properties', 'sources', 'run'] as const)
      expect(stepForHash(guidedHref(id))?.label).toBe('Site values and run');
    for (const id of ['pathways', 'receptors', 'toxicity'] as const)
      expect(stepForHash(guidedHref(id))?.label).toBe('Pathways and receptors');
  });

  it('gives no step to the home, report, workbench, methods and documentation pages', () => {
    for (const r of ['', '#/', '#/report', '#/workbench', '#/vadose', '#/methods', '#/docs'])
      expect(stepForHash(r)).toBeUndefined();
  });
});

describe('workbench routes', () => {
  it('lists every model screen once, with a report and the validation and methods pages', () => {
    const hrefs = WORKBENCH_ROUTES.map((r) => r.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of [
      '#/transport',
      '#/vadose',
      '#/saturated',
      '#/vapor',
      '#/surface-water',
      '#/household',
      '#/plants-eco',
      '#/risk',
      '#/cleanup',
      WORKBENCH_REPORT_HASH,
      '#/validation',
      '#/methods',
    ])
      expect(hrefs).toContain(h);
  });

  it('knows the workbench page and its routes, and nothing else', () => {
    expect(isWorkbenchHash(WORKBENCH_HASH)).toBe(true);
    for (const r of WORKBENCH_ROUTES) expect(isWorkbenchHash(r.href), r.href).toBe(true);
    for (const h of ['', '#/', '#/report', '#/step/run', '#/docs', '#/site'])
      expect(isWorkbenchHash(h), h).toBe(false);
  });

  it('sends the retired site and chemicals routes to steps 2 and 1', () => {
    expect(ROUTE_REDIRECTS).toEqual({ '#/site': '#/step/site', '#/chemicals': '#/step/chemicals' });
    expect(redirectedHash('#/site')).toBe('#/step/site');
    expect(redirectedHash('#/chemicals')).toBe('#/step/chemicals');
    expect(redirectedHash('#/risk')).toBe('#/risk');
  });
});

describe('guided step list', () => {
  it('lists the steps in order with a route each', () => {
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
    for (const s of GUIDED_STEPS) {
      expect(guidedHref(s.id)).toBe(`#/step/${s.id}`);
      expect(guidedStepForHash(`#/step/${s.id}`)).toBe(s);
    }
    expect(guidedStepForHash('#/step/nope')).toBeUndefined();
    expect(guidedStepForHash('#/site')).toBeUndefined();
  });
});
