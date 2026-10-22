import {
  PATHWAYS,
  DIRECT_PATHWAY_IDS,
  legacyReceptor,
  modernReceptor,
  type DirectChemical,
  type DirectInput,
  type DirectReceptor,
  type LegacyChemical,
  type LegacyReceptor,
  type Medium,
  type ModernChemical,
  type ModernReceptor,
  type PathwayId,
  type ProduceFactors,
} from '@model-flow/engine';
import type { ChemicalDb } from '../risk/chemicalDb';
import { PATHWAY_LABELS } from '../risk/chartData';
import { MEDIA, PRESET_LABELS, type ReceptorForm } from '../risk/form';
import type { ProduceRiskFeed } from '../plantsEco/feeds';
import { pickSlot, type FeedSlots } from '../project/feedSlots';
import {
  Errors,
  legacyBoundary,
  legacyChemical,
  mediumLabel,
  modernBoundary,
  modernChem,
  parseEdits,
  parseSite,
  receptorTag,
} from '../risk/build';
import type { CleanupForm } from './form';

export type CleanupLegacyInput = DirectInput<LegacyReceptor, LegacyChemical>;
export type CleanupModernInput = DirectInput<ModernReceptor, ModernChemical>;

/** The one input error that means "nothing to compute yet" rather than "something is wrong". */
export const ENTER_CONCENTRATION =
  'Cumulative allocation keeps your ratios: enter a concentration for at least one chemical in at least one medium.';
export const ADD_CHEMICAL = 'Add at least one chemical.';

/** The held results of other screens this screen reads. */
export interface CleanupFeeds {
  /**
   * The plants and ecology screen's produce results, for the homegrown produce pathway: the feed's
   * slots (one per chemical) or one result. Each row reads its own chemical's slot.
   */
  produce?: ProduceRiskFeed | FeedSlots<ProduceRiskFeed> | null;
}

export type CleanupBuildResult =
  | {
      ok: true;
      legacy: CleanupLegacyInput;
      modern: CleanupModernInput;
      notes: string[];
      /** Engine warnings of the produce plant factors, shown with the cleanup warnings. */
      feedWarnings: { code: string; message: string }[];
    }
  | { ok: false; errors: string[] };

/** Screen unit to SI: mg/kg to kg/kg, mg/L to kg/m3, mg/m3 to kg/m3. */
const TO_SI: Record<Medium, number> = {
  soil: 1e-6,
  groundwater: 1e-3,
  surfaceWater: 1e-3,
  bathroomAir: 1e-6,
  indoorAir: 1e-6,
  outdoorAir: 1e-6,
};

/** SI back to the screen unit of the medium. */
export const FROM_SI = (m: Medium): number => 1 / TO_SI[m];
export const MEDIUM_UNIT = (m: Medium): string => MEDIA.find((x) => x.key === m)?.unit ?? '';

/** A blank is `undefined`; anything else must be a finite number above zero (or not below, when `zero`). */
function parseTarget(text: string, label: string, errors: Errors): number | undefined {
  if (text.trim() === '') return undefined;
  const v = Number(text.trim());
  if (!Number.isFinite(v) || v <= 0) {
    errors.add(`${label}: enter a number above zero`);
    return undefined;
  }
  return v;
}

function parseEntered(text: string | undefined, label: string, errors: Errors): number | undefined {
  if (text === undefined || text.trim() === '') return undefined;
  const v = Number(text.trim());
  if (!Number.isFinite(v) || v < 0) {
    errors.add(`${label}: enter a number that is not negative`);
    return undefined;
  }
  return v;
}

/**
 * Turns the form into one back-calculation input per method on the same chemicals, receptors and
 * targets. Individual and equal allocation need no concentration: every medium with a switched-on
 * pathway gets a level. Cumulative allocation keeps the entered ratios, so only the media with an
 * entered concentration are solved, and a chemical blank in such a medium counts as zero there.
 */
