import { beforeEach, describe, expect, it } from 'vitest';
import type { ModeledCleanupRun } from '../uncertainty/headless';
import { defaultSetup } from '../uncertainty/project';
import type { ModeledRequest } from './modeledTypes';
import {
  clearModeledSummary,
  getModeledSummary,
  modeledFingerprint,
  setModeledSummary,
  summarizeModeledRun,
} from './modeledSummary';

const request = {
  chemical: { id: '71-43-2', name: 'Benzene' },
  windowSeconds: 0,
} as ModeledRequest;

const run = {
  result: {
    n: 200,
    seed: 'abc',
    ids: ['groundwater.velocity'],
    samples: [[1], [2]],
    iterationLevels: [1e-3, 2e-3, Infinity, NaN],
    censoredRows: [2],
    succeeded: 3,
    forwardRuns: 41,
    cap: 1,
    censored: { count: 1, fraction: 0.25 },
    failures: { count: 1, fraction: 0.25, first: [], codes: {} },
    protection: { p: 0.95, level: 5e-4 },
    levels: [
      { p: 0.5, level: 2e-3 },
      { p: 0.9, level: 1e-3 },
      { p: 0.95, level: null },
    ],
    warnings: [{ code: 'uncertainty.small-sample-tail', message: 'few draws' }],
  },
  unit: 'mg/L',
  fromSi: 1000,
  deterministic: 1.5e-3,
  spearman: [{ label: 'Seepage velocity', rho: -0.4 }],
  workers: 2,
} as unknown as ModeledCleanupRun;

describe('modeledFingerprint', () => {
  it('is equal for equal content and moves with the request, a row, the seed or the count', () => {
    const base = defaultSetup();
    const f = modeledFingerprint(request, base);
    expect(modeledFingerprint({ ...request }, { ...base })).toBe(f);
    expect(modeledFingerprint({ ...request, windowSeconds: 1 }, base)).not.toBe(f);
    expect(modeledFingerprint(request, { ...base, seed: 'other' })).not.toBe(f);
    expect(modeledFingerprint(request, { ...base, iterations: '50' })).not.toBe(f);
    expect(modeledFingerprint(request, { ...base, protection: '90' })).not.toBe(f);
    expect(modeledFingerprint(request, { ...base, choice: 'modern' })).not.toBe(f);
    const row = { kind: 'uniform' as const, params: {}, lnForm: 'geometric' as const };
    expect(
      modeledFingerprint(request, {
        ...base,
        rows: { a: { ...row, lo: '1', hi: '2', table: '' } },
      }),
    ).not.toBe(f);
  });
});

describe('summarizeModeledRun', () => {
  it('keeps the percentiles, run line, warnings and ranking, never the draws', () => {
    const s = summarizeModeledRun(run, 'Benzene at the source, Wexler', 'fp1');
    expect(s).toMatchObject({
      fingerprint: 'fp1',
      label: 'Benzene at the source, Wexler',
      unit: 'mg/L',
      fromSi: 1000,
      deterministic: 1.5e-3,
      n: 200,
      succeeded: 3,
      seed: 'abc',
      forwardRuns: 41,
      workers: 2,
      chosen: 0.95,
    });
    expect(s.levels).toEqual(run.result.levels);
    expect(s.warnings).toHaveLength(1);
    expect(s.spearman).toEqual(run.spearman);
    const text = JSON.stringify(s);
    expect(text).not.toContain('iterationLevels');
    expect(text).not.toContain('samples');
  });
});

describe('the session store', () => {
  beforeEach(() => clearModeledSummary());
  it('holds the last summary until it is cleared', () => {
    expect(getModeledSummary()).toBeNull();
    const s = summarizeModeledRun(run, 'x', 'fp');
    setModeledSummary(s);
    expect(getModeledSummary()).toBe(s);
    clearModeledSummary();
    expect(getModeledSummary()).toBeNull();
  });
});
