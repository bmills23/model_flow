import type { SiteState, SourceMedium } from './model';
import { MEDIUM_LABELS } from './model';

export type ItemId =
  | 'chemicals'
  | 'vadose'
  | 'transport'
  | 'vapor'
  | 'plants-eco'
  | 'household'
  | 'surface-water'
  | 'risk'
  | 'cleanup'
  | 'report';

export interface ChecklistItem {
  id: ItemId;
  /** The label of the step bar entry the screen belongs to. */
  step: string;
  screen: string;
  href: string;
  /** What to do on the screen. */
  action: string;
  /** The label of the feed button to press there, when the screen hands a value on. */
  feed?: string;
}

export type ProblemId =
  | 'no-medium'
  | 'two-media'
  | 'produce-both'
  | 'produce-soil-needs-soil'
  | 'produce-irrigation-needs-groundwater';

export interface Problem {
  id: ProblemId;
  message: string;
}

export interface Checklist {
  /** Combinations the method does not allow, each explained. With any problem there are no items. */
  problems: Problem[];
  /** Advice that does not block the checklist. */
  notes: string[];
  items: ChecklistItem[];
}

const item = (
  id: ItemId,
  step: string,
  screen: string,
  href: string,
  action: string,
  feed?: string,
): ChecklistItem => ({ id, step, screen, href, action, ...(feed ? { feed } : {}) });

function problemsOf(s: SiteState): Problem[] {
  const out: Problem[] = [];
  if (s.media.length === 0) {
    out.push({
      id: 'no-medium',
      message: 'Tick the source medium. An analysis starts from one source medium.',
    });
  }
  if (s.media.length > 1) {
    const soilAndGas =
      s.media.includes('soilToIndoorAir') && s.media.includes('soilGasToIndoorAir');
    out.push({
      id: 'two-media',
      message:
        'An analysis starts from one source medium at a time, so ticking more than one is not allowed. ' +
        'Pick one and run the others as separate projects.' +
        (soilAndGas
          ? ' When you have both soil and soil gas data for indoor air, soil gas is the better basis: it measures what is in the pore space instead of inferring it from soil.'
          : ''),
    });
  }
  if (s.produceSoil && s.produceIrrigation) {
    out.push({
      id: 'produce-both',
      message:
        'Homegrown produce takes its contaminant from the soil or from irrigation water, not both at once. Untick one.',
    });
  }
  if (s.receptors === 'human' && s.media.length === 1 && !(s.produceSoil && s.produceIrrigation)) {
    const m = s.media[0]!;
    if (s.produceSoil && m !== 'soil') {
      out.push({
        id: 'produce-soil-needs-soil',
        message: `Produce from soil needs soil as the source medium, but the source is ${MEDIUM_LABELS[m].toLowerCase()}. Choose soil, or switch the produce source.`,
      });
    }
    if (s.produceIrrigation && m !== 'groundwater') {
      out.push({
        id: 'produce-irrigation-needs-groundwater',
        message: `Produce from irrigation water needs groundwater as the source medium, but the source is ${MEDIUM_LABELS[m].toLowerCase()}. Choose groundwater, or switch the produce source.`,
      });
    }
  }
  return out;
}

const VAPOR_METHOD = {
  legacy: 'the legacy Johnson and Ettinger method',
  modern: 'the modern EPA method',
} as const;

function fateItems(s: SiteState, m: SourceMedium): ChecklistItem[] {
  const down = s.location === 'downgradient';
  const well = down
    ? 'Set the distance to the downgradient exposure well'
    : 'Put the exposure well in the source area (onsite)';
  switch (m) {
    case 'soil':
      return [
        item(
          'vadose',
          'Transport',
          'Vadose leaching',
          '#/vadose',
          'Describe the soil layers and the source, then run the leaching model.',
          'Use as groundwater source',
        ),
        item(
          'transport',
          'Transport',
          'Groundwater transport',
          '#/transport',
          `${well}, then run the transport model.`,
          'Use as exposure well concentration',
        ),
      ];
    case 'groundwater':
      return [
        item(
          'transport',
          'Transport',
          'Groundwater transport',
          '#/transport',
          `${well}, then run the transport model from the groundwater source.`,
          'Use as exposure well concentration',
        ),
      ];
    case 'soilToIndoorAir':
      return [
        item(
          'vadose',
          'Transport',
          'Vadose leaching',
          '#/vadose',
          'Describe the soil layers and the source.',
          'Use as vapor source',
        ),
        item(
          'vapor',
          'Transport',
          'Vapor intrusion',
          '#/vapor',
          `Use ${VAPOR_METHOD[s.vaporMethod]}, take the soil source from the vadose result and set the building.`,
          'Send to exposure and risk',
        ),
      ];
    case 'soilGasToIndoorAir':
      return [
        item(
          'vapor',
          'Transport',
          'Vapor intrusion',
          '#/vapor',
          `Use ${VAPOR_METHOD[s.vaporMethod]}, choose soil gas as the source and set the building.`,
          'Send to exposure and risk',
        ),
      ];
    default:
      return [];
  }
}

