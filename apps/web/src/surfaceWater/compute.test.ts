import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM as TRANSPORT_FORM, toScenario } from '../transport/form';
import { at123dBankPlane, bankPlaneDischarge } from '@model-flow/engine';
import { at123dInput } from '../transport/compute';
import { BANK_QUADRATURE, compute } from './compute';
import { DEFAULT_FORM, LAKE_FORM, toRequest } from './inputs';

function run(form = DEFAULT_FORM) {
  const r = toRequest(form, null);
  if (!r.ok) throw new Error(r.errors.join('; '));
  const out = compute(r.request);
  if (!out.ok) throw new Error(out.error);
  return out.result;
}

describe('surface water compute, unlinked', () => {
  it('reproduces the Table R-8 river case to the printed digits', () => {
    const res = run();
    const last = res.times.length - 1;
    expect(res.legacy.groundwaterFlow * 86400).toBeCloseTo(250, 9);
    expect(res.legacy.surfaceWater[last]! * 1e3).toBeCloseTo(2.906977, 5);
    expect((res.legacy.sediment.concentrations ?? [])[last]! * 1e6).toBeCloseTo(2.95, 9);
    // mass flux Q_gw C_gw in mg/d
    expect(res.legacy.groundwaterFlow * 86400 * 5).toBeCloseTo(1.25e3, 9);
  });

  it('reproduces the Table R-8 lake case', () => {
    const res = run(LAKE_FORM);
    expect(res.legacy.surfaceWater.at(-1)! * 1e3).toBeCloseTo(3.930818, 5);
  });

  it('gives the modern box the legacy value for a constant loading', () => {
    const res = run();
    res.modern.surfaceWater.forEach((c, k) => {
      expect(c).toBeCloseTo(res.legacy.surfaceWater[k]!, 12);
    });
  });

  it('adds a river receptor when a distance is given', () => {
    const res = run({ ...DEFAULT_FORM, decay: '0.1', downstream: '1000' });
    expect(res.modern.downstream).toBeDefined();
    expect(res.modern.downstream!.at(-1)!).toBeLessThan(res.modern.surfaceWater.at(-1)!);
  });

  it('reports a chemical with no Koc or Kd as not quantified, never zero', () => {
    const res = run({ ...DEFAULT_FORM, koc: '', kd: '' });
    expect(res.legacy.sediment.quantified).toBe(false);
    expect(res.legacy.sediment.concentrations).toBeUndefined();
  });

  it('turns an engine range error into a message', () => {
    const r = toRequest({ ...DEFAULT_FORM, upstreamFlow: '-1' }, null);
    if (!r.ok) return;
    const out = compute(r.request);
    expect(out.ok).toBe(false);
  });
});

describe('surface water compute, linked to a transport run', () => {
  it('draws surface water from the AT123D plume at the bank with both methods', () => {
    const s = toScenario({ ...TRANSPORT_FORM, timeYr: '5' });
    if (!s.ok) throw new Error('scenario');
    const { zOf: _z, ...scenario } = s.scenario;
    void _z;
    const r = toRequest(
      { ...DEFAULT_FORM, linked: true, bankX: '50', reachLength: '40', thickness: '3' },
      { scenario, label: 'test run' },
    );
    if (!r.ok) throw new Error(r.errors.join('; '));
    const out = compute(r.request);
    if (!out.ok) throw new Error(out.error);
    const res = out.result;
    expect(res.times.length).toBeGreaterThan(5);
    expect(res.linked).toBe(true);
    expect(res.legacy.surfaceWater.every(Number.isFinite)).toBe(true);
    expect(res.modern.surfaceWater.every(Number.isFinite)).toBe(true);
    expect(Math.max(...res.legacy.groundwaterConcentrations)).toBeGreaterThan(0);
    expect(Math.max(...res.modern.fluxAveraged)).toBeGreaterThan(0);
    expect(Math.max(...res.modern.surfaceWater)).toBeGreaterThan(res.modern.surfaceWater[0]!);
  }, 60000);

  it('holds the fast bank quadrature within 1 percent of the tight integral', () => {
    const s = toScenario({ ...TRANSPORT_FORM, timeYr: '5' });
    if (!s.ok) throw new Error('scenario');
    const { time: _t, ...fixed } = at123dInput(s.scenario, 0);
    void _t;
    const c = at123dBankPlane(fixed, 50, s.scenario.zOf(0));
    const plane = {
      reachLength: 40,
      thickness: 3,
      darcyFlux: s.scenario.velocity * s.scenario.porosity,
    };
    const t = [s.scenario.time];
    const fast = bankPlaneDischarge(c, plane, t, BANK_QUADRATURE).discharge[0]!;
    const tight = bankPlaneDischarge(c, plane, t).discharge[0]!;
    expect(tight).toBeGreaterThan(0);
    expect(Math.abs(fast - tight) / tight).toBeLessThan(0.01);
  }, 60000);
});
