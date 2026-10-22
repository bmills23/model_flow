import { screenFeedProblem } from '../project/feedChemical';
import type { SourceChoice } from './VaporPanels';
import type { SourceSeries } from './series';

export type HeldChoice = Exclude<SourceChoice, 'entered'>;
export interface HeldSource {
  choice: HeldChoice;
  source: SourceSeries;
}

const FEED_NAME: Record<HeldChoice, string> = {
  waterTable: 'water table source',
  vadose: 'vadose source',
  saturated: 'saturated source',
};

/**
 * The sources other screens hold, split into those the vapor screen may use for its chemical and those it
 * refuses (another chemical, or untagged in a project of several chemicals). A refused source computes and
 * sends nothing.
 */
export function heldSources(args: {
  waterTable: SourceSeries | null;
  vadose: SourceSeries | null;
  saturated: SourceSeries | null;
  screenChemical: string;
  projectCount: number;
  nameOf: (id: string) => string;
}): { held: HeldSource[]; problems: { choice: HeldChoice; message: string }[] } {
  const held: HeldSource[] = [];
  const problems: { choice: HeldChoice; message: string }[] = [];
  const entries: [HeldChoice, SourceSeries | null][] = [
    ['waterTable', args.waterTable],
    ['vadose', args.vadose],
    ['saturated', args.saturated],
  ];
  for (const [choice, source] of entries) {
    if (source === null) continue;
    const message = screenFeedProblem({
      feed: FEED_NAME[choice],
      feedChemical: source.chemicalId,
      screenChemical: args.screenChemical,
      projectCount: args.projectCount,
      nameOf: args.nameOf,
    });
    if (message === null) held.push({ choice, source });
    else problems.push({ choice, message: message[0]!.toUpperCase() + message.slice(1) });
  }
  return { held, problems };
}
