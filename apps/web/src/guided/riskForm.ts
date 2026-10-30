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
import type { GuidedFormKey, GuidedState, SourceValueKey } from './state';
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
    return { ...base, name: c.name, conc, ...feedFlags(guided, c.id, on, outputs) };
  });
}

/** The feed switches of one chemical's row: on for the outputs the chain writes and a ticked pathway reads. */
function feedFlags(
  guided: GuidedState,
  id: string,
  on: Record<PathwayId, boolean>,
  outputs: readonly string[],
): Pick<ChemicalRow, RiskFeedUse['flag']> {
  const any = (...ps: PathwayId[]): boolean => ps.some((p) => on[p]);
  return {
    groundwaterFromWell: outputs.includes('well') && any('waterIngestion', 'waterDermal'),
    indoorFromVapor: outputs.includes('vaporRisk') && on.indoorInhalation,
    outdoorFromVapor:
      outputs.includes('vaporRisk') &&
      on.outdoorInhalation &&
      !outputLacks(guided, 'vaporRisk', id, 'outdoor'),
    surfaceWaterFromModel: outputs.includes('surfaceWater') && any('swimIngestion', 'swimDermal'),
    bathroomFromHousehold:
      outputs.includes('household') &&
      on.showerInhalation &&
      !outputLacks(guided, 'household', id, 'bathroomAir'),
    produceFromPlantsEco: outputs.includes('produce') && on.produce,
  };
}

/** A model output a risk row reads, the switch it turns on, the model that writes it, and its words. */
interface RiskFeedUse {
  feed: string;
  flag:
    | 'groundwaterFromWell'
    | 'indoorFromVapor'
    | 'outdoorFromVapor'
    | 'surfaceWaterFromModel'
    | 'bathroomFromHousehold'
    | 'produceFromPlantsEco';
  model: GuidedFormKey;
  what: string;
  /** The medium whose 3b value must not stand in for the missing output. */
  medium?: Medium;
}
const RISK_FEED_USES: readonly RiskFeedUse[] = [
  {
    feed: 'well',
    flag: 'groundwaterFromWell',
    model: 'transport',
    what: 'well water (drinking and bathing)',
    medium: 'groundwater',
  },
  { feed: 'vaporRisk', flag: 'indoorFromVapor', model: 'vapor', what: 'indoor air' },
  { feed: 'vaporRisk', flag: 'outdoorFromVapor', model: 'vapor', what: 'outdoor air' },
  {
    feed: 'surfaceWater',
    flag: 'surfaceWaterFromModel',
    model: 'surfaceWater',
    what: 'swimming water',
  },
  { feed: 'household', flag: 'bathroomFromHousehold', model: 'household', what: 'shower air' },
  { feed: 'produce', flag: 'produceFromPlantsEco', model: 'plantsEco', what: 'homegrown produce' },
];

/** One pathway group of one chemical that the Run gave no concentration, with its reason in plain words. */
export interface GuidedRiskGap {
  chemicalId: string;
  flag: RiskFeedUse['flag'];
  medium?: Medium;
  /** The chemical's name and the pathway group in words, for a total that leaves it out. */
  chemical: string;
  what: string;
  note: string;
}

/**
 * The model outputs a risk row would read that the Run did not produce for that chemical, while it did
 * produce them for another chemical or recorded why it could not (plan: that chemical's pathway is not
 * quantified, the others are computed). A feed the Run never wrote for any chemical is not a gap: the build
 * then says the Run has to be done.
 */
export function guidedRiskGaps(
  guided: GuidedState,
  chemicals: readonly GuidedChemicalRef[],
): GuidedRiskGap[] {
  const on = pathwaysOn(guided);
  const outputs = chain(guided.site).outputs;
  const gaps: GuidedRiskGap[] = [];
  chemicals.forEach((c) => {
    const row = feedFlags(guided, c.id, on, outputs);
    const note = guided.runNotes[c.id];
    for (const use of RISK_FEED_USES) {
      if (row[use.flag] !== true) continue;
      if (guided.outputs[use.feed]?.[c.id] !== undefined) continue;
      const ranForOthers = Object.keys(guided.outputs[use.feed] ?? {}).length > 0;
      if (note?.feeds[use.feed] === undefined && !ranForOthers) continue;
      const problems = note?.problems ?? [];
      const own = problems.filter((p) => p.model === use.model);
      const why = (own.length > 0 ? own : problems).map((p) => p.message);
      const reason =
        why.length > 0
          ? why.join(' ')
          : `The Run in step 3d gave no result for ${c.name} that this pathway can use.`;
      gaps.push({
        chemicalId: c.id,
        flag: use.flag,
        chemical: c.name,
        what: use.what,
        ...(use.medium === undefined ? {} : { medium: use.medium }),
        note: `${c.name}: ${use.what} is not quantified. ${reason}`,
      });
    }
  });
  return gaps;
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
  const gaps = guidedRiskGaps(guided, chemicals);
  const form: RiskForm = {
    ...defaultForm(),
    chemicals: guidedRows(guided, chemicals, db).map((row) => {
      const own = gaps.filter((g) => g.chemicalId === row.id);
      if (own.length === 0) return row;
      const out: ChemicalRow = { ...row, conc: { ...row.conc } };
      for (const gap of own) {
        out[gap.flag] = false;
        if (gap.medium !== undefined) delete out.conc[gap.medium];
      }
      return out;
    }),
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
  const built = buildInputs(
    deriveRiskForm(guided, chemicals, db, overrides),
    db,
    f.well,
    f.vapor,
    f.surface,
    f.household,
    f.produce,
  );
  // each chemical pathway the Run gave no concentration is said, with the Run's reason, next to the result
  const gapNotes = guidedRiskGaps(guided, chemicals).map((g) => g.note);
  return built.ok
    ? { ...built, notes: [...gapNotes, ...built.notes] }
    : { ...built, errors: [...gapNotes, ...built.errors] };
}
