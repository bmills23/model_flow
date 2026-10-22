// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { gelhar1985Longitudinal } from '@model-flow/engine';
import { DEFAULT_FORM, toScenario } from './form';
import { fromProject, toProject, transportProjectSchema } from './project';

describe('transport project: the dispersivity choice', () => {
  it('opens a saved regression blank as the regression, with its numbers unchanged and warned', () => {
    const saved = { form: { dispLaw: 'legacy', alphaLOverride: '', rx: '100' } };
    const parsed = transportProjectSchema.parse(saved);
    const { form } = fromProject(parsed);
    expect(form.dispLaw).toBe('legacy');
    const r = toScenario(form);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenario.alphaL).toBeCloseTo(gelhar1985Longitudinal(100), 12);
    expect(r.scenario.notes.map((n) => n.code)).toEqual(['dispersivity.regression-unsourced']);
  });

  it('reads a saved form that has no law at all as the regression it always meant', () => {
    const { form } = fromProject(transportProjectSchema.parse({ form: { rx: '60' } }));
    expect(form.dispLaw).toBe('legacy');
  });

  it('starts a project with no transport form on an entered value', () => {
    expect(fromProject(undefined).form.dispLaw).toBe('entered');
    expect(fromProject({}).form.dispLaw).toBe('entered');
  });

  it('round-trips the entered and SSG choices', () => {
    for (const dispLaw of ['entered', 'ssg'] as const) {
      const form = { ...DEFAULT_FORM, dispLaw, alphaTOverride: '0.5' };
      const back = fromProject(transportProjectSchema.parse(toProject({ form, method: 'modern' })));
      expect(back.form.dispLaw).toBe(dispLaw);
      expect(back.form.alphaTOverride).toBe('0.5');
    }
  });
});
