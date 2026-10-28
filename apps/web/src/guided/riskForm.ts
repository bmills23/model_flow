import { DIRECT_PATHWAY_IDS, type Medium, type PathwayId } from '@model-flow/engine';
import type { BuildResult } from '../risk/build';
import { buildInputs } from '../risk/build';
import type { ChemicalDb, ChemicalRecord } from '../risk/chemicalDb';
import {
  defaultForm,
  newChemicalRow,
  type ChemicalRow,
  type ReceptorForm,
  type RiskForm,
} from '../risk/form';
import type { OverridesState } from '../overrides/model';
import { withReceptorEdits } from '../overrides/receptors';
import { chain } from './chain';
import { outputLacks, pathwaysOn } from './pathways';
import { riskFeeds } from './slots';
import type { GuidedState, SourceValueKey } from './state';
import { sourceNumber } from './units';

/**
 * The risk form step 4 and step 5 derive from the guided answers (plan section 1: the forms are derived
 * from `exposure` and `targets`, never stored). Rows carry the 3b concentrations in the screen units and
 * switch on the feeds the chain writes; receptors are the guided ones with the step 4a ticks laid over and
 * the project's `guided.a` / `guided.b` edits laid on. Pure: no store, no engine call.
 */

/** A project chemical as the forms need it: its id and the name the project shows. */
export interface GuidedChemicalRef {
  id: string;
  name: string;
}

const numText = (v: number): string => String(Number(v.toPrecision(12)));

/** The 3b value of a medium in the screen unit as form text; undefined when blank or unreadable. */
function sourceText(g: GuidedState, id: string, medium: SourceValueKey): string | undefined {
  const v = g.sources[id]?.values[medium];
  const n = v === undefined ? null : sourceNumber(v.value, v.unit, medium);
  return n === null ? undefined : numText(n);
}

/**
 * One row per chemical: its concentrations for the media a pathway reads, and the feeds the chain writes
 * switched on for the pathways that are ticked. A chemical the database lacks keeps its row, so the build
 * names it instead of dropping it.
 */
export function guidedRows(
  guided: GuidedState,
  chemicals: readonly GuidedChemicalRef[],
  db: ChemicalDb,
): ChemicalRow[] {
  const on = pathwaysOn(guided);
  const outputs = chain(guided.site).outputs;
  const measured = guided.site.basis === 'measured';
  const any = (...ps: PathwayId[]): boolean => ps.some((p) => on[p]);
  const mediaOf = (): [Medium, SourceValueKey][] => {
    if (measured) {
      return guided.site.measured.map((m): [Medium, SourceValueKey] => [m, m]);
    }
    const out: [Medium, SourceValueKey][] = [];
    // soil is also read by the produce pathway; groundwater only fixes the ratios of a cleanup allocation
    if (
      guided.site.sources.includes('soilAbove') &&
      any('soilIngestion', 'soilDermal', 'produce')
    ) {
      out.push(['soil', 'soilAbove']);
    }
    if (guided.site.sources.includes('groundwater') && any('waterIngestion', 'waterDermal')) {
      out.push(['groundwater', 'groundwater']);
    }
    return out;
  };
  const media = mediaOf();
  return chemicals.map((c) => {
    const rec: ChemicalRecord | undefined = db.byId.get(c.id);
    const base = newChemicalRow(
      rec ?? { id: c.id, name: c.name, tox: {} as ChemicalRecord['tox'], phys: undefined },
    );
    const conc: ChemicalRow['conc'] = {};
    for (const [medium, key] of media) {
      const t = sourceText(guided, c.id, key);
      if (t !== undefined) conc[medium] = t;
    }
    return {
      ...base,
      name: c.name,
      conc,
      groundwaterFromWell: outputs.includes('well') && any('waterIngestion', 'waterDermal'),
      indoorFromVapor: outputs.includes('vaporRisk') && on.indoorInhalation,
      outdoorFromVapor:
        outputs.includes('vaporRisk') &&
        on.outdoorInhalation &&
        !outputLacks(guided, 'vaporRisk', c.id, 'outdoor'),
      surfaceWaterFromModel: outputs.includes('surfaceWater') && any('swimIngestion', 'swimDermal'),
      bathroomFromHousehold:
        outputs.includes('household') &&
        on.showerInhalation &&
        !outputLacks(guided, 'household', c.id, 'bathroomAir'),
      produceFromPlantsEco: outputs.includes('produce') && on.produce,
    };
  });
}

/** The guided receptors with the step 4a ticks laid over each one's own pathway switches. */
export function guidedReceptors(guided: GuidedState): { a: ReceptorForm; b: ReceptorForm | null } {
  const on = pathwaysOn(guided);
  const lay = (r: ReceptorForm): ReceptorForm => ({
    ...r,
    pathways: Object.fromEntries(
      DIRECT_PATHWAY_IDS.map((p) => [p, r.pathways[p] && on[p]]),
    ) as Record<PathwayId, boolean>,
    produce: on.produce,
  });
  const { a, b } = guided.exposure;
  return { a: lay(a), b: b === null ? null : lay(b) };
}

/** The exposure and risk form for the guided project: forward risk reads this, and the build reads its feeds. */
export function deriveRiskForm(
  guided: GuidedState,
  chemicals: readonly GuidedChemicalRef[],
  db: ChemicalDb,
  overrides?: OverridesState,
): RiskForm {
  const { a, b } = guidedReceptors(guided);
  const form: RiskForm = {
    ...defaultForm(),
    chemicals: guidedRows(guided, chemicals, db),
    a,
    b,
    additive: guided.exposure.additive,
  };
  return overrides === undefined ? form : withReceptorEdits(form, overrides, 'guided');
}

/** The scenario inputs of the guided project: the derived form built over the Run's outputs as slots. */
export function buildGuidedInputs(
  guided: GuidedState,
  chemicals: readonly GuidedChemicalRef[],
  db: ChemicalDb,
  overrides?: OverridesState,
): BuildResult {
  const f = riskFeeds(guided.outputs);
  return buildInputs(
    deriveRiskForm(guided, chemicals, db, overrides),
    db,
    f.well,
    f.vapor,
    f.surface,
    f.household,
    f.produce,
  );
}
