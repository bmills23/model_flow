// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SwRequest } from '../surfaceWater/inputs';
import { computeBase, computeScaled, compute } from '../surfaceWater/compute';
import {
  makeSurfaceJob,
  saturatedAtF,
  solveSurfaceJob,
  vadoseAtF,
  type SurfaceSolveJob,
} from './surfaceSolve';
import {
  fedRequest,
  linkedRequest,
  peakOf,
  run,
  saturatedFeed,
  unlinkedRequest,
  vadoseScenario,
} from './surfaceSolve.testkit';

const MG_L = 1e-3;

describe('computeScaled', () => {
  it('equals the full run of a loading multiplied by k (peak and series)', () => {
    const req = linkedRequest();
    const { outcome, base } = computeBase(req);
    expect(outcome.ok).toBe(true);
    expect(base).not.toBeNull();
    const sc = req.link!.scenario;
    const k = 3.7;
    const doubled: SwRequest = {
      ...req,
      link: { ...req.link!, scenario: { ...sc, c0: sc.c0 * k, massRate: sc.massRate * k } },
    };
    const full = run(doubled);
    const fast = computeScaled(req, base!, k);
    if (!fast.ok) throw new Error(fast.error);
    for (const key of ['legacy', 'modern'] as const) {
      const a = full[key].surfaceWater;
      const b = fast.result[key].surfaceWater;
      expect(b.length).toBe(a.length);
      a.forEach((x, i) => expect(Math.abs(b[i]! - x)).toBeLessThanOrEqual(1e-9 * Math.max(...a)));
    }
  }, 120000);
});

describe('solveSurfaceJob, groundwater route', () => {
  it('unlinked with an upstream background: the solved source reproduces the target', () => {
    const request = unlinkedRequest({ background: '0.5' });
    const r1 = run(request);
    const base = peakOf(r1, 'well-mixed');
    const target = base * 3;
    const job = makeSurfaceJob({
      request,
      method: 'well-mixed',
      route: 'groundwater',
      targets: [target],
    });
    const res = solveSurfaceJob(job);
    expect(res.error).toBeNull();
    const s = res.solved[0]!;
    expect(s.reached).toBe(true);
    expect(s.level).not.toBeNull();
    expect(res.medium).toBe('groundwater');
    const forward = peakOf(run({ ...request, groundwaterConcentration: s.level! }), 'well-mixed');
    expect(Math.abs(forward / target - 1)).toBeLessThan(1e-9);
    // not proportional: the background means the linear estimate would miss
    expect(s.level!).not.toBeCloseTo((target / base) * request.groundwaterConcentration, 6);
  });

  it('a target at or below the background is not reachable by any source, and says so', () => {
    const request = unlinkedRequest({ background: '0.5' });
    const bg = peakOf(run({ ...request, groundwaterConcentration: 0 }), 'mass-discharge');
    const job = makeSurfaceJob({
      request,
      method: 'mass-discharge',
      route: 'groundwater',
      targets: [bg / 2],
    });
    const s = solveSurfaceJob(job).solved[0]!;
    expect(s.level).toBeNull();
    expect(s.reached).toBe(false);
    expect(s.reason).toMatch(/background/i);
  });

  it('a target above what the solubility lets through is not reached, with the limit', () => {
    const request = unlinkedRequest({ background: '0.5', solubility: '10' });
    const top = peakOf(run({ ...request, groundwaterConcentration: 10 * MG_L }), 'well-mixed');
    const job = makeSurfaceJob({
      request,
      method: 'well-mixed',
      route: 'groundwater',
      targets: [top * 2, top / 2],
    });
    const [far, near] = solveSurfaceJob(job).solved;
    expect(far!.level).toBeNull();
    expect(far!.reached).toBe(false);
    expect(far!.limit).toBeCloseTo(10 * MG_L, 15);
    expect(far!.maxSurface).toBeCloseTo(top, 12);
    expect(near!.reached).toBe(true);
    expect(near!.level!).toBeLessThan(10 * MG_L);
  });

  it('linked to a typed transport run with a background: solved by scaling the one transport run', () => {
    const request = linkedRequest({ background: '0.2' });
    const sc = request.link!.scenario;
    const base = peakOf(run(request), 'mass-discharge');
    const target = base * 2;
    const job = makeSurfaceJob({
      request,
      method: 'mass-discharge',
      route: 'groundwater',
      targets: [target],
    });
    const s = solveSurfaceJob(job).solved[0]!;
    expect(s.reached).toBe(true);
    const k = s.level! / sc.c0;
    const forward = peakOf(
      run({
        ...request,
        link: {
          ...request.link!,
          scenario: { ...sc, c0: s.level!, massRate: sc.massRate * k },
        },
      }),
      'mass-discharge',
    );
    expect(Math.abs(forward / target - 1)).toBeLessThan(1e-7);
  }, 120000);
});

