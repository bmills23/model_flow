// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { distributionQuantile, type UncertainInput } from '@model-flow/engine';
import {
  buildCorrelation,
  buildDistribution,
  buildEditorSpec,
  cdfCurve,
  emptyRow,
  type DistRow,
} from './editor';

function row(kind: DistRow['kind'], params: Record<string, string>, extra?: Partial<DistRow>) {
  return { ...emptyRow(), kind, params, ...extra } as DistRow;
}

const bw: UncertainInput<{ bw: number }> = {
  id: 'exposure.receptor0.bw',
  label: 'Body weight',
  unit: 'kg',
  category: 'exposure',
  bounds: [0.1, 500],
  get: (i) => i.bw,
  set: (i, v) => ({ ...i, bw: v }),
};
const ir: UncertainInput<{ bw: number }> = { ...bw, id: 'exposure.receptor0.ir', label: 'Intake' };
const ef: UncertainInput<{ bw: number }> = { ...bw, id: 'exposure.receptor0.ef', label: 'Freq' };

describe('buildDistribution', () => {
  it('returns null for an input left at its point value', () => {
    expect(buildDistribution(emptyRow(), 1)).toEqual({ ok: true, dist: null });
  });

  it('builds each kind from text fields', () => {
    const t = buildDistribution(row('triangular', { a: '1', mode: '2', b: '4' }), 1);
    expect(t).toEqual({ ok: true, dist: { kind: 'triangular', a: 1, mode: 2, b: 4 } });
    const n = buildDistribution(row('normal', { mean: '70', sd: '10' }), 1);
    expect(n).toEqual({ ok: true, dist: { kind: 'normal', mean: 70, sd: 10 } });
    const l = buildDistribution(row('lognormal', { gm: '2', gsd: '1.5' }), 1);
    expect(l).toEqual({ ok: true, dist: { kind: 'lognormal', gm: 2, gsd: 1.5 } });
  });

  it('converts a lognormal given by arithmetic moments', () => {
    const r = buildDistribution(
      row('lognormal', { mean: '10', sd: '5' }, { lnForm: 'arithmetic' }),
      1,
    );
    expect(r.ok).toBe(true);
    if (r.ok && r.dist && r.dist.kind === 'lognormal') {
      const sigma2 = Math.log(1 + 0.25);
      expect(r.dist.gsd).toBeCloseTo(Math.exp(Math.sqrt(sigma2)), 12);
      expect(r.dist.gm).toBeCloseTo(Math.exp(Math.log(10) - sigma2 / 2), 12);
    }
  });

  it('applies truncation and converts entered units to SI', () => {
    const r = buildDistribution(row('uniform', { a: '1', b: '3' }, { lo: '1.5', hi: '2.5' }), 1000);
    expect(r).toEqual({
      ok: true,
      dist: { kind: 'uniform', a: 1000, b: 3000, lo: 1500, hi: 2500 },
    });
  });

  it('parses an empirical table of value and probability pairs', () => {
    const r = buildDistribution(row('empirical', {}, { table: '1 0\n2, 0.5\n4;1' }), 1);
    expect(r).toEqual({
      ok: true,
      dist: { kind: 'empirical', values: [1, 2, 4], probs: [0, 0.5, 1] },
    });
  });

  it('refuses empty, non-numeric and malformed entries with a message', () => {
    const a = buildDistribution(row('normal', { mean: '70', sd: '' }), 1);
    expect(a.ok).toBe(false);
    const b = buildDistribution(row('normal', { mean: 'abc', sd: '1' }), 1);
    expect(b.ok).toBe(false);
    const c = buildDistribution(row('empirical', {}, { table: '1 0\nfoo' }), 1);
    expect(c.ok).toBe(false);
    const d = buildDistribution(row('uniform', { a: '1', b: '2' }, { lo: 'x' }), 1);
    expect(d.ok).toBe(false);
  });
});

describe('cdfCurve', () => {
  it('is monotone from near 0 to near 1 and passes through the median', () => {
    const d = { kind: 'lognormal', gm: 3, gsd: 2 } as const;
    const pts = cdfCurve(d, 60);
    expect(pts.length).toBe(60);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.x).toBeGreaterThanOrEqual(pts[i - 1]!.x);
      expect(pts[i]!.p).toBeGreaterThanOrEqual(pts[i - 1]!.p);
    }
    expect(pts[0]!.p).toBeLessThan(0.01);
    expect(pts[59]!.p).toBeGreaterThan(0.99);
    const mid = pts.reduce((b, p) => (Math.abs(p.p - 0.5) < Math.abs(b.p - 0.5) ? p : b));
    expect(Math.abs(mid.x - distributionQuantile(d, 0.5)) / 3).toBeLessThan(0.1);
  });

  it('respects truncation limits', () => {
    const pts = cdfCurve({ kind: 'normal', mean: 0, sd: 1, lo: -1, hi: 1 }, 20);
    expect(pts[0]!.x).toBeGreaterThanOrEqual(-1);
    expect(pts[19]!.x).toBeLessThanOrEqual(1);
    expect(pts[19]!.p).toBeCloseTo(1, 6);
  });

  it('gives a single step for a constant', () => {
    const pts = cdfCurve({ kind: 'constant', value: 5 }, 20);
    expect(pts[0]!.p).toBe(0);
    expect(pts[pts.length - 1]!.p).toBe(1);
  });
});

