import { describe, expect, it } from 'vitest';
import { solveSourceLevel } from '../src/processes/cleanup/solve.js';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

// a saturating, monotone metric: m(C) = C / (1 + C / 50)
const saturating = (c: number) => c / (1 + c / 50);
const invSat = (m: number) => m / (1 - m / 50);

describe('solveSourceLevel: linear shortcut', () => {
  it('takes the verified shortcut for a linear metric in two forward runs', () => {
    let calls = 0;
    const r = solveSourceLevel({
      metric: (c) => {
        calls++;
        return 3e-3 * c;
      },
      target: 1e-6,
      reference: 1e-3,
    });
    expect(r.reachable).toBe(true);
    expect(r.method).toBe('linear');
    expect(rel(r.level!, 1e-6 / 3e-3)).toBeLessThan(1e-12);
    expect(calls).toBe(2);
    expect(Math.abs(r.residual)).toBeLessThanOrEqual(1e-9);
  });

  it('equals a Brent solve of the same linear metric to 1e-10 (identity b)', () => {
    const f = (c: number) => 2.5e-4 * c;
    const shortcut = solveSourceLevel({ metric: f, target: 7e-7, reference: 0.1 });
    const brentOnly = solveSourceLevel({
      metric: f,
      target: 7e-7,
      reference: 0.1,
      skipShortcut: true,
    });
    expect(brentOnly.method).toBe('brent');
    expect(rel(shortcut.level!, brentOnly.level!)).toBeLessThan(1e-10);
  });
});

describe('solveSourceLevel: bracketing', () => {
  it('brackets upward from a reference below the root', () => {
    const r = solveSourceLevel({ metric: saturating, target: 5, reference: 1e-3 });
    expect(r.method).toBe('brent');
    expect(rel(r.level!, invSat(5))).toBeLessThan(1e-9);
    expect(Math.abs(r.residual)).toBeLessThanOrEqual(1e-9);
  });

  it('brackets downward from a reference above the root', () => {
    const r = solveSourceLevel({ metric: saturating, target: 5, reference: 1e4 });
    expect(rel(r.level!, invSat(5))).toBeLessThan(1e-9);
  });

  it('brackets downward over many decades', () => {
    const r = solveSourceLevel({ metric: saturating, target: 1e-12, reference: 1e6 });
    expect(rel(r.level!, invSat(1e-12))).toBeLessThan(1e-9);
  });

  it('finds the root inside a capped interval', () => {
    const r = solveSourceLevel({ metric: saturating, target: 5, reference: 1e-3, cap: 1e6 });
    expect(rel(r.level!, invSat(5))).toBeLessThan(1e-9);
  });

  it('returns the cap itself when the target equals the metric at the cap', () => {
    const cap = 40;
    const r = solveSourceLevel({
      metric: saturating,
      target: saturating(cap),
      reference: 1,
      cap,
    });
    expect(r.reachable).toBe(true);
    expect(rel(r.level!, cap)).toBeLessThan(1e-9);
  });

  it('reports not reachable when the metric at the cap is below the target', () => {
    const r = solveSourceLevel({ metric: saturating, target: 49, reference: 1, cap: 100 });
    expect(r.reachable).toBe(false);
    expect(r.level).toBeNull();
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.target-not-reachable');
    expect(r.maxMetric).toBeCloseTo(saturating(100), 12);
  });

  it('reports not reachable without a cap when 40 decades are not enough', () => {
    const r = solveSourceLevel({ metric: (c) => Math.min(c, 1), target: 2, reference: 1 });
    expect(r.reachable).toBe(false);
    expect(r.level).toBeNull();
  });

  it('treats a metric that is zero everywhere as not reachable with zero maximum', () => {
    const r = solveSourceLevel({ metric: () => 0, target: 1, reference: 1, cap: 1e6 });
    expect(r.reachable).toBe(false);
    expect(r.maxMetric).toBe(0);
  });

  it('solves a flat-then-rising (zero below a threshold) metric', () => {
    const f = (c: number) => Math.max(0, c - 10) * 1e-3;
    const r = solveSourceLevel({ metric: f, target: 5e-3, reference: 1, cap: 1e6 });
    expect(rel(r.level!, 15)).toBeLessThan(1e-9);
  });
});

describe('solveSourceLevel: failures and acceptance', () => {
  it('throws an Error (not a warning) when Brent does not converge', () => {
    expect(() =>
      solveSourceLevel({ metric: saturating, target: 5, reference: 1e-3, maxIter: 2 }),
    ).toThrowError(/did not converge/);
  });

  it('throws an Error when no downward bracket exists within 40 decades', () => {
    expect(() => solveSourceLevel({ metric: () => 1, target: 0.5, reference: 1 })).toThrowError(
      /downward bracket/,
    );
  });

  it('accepts a numerical chain at 1e-3 and warns', () => {
    // a metric with 1e-4 relative noise cannot meet 1e-9 but meets 1e-3
    const noisy = (c: number) => saturating(c) * (1 + 1e-4 * Math.sin(c));
    const r = solveSourceLevel({
      metric: noisy,
      target: 5,
      reference: 1e-3,
      numerical: true,
    });
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('cleanup.numerical-chain');
    expect(codes).not.toContain('cleanup.round-trip-tolerance');
  });

  it('reports the round-trip miss when the acceptance level is not met', () => {
    const step = (c: number) => (c < 3 ? 0 : 10); // jump: no c gives metric 5
    const r = solveSourceLevel({ metric: step, target: 5, reference: 1, cap: 1e3 });
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.round-trip-tolerance');
  });
});

describe('solveSourceLevel: secant parity (identity c)', () => {
  it('agrees with Brent to 1e-8 where the secant converges', () => {
    const r = solveSourceLevel({
      metric: saturating,
      target: 5,
      reference: 1e-3,
      secantParity: true,
    });
    expect(r.secant).toBeDefined();
    expect(r.secant!.converged).toBe(true);
    expect(rel(r.secant!.level, r.level!)).toBeLessThan(1e-8);
    expect(r.warnings.map((w) => w.code)).not.toContain('cleanup.secant-disagrees');
  });

  it('is off unless asked', () => {
    const r = solveSourceLevel({ metric: saturating, target: 5, reference: 1e-3 });
    expect(r.secant).toBeUndefined();
  });

  it('reports non-convergence without asserting agreement', () => {
    const step = (c: number) => (c < 3 ? 0 : 10);
    const r = solveSourceLevel({
      metric: step,
      target: 5,
      reference: 1,
      cap: 1e3,
      secantParity: true,
    });
    expect(r.secant).toBeDefined();
    expect(r.secant!.converged).toBe(false);
    expect(r.warnings.map((w) => w.code)).toContain('cleanup.secant-not-converged');
  });
});
