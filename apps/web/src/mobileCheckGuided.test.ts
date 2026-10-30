// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { guidedResultProblems } from '../../../scripts/guided-verdict.mjs';

const good = { tables: 2, notQuantified: false, loading: false, alerts: [], textLen: 900 };

describe('mobile check guided result rule', () => {
  it('passes a screen with result tables', () => {
    expect(guidedResultProblems(good)).toEqual([]);
  });
  it('passes a screen that says why a chemical is not quantified', () => {
    expect(guidedResultProblems({ ...good, tables: 0, notQuantified: true })).toEqual([]);
  });
  it('fails a screen with no table and no reason (the AC2.7 capture: 0 tables, 709 characters)', () => {
    expect(guidedResultProblems({ ...good, tables: 0, textLen: 709 })).toHaveLength(1);
  });
  it('fails a loading message and a build alert, with its text', () => {
    expect(guidedResultProblems({ ...good, loading: true })).toHaveLength(1);
    const p = guidedResultProblems({
      ...good,
      tables: 0,
      alerts: ['Needed before the risk can be computed'],
    });
    expect(p.some((x: string) => x.includes('Needed before the risk can be computed'))).toBe(true);
  });
});
