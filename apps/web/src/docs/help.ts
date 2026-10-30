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
  'step/chemicals': 'The guided flow (steps 1 to 3)',
  'step/site': 'The guided flow (steps 1 to 3)',
  'step/properties': 'The guided flow (steps 1 to 3)',
  'step/sources': 'The guided flow (steps 1 to 3)',
  'step/run': 'The guided flow (steps 1 to 3)',
  'step/pathways': 'The guided flow (steps 1 to 3)',
  'step/receptors': 'The guided flow (steps 1 to 3)',
  'step/toxicity': 'The guided flow (steps 1 to 3)',
  'step/targets': 'The guided flow (steps 1 to 3)',
  'step/results': 'The guided flow (steps 1 to 3)',
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