describe('buildCorrelation', () => {
  const ids = [bw.id, ir.id, ef.id];
  it('is absent when no pair is entered', () => {
    expect(buildCorrelation(ids, {})).toEqual({ ok: true, correlation: undefined, issues: [] });
  });

  it('builds a symmetric unit-diagonal matrix over the inputs that appear in a pair', () => {
    const r = buildCorrelation(ids, { [`${bw.id}|${ir.id}`]: '0.5' });
    expect(r.ok).toBe(true);
    expect(r.correlation).toEqual({
      ids: [bw.id, ir.id],
      matrix: [
        [1, 0.5],
        [0.5, 1],
      ],
    });
  });

  it('refuses a matrix that is not positive definite', () => {
    const r = buildCorrelation(ids, {
      [`${bw.id}|${ir.id}`]: '0.9',
      [`${ir.id}|${ef.id}`]: '0.9',
      [`${bw.id}|${ef.id}`]: '-0.9',
    });
    expect(r.ok).toBe(false);
    expect(r.issues.join(' ')).toMatch(/positive definite/i);
  });

  it('refuses out-of-range and non-numeric entries', () => {
    expect(buildCorrelation(ids, { [`${bw.id}|${ir.id}`]: '1' }).ok).toBe(false);
    expect(buildCorrelation(ids, { [`${bw.id}|${ir.id}`]: '-1.2' }).ok).toBe(false);
    expect(buildCorrelation(ids, { [`${bw.id}|${ir.id}`]: 'x' }).ok).toBe(false);
  });

  it('treats a blank or zero entry as no correlation', () => {
    const r = buildCorrelation(ids, { [`${bw.id}|${ir.id}`]: '', [`${ir.id}|${ef.id}`]: '0' });
    expect(r).toEqual({ ok: true, correlation: undefined, issues: [] });
  });
});

describe('buildEditorSpec', () => {
  it('collects SI distributions by id, checks bounds and drops correlation for unsampled inputs', () => {
    const rows = {
      [bw.id]: row('normal', { mean: '70', sd: '10' }, { lo: '40', hi: '120' }),
      [ir.id]: row('uniform', { a: '1', b: '2' }),
    };
    const r = buildEditorSpec([bw, ir, ef], rows, {}, { [`${bw.id}|${ef.id}`]: '0.3' });
    expect(r.ok).toBe(false);
    expect(r.issues.join(' ')).toMatch(/Freq/);
  });

  it('is ok with valid rows and correlation, and keeps the sample column order', () => {
    const rows = {
      [ir.id]: row('uniform', { a: '1', b: '2' }),
      [bw.id]: row('normal', { mean: '70', sd: '10' }, { lo: '40', hi: '120' }),
    };
    const r = buildEditorSpec([bw, ir, ef], rows, {}, { [`${bw.id}|${ir.id}`]: '-0.4' });
    expect(r.ok).toBe(true);
    expect(Object.keys(r.distributions)).toEqual([bw.id, ir.id]);
    expect(r.correlation?.ids).toEqual([bw.id, ir.id]);
  });

  it('flags a support outside the physical bounds from the check, per input', () => {
    const rows = { [bw.id]: row('normal', { mean: '70', sd: '10' }) };
    const r = buildEditorSpec([bw], rows, {}, {});
    expect(r.ok).toBe(false);
    expect(r.issues.join(' ')).toMatch(/Body weight/);
    expect(r.issues.join(' ')).toMatch(/bounds/);
  });

  it('applies a display unit factor to entered values', () => {
    const rows = { [bw.id]: row('uniform', { a: '50', b: '100' }) };
    const r = buildEditorSpec([bw], rows, { [bw.id]: 0.001 }, {});
    expect(r.ok).toBe(false);
    const rows2 = { [bw.id]: row('uniform', { a: '50000', b: '100000' }) };
    const ok = buildEditorSpec([bw], rows2, { [bw.id]: 0.001 }, {});
    expect(ok.ok).toBe(true);
    expect(ok.distributions[bw.id]).toEqual({ kind: 'uniform', a: 50, b: 100 });
  });
});
