// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compute } from './compute';
import { DEFAULT_FORM, toScenario } from './form';
import { fmt, regionRows, releaseRows, sectionLevels } from './chartData';

const sc = toScenario(DEFAULT_FORM);
if (!sc.ok) throw new Error('scenario');
const out = compute({ scenario: sc.scenario });
if (!out.ok) throw new Error(out.error);
const { legacy, modern } = out.result.runs;

describe('fmt', () => {
  it('prints four significant figures, zero, infinity and small values readably', () => {
    expect(fmt(17)).toBe('17');
    expect(fmt(1763.1226)).toBe('1763');
    expect(fmt(0.20716087)).toBe('0.2072');
    expect(fmt(0)).toBe('0');
    expect(fmt(Infinity)).toBe('none');
    expect(fmt(4.5e-5)).toBe('4.500e-5');
  });
});

describe('sectionLevels', () => {
  it('gives the unsaturated and saturated thickness at low and high water', () => {
    expect(sectionLevels(legacy!.levels, 2)).toEqual({
      low: { unsat: 1.5, sat: 0.5 },
      high: { unsat: 0.5, sat: 1.5 },
    });
  });
});

describe('regionRows', () => {
  it('has one row per quantity with both regions, in mg/L for concentrations', () => {
    const rows = regionRows(legacy!);
    const phase = rows.find((r) => /^separate phase present/i.test(r.label))!;
    expect(phase.values).toEqual(['Yes', 'Yes']);
    const x = rows.find((r) => /mole fraction/i.test(r.label))!;
    expect(Number(x.values[0])).toBeCloseTo(0.01282, 5);
  });

  it('shows none for a region that does not exist', () => {
    const dry = toScenario({ ...DEFAULT_FORM, hMin: '0', dh: '0' });
    if (!dry.ok) throw new Error('dry');
    const o = compute({ scenario: dry.scenario });
    if (!o.ok) throw new Error(o.error);
    expect(regionRows(o.result.runs.legacy!)[0]!.values[1]).toBe('none');
  });
});

describe('releaseRows', () => {
  it('lists M0, the depletion time and gamma per method', () => {
    const rows = releaseRows([legacy!, modern!]);
    const td = rows.find((r) => /exhausted/i.test(r.label))!;
    expect(td.values[0]).toMatch(/^1763 d/);
    expect(td.values[1]).toBe('none');
    const g = rows.find((r) => /decline constant/i.test(r.label))!;
    expect(g.values).toEqual(['none', '0.2072 per year']);
    const m0 = rows.find((r) => /initial mass/i.test(r.label))!;
    expect(m0.values).toEqual(['17', '17']);
  });
});
