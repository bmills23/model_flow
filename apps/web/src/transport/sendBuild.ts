import { chemicalTag } from '../project/feedChemical';
import type { SourceSeries } from '../vapor/series';
import type { MethodKey, ComputeResult } from './compute';
import type { Scenario } from './form';
import { SERIES } from './series';
import { transportRunInputs } from './runInputs';
import { waterTableSource } from './vaporFeed';
import type { BankFeed } from './bankFeed';
import type { TransportFeed } from './chainFeed';
import type { WellFeed } from './wellFeed';

/** The receptor well history of one method, as the exposure and risk screen takes it; null when the method has no series. */
export function buildWellFeed(args: {
  method: MethodKey;
  result: Pick<ComputeResult, 'times' | 'series'>;
  scenario: Scenario;
  timeYr: string;
  chemicalId: string | undefined;
}): WellFeed | null {
  const { method: k, result, scenario, timeYr, chemicalId } = args;
  const values = result.series[k];
  if (!values) return null;
  return {
    method: k,
    label: `Receptor well, ${SERIES[k].label}, ${timeYr} years`,
    times: [...result.times],
    values: [...values],
    runInputs: transportRunInputs(scenario),
    ...chemicalTag(chemicalId),
  };
}

/** The aquifer, source box, receptor and time offered to the cleanup levels screen. */
export function buildTransportFeed(args: {
  scenario: Scenario;
  timeYr: string;
  rx: string;
  chemicalId: string | undefined;
}): TransportFeed {
  const { scenario, timeYr, rx, chemicalId } = args;
  return {
    scenario,
    label: `${timeYr} years, receptor at ${rx} m`,
    ...chemicalTag(chemicalId),
  };
}

/** The groundwater concentration at the water table, as a vapor source. */
export function buildWaterTableFeed(args: {
  scenario: Scenario;
  method: MethodKey;
  timeYr: string;
  chemicalId: string | undefined;
}): SourceSeries & { chemicalId?: string } {
  const { scenario, method: k, timeYr, chemicalId } = args;
  return {
    ...waterTableSource(
      scenario,
      k,
      `Water table under the receptor point, ${SERIES[k].label}, ${timeYr} years`,
    ),
    ...chemicalTag(chemicalId),
  };
}

/** The plume offered to the surface water screen as the discharge at the bank (the closure is dropped). */
export function buildBankFeed(args: {
  scenario: Scenario;
  timeYr: string;
  chemicalId: string | undefined;
}): BankFeed {
  const { scenario, timeYr, chemicalId } = args;
  const { zOf: _zOf, ...plain } = scenario;
  void _zOf;
  return {
    scenario: plain,
    label: `Groundwater transport run, ${timeYr} years`,
    ...chemicalTag(chemicalId),
  };
}
