/**
 * The choice of criteria set on the surface water screen (DECISIONS, "Wave V scope", rulings 3 to 5). The US
 * sets (EPA national recommended water quality criteria and the Region 4 sediment benchmarks) stay the default.
 */
export const CRITERIA_SET_CHOICES = [
  'us',
  'ccme',
  'eu',
  'eu2026',
  'uk',
  'anzg',
  'macdonald2000',
  'all',
] as const;

export type CriteriaSetChoice = (typeof CRITERIA_SET_CHOICES)[number];

/** A set other than the US pair or the union: one of the international sets built in waves V and W. */
export type InternationalSet = Exclude<CriteriaSetChoice, 'us' | 'all'>;

export const DEFAULT_CRITERIA_SET: CriteriaSetChoice = 'us';

export const INTERNATIONAL_SETS: readonly InternationalSet[] = [
  'ccme',
  'eu',
  'eu2026',
  'uk',
  'anzg',
  'macdonald2000',
];

export const CRITERIA_SET_LABEL: Record<CriteriaSetChoice, string> = {
  us: 'United States: EPA national recommended criteria and Region 4 sediment benchmarks',
  ccme: 'Canada: CCME water and sediment quality guidelines',
  eu: 'European Union: Directive 2008/105/EC as amended by Directive 2013/39/EU (2013 annex)',
  eu2026:
    'European Union: Directive 2008/105/EC as amended by Directive (EU) 2026/805 (standards as amended, dates of application in the row notes)',
  uk: 'United Kingdom: England and Wales standards directions',
  anzg: 'Australia and New Zealand: ANZG 2018 default guideline values',
  macdonald2000: 'MacDonald et al. 2000: consensus sediment guidelines (TEC and PEC)',
  all: 'All of the sets, side by side',
};

/** What each choice holds, for the line under the selector. */
export const CRITERIA_SET_MEDIA: Record<CriteriaSetChoice, string> = {
  us: 'water (aquatic life and human health) and sediment',
  ccme: 'water (freshwater and marine) and sediment (freshwater and marine)',
  eu: 'water only (inland and other surface waters)',
  eu2026:
    'water only (inland and other surface waters), with the dates of application in the notes',
  uk: 'water only (fresh and salt water)',
  anzg: 'water only (fresh and marine, by level of species protection)',
  macdonald2000: 'freshwater sediment only',
  all: 'water and sediment from every set',
};

/** Data edition of the international sets (the directory name under packages/data/generated). */
export const CRITERIA_SETS_EDITION = 'criteria-2026-10-23';

/** References.json keys that source each international set, for the methods statement. */
export const CRITERIA_SET_REFERENCES: Record<InternationalSet, readonly string[]> = {
  ccme: ['ccme2026summary'],
  eu: ['eudir2008105', 'eudir201339'],
  eu2026: ['eudir2008105', 'eudir201339', 'eudir2026805'],
  uk: ['ukwfdstandards2015'],
  anzg: ['anzg2018', 'warne2018'],
  macdonald2000: ['macdonald2000', 'macdonald2000copy', 'macdonald2000epacopy'],
};

export const isCriteriaSetChoice = (v: unknown): v is CriteriaSetChoice =>
  typeof v === 'string' && (CRITERIA_SET_CHOICES as readonly string[]).includes(v);

/** The references.json keys of the international sets a choice reads (none for the US pair). */
export function criteriaReferenceKeys(choice: CriteriaSetChoice): string[] {
  if (choice === 'us') return [];
  const sets = choice === 'all' ? INTERNATIONAL_SETS : [choice];
  return [...new Set(sets.flatMap((s) => CRITERIA_SET_REFERENCES[s]))];
}
