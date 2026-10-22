// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { vadoseSoilVaporSeries } from '@model-flow/engine';
import { compute } from './compute';
import { R7_FORM as DEFAULT_FORM, toScenario } from './form';
import { vadoseVaporSource } from './vaporFeed';

describe('vadoseVaporSource', () => {
  const r = toScenario(DEFAULT_FORM);
  if (!r.ok) throw new Error('form');
  const out = compute({ scenario: r.scenario });
  if (!out.ok) throw new Error(out.error);
  const run = out.result.runs.legacy!;

  it('offers the source pore water series, in seconds and kg/m3, as a pore water source', () => {
    const s = vadoseVaporSource(run, 'Table R-7 case, legacy');
    expect(s.kind).toBe('poreWater');
    if (!('series' in s)) throw new Error('series');
    expect(s.series.times).toEqual(run.series.times);
    expect(s.series.values).toEqual(run.series.sourcePoreWater);
    expect(s.label).toBe('Table R-7 case, legacy');
  });

  it('gives the engine soil vapor series when multiplied by H', () => {
    const s = vadoseVaporSource(run, 'x');
    if (!('series' in s)) throw new Error('series');
    const engine = vadoseSoilVaporSeries(
      {
        volatilizationVelocity: 0,
        series: { times: run.series.times, sourcePoreWater: run.series.sourcePoreWater },
      },
      0.228,
    );
    expect(s.series.values.map((c) => 0.228 * c)).toEqual(engine.values);
  });
});
