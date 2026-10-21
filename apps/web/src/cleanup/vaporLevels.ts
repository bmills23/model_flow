import { sourceLevelOfChemical } from './chemicalLevel';
import type { VaporSourceKind } from '../vapor/coefficients';
import type { VaporRiskFeed } from '../vapor/feeds';
import type { CleanupOutcome } from './compute';

export interface VaporLevelRow {
  /** The receptor method of the M5 run the level comes from. */
  method: 'legacy' | 'modern';
  /** The vapor or outdoor air method id that produced the coefficient (for example vapor.je-1991). */
  vaporMethod: string | null;
  what: string;
  /** Source level in SI (kg/m3, or kg/kg for soil); null when not quantified. */
  level: number | null;
  cancerLevel: number | null;
  noncancerLevel: number | null;
  limiting: string | null;
  /** Screen unit and the factor from SI. */
  unit: 'mg/L' | 'mg/kg' | 'mg/m3';
  fromSi: number;
  /** Why the level is not quantified; null when it is. */
  reason: string | null;
  warnings: string[];
}

const SOURCE: Record<
  VaporSourceKind,
  { name: string; unit: VaporLevelRow['unit']; fromSi: number }
> = {
  soil: { name: 'Soil', unit: 'mg/kg', fromSi: 1e6 },
  groundwater: { name: 'Groundwater', unit: 'mg/L', fromSi: 1e3 },
  poreWater: { name: 'Soil pore water', unit: 'mg/L', fromSi: 1e3 },
  soilGas: { name: 'Soil gas', unit: 'mg/m3', fromSi: 1e6 },
};

const PATHS = [
  { key: 'indoor', medium: 'indoorAir', where: 'indoor air' },
  { key: 'outdoor', medium: 'outdoorAir', where: 'outdoor air' },
] as const;

const limitText = (max: number, src: { unit: string; fromSi: number }): string =>
  `${Number((max * src.fromSi).toPrecision(3))} ${src.unit}`;

const RESEND =
  'this vapor feed was sent before source levels existed: send it again from the vapor screen';

/**
 * The groundwater, soil gas, pore water or soil level that gives the cleanup screen's indoor and outdoor
 * air levels, for the chemical the vapor screen was run for: the air level over the vapor run's
 * air-over-source coefficient (no root find). A path the vapor run could not show linear in its source,
 * or a level beyond the range the coefficient holds for, is a row with no level and the reason.
 */
export function vaporSourceLevels(outcome: CleanupOutcome, feed: VaporRiskFeed): VaporLevelRow[] {
  const rows: VaporLevelRow[] = [];
  for (const method of ['legacy', 'modern'] as const) {
    const o = outcome[method];
    if (!o.ok) continue;
    for (const path of PATHS) {
      if (feed[path.key] === undefined) continue;
      const medium = o.result.media.find((m) => m.medium === path.medium);
      if (!medium || !medium.levels.some((l) => l.chemical === feed.chemicalId)) continue;
      const coef = feed.coefficients?.[path.key];
      const notQuantified = (reason: string, vaporMethod: string | null): VaporLevelRow => ({
        method,
        vaporMethod,
        what: `Source (${path.where})`,
        level: null,
        cancerLevel: null,
        noncancerLevel: null,
        limiting: null,
        unit: 'mg/L',
        fromSi: 1e3,
        reason,
        warnings: [],
      });
      if (coef === undefined) {
        rows.push(notQuantified(RESEND, feed[path.key]?.origin ?? null));
        continue;
      }
      if (!coef.quantified) {
        rows.push(notQuantified(coef.reason, coef.methodId));
        continue;
      }
      const src = SOURCE[coef.source];
      const lv = sourceLevelOfChemical(o.result, path.medium, feed.chemicalId, coef.value)!;
      const row: VaporLevelRow = {
        method,
        vaporMethod: coef.methodId,
        what: `${src.name} (${path.where})`,
        level: lv.level,
        cancerLevel: lv.cancerLevel,
        noncancerLevel: lv.noncancerLevel,
        limiting: lv.limiting,
        unit: src.unit,
        fromSi: src.fromSi,
        reason: null,
        warnings: lv.warnings.map((w) => w.message),
      };
      const max = coef.maxSource;
      if (coef.value === 0) {
        row.reason = 'the model transfers nothing from this source to the air (coefficient 0)';
      } else if (max !== undefined && lv.level !== null && lv.level > max) {
        row.reason = `the level would exceed the model's residual-phase limit of ${limitText(max, src)}, above which the vapor no longer rises, so the model does not reach this air level from this source`;
        row.level = null;
        row.cancerLevel = null;
        row.noncancerLevel = null;
        row.limiting = null;
      } else if (
        max !== undefined &&
        [lv.cancerLevel, lv.noncancerLevel].some((x) => x !== null && x > max)
      ) {
        row.warnings.push(
          `${row.what}: a cancer or noncancer level above ${limitText(max, src)} is beyond the model's residual-phase limit, so the model cannot reach it from this source`,
        );
      }
      rows.push(row);
    }
  }
  return rows;
}
