import { describe, expect, it } from 'vitest';
import { receptorConcentration } from './compute';
import { DEFAULT_FORM, toScenario } from './form';
import { waterTableSource } from './vaporFeed';

describe('waterTableSource', () => {
  const r = toScenario({ ...DEFAULT_FORM, rx: '60', ry: '2', rDepth: '1', timeYr: '8' });
  if (!r.ok) throw new Error('form');
  const s = r.scenario;

  it('evaluates the transport solution at the water table under the receptor point, not the well screen', () => {
    const src = waterTableSource(s, 'modern', 'Transport, modern');
    expect(src.kind).toBe('groundwater');
    if (!('series' in src)) throw new Error('series');
    const t = src.series.times;
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeCloseTo(s.time, 6);
    const at = { ...s, receptorDepths: { top: 0, bottom: 0 } };
    const i = t.length - 1;
    expect(src.series.values[i]).toBeCloseTo(receptorConcentration(at, 'modern', t[i]!, 1), 14);
    // the well screen is 1 m deep, so the two differ
    expect(src.series.values[i]).not.toBeCloseTo(receptorConcentration(s, 'modern', t[i]!), 14);
  });

  it('is never negative and has the engine adapter label', () => {
    const src = waterTableSource(s, 'legacy', 'Transport, legacy');
    if (!('series' in src)) throw new Error('series');
    expect(Math.min(...src.series.values)).toBeGreaterThanOrEqual(0);
    expect(src.label).toBe('Transport, legacy');
  });
});
