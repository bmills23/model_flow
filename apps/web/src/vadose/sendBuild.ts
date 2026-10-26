import { chemicalTag } from '../project/feedChemical';
import type { SourceSeries } from '../vapor/series';
import type { RunSummary, VadoseMethod } from './compute';
import type { VadoseFeed } from './feed';
import type { VadoseScenario } from './form';
import { METHOD_SERIES } from './series';
import { vadoseVaporSource } from './vaporFeed';

const caseName = (r7: boolean): string =>
  r7 ? 'Table R-7 validation case' : 'Vadose leaching run';

/** The vadose result offered to the groundwater screen as its source. */
export function buildVadoseFeed(args: {
  scenario: VadoseScenario;
  method: VadoseMethod;
  r7: boolean;
  chemicalId: string | undefined;
}): VadoseFeed {
  const { scenario, method, r7, chemicalId } = args;
  return {
    scenario,
    method,
    label: `${caseName(r7)}, ${METHOD_SERIES[method].label}`,
    ...chemicalTag(chemicalId),
  };
}

/** The source pore water of a vadose run, offered to the vapor screen as a soil source. */
export function buildVadoseVaporFeed(args: {
  run: RunSummary;
  r7: boolean;
  chemicalId: string | undefined;
}): SourceSeries & { chemicalId?: string } {
  const { run, r7, chemicalId } = args;
  return {
    ...vadoseVaporSource(
      run,
      `${caseName(r7)}, ${METHOD_SERIES[run.method].label}, source pore water`,
    ),
    ...chemicalTag(chemicalId),
  };
}
