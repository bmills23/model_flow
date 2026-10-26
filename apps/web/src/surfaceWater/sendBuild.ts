import { surfaceWaterCoefficient, surfaceWaterSolveState } from './coefficient';
import type { SwResult } from './compute';
import type { SurfaceWaterFeed, SurfaceWaterFeedMethod } from './feed';
import { chemicalTag } from '../project/feedChemical';
import type { SwRequest } from './inputs';
import { surfaceWaterRunInputs } from './runInputs';

const DAY = 86400;

/**
 * What the surface water screen sends to the exposure and risk screen for one method, built from the run
 * alone so the screen's send buttons and a guided run give the same feed for the same inputs.
 * `request` is the request the result was made with; pass null when the request no longer matches the
 * result (a new run is computing), and the feed then carries no coefficient, solve state or recorded
 * inputs. `chemicalId` is the chemical of the run (the transport run's when linked).
 */
export function buildSurfaceWaterFeed(args: {
  result: SwResult;
  request: SwRequest | null;
  method: SurfaceWaterFeedMethod;
  chemicalId: string | undefined;
}): SurfaceWaterFeed {
  const { result, request, method } = args;
  const legacy = method === 'well-mixed';
  const values = legacy ? result.legacy.surfaceWater : result.modern.surfaceWater;
  const last = result.times.length - 1;
  return {
    method,
    origin: `surfaceWater.${method}`,
    label: `${legacy ? 'Legacy well-mixed' : 'Modern mass-discharge'} surface water, ${(result.times[last]! / (365.25 * DAY)).toFixed(1)} years`,
    times: [...result.times],
    values: [...values],
    ...(request
      ? {
          coefficient: surfaceWaterCoefficient(request, result, method),
          solve: surfaceWaterSolveState(request),
          runInputs: surfaceWaterRunInputs(request),
        }
      : {}),
    ...chemicalTag(args.chemicalId),
  };
}
