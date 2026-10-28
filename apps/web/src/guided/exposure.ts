import { DIRECT_PATHWAY_IDS, type PathwayId } from '@model-flow/engine';
import { PATHWAY_LABELS } from '../risk/chartData';
import {
  Errors,
  legacyBoundary,
  modernBoundary,
  parseEdits,
  parseSite,
  receptorTag,
} from '../risk/build';
import { defaultReceptor, type ReceptorForm } from '../risk/form';
import type { OverridesState } from '../overrides/model';
import { withReceptorEdits } from '../overrides/receptors';
import { guidedReceptors } from './riskForm';
import { pathwayStatuses, pathwaysOn } from './pathways';
import type { GuidedState } from './state';

/**
 * Step 4 on the guided state: the pathway ticks, the receptors, and what a ticked pathway still needs.
 * Pure: it reads the guided answers (and, when given, the project's receptor edits) and returns new values.
 */

/**
 * A copy with one pathway ticked or unticked. `exposure.pathways` holds only the ticks the user changed,
 * and an absent entry means ticked, so ticking again removes the entry.
 */
export function setPathwayTick(g: GuidedState, id: PathwayId, on: boolean): GuidedState {
  const pathways = Object.fromEntries(
    Object.entries(g.exposure.pathways).filter(([k]) => k !== id),
  );
  return {
    ...g,
    exposure: { ...g.exposure, pathways: on ? pathways : { ...pathways, [id]: false } },
  };
}

/** A child and an adult as the two receptors, with their cancer risks added (never the hazard indices). */
export function childAndAdult(g: GuidedState): GuidedState {
  return {
    ...g,
    exposure: {
      ...g.exposure,
      a: { ...defaultReceptor('child'), ...siteFactorsOf(g.exposure.a) },
      b: { ...defaultReceptor('resident'), ...siteFactorsOf(g.exposure.b ?? g.exposure.a) },
      additive: true,
    },
  };
}

const SITE_KEYS = [
  'soilSkinArea',
  'soilAdherence',
  'waterIngestion',
  'waterSkinArea',
  'inhalationRate',
  'bathTime',
  'swimTime',
  'swimDays',
  'outdoorTime',
] as const;
type SiteKey = (typeof SITE_KEYS)[number];

const siteFactorsOf = (r: ReceptorForm): Pick<ReceptorForm, SiteKey> =>
  Object.fromEntries(SITE_KEYS.map((k) => [k, r[k]])) as Pick<ReceptorForm, SiteKey>;

/** What is wrong with the receptors' typed site factors, in words (a bad number), one line each. */
export function receptorProblems(g: GuidedState): string[] {
  const errors = new Errors();
  const { a, b } = g.exposure;
  for (const [r, tag] of [
    [a, 'Receptor A'],
    [b, 'Receptor B'],
  ] as const) {
    if (r === null) continue;
    parseSite(r, tag, errors);
    parseEdits(r, tag, errors);
  }
  return errors.list;
}

/**
 * Step 4 is done with at least one pathway on that a receptor is exposed by, and receptors whose typed
 * factors are readable numbers.
 */
export function exposureDone(g: GuidedState): boolean {
  const on = pathwaysOn(g);
  const { a, b } = guidedReceptors(g);
  const exposed = (r: ReceptorForm | null): boolean =>
    r !== null &&
    (DIRECT_PATHWAY_IDS.some((p) => on[p] && r.pathways[p]) || (on.produce && r.produce));
  return (exposed(a) || exposed(b)) && receptorProblems(g).length === 0;
}

export interface MissingInput {
  /** The receptor's name: its own name when it has one, else "Receptor A" or "Receptor B". */
  receptor: string;
  which: 'a' | 'b';
  /** The exposure input in plain words, for example "Bathing time". */
  label: string;
  unit: string;
  /** The ticked pathways that need it, by name. */
  pathways: string[];
}

type Bounds = Record<string, unknown>;
const num = (v: unknown): boolean => typeof v === 'number';
const hours = (b: Bounds, key: string): Bounds => (b[key] ?? {}) as Bounds;

interface Need {
  pathway: PathwayId;
  form: SiteKey;
  label: string;
  unit: string;
  /** True when the legacy boundary carries the value. */
  legacy: (b: Bounds) => boolean;
  /** True when one modern life stage carries the value. */
  modern: (s: Bounds) => boolean;
}

const et = (p: PathwayId) => (b: Bounds) => num(hours(b, 'etHoursPerDay')[p]);
const ef = (p: PathwayId) => (b: Bounds) => num(hours(b, 'efDaysPerYrByPathway')[p]);
const field = (k: string) => (b: Bounds) => num(b[k]);

