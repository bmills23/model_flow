import { describe, expect, it } from 'vitest';
import { compute } from './compute';
import { DEFAULT_FORM, toScenario } from './form';
import { saturatedVaporSource } from './vaporFeed';

describe('saturatedVaporSource', () => {
  const r = toScenario(DEFAULT_FORM);
  if (!r.ok) throw new Error('form');
  const out = compute({ scenario: r.scenario });
  if (!out.ok) throw new Error(out.error);

  it('takes the region 1 pore water of the run as one pore water value', () => {
    const run = out.result.runs.legacy!;
    const s = saturatedVaporSource(run, 'Hand case A, legacy');
    if (s === null) throw new Error('region 1 expected');
    expect(s.kind).toBe('poreWater');
    if (!('constant' in s)) throw new Error('constant');
    expect(s.constant).toBe(run.regions.unsaturated!.c);
    expect(s.label).toBe('Hand case A, legacy');
  });

  it('has no source when the run has no region above the water table', () => {
    const run = out.result.runs.legacy!;
    expect(
      saturatedVaporSource(
        { ...run, regions: { unsaturated: null, saturated: run.regions.saturated } },
        'x',
      ),
    ).toBeNull();
  });
});
