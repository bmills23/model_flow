// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compute } from './compute';
import { DEFAULT_FORM, toScenario } from './form';
import { SATURATED_METHODS as METHODS } from './timeSeries';
import { saturatedVaporSource } from './vaporFeed';
import { buildSaturatedFeed, buildSaturatedVaporFeed } from './sendBuild';

const r = toScenario(DEFAULT_FORM);
if (!r.ok) throw new Error('form');
const out = compute({ scenario: r.scenario });
if (!out.ok) throw new Error(out.error);
const run = out.result.runs.legacy!;

describe('saturated send builders equal the page sends', () => {
  for (const caseA of [true, false]) {
    const name = caseA ? 'Hand case A' : 'Saturated soil source run';
    it(`source feed (case A ${caseA})`, () => {
      expect(
        buildSaturatedFeed({ input: r.scenario.input, method: 'modern', caseA, chemicalId: 'c' }),
      ).toEqual({
        input: r.scenario.input,
        method: 'modern',
        label: `${name}, ${METHODS.modern.short} method`,
        chemicalId: 'c',
      });
    });
    it(`vapor feed (case A ${caseA})`, () => {
      expect(buildSaturatedVaporFeed({ run, method: 'legacy', caseA, chemicalId: 'c' })).toEqual({
        ...saturatedVaporSource(
          run,
          `${name}, ${METHODS.legacy.short} method, pore water above the water table`,
        ),
        chemicalId: 'c',
      });
    });
  }
  it('vapor feed is null without a region above the water table', () => {
    const bare = { ...run, regions: { unsaturated: null, saturated: run.regions.saturated } };
    expect(
      buildSaturatedVaporFeed({ run: bare, method: 'legacy', caseA: true, chemicalId: 'c' }),
    ).toBeNull();
  });
});