const NEEDS: readonly Need[] = [
  {
    pathway: 'soilDermal',
    form: 'soilSkinArea',
    label: 'Soil skin area',
    unit: 'cm2',
    legacy: field('soilSkinAreaCm2'),
    modern: field('soilSkinAreaCm2'),
  },
  {
    pathway: 'soilDermal',
    form: 'soilAdherence',
    label: 'Soil adherence',
    unit: 'mg/cm2',
    legacy: field('soilAdherenceMgPerCm2'),
    modern: field('soilAdherenceMgPerCm2'),
  },
  {
    pathway: 'waterIngestion',
    form: 'waterIngestion',
    label: 'Drinking water',
    unit: 'L/day',
    legacy: field('waterIngestionLPerDay'),
    modern: field('waterIngestionLPerDay'),
  },
  {
    pathway: 'waterDermal',
    form: 'waterSkinArea',
    label: 'Skin area for water',
    unit: 'cm2',
    legacy: field('waterSkinAreaCm2'),
    modern: field('waterSkinAreaCm2'),
  },
  {
    pathway: 'swimDermal',
    form: 'waterSkinArea',
    label: 'Skin area for water',
    unit: 'cm2',
    legacy: field('swimSkinAreaCm2'),
    modern: field('swimSkinAreaCm2'),
  },
  {
    pathway: 'waterDermal',
    form: 'bathTime',
    label: 'Bathing time',
    unit: 'h/day',
    legacy: et('waterDermal'),
    modern: field('bathingTimeHr'),
  },
  {
    pathway: 'showerInhalation',
    form: 'bathTime',
    label: 'Bathing time',
    unit: 'h/day',
    legacy: et('showerInhalation'),
    modern: et('showerInhalation'),
  },
  {
    pathway: 'swimIngestion',
    form: 'swimTime',
    label: 'Swimming time',
    unit: 'h/day',
    legacy: et('swimIngestion'),
    modern: field('swimTimeHr'),
  },
  {
    pathway: 'swimDermal',
    form: 'swimTime',
    label: 'Swimming time',
    unit: 'h/day',
    legacy: et('swimDermal'),
    modern: field('swimTimeHr'),
  },
  {
    pathway: 'swimIngestion',
    form: 'swimDays',
    label: 'Swimming days',
    unit: 'd/yr',
    legacy: ef('swimIngestion'),
    modern: ef('swimIngestion'),
  },
  {
    pathway: 'swimDermal',
    form: 'swimDays',
    label: 'Swimming days',
    unit: 'd/yr',
    legacy: ef('swimDermal'),
    modern: ef('swimDermal'),
  },
  {
    pathway: 'outdoorInhalation',
    form: 'outdoorTime',
    label: 'Outdoor air time',
    unit: 'h/day',
    legacy: et('outdoorInhalation'),
    modern: et('outdoorInhalation'),
  },
  ...(['showerInhalation', 'indoorInhalation', 'outdoorInhalation'] as const).map(
    (pathway): Need => ({
      pathway,
      form: 'inhalationRate',
      label: 'Breathing rate',
      unit: 'm3/h',
      legacy: field('inhalationM3PerHour'),
      // the modern method works from the air concentration alone
      modern: () => true,
    }),
  ),
];

/**
 * The exposure inputs a ticked pathway needs and the receptor does not have: neither typed in step 4b nor
 * carried by its profile, for the method chosen in step 3d. Naming them is what USABILITY M3 asks for in
 * place of a bare "no toxicity value" further on.
 */
export function missingExposureInputs(g: GuidedState, overrides?: OverridesState): MissingInput[] {
  const on = pathwayStatuses(g).filter((p) => p.on);
  const { a, b } = guidedReceptors(g);
  const named =
    overrides === undefined
      ? { a, b }
      : (withReceptorEdits({ a, b }, overrides, 'guided') as {
          a: ReceptorForm;
          b: ReceptorForm | null;
        });
  const out: MissingInput[] = [];
  for (const [r, which, tag] of [
    [named.a, 'a', 'Receptor A'],
    [named.b, 'b', 'Receptor B'],
  ] as const) {
    if (r === null) continue;
    const site = parseSite(r, tag, new Errors());
    const legacy = g.run.basis === 'legacy';
    const bound = legacy
      ? (legacyBoundary(r.preset, site) as unknown as Bounds)
      : (modernBoundary(r.preset, site) as unknown as Bounds);
    const stages = legacy ? [] : ((bound['stages'] as Bounds[] | undefined) ?? []);
    const byForm = new Map<SiteKey, MissingInput>();
    for (const n of NEEDS) {
      if (!on.some((p) => p.id === n.pathway) || !r.pathways[n.pathway]) continue;
      const has = legacy ? n.legacy(bound) : stages.every((s) => n.modern(s));
      if (has) continue;
      const found = byForm.get(n.form);
      const pathway = PATHWAY_LABELS[n.pathway];
      if (found !== undefined) {
        if (!found.pathways.includes(pathway)) found.pathways.push(pathway);
      } else {
        byForm.set(n.form, {
          receptor: receptorTag(r, tag),
          which,
          label: n.label,
          unit: n.unit,
          pathways: [pathway],
        });
      }
    }
    out.push(...byForm.values());
  }
  return out;
}
