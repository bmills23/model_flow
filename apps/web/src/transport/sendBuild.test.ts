// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compute } from './compute';
import { toScenario } from './form';
import { REGRESSION_FORM } from './regression.testkit';
import { SERIES } from './series';
import { transportRunInputs } from './runInputs';
import { waterTableSource } from './vaporFeed';
import { buildBankFeed, buildTransportFeed, buildWaterTableFeed, buildWellFeed } from './sendBuild';

const r = toScenario(REGRESSION_FORM);
if (!r.ok) throw new Error('form');
const scenario = r.scenario;
const out = compute({ scenario, mapMethod: 'modern', domenico: true });
if (!out.ok) throw new Error(out.error);
const result = out.result;
const timeYr = REGRESSION_FORM.timeYr;

describe('transport send builders equal the page sends', () => {
  it('well feed', () => {
    const k = 'modern' as const;
    const values = result.series[k]!;
    const old = {
      method: k,
      label: `Receptor well, ${SERIES[k].label}, ${timeYr} years`,
      times: [...result.times],
      values: [...values],
      runInputs: transportRunInputs(scenario),
      chemicalId: '71-43-2',
    };
    expect(buildWellFeed({ method: k, result, scenario, timeYr, chemicalId: '71-43-2' })).toEqual(
      old,
    );
    const { chemicalId: _c, ...untagged } = old;
    void _c;
    expect(buildWellFeed({ method: k, result, scenario, timeYr, chemicalId: '  ' })).toEqual(
      untagged,
    );
  });

  it('well feed is null for a method without a series', () => {
    const { domenico: _d, ...rest } = result.series;
    void _d;
    const none = { times: result.times, series: rest };
    expect(
      buildWellFeed({ method: 'domenico', result: none, scenario, timeYr, chemicalId: undefined }),
    ).toBeNull();
  });

  it('cleanup levels feed', () => {
    expect(
      buildTransportFeed({ scenario, timeYr, rx: REGRESSION_FORM.rx, chemicalId: 'x' }),
    ).toEqual({
      scenario,
      label: `${timeYr} years, receptor at ${REGRESSION_FORM.rx} m`,
      chemicalId: 'x',
    });
  });

  it('water table feed', () => {
    const k = 'legacy' as const;
    const old = {
      ...waterTableSource(
        scenario,
        k,
        `Water table under the receptor point, ${SERIES[k].label}, ${timeYr} years`,
      ),
      chemicalId: 'x',
    };
    expect(buildWaterTableFeed({ scenario, method: k, timeYr, chemicalId: 'x' })).toEqual(old);
  });

  it('bank feed drops the closure', () => {
    const { zOf: _z, ...plain } = scenario;
    void _z;
    const feed = buildBankFeed({ scenario, timeYr, chemicalId: undefined });
    expect(feed).toEqual({ scenario: plain, label: `Groundwater transport run, ${timeYr} years` });
    expect('zOf' in feed.scenario).toBe(false);
  });
});
