import { PATHWAYS, type PathwayId } from '@model-flow/engine';
import { PATHWAY_LABELS } from '../risk/chartData';
import type { ChemicalDb } from '../risk/chemicalDb';
import { TOX_FIELDS, type ToxField } from '../overrides/toxicity';
import { pathwayStatuses } from './pathways';
import type { GuidedChemicalRef } from './riskForm';
import type { GuidedRun, GuidedState } from './state';

/**
 * Step 4c: which toxicity values the ticked pathways need, and which chemicals have none of them for a
 * route. Oral and dermal pathways read the oral values (a dermal dose is the oral value adjusted for
 * absorption); inhalation pathways read the inhalation values. Pure.
 */

type Route = 'oral' | 'inhalation';
const routeOf = (p: PathwayId): Route =>
  PATHWAYS[p].route === 'inhalation' ? 'inhalation' : 'oral';

const ROUTE_FIELDS: Record<Route, readonly ToxField[]> = {
  oral: ['sfo', 'rfdo'],
  inhalation: ['iur', 'rfci'],
};

/** The ticked pathways of each route, by name. */
function tickedByRoute(g: GuidedState): Record<Route, PathwayId[]> {
  const out: Record<Route, PathwayId[]> = { oral: [], inhalation: [] };
  for (const p of pathwayStatuses(g)) if (p.on) out[routeOf(p.id)].push(p.id);
  return out;
}

/** The toxicity values the ticked pathways need, in screen order. */
export function neededToxFields(g: GuidedState): ToxField[] {
  const by = tickedByRoute(g);
  const needed = new Set<ToxField>();
  for (const route of ['oral', 'inhalation'] as const) {
    if (by[route].length > 0) for (const f of ROUTE_FIELDS[route]) needed.add(f);
  }
  return TOX_FIELDS.map((f) => f.key).filter((k) => needed.has(k));
}

/** The inhalation basis as text: what the method chosen in step 3d uses, and the other basis as the check. */
export function inhalationBasis(basis: GuidedRun['basis']): { main: string; check: string } {
  const unit = 'the inhalation unit risk and reference concentration';
  const slope = 'the inhalation slope factor and reference dose';
  return basis === 'modern'
    ? {
        main: `The modern method (chosen in step 3d) assesses inhalation with ${unit}.`,
        check: `As a check, the legacy method converts them to ${slope} at a standard adult breathing 20 m3 a day at 70 kg.`,
      }
    : {
        main: `The legacy method (chosen in step 3d) assesses inhalation with ${slope}, converted from ${unit} at a standard adult breathing 20 m3 a day at 70 kg.`,
        check: `As a check, the modern method uses ${unit} directly.`,
      };
}

export interface ToxGap {
  chemicalId: string;
  route: Route;
  /** The sentence that names what is missing, for the chemical and the pathways that need it. */
  text: string;
}

const LABEL = Object.fromEntries(TOX_FIELDS.map((f) => [f.key, f.label.toLowerCase()])) as Record<
  ToxField,
  string
>;

/**
 * A chemical with none of a route's values (cancer or noncancer) has no risk from that route's ticked
 * pathways. The gap names the chemical, both values and the pathways, so the reader knows what to enter.
 */
export function toxicityGaps(
  g: GuidedState,
  chemicals: readonly GuidedChemicalRef[],
  db: ChemicalDb,
): ToxGap[] {
  const by = tickedByRoute(g);
  const gaps: ToxGap[] = [];
  for (const chem of chemicals) {
    const rec = db.byId.get(chem.id);
    for (const route of ['oral', 'inhalation'] as const) {
      if (by[route].length === 0) continue;
      const [cancer, other] = ROUTE_FIELDS[route];
      if (rec !== undefined && (rec.tox[cancer!] !== undefined || rec.tox[other!] !== undefined)) {
        continue;
      }
      const names = by[route].map((p) => PATHWAY_LABELS[p].toLowerCase()).join(', ');
      gaps.push({
        chemicalId: chem.id,
        route,
        text: `${chem.name} has no ${LABEL[cancer!]} or ${LABEL[other!]}, so ${names} gives no risk for it. Enter one of them below with a source note.`,
      });
    }
  }
  return gaps;
}
