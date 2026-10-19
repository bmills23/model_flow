import { sourceLevelsOverCoefficient, type Medium } from '@model-flow/engine';
import type { HouseholdRiskFeed } from '../household/feeds';
import type { CleanupOutcome } from './compute';

export interface HouseholdLevelRow {
  /** The receptor method of the M5 run the level comes from. */
  method: 'legacy' | 'modern';
  /** The household method id that produced the coefficient (for example shower.little-1992). */
  householdMethod: string | null;
  what: string;
  /** Source level in SI (kg/m3 for water, kg/kg for soil); null when not quantified. */
  level: number | null;
  cancerLevel: number | null;
  noncancerLevel: number | null;
  limiting: string | null;
  /** Screen unit and the factor from SI. */
  unit: 'mg/L' | 'mg/kg';
  fromSi: number;
  warnings: string[];
}

const TERMS: readonly {
  key: keyof HouseholdRiskFeed['coefficients'];
  medium: Extract<Medium, 'bathroomAir' | 'indoorAir' | 'outdoorAir'>;
  what: string;
  unit: 'mg/L' | 'mg/kg';
  fromSi: number;
}[] = [
  {
    key: 'bathroomAir',
    medium: 'bathroomAir',
    what: 'Tap water (shower air)',
    unit: 'mg/L',
    fromSi: 1e3,
  },
  {
    key: 'householdAir',
    medium: 'indoorAir',
    what: 'Tap water (household air)',
    unit: 'mg/L',
    fromSi: 1e3,
  },
  {
    key: 'sprayAir',
    medium: 'outdoorAir',
    what: 'Irrigation water (sprinkler spray air)',
    unit: 'mg/L',
    fromSi: 1e3,
  },
  {
    key: 'particulateAir',
    medium: 'outdoorAir',
    what: 'Surface soil (windblown particulates)',
    unit: 'mg/kg',
    fromSi: 1e6,
  },
];

/**
 * The water and soil levels that give the cleanup screen's air level, for the chemical the household
 * screen was run for: the M5 level over the linear model coefficient (no root find). Each term is
 * the level that source alone must meet; a term the household run did not compute is omitted.
 */
export function householdSourceLevels(
  outcome: CleanupOutcome,
  feed: HouseholdRiskFeed,
): HouseholdLevelRow[] {
  const rows: HouseholdLevelRow[] = [];
  for (const method of ['legacy', 'modern'] as const) {
    const o = outcome[method];
    if (!o.ok) continue;
    for (const t of TERMS) {
      const coefficient = feed.coefficients[t.key];
      if (coefficient === undefined) continue;
      if (!o.result.media.some((m) => m.medium === t.medium)) continue;
      const medium = o.result.media.find((m) => m.medium === t.medium)!;
      if (!medium.levels.some((l) => l.chemical === feed.chemicalId)) continue;
      const lv = sourceLevelsOverCoefficient(o.result, t.medium, {
        [feed.chemicalId]: coefficient,
      }).find((l) => l.chemical === feed.chemicalId)!;
      rows.push({
        method,
        householdMethod: feed.methods[t.key] ?? null,
        what: t.what,
        level: lv.level,
        cancerLevel: lv.cancerLevel,
        noncancerLevel: lv.noncancerLevel,
        limiting: lv.limiting,
        unit: t.unit,
        fromSi: t.fromSi,
        warnings: lv.warnings.map((w) => w.message),
      });
    }
  }
  return rows;
}
