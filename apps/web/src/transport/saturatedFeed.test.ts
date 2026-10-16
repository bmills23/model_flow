import { describe, expect, it } from 'vitest';
import { loadedMass, runExponential, saturatedSourceBox } from '@model-flow/engine';
import { compute, fedSteps, withFedSteps } from './compute';
import { DEFAULT_FORM, toScenario, type Scenario, type TransportForm } from './form';
import type { SaturatedFeed } from '../saturated/feed';
import { DEFAULT_FORM as SAT_FORM, toScenario as toSaturated } from '../saturated/form';

const sat = toSaturated(SAT_FORM);
if (!sat.ok) throw new Error('saturated scenario');
const satInput = sat.scenario.input;

function feed(method: 'legacy' | 'modern' = 'legacy', input = satInput): SaturatedFeed {
  return { input, method, label: 'Hand case A' };
}

function scenario(over: Partial<TransportForm> = {}, f: SaturatedFeed | null = feed()): Scenario {
  const r = toScenario(
    { ...DEFAULT_FORM, feedFromSaturated: true, timeYr: '12', ...over },
    null,
    f,
  );
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.scenario;
}

const aquifer = (velocity: number, thickness?: number) => ({
  velocity,
  porosity: 0.3,
  retardation: 1,
  decayRate: 0,
  dx: 1,
  dy: 1,
  dz: 1,
  ...(thickness !== undefined ? { thickness } : {}),
});

describe('transport screen fed by the saturated source', () => {
  it('takes the plan size, the mixing depth and the aquifer from the saturated screen', () => {
    const s = scenario({ srcLength: '999', porosity: '0.9', K: '999' });
    expect(s.srcLength).toBe(10);
    expect(s.srcWidth).toBe(10);
    expect(s.srcDepth).toBeCloseTo(1.5, 12);
    expect(s.porosity).toBe(0.3);
    expect(s.velocity * s.porosity).toBeCloseTo((5 / 86400) * 0.01, 15);
    const kd = satInput.chemical.koc * satInput.soil.foc;
    expect(s.retardation).toBeCloseTo(1 + (satInput.soil.rhoB * kd) / 0.3, 12);
    expect(s.fed?.saturated).toBeDefined();
    expect(s.top).toBe('no-flux');
  });

  it('puts the source box where saturatedSourceBox puts it, for both aquifer kinds', () => {
    const inf = scenario();
    const box = saturatedSourceBox(satInput, aquifer(inf.velocity));
    expect(inf.source).toMatchObject({ x1: box.x1, x2: box.x2, y1: box.y1, y2: box.y2 });
    expect(inf.source.z1).toBeCloseTo(box.z1, 12);
    expect(inf.source.z2).toBeCloseTo(box.z2, 12);
    const fin = scenario({ thicknessMode: 'finite', thickness: '10' });
    const fbox = saturatedSourceBox(satInput, aquifer(fin.velocity, 10));
    expect(fin.source.z1).toBeCloseTo(fbox.z1, 12);
    expect(fin.source.z2).toBeCloseTo(fbox.z2, 12);
  });

  it('keeps the typed mixing depth when the source never submerges', () => {
    const dry = toSaturated({ ...SAT_FORM, hMin: '0', dh: '0' });
    if (!dry.ok) throw new Error('dry');
    const s = scenario({ srcDepth: '2.5' }, feed('modern', dry.scenario.input));
    expect(s.srcDepth).toBe(2.5);
  });

  it('is an ordinary scenario when the toggle is off or no feed is held', () => {
    const off = toScenario({ ...DEFAULT_FORM, feedFromSaturated: false }, null, feed());
    expect(off.ok).toBe(true);
    if (off.ok) expect(off.scenario.fed).toBeUndefined();
    const none = toScenario({ ...DEFAULT_FORM, feedFromSaturated: true }, null, null);
    expect(none.ok).toBe(true);
    if (none.ok) expect(none.scenario.fed).toBeUndefined();
  });

  it('builds steps that carry the delivered mass of the chosen method up to the evaluation time', () => {
    const s = scenario({}, feed('modern'));
    const steps = fedSteps(s);
    const d = runExponential({ ...satInput, tEnd: s.time }).budget.delivered;
    expect(Math.abs(loadedMass(steps) - d) / d).toBeLessThan(1e-12);
    expect(steps.length).toBeLessThanOrEqual(48);
    const legacy = fedSteps(scenario({}, feed('legacy')));
    expect(loadedMass(legacy)).toBeCloseTo(17, 9);
    expect(legacy.length).toBe(1);
  });

  it('computes and notes the feed, and the seasonal fallback when it applies', () => {
    const small = { nx: 10, ny: 8, nCurve: 4 };
    const out = compute({
      scenario: scenario({ timeYr: '5' }),
      mapMethod: 'legacy',
      domenico: false,
      ...small,
    });
    if (!out.ok) throw new Error(out.error);
    const codes = out.result.warnings.map((w) => w.code);
    expect(codes).toContain('ui.saturated-feed');
    expect(codes).not.toContain('ui.saturated-seasonal-fallback');
    expect(out.result.readouts.legacy).toBeGreaterThan(0);

    const seasonal = toSaturated({ ...SAT_FORM, schedule: 'seasonal' });
    if (!seasonal.ok) throw new Error('seasonal');
    const long = scenario({ timeYr: '30' }, feed('modern', seasonal.scenario.input));
    expect(withFedSteps(long).fed?.seasonalFallback).toBe(true);
    const out2 = compute({ scenario: long, mapMethod: 'legacy', domenico: false, ...small });
    if (!out2.ok) throw new Error(out2.error);
    expect(out2.result.warnings.map((w) => w.code)).toContain('ui.saturated-seasonal-fallback');
  });
});