describe('solveSurfaceJob, fed route', () => {
  it('a plume fed by the vadose screen: the solved soil concentration reproduces the target', () => {
    const request = fedRequest('vadose');
    const first = run(request);
    const base = peakOf(first, 'well-mixed');
    expect(base).toBeGreaterThan(0);
    const target = base * 0.5;
    const job = makeSurfaceJob({ request, method: 'well-mixed', route: 'fed', targets: [target] });
    const res = solveSurfaceJob(job);
    expect(res.error).toBeNull();
    expect(res.medium).toBe('soil');
    const s = res.solved[0]!;
    expect(s.reached).toBe(true);
    const f0 = vadoseScenario.legacy!.source.F;
    // linear chain: half the target needs about half the soil concentration
    expect(s.level!).toBeGreaterThan(0);
    // the leachate nears its solubility at the soil concentration of the case, so the chain is not
    // proportional: half the surface water takes well under half the soil concentration, and the
    // linear estimate (half) would miss by far more than the solver tolerance
    expect(s.level! / f0).toBeGreaterThan(0.05);
    expect(s.level! / f0).toBeLessThan(0.4);
    expect(s.solver).toBe('brent');
    expect(Math.abs(s.residual)).toBeLessThanOrEqual(s.acceptance);
    // forward run with that soil concentration through the very same chain
    const fed = request.link!.scenario.fed!;
    const at = vadoseAtF(fed.vadose!, s.level!, false, 'legacy');
    const forward = peakOf(
      run({
        ...request,
        link: {
          ...request.link!,
          scenario: {
            ...request.link!.scenario,
            fed: { ...fed, vadose: at.scenario, steps: undefined },
          },
        },
      }),
      'well-mixed',
    );
    expect(Math.abs(forward / target - 1)).toBeLessThan(1e-8);
  }, 240000);

  it('a plume fed by the saturated screen is solved for the screen soil concentration', () => {
    const request = fedRequest('saturated');
    const base = peakOf(run(request), 'mass-discharge');
    expect(base).toBeGreaterThan(0);
    const target = base * 0.25;
    const job = makeSurfaceJob({
      request,
      method: 'mass-discharge',
      route: 'fed',
      targets: [target],
    });
    const res = solveSurfaceJob(job);
    expect(res.error).toBeNull();
    const s = res.solved[0]!;
    expect(s.reached).toBe(true);
    const fed = request.link!.scenario.fed!;
    const at = saturatedAtF(fed.saturated!, s.level!, false);
    const forward = peakOf(
      run({
        ...request,
        link: {
          ...request.link!,
          scenario: {
            ...request.link!.scenario,
            fed: { ...fed, saturated: at.input, steps: undefined },
          },
        },
      }),
      'mass-discharge',
    );
    expect(Math.abs(forward / target - 1)).toBeLessThan(1e-8);
    expect(saturatedFeed.input.chemical.F).toBeGreaterThan(0);
  }, 240000);
});

describe('solveSurfaceJob, soil route', () => {
  it('a vadose soil source carried through a typed linked run is solved', () => {
    const request = linkedRequest({}, '12');
    const f0 = vadoseScenario.legacy!.source.F;
    const probe = makeSurfaceJob({
      request,
      method: 'well-mixed',
      route: 'soil',
      soil: { vadose: vadoseScenario, tphHeld: false, label: 'R-7' },
      targets: [1e-9],
    });
    const first = solveSurfaceJob(probe);
    expect(first.error).toBeNull();
    const s = first.solved[0]!;
    expect(s.reached).toBe(true);
    expect(first.medium).toBe('soil');
    expect(s.level!).toBeGreaterThan(0);
    expect(f0).toBeGreaterThan(0);
    // forward run with the same chain at the solved concentration
    const sc = request.link!.scenario;
    const at = vadoseAtF(vadoseScenario, s.level!, false, 'legacy');
    const forward = compute({
      ...request,
      link: {
        ...request.link!,
        scenario: { ...sc, fed: { vadose: at.scenario, method: 'legacy', label: 'R-7' } },
      },
    });
    if (!forward.ok) throw new Error(forward.error);
    const peak = Math.max(...forward.result.legacy.surfaceWater);
    expect(Math.abs(peak / 1e-9 - 1)).toBeLessThan(1e-8);
  }, 240000);

  it('an unlinked surface water run has no aquifer for a soil source', () => {
    const job: SurfaceSolveJob = makeSurfaceJob({
      request: unlinkedRequest(),
      method: 'well-mixed',
      route: 'soil',
      soil: { vadose: vadoseScenario, tphHeld: false, label: 'R-7' },
      targets: [1e-9],
    });
    const res = solveSurfaceJob(job);
    expect(res.error).toMatch(/not linked/i);
    expect(res.solved).toEqual([]);
  });
});