export function buildCleanup(
  form: CleanupForm,
  db: ChemicalDb,
  feeds: CleanupFeeds = {},
): CleanupBuildResult {
  const produceHeld = feeds.produce ?? null;
  // the produce result made for this chemical, or null (one slot per chemical)
  const ownProduce = (id: string): ProduceRiskFeed | null => {
    const f = pickSlot(produceHeld, id);
    return f !== null && f.chemicalId === id ? f : null;
  };
  const errors = new Errors();
  if (form.chemicals.length === 0) errors.add(ADD_CHEMICAL);

  const records = form.chemicals.map((row) => ({ row, rec: db.byId.get(row.id) }));
  for (const { row, rec } of records) {
    if (rec === undefined) errors.add(`${row.name}: not in the chemical database`);
    if (row.produceFromPlantsEco && ownProduce(row.id) === null) {
      errors.add(
        `${row.name}: no plants and ecology result for this chemical to use; run the plants and ecology screen with it and send its produce result here`,
      );
    }
  }
  // the chemicals whose soil level includes the produce pathway (they opted in and the feed is theirs)
  const usesProduce = (id: string, flagged: boolean): boolean => flagged && ownProduce(id) !== null;
  const anyProduce = form.chemicals.some((c) => usesProduce(c.id, c.produceFromPlantsEco));
  // the produce results in use; the receptor's intake comes from the first (each chemical's plant
  // factors come from its own result)
  const usedProduce = form.chemicals
    .filter((c) => usesProduce(c.id, c.produceFromPlantsEco))
    .map((c) => ownProduce(c.id)!);
  const produce = usedProduce[0] ?? null;
  const feedWarnings: { code: string; message: string }[] = [];

  const risk = parseTarget(form.targetRisk, 'Target cancer risk', errors);
  const hq = parseTarget(form.targetHq, 'Target hazard quotient', errors);
  const targets: { risk?: number; hq?: number } = {};
  if (risk !== undefined) targets.risk = risk;
  if (hq !== undefined) targets.hq = hq;

  const cumulative = form.allocation === 'cumulative';
  const entered = new Map<string, Partial<Record<Medium, number>>>();
  const mediaWithValue = new Set<Medium>();
  if (cumulative) {
    for (const { row } of records) {
      const e: Partial<Record<Medium, number>> = {};
      for (const m of MEDIA) {
        const v = parseEntered(row.conc[m.key], `${row.name}, ${m.label.toLowerCase()}`, errors);
        if (v !== undefined) {
          e[m.key] = v * TO_SI[m.key];
          mediaWithValue.add(m.key);
        }
      }
      entered.set(row.id, e);
    }
    if (form.chemicals.length > 0 && errors.list.length === 0 && mediaWithValue.size === 0) {
      errors.add(ENTER_CONCENTRATION);
    }
  }

  const receptors: { tag: string; rf: ReceptorForm }[] = [
    { tag: 'Receptor A', rf: form.a },
    ...(form.b ? [{ tag: 'Receptor B', rf: form.b }] : []),
  ];
  const notes: string[] = [];
  const legacyReceptors: DirectReceptor<LegacyReceptor>[] = [];
  const modernReceptors: DirectReceptor<ModernReceptor>[] = [];
  const ready = errors.list.length === 0;
  for (const { tag: defaultTag, rf } of receptors) {
    const tag = receptorTag(rf, defaultTag);
    const site = parseSite(rf, tag, errors);
    const edits = parseEdits(rf, tag, errors);
    if (!ready || errors.list.length > 0) continue;
    const label = `${tag} (${PRESET_LABELS[rf.preset]})`;
    const usable = (p: PathwayId): boolean => !cumulative || mediaWithValue.has(PATHWAYS[p].medium);
    const pathways: PathwayId[] = DIRECT_PATHWAY_IDS.filter((p) => rf.pathways[p] && usable(p));
    const produceOn = rf.produce && anyProduce && usable('produce');
    if (produceOn && produce !== null) {
      pathways.push('produce');
      notes.push(
        `${label}: homegrown produce uses the ${produce.intakeLabel} intake for every life stage of the receptor.`,
      );
      for (const w of usedProduce.flatMap((f) => f.warnings ?? [])) {
        if (!feedWarnings.some((x) => x.code === w.code && x.message === w.message)) {
          feedWarnings.push(w);
        }
      }
    } else if (rf.produce) {
      notes.push(
        anyProduce
          ? `${label}: homegrown produce skipped, no concentration entered for soil.`
          : `${label}: homegrown produce skipped, no chemical uses the plants and ecology screen's plant factors.`,
      );
    }
    for (const p of DIRECT_PATHWAY_IDS) {
      if (rf.pathways[p] && !usable(p)) {
        notes.push(
          `${label}: ${PATHWAY_LABELS[p]} skipped, no concentration entered for ${mediumLabel(PATHWAYS[p].medium).toLowerCase()}.`,
        );
      }
    }
    if (pathways.length === 0) {
      errors.add(`${label}: switch on at least one pathway.`);
      continue;
    }
    try {
      const intake = produceOn && produce !== null ? produce.intakes : undefined;
      legacyReceptors.push({
        label,
        receptor: legacyReceptor(legacyBoundary(rf.preset, site, intake, edits)),
        pathways,
        routeExtrapolation: form.routeExtrapolation,
      });
      modernReceptors.push({
        label,
        receptor: modernReceptor(modernBoundary(rf.preset, site, intake, edits)),
        pathways,
      });
    } catch (e) {
      errors.add(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (errors.list.length > 0) return { ok: false, errors: errors.list };

  const enteredFor = (id: string): Partial<Record<Medium, number>> | undefined => {
    if (!cumulative) return undefined;
    const e = entered.get(id) ?? {};
    // a medium solved for cumulative allocation: a blank chemical there counts as zero
    const out: Partial<Record<Medium, number>> = {};
    for (const m of mediaWithValue) out[m] = e[m] ?? 0;
    return out;
  };
  const chem = <C>(
    make: (
      rec: NonNullable<(typeof records)[number]['rec']>,
      dermal: (typeof form.chemicals)[number]['dermalForm'],
      factors: ProduceFactors | undefined,
    ) => C,
  ): DirectChemical<C>[] =>
    records.map(({ row, rec }) => {
      const factors = usesProduce(row.id, row.produceFromPlantsEco)
        ? ownProduce(row.id)?.factors
        : undefined;
      const out: DirectChemical<C> = { id: row.id, chemical: make(rec!, row.dermalForm, factors) };
      if (rec!.tox.volatile) out.volatile = true;
      const e = enteredFor(row.id);
      if (e !== undefined) out.entered = e;
      return out;
    });

  const common = {
    targets,
    allocation: form.allocation,
    additive: form.additive && receptors.length === 2,
  };
  return {
    ok: true,
    legacy: {
      receptors: legacyReceptors,
      chemicals: chem((rec, _dermal, factors) => legacyChemical(rec, factors)),
      ...common,
    },
    modern: {
      receptors: modernReceptors,
      chemicals: chem((rec, dermal, factors) => modernChem(rec, dermal, factors)),
      ...common,
    },
    notes,
    feedWarnings,
  };
}
