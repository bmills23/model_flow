// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM as TRANSPORT_FORM, toScenario } from '../transport/form';
import { compute, type SwResult } from './compute';
import { DEFAULT_FORM, toRequest, type SwRequest } from './inputs';
import { surfaceWaterCoefficient } from './coefficient';

const peak = (xs: number[]): number => Math.max(...xs);

function unlinked(over: Partial<typeof DEFAULT_FORM> = {}): SwRequest {
  const r = toRequest({ ...DEFAULT_FORM, ...over }, null);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.request;
}

function linked(over: Partial<typeof TRANSPORT_FORM> = {}): SwRequest {
  const s = toScenario({ ...TRANSPORT_FORM, timeYr: '5', ...over });
  if (!s.ok) throw new Error('scenario');
  const { zOf: _z, ...scenario } = s.scenario;
  void _z;
  const r = toRequest({ ...DEFAULT_FORM, linked: true, bankX: '50' }, { scenario, label: 'run' });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.request;
}

function run(req: SwRequest): SwResult {
  const out = compute(req);
  if (!out.ok) throw new Error(out.error);
  return out.result;
}

/** The request with the groundwater source doubled, the way each origin holds it. */
function doubled(req: SwRequest): SwRequest {
  if (!req.link) return { ...req, groundwaterConcentration: req.groundwaterConcentration * 2 };
  const sc = req.link.scenario;
  return {
    ...req,
    link: {
      ...req.link,
      scenario: { ...sc, c0: sc.c0 * 2, massRate: sc.massRate * 2 },
    },
  };
}

describe('surfaceWaterCoefficient', () => {
  it('unlinked: doubling the groundwater concentration doubles the peak, so peak over source is the coefficient', () => {
    const req = unlinked();
    for (const method of ['well-mixed', 'mass-discharge'] as const) {
      const key = method === 'well-mixed' ? 'legacy' : 'modern';
      const one = run(req);
      const two = run(doubled(req));
      expect(peak(two[key].surfaceWater) / peak(one[key].surfaceWater)).toBeCloseTo(2, 9);
      const c = surfaceWaterCoefficient(req, one, method);
      expect(c.reason).toBeNull();
      expect(c.value).toBeCloseTo(peak(one[key].surfaceWater) / req.groundwaterConcentration, 15);
      // the coefficient reproduces the doubled run
      expect(c.value! * req.groundwaterConcentration * 2).toBeCloseTo(
        peak(two[key].surfaceWater),
        12,
      );
      expect(c.method).toBe(`surfaceWater.${method}`);
      expect(c.sourceMedium).toBe('groundwater');
      expect(c.sourceUnit).toBe('mg/L');
    }
  });

  it('linked to a transport run: doubling the source doubles the peak; the source is the held concentration c0', () => {
    const req = linked();
    const one = run(req);
    const two = run(doubled(req));
    for (const method of ['well-mixed', 'mass-discharge'] as const) {
      const key = method === 'well-mixed' ? 'legacy' : 'modern';
      expect(peak(two[key].surfaceWater) / peak(one[key].surfaceWater)).toBeCloseTo(2, 6);
      const c = surfaceWaterCoefficient(req, one, method);
      expect(c.reason).toBeNull();
      expect(c.value).toBeCloseTo(peak(one[key].surfaceWater) / req.link!.scenario.c0, 15);
    }
  }, 60000);

  it('a mass rate source is the same source as its concentration', () => {
    const a = linked({ sourceMode: 'massRate', massRate: '50' });
    const out = run(a);
    const c = surfaceWaterCoefficient(a, out, 'mass-discharge');
    expect(c.value).toBeCloseTo(peak(out.modern.surfaceWater) / a.link!.scenario.c0, 15);
  }, 60000);

  it('a vadose or saturated fed source is not quantified, with the reason', () => {
    const req = linked();
    const fedReq: SwRequest = {
      ...req,
      link: {
        ...req.link!,
        scenario: {
          ...req.link!.scenario,
          fed: { method: 'modern', label: 'Vadose leachate', vadose: {} as never },
        },
      },
    };
    const c = surfaceWaterCoefficient(fedReq, run(req), 'well-mixed');
    expect(c.value).toBeNull();
    expect(c.reason).toMatch(/vadose or saturated/i);
  }, 60000);

  it('an upstream background makes the peak non-proportional to the source: not quantified', () => {
    const req = unlinked({ background: '0.5' });
    const c = surfaceWaterCoefficient(req, run(req), 'well-mixed');
    expect(c.value).toBeNull();
    expect(c.reason).toMatch(/background/i);
  });

  it('a zero source or a zero peak is not quantified, never a zero coefficient', () => {
    const req = unlinked({ groundwaterConcentration: '0' });
    const c = surfaceWaterCoefficient(req, run(req), 'well-mixed');
    expect(c.value).toBeNull();
    expect(c.reason).toMatch(/no groundwater source|transfers nothing/i);
  });

  it('carries the solubility (kg/m3) when the run has one', () => {
    const req = unlinked({ solubility: '1780' });
    const c = surfaceWaterCoefficient(req, run(req), 'mass-discharge');
    expect(c.solubility).toBeCloseTo(1.78, 12);
  });
});
