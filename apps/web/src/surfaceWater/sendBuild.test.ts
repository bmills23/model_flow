import { describe, expect, it } from 'vitest';
import { compute } from './compute';
import { surfaceWaterCoefficient, surfaceWaterSolveState } from './coefficient';
import { DEFAULT_FORM, LAKE_FORM, toRequest } from './inputs';
import { surfaceWaterRunInputs } from './runInputs';
import { buildSurfaceWaterFeed } from './sendBuild';

const DAY = 86400;

function run(form = DEFAULT_FORM) {
  const parsed = toRequest(form, null);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  const out = compute(parsed.request);
  if (!out.ok) throw new Error(out.error);
  return { request: parsed.request, result: out.result };
}

// the send the screen made inline before the builder existed
function oldSend(
  result: ReturnType<typeof run>['result'],
  request: ReturnType<typeof run>['request'],
  method: 'well-mixed' | 'mass-discharge',
  chem: string,
  withRun: boolean,
) {
  const last = result.times.length - 1;
  const legacy = method === 'well-mixed';
  const values = legacy ? result.legacy.surfaceWater : result.modern.surfaceWater;
  return {
    method,
    origin: `surfaceWater.${method}`,
    label: `${legacy ? 'Legacy well-mixed' : 'Modern mass-discharge'} surface water, ${(result.times[last]! / (365.25 * DAY)).toFixed(1)} years`,
    times: [...result.times],
    values: [...values],
    ...(withRun
      ? {
          coefficient: surfaceWaterCoefficient(request, result, method),
          solve: surfaceWaterSolveState(request),
          runInputs: surfaceWaterRunInputs(request),
        }
      : {}),
    ...(chem.trim() !== '' ? { chemicalId: chem } : {}),
  };
}

describe('buildSurfaceWaterFeed', () => {
  for (const [name, form] of [
    ['river', DEFAULT_FORM],
    ['lake', LAKE_FORM],
  ] as const) {
    for (const method of ['well-mixed', 'mass-discharge'] as const) {
      it(`equals the screen's send for the ${name} run, ${method}`, () => {
        const { request, result } = run(form);
        expect(buildSurfaceWaterFeed({ result, request, method, chemicalId: '71-43-2' })).toEqual(
          oldSend(result, request, method, '71-43-2', true),
        );
      });
    }
  }

  it('carries no run record when the request no longer matches the result, and no tag for a blank chemical', () => {
    const { result } = run();
    const feed = buildSurfaceWaterFeed({
      result,
      request: null,
      method: 'well-mixed',
      chemicalId: ' ',
    });
    expect(feed).toEqual(oldSend(result, run().request, 'well-mixed', ' ', false));
    expect('coefficient' in feed).toBe(false);
    expect('chemicalId' in feed).toBe(false);
  });
});