/**
 * The advisory checklist for a set of site choices: the screens to visit in order, the feed button to press
 * on each, and the combinations that are not allowed (explained, with no checklist). Nothing here locks a
 * screen; the page only suggests an order.
 */
export function checklist(s: SiteState): Checklist {
  const problems = problemsOf(s);
  const notes: string[] = [];
  if (problems.length > 0) return { problems, notes, items: [] };

  const m = s.media[0]!;
  const modeled = s.basis === 'modeled';
  const vaporSource = m === 'soilToIndoorAir' || m === 'soilGasToIndoorAir';
  const human = s.receptors === 'human';

  const items: ChecklistItem[] = [
    item(
      'chemicals',
      'Chemicals',
      'Chemical database',
      '#/chemicals',
      'Look up the chemicals and their values, then add them on the screens below.',
    ),
  ];
  if (modeled) items.push(...fateItems(s, m));

  if (human) {
    if (s.produceSoil) {
      items.push(
        item(
          'plants-eco',
          'Transport',
          'Plants, ecology and TPH',
          '#/plants-eco',
          'Set the plant uptake factors for homegrown produce.',
          'Send to exposure and risk',
        ),
      );
    }
    if (s.produceIrrigation) {
      items.push(
        item(
          'household',
          'Transport',
          'Shower, irrigation and particulates',
          '#/household',
          'Set the irrigation water use and the produce irrigated.',
          'Send to risk and cleanup',
        ),
      );
    }
    items.push(
      item(
        'risk',
        'Receptors',
        'Exposure and risk',
        '#/risk',
        modeled
          ? 'Check each received value names its source, then choose the receptors and exposure settings.'
          : `Enter the ${MEDIUM_LABELS[m].toLowerCase()} concentration for each chemical, then choose the receptors and exposure settings.`,
      ),
      item(
        'cleanup',
        'Risk & cleanup',
        'Cleanup levels',
        '#/cleanup',
        'Pick the target risk and hazard and read the cleanup levels.',
      ),
    );
  } else {
    items.push(
      item(
        'plants-eco',
        'Transport',
        'Plants, ecology and TPH',
        '#/plants-eco',
        modeled
          ? 'Set the ecological receptors and take the modeled concentration.'
          : `Enter the ${MEDIUM_LABELS[m].toLowerCase()} concentration and set the ecological receptors.`,
        'Send to exposure and risk',
      ),
    );
    if (m === 'surfaceWater' && !modeled) {
      items.push(
        item(
          'surface-water',
          'Transport',
          'Surface water and sediment',
          '#/surface-water',
          'Compare the surface water concentration with the criteria.',
        ),
      );
    }
  }
  items.push(
    item(
      'report',
      'Results',
      'Report',
      '#/report',
      'Review the inputs, results and warnings, then print or save the report.',
    ),
  );

  if (!modeled) {
    notes.push(
      s.location === 'downgradient'
        ? 'Entering concentrations directly: the exposure point does not change a measured value, so enter the concentration measured at the exposure point.'
        : 'Entering concentrations directly: enter the concentration measured at the exposure point.',
    );
  }
  if (modeled && vaporSource && s.location === 'downgradient') {
    notes.push(
      'Vapor intrusion is modeled beneath the building, so its exposure point is onsite; the downgradient choice does not apply to it.',
    );
  }
  if (!human && (s.produceSoil || s.produceIrrigation)) {
    notes.push(
      'Homegrown produce is a human pathway, so the produce choice is not used for ecological receptors.',
    );
  }
  if (!human && (m === 'indoorAir' || m === 'soilToIndoorAir' || m === 'soilGasToIndoorAir')) {
    notes.push(
      'Indoor air is a human exposure route; ecological receptors do not use it, so check that this is the source you mean.',
    );
  }
  return { problems, notes, items };
}
