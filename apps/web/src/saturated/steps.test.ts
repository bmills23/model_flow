import { describe, expect, it } from 'vitest';
import { convert, loadedMass, runExponential, runTwoRegion } from '@model-flow/engine';
import { DEFAULT_FORM, toScenario, type SaturatedForm } from './form';
import { saturatedFedSteps, FED_MAX_STEPS } from './steps';

const YR = convert(1, 'yr', 's');
const MONTH = YR / 12;

function input(over: Partial<SaturatedForm> = {}) {
  const r = toScenario({ ...DEFAULT_FORM, ...over });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.scenario.input;
}
const stepLength = (time: number) => Math.max(MONTH, time / FED_MAX_STEPS);

describe('saturated feed step cap', () => {
  it('feeds the legacy annual mean as one step carrying the delivered mass', () => {
    const i = input();
    const t = 10 * YR;
    const f = saturatedFedSteps(i, 'legacy', t, stepLength(t));
    expect(f.fallback).toBe(false);
    expect(f.steps.length).toBe(1);
    const d = runTwoRegion({ ...i, tEnd: t }).budget.delivered;
    expect(Math.abs(loadedMass(f.steps) - d) / d).toBeLessThan(1e-12);
  });

  it('caps the modern feed at 48 steps with exact mass', () => {
    const i = input();
    for (const years of [10, 50]) {
      const t = years * YR;
      const f = saturatedFedSteps(i, 'modern', t, stepLength(t));
      expect(f.steps.length).toBeLessThanOrEqual(FED_MAX_STEPS);
      expect(f.fallback).toBe(false);
      const d = runExponential({ ...i, tEnd: t }).budget.delivered;
      expect(Math.abs(loadedMass(f.steps) - d) / d).toBeLessThan(1e-12);
    }
  });

  it('keeps a modern seasonal schedule by lengthening the steps while the segments fit the cap', () => {
    const i = input({ schedule: 'seasonal' });
    const t = 10 * YR;
    const f = saturatedFedSteps(i, 'modern', t, stepLength(t));
    expect(f.fallback).toBe(false);
    expect(f.steps.length).toBeLessThanOrEqual(FED_MAX_STEPS);
    expect(f.steps.length).toBeGreaterThanOrEqual(20);
    const d = runExponential({ ...i, tEnd: t }).budget.delivered;
    expect(Math.abs(loadedMass(f.steps) - d) / d).toBeLessThan(1e-12);
  });

  it('falls back to the annual mean when even one step per season exceeds the cap', () => {
    const i = input({ schedule: 'seasonal' });
    const t = 30 * YR;
    const f = saturatedFedSteps(i, 'modern', t, stepLength(t));
    expect(f.fallback).toBe(true);
    expect(f.steps.length).toBeLessThanOrEqual(FED_MAX_STEPS);
    const mean = runExponential({
      ...i,
      source: { ...i.source, schedule: 'annual-mean' },
      tEnd: t,
    }).budget.delivered;
    expect(Math.abs(loadedMass(f.steps) - mean) / mean).toBeLessThan(1e-12);
  });

  it('falls back for a long-lived legacy seasonal source and not for a short-lived one', () => {
    const t = 30 * YR;
    const short = saturatedFedSteps(input({ schedule: 'seasonal' }), 'legacy', t, stepLength(t));
    expect(short.fallback).toBe(false);
    const big = input({ schedule: 'seasonal', F: '5000', FT: '50000' });
    const long = saturatedFedSteps(big, 'legacy', t, stepLength(t));
    expect(long.fallback).toBe(true);
    expect(long.steps.length).toBe(1);
  });

  it('ignores a source decay rate for the legacy method', () => {
    const i = input({ srcDecay: '0.001' });
    const t = 5 * YR;
    expect(() => saturatedFedSteps(i, 'legacy', t, stepLength(t))).not.toThrow();
  });
});
