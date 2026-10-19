/**
 * The site model choices: who is exposed, how the source concentrations are known, which single medium
 * is the source, where the exposure point is, which vapor method and where homegrown produce gets its
 * contaminant. The choices are advisory: they only decide the checklist the site page shows, nothing on
 * any other screen is locked or changed by them.
 */

export type ReceptorKind = 'human' | 'ecological';
export type Basis = 'direct' | 'modeled';
export type Location = 'onsite' | 'downgradient';
export type VaporMethod = 'legacy' | 'modern';

/** Media a concentration can be entered for directly. */
export const DIRECT_MEDIA = [
  'soil',
  'groundwater',
  'surfaceWater',
  'indoorAir',
  'outdoorAir',
] as const;
/** Sources the fate models start from. */
export const MODELED_SOURCES = [
  'soil',
  'groundwater',
  'soilToIndoorAir',
  'soilGasToIndoorAir',
] as const;
export type DirectMedium = (typeof DIRECT_MEDIA)[number];
export type ModeledSource = (typeof MODELED_SOURCES)[number];
export type SourceMedium = DirectMedium | ModeledSource;

export const MEDIUM_LABELS: Record<SourceMedium, string> = {
  soil: 'Soil',
  groundwater: 'Groundwater',
  surfaceWater: 'Surface water',
  indoorAir: 'Indoor air',
  outdoorAir: 'Outdoor air',
  soilToIndoorAir: 'Soil to indoor air',
  soilGasToIndoorAir: 'Soil gas to indoor air',
};

export interface SiteState {
  receptors: ReceptorKind;
  basis: Basis;
  /** The ticked source media. Exactly one is a valid analysis; more or none is explained on the page. */
  media: SourceMedium[];
  location: Location;
  vaporMethod: VaporMethod;
  /** Homegrown produce takes its contaminant from the soil, from irrigation water, or neither. Both is refused. */
  produceSoil: boolean;
  produceIrrigation: boolean;
}

export const defaultSite = (): SiteState => ({
  receptors: 'human',
  basis: 'direct',
  media: ['soil'],
  location: 'onsite',
  vaporMethod: 'modern',
  produceSoil: false,
  produceIrrigation: false,
});

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export const isDefaultSite = (s: SiteState): boolean => {
  const d = defaultSite();
  return (
    s.receptors === d.receptors &&
    s.basis === d.basis &&
    sameList(s.media, d.media) &&
    s.location === d.location &&
    s.vaporMethod === d.vaporMethod &&
    s.produceSoil === d.produceSoil &&
    s.produceIrrigation === d.produceIrrigation
  );
};

/** The media that can be ticked for a basis. */
export const mediaFor = (basis: Basis): readonly SourceMedium[] =>
  basis === 'direct' ? DIRECT_MEDIA : MODELED_SOURCES;

/** One line for the report inputs section. */
export function siteSummary(s: SiteState): string {
  const who = s.receptors === 'human' ? 'human receptors' : 'ecological receptors';
  const how = s.basis === 'direct' ? 'concentrations entered directly' : 'concentrations modeled';
  const media =
    s.media.length === 0
      ? 'no source medium chosen'
      : s.media.map((m) => MEDIUM_LABELS[m]).join(' and ');
  const where = s.location === 'onsite' ? 'onsite' : 'downgradient';
  const produce =
    s.produceSoil && s.produceIrrigation
      ? 'produce from soil and irrigation water (not allowed together)'
      : s.produceSoil
        ? 'produce from soil'
        : s.produceIrrigation
          ? 'produce from irrigation water'
          : 'no homegrown produce';
  const vapor =
    s.basis === 'modeled' &&
    (s.media.includes('soilToIndoorAir') || s.media.includes('soilGasToIndoorAir'))
      ? `, ${s.vaporMethod === 'legacy' ? 'legacy Johnson and Ettinger' : 'modern EPA'} vapor method`
      : '';
  return `${who}, ${how}, source: ${media}, exposure point ${where}, ${produce}${vapor}.`;
}
