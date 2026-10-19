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
} from '@model-flow/engine';
import type { ChemicalDb } from '../risk/chemicalDb';
import { PATHWAY_LABELS } from '../risk/chartData';
import { MEDIA, PRESET_LABELS, type ReceptorForm } from '../risk/form';
import {
  Errors,
  legacyBoundary,
  legacyChemical,
  mediumLabel,
  modernBoundary,
  modernChem,
  parseSite,
} from '../risk/build';
import type { CleanupForm } from './form';

export type CleanupLegacyInput = DirectInput<LegacyReceptor, LegacyChemical>;
export type CleanupModernInput = DirectInput<ModernReceptor, ModernChemical>;

/** The one input error that means "nothing to compute yet" rather than "something is wrong". */
export const ENTER_CONCENTRATION =
  'Cumulative allocation keeps your ratios: enter a concentration for at least one chemical in at least one medium.';
export const ADD_CHEMICAL = 'Add at least one chemical.';

export type CleanupBuildResult =
  | { ok: true; legacy: CleanupLegacyInput; modern: CleanupModernInput; notes: string[] }
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
export function buildCleanup(form: CleanupForm, db: ChemicalDb): CleanupBuildResult {
  const errors = new Errors();
  if (form.chemicals.length === 0) errors.add(ADD_CHEMICAL);

  const records = form.chemicals.map((row) => ({ row, rec: db.byId.get(row.id) }));
  for (const { row, rec } of records) {
    if (rec === undefined) errors.add(`${row.name}: not in the chemical database`);
  }

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
  for (const { tag, rf } of receptors) {
    const site = parseSite(rf, tag, errors);
    if (!ready || errors.list.length > 0) continue;
    const label = `${tag} (${PRESET_LABELS[rf.preset]})`;
    const usable = (p: PathwayId): boolean => !cumulative || mediaWithValue.has(PATHWAYS[p].medium);
    const pathways = DIRECT_PATHWAY_IDS.filter((p) => rf.pathways[p] && usable(p));
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
      legacyReceptors.push({
        label,
        receptor: legacyReceptor(legacyBoundary(rf.preset, site)),
        pathways,
        routeExtrapolation: form.routeExtrapolation,
      });
      modernReceptors.push({
        label,
        receptor: modernReceptor(modernBoundary(rf.preset, site)),
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
    ) => C,
  ): DirectChemical<C>[] =>
    records.map(({ row, rec }) => {
      const out: DirectChemical<C> = { id: row.id, chemical: make(rec!, row.dermalForm) };
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
      chemicals: chem((rec) => legacyChemical(rec)),
      ...common,
    },
    modern: {
      receptors: modernReceptors,
      chemicals: chem((rec, dermal) => modernChem(rec, dermal)),
      ...common,
    },
    notes,
  };
}
