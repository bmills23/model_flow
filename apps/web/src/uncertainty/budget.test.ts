import { describe, expect, it } from 'vitest';
import { UncertaintyError } from '@model-flow/engine';
import {
  CONFIRM_MS,
  PILOT_ROWS,
  REFUSE_MS,
  assertWithinBudget,
  decideBudget,
  formatDuration,
  poolSize,
  projectRun,
} from './budget';

describe('poolSize', () => {
  it('is min(4, cores - 1), at least 1', () => {
    expect(poolSize(1)).toBe(1);
    expect(poolSize(2)).toBe(1);
    expect(poolSize(3)).toBe(2);
    expect(poolSize(5)).toBe(4);
    expect(poolSize(16)).toBe(4);
  });
  it('falls back to 1 when the core count is unknown or invalid', () => {
    expect(poolSize(undefined)).toBe(1);
    expect(poolSize(0)).toBe(1);
    expect(poolSize(Number.NaN)).toBe(1);
  });
});

describe('projectRun', () => {
  it('projects wall time as the per-row time times the rows, over the workers', () => {
    // 5 pilot rows took 100 ms: 20 ms a row; 1000 rows on 4 workers: 5 s.
    const p = projectRun({ pilotMs: 100, pilotRows: 5, totalRows: 1000, workers: 4 });
    expect(p.msPerRow).toBeCloseTo(20, 12);
    expect(p.projectedMs).toBeCloseTo(5000, 9);
    expect(p.decision).toBe('run');
  });
  it('uses the constants of ruling 11', () => {
    expect(PILOT_ROWS).toBe(5);
    expect(CONFIRM_MS).toBe(60_000);
    expect(REFUSE_MS).toBe(600_000);
  });
});

describe('decideBudget', () => {
  it('runs up to 60 s, confirms above, refuses above 10 minutes', () => {
    expect(decideBudget(0)).toBe('run');
    expect(decideBudget(60_000)).toBe('run');
    expect(decideBudget(60_001)).toBe('confirm');
    expect(decideBudget(600_000)).toBe('confirm');
    expect(decideBudget(600_001)).toBe('refuse');
  });
  it('treats a non-finite projection as a refusal', () => {
    expect(decideBudget(Number.NaN)).toBe('refuse');
    expect(decideBudget(Number.POSITIVE_INFINITY)).toBe('refuse');
  });
});

describe('assertWithinBudget', () => {
  it('throws uncertainty.run-budget showing the projection', () => {
    const p = projectRun({ pilotMs: 5000, pilotRows: 5, totalRows: 10_000, workers: 1 });
    expect(p.decision).toBe('refuse');
    try {
      assertWithinBudget(p);
      throw new Error('expected a refusal');
    } catch (e) {
      expect(e).toBeInstanceOf(UncertaintyError);
      expect((e as UncertaintyError).code).toBe('uncertainty.run-budget');
      expect((e as Error).message).toContain(formatDuration(p.projectedMs));
    }
  });
  it('passes run and confirm projections', () => {
    expect(() =>
      assertWithinBudget(projectRun({ pilotMs: 1, pilotRows: 5, totalRows: 10, workers: 1 })),
    ).not.toThrow();
  });
});

describe('formatDuration', () => {
  it('reads in seconds, minutes and hours', () => {
    expect(formatDuration(900)).toBe('0.9 s');
    expect(formatDuration(75_000)).toBe('1 min 15 s');
    expect(formatDuration(3_900_000)).toBe('1 h 5 min');
  });
});
