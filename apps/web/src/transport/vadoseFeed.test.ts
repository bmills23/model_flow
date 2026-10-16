import { describe, expect, it } from 'vitest';
import { loadedMass } from '@model-flow/engine';
import { compute, fedSteps, receptorConcentration, withFedSteps } from './compute';
import { DEFAULT_FORM, toScenario, type Scenario, type TransportForm } from './form';
import { vadoseFluxSeries } from '../vadose/compute';
import { DEFAULT_FORM as VADOSE_FORM, toScenario as toVadose } from '../vadose/form';
import type { VadoseFeed } from '../vadose/feed';

const v = toVadose(VADOSE_FORM);
if (!v.ok) throw new Error('vadose scenario');
const vadoseScenario = v.scenario;

function feed(method: 'legacy' | 'modern' = 'legacy'): VadoseFeed {
  return { scenario: vadoseScenario, method, label: 'Table R-7 validation case' };
}

function scenario(over: Partial<TransportForm> = {}, f: VadoseFeed | null = feed()): Scenario {
  const r = toScenario({ ...DEFAULT_FORM, feedFromVadose: true, timeYr: '12', ...over }, f);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.scenario;
}

describe('transport screen fed by the vadose result', () => {
  it('takes the plan size from the vadose source and ignores the typed source strength', () => {
    const s = scenario({ c0: 'not a number', srcLength: '999', srcWidth: '999' });
    expect(s.srcLength).toBe(10);
    expect(s.srcWidth).toBe(10);
    expect(s.source.x1).toBe(-10);
    expect(s.source.y2 - s.source.y1).toBe(10);
    expect(s.fed?.method).toBe('legacy');
  });

  it('is an ordinary scenario when the toggle is off or no feed is held', () => {
    expect(toScenario({ ...DEFAULT_FORM, feedFromVadose: false }, feed())).toMatchObject({
      ok: true,
    });
    const off = toScenario({ ...DEFAULT_FORM, feedFromVadose: false }, feed());
    if (off.ok) expect(off.scenario.fed).toBeUndefined();
    const none = toScenario({ ...DEFAULT_FORM, feedFromVadose: true }, null);
    if (none.ok) expect(none.scenario.fed).toBeUndefined();
  });

  it('gives an infinitely deep aquifer a no-flux water table and leaves a finite one alone', () => {
    expect(scenario().top).toBe('no-flux');
    expect(scenario({ thicknessMode: 'finite', thickness: '10' }).top).toBeUndefined();
    const plain = toScenario(DEFAULT_FORM, feed());
    if (plain.ok) expect(plain.scenario.top).toBeUndefined();
  });

  it('builds mass-release steps that carry the mass the vadose run delivers by the evaluation time', () => {
    const s = scenario();
    const steps = fedSteps(s);
    const series = vadoseFluxSeries(vadoseScenario, 'legacy', s.time);
    let delivered = 0;
    for (let k = 1; k < series.times.length; k++) {
      delivered +=
        0.5 * (series.flux[k]! + series.flux[k - 1]!) * (series.times[k]! - series.times[k - 1]!);
    }
    delivered *= 100; // 10 m by 10 m
    expect(loadedMass(steps)).toBeCloseTo(delivered, 9);
    expect(steps[0]!.start).toBe(0);
    expect(steps[steps.length - 1]!.end).toBeCloseTo(s.time, 3);
    expect(steps.length).toBeLessThanOrEqual(48);
    expect(steps.every((x) => x.rate >= 0)).toBe(true);
  });

  it('uses the chosen vadose method for the schedule', () => {
    const a = fedSteps(scenario({}, feed('legacy')));
    const b = fedSteps(scenario({}, feed('modern')));
    expect(loadedMass(a)).not.toBeCloseTo(loadedMass(b), 6);
  });

  it('computes with the schedule and notes the feed', () => {
    const out = compute({
      scenario: scenario({ timeYr: '12' }),
      mapMethod: 'legacy',
      domenico: false,
      nx: 20,
      ny: 12,
      nCurve: 6,
    });
    if (!out.ok) throw new Error(out.error);
    const codes = out.result.warnings.map((w) => w.code);
    expect(codes).toContain('ui.vadose-feed');
    expect(out.result.readouts.legacy).toBeGreaterThanOrEqual(0);
    expect(Math.max(...out.result.grid.flat())).toBeGreaterThan(0);
  }, 30000);

  it('moves the water-table load into an aquifer where the default medium would lose half', () => {
    const fed = withFedSteps(scenario());
    const withTop = receptorConcentration(fed, 'legacy', fed.time);
    const without = receptorConcentration({ ...fed, top: undefined }, 'legacy', fed.time);
    expect(withTop).toBeGreaterThan(without);
  }, 30000);
});
