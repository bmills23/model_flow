// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compute } from './compute';
import { R7_FORM, toScenario } from './form';
import { METHOD_SERIES } from './series';
import { vadoseVaporSource } from './vaporFeed';
import { buildVadoseFeed, buildVadoseVaporFeed } from './sendBuild';

const r = toScenario(R7_FORM);
if (!r.ok) throw new Error('form');
const out = compute({ scenario: r.scenario });
if (!out.ok) throw new Error(out.error);
const run = out.result.runs.legacy!;

describe('vadose send builders equal the page sends', () => {
  for (const r7 of [true, false]) {
    const name = r7 ? 'Table R-7 validation case' : 'Vadose leaching run';
    it(`source feed (r7 ${r7})`, () => {
      expect(
        buildVadoseFeed({ scenario: r.scenario, method: 'legacy', r7, chemicalId: 'c' }),
      ).toEqual({
        scenario: r.scenario,
        method: 'legacy',
        label: `${name}, ${METHOD_SERIES.legacy.label}`,
        chemicalId: 'c',
      });
    });
    it(`vapor feed (r7 ${r7})`, () => {
      expect(buildVadoseVaporFeed({ run, r7, chemicalId: undefined })).toEqual(
        vadoseVaporSource(run, `${name}, ${METHOD_SERIES[run.method].label}, source pore water`),
      );
    });
  }
});
