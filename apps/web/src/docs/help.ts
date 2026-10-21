// The user guide heading each screen's Help link points at. Each screen names its heading here, once,
// so the target text lives in one place and the test checks it against docs/USER_GUIDE.md.

import { docHash } from './catalog';
import { sectionId } from './markdown';

export const HELP_TARGETS = {
  transport: 'Groundwater transport (`#/transport`)',
  vadose: 'Vadose leaching (`#/vadose`)',
  saturated: 'Saturated soil source (`#/saturated`)',
  vapor: 'Vapor intrusion (`#/vapor`)',
  'surface-water': 'Surface water and sediment (`#/surface-water`)',
  household: 'Shower, irrigation and particulates (`#/household`)',
  'plants-eco': 'Plants, ecology and TPH (`#/plants-eco`)',
  chemicals: 'Chemical database (`#/chemicals`)',
  site: 'Site model (`#/site`)',
  risk: 'Exposure and risk (`#/risk`)',
  cleanup: 'Cleanup levels (`#/cleanup`)',
  report: 'Report (`#/report`)',
  validation: 'Validation (`#/validation`)',
} as const;

export type HelpTarget = keyof typeof HELP_TARGETS;

// The reader hash for a screen's user guide section.
export function helpHref(target: HelpTarget): string {
  return `${docHash('user-guide')}/${sectionId(HELP_TARGETS[target])}`;
}
