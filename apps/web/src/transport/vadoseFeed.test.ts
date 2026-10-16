import { describe, expect, it } from 'vitest';
import { fluxToLoadingSteps, loadedMass } from '@model-flow/engine';
import {
  FED_MAX_STEPS,
  compute,
  fedStepLength,
  fedSteps,
  receptorConcentration,
  withFedSteps,
} from './compute';
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
    if (plain.ok) expect(plain.scenario.top).toBe('no-flux');
  });

  it('builds mass-release steps that carry the mass the vadose run delivers by the evaluation time', () => {
    const s = scenario();
    const steps = fedSteps(s);
    const series = vadoseFluxSeries(vadoseScenario, 'legacy', s.time);
    // the vadose run's own exact cumulative delivery over the 10 m by 10 m source, not the trapezoid
    const delivered = series.delivered[series.delivered.length - 1]!;
    expect(Math.abs(loadedMass(steps) - delivered) / delivered).toBeLessThan(1e-12);
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

  it('moves the water-table load into an aquifer where the whole-space medium would lose half', () => {
    const fed = withFedSteps(scenario());
    const withTop = receptorConcentration(fed, 'legacy', fed.time);
    const without = receptorConcentration({ ...fed, top: 'unbounded' }, 'legacy', fed.time);
    expect(withTop).toBeGreaterThan(without);
  }, 30000);

  it('uses one-month steps until the cap, then equal steps of time / cap', () => {
    const YEAR = 365.25 * 86400;
    const month = YEAR / 12;
    expect(fedStepLength(2 * YEAR)).toBeCloseTo(month, 3);
    expect(fedStepLength(4 * YEAR)).toBeCloseTo(month, 3);
    expect(fedStepLength(50 * YEAR)).toBeCloseTo((50 * YEAR) / FED_MAX_STEPS, 3);
    const steps = fedSteps(scenario({ timeYr: '50' }));
    expect(steps.length).toBeLessThanOrEqual(FED_MAX_STEPS);
    const s2 = fedSteps(scenario({ timeYr: '3' }));
    expect(s2).toHaveLength(36);
  }, 60000);

  // The capped step is the longest the screen uses (12.5 months at 50 years); it must still give the
  // receptor value of a schedule four times finer to within the bound documented in the methods note.
  it.each([
    ['legacy' as const, 'legacy' as const],
    ['modern' as const, 'modern' as const],
  ])(
    'capped steps at 50 years stay within the documented bound (%s)',
    (vadose, method) => {
      const s = scenario({ timeYr: '50' }, feed(vadose));
      const series = vadoseFluxSeries(vadoseScenario, vadose, s.time);
      const area = s.srcLength * s.srcWidth;
      const at = (len: number): number =>
        receptorConcentration(
          { ...s, fed: { ...s.fed!, steps: fluxToLoadingSteps(series, area, s.time, len) } },
          method,
          s.time,
        );
      const capped = at(fedStepLength(s.time));
      const fine = at(fedStepLength(s.time) / 4);
      expect(fine).toBeGreaterThan(0);
      expect(Math.abs(capped - fine) / fine).toBeLessThan(2e-3);
    },
    120000,
  );
});
