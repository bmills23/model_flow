import type { SaturatedSourceInput } from '@model-flow/engine';
import { chemicalTag } from '../project/feedChemical';
import type { SourceSeries } from '../vapor/series';
import type { RunSummary } from './compute';
import type { SaturatedFeed, SaturatedMethod } from './feed';
import { SATURATED_METHODS as METHODS } from './timeSeries';
import { saturatedVaporSource } from './vaporFeed';

const caseName = (caseA: boolean): string => (caseA ? 'Hand case A' : 'Saturated soil source run');

/** The saturated source result offered to the groundwater screen as its source. */
export function buildSaturatedFeed(args: {
  input: SaturatedSourceInput;
  method: SaturatedMethod;
  caseA: boolean;
  chemicalId: string | undefined;
}): SaturatedFeed {
  const { input, method, caseA, chemicalId } = args;
  return {
    input,
    method,
    label: `${caseName(caseA)}, ${METHODS[method].short} method`,
    ...chemicalTag(chemicalId),
  };
}

/** The pore water above the water table, as a vapor source; null when the source has no such region. */
export function buildSaturatedVaporFeed(args: {
  run: RunSummary;
  method: SaturatedMethod;
  caseA: boolean;
  chemicalId: string | undefined;
}): (SourceSeries & { chemicalId?: string }) | null {
  const { run, method, caseA, chemicalId } = args;
  const source = saturatedVaporSource(
    run,
    `${caseName(caseA)}, ${METHODS[method].short} method, pore water above the water table`,
  );
  return source === null ? null : { ...source, ...chemicalTag(chemicalId) };
}