describe('saturated feed aquifer validation', () => {
  const bad = (aq: Partial<typeof satInput.aquifer>, soil: Partial<typeof satInput.soil> = {}) =>
    toScenario(
      { ...DEFAULT_FORM, feedFromSaturated: true, timeYr: '12' },
      null,
      feed('legacy', {
        ...satInput,
        aquifer: { ...satInput.aquifer, ...aq },
        soil: { ...satInput.soil, ...soil },
      }),
    );

  it('reports a zero gradient or a porosity of 1 as an input error naming the saturated screen', () => {
    const g = bad({ gradient: 0 });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.errors.join(' ')).toMatch(/gradient.*saturated/i);
    const n = bad({}, { porosity: 1 });
    expect(n.ok).toBe(false);
    if (!n.ok) expect(n.errors.join(' ')).toMatch(/porosity.*saturated/i);
  });
});

describe('saturated feed for a source that never submerges', () => {
  it('keeps the typed mixing depth and says so, unlike the engine coupling, which uses a patch', () => {
    const dry = toSaturated({ ...SAT_FORM, hMin: '0', dh: '0' });
    if (!dry.ok) throw new Error('dry');
    const s = scenario({ srcDepth: '3.5' }, feed('legacy', dry.scenario.input));
    expect(s.srcDepth).toBe(3.5);
    const out = compute({
      scenario: s,
      mapMethod: 'legacy',
      domenico: false,
      nx: 10,
      ny: 8,
      nCurve: 4,
    });
    if (!out.ok) throw new Error(out.error);
    const note = out.result.warnings.find((w) => w.code === 'ui.saturated-feed');
    expect(note?.message).toMatch(/never reaches below the water table/i);
    expect(note?.message).toMatch(/mixing depth typed/i);
    const wet = compute({
      scenario: scenario(),
      mapMethod: 'legacy',
      domenico: false,
      nx: 10,
      ny: 8,
      nCurve: 4,
    });
    if (!wet.ok) throw new Error(wet.error);
    expect(wet.result.warnings.find((w) => w.code === 'ui.saturated-feed')?.message).not.toMatch(
      /never reaches/i,
    );
  });
});
