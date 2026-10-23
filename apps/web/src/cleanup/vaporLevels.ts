import { sourceLevelOfChemical } from './chemicalLevel';
import type { VaporSourceKind } from '../vapor/coefficients';
import type { VaporRiskFeed } from '../vapor/feeds';
import type { VaporSolveSpec } from '../vapor/forward';
import type { CleanupOutcome } from './compute';
import { solveVaporSource } from './vaporSolve';

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
  /**
   * Where the level came from: the vapor run's linear coefficient, or a solve against its forward
   * model (a path not proportional to the source, or a level past a limit the model is run to). Null
   * when the row has no level and no solve was tried.
   */
  basis: 'linear' | 'solve' | null;
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
const RESEND_SOLVE =
  'this vapor feed was sent before nonlinear source levels were solved: send it again from the vapor screen';

/**
 * Stems of the reasons a feed saved before the solve carries for a path that is not proportional to
 * its source; such a feed holds no forward model, so the row asks for it to be sent again.
 */
const OLD_NONLINEAR_STEMS = [
  'a soil source with a TPH mixture',
  'takes the oxygen demand from the source vapor',
  'is not proportional to the source',
  'is not linear in the soil concentration',
];
const oldNonlinear = (reason: string): boolean =>
  OLD_NONLINEAR_STEMS.some((stem) => reason.includes(stem));

/** The air level in mg/m3 as the rows print it. */
const airText = (kgPerM3: number): string => `${Number((kgPerM3 * 1e6).toPrecision(3))} mg/m3`;

/** The air levels (kg/m3) of one chemical in one medium, from the direct back-calculation. */
interface AirLevels {
  level: number | null;
  cancerLevel: number | null;
  noncancerLevel: number | null;
}

/**
 * The three source levels of a row (governing, cancer, noncancer) solved against the forward model: each
 * air level the cleanup screen back-calculated is met by the source whose forward air equals it. A level
 * the model does not reach up to its limit is null, and `notReached` says which with the largest air the
 * model gave; a forward run the engine refused is `failed`.
 */
function solveRow(
  spec: VaporSolveSpec,
  air: AirLevels,
  src: { name: string; unit: VaporLevelRow['unit']; fromSi: number },
  soil: boolean,
): {
  level: number | null;
  cancerLevel: number | null;
  noncancerLevel: number | null;
  reason: string | null;
  warnings: string[];
} {
  const cache = new Map<number, ReturnType<typeof solveVaporSource>>();
  const solved = (target: number | null): ReturnType<typeof solveVaporSource> | null => {
    if (target === null) return null;
    let r = cache.get(target);
    if (r === undefined) {
      r = solveVaporSource(spec, target, soil);
      cache.set(target, r);
    }
    return r;
  };
  const governing = solved(air.level);
  const cancer = solved(air.cancerLevel);
  const noncancer = solved(air.noncancerLevel);
  const limit = spec.cap
    ? `${spec.cap.label} of ${limitText(spec.cap.value, src)}`
    : 'the largest source tried';
  const missed = (r: NonNullable<typeof governing>, target: number | null): string =>
    r.error !== undefined
      ? `the source level could not be solved: ${r.error}`
      : `the model does not reach the air level ${airText(target ?? 0)} from this source: its air tops out at ${airText(r.maxAir)} at the ${limit}`;
  const warnings: string[] = [];
  for (const r of [governing, cancer, noncancer]) {
    for (const w of r?.warnings ?? []) if (!warnings.includes(w)) warnings.push(w);
  }
  if (governing !== null && governing.level === null) {
    return {
      level: null,
      cancerLevel: null,
      noncancerLevel: null,
      reason: missed(governing, air.level),
      warnings,
    };
  }
  const endpoint = (
    name: string,
    r: ReturnType<typeof solveVaporSource> | null,
    target: number | null,
  ): number | null => {
    if (r === null) return null;
    if (r.level === null) warnings.push(`${name} level: ${missed(r, target)}`);
    return r.level;
  };
  return {
    level: governing?.level ?? null,
    cancerLevel: endpoint('cancer', cancer, air.cancerLevel),
    noncancerLevel: endpoint('noncancer', noncancer, air.noncancerLevel),
    reason: null,
    warnings,
  };
}

const cache = new WeakMap<VaporRiskFeed, WeakMap<CleanupOutcome, VaporLevelRow[]>>();

/**
 * The groundwater, soil gas, pore water or soil level that gives the cleanup screen's indoor and outdoor
 * air levels, for the chemical the vapor screen was run for. Where the vapor run showed the air linear in
 * its source the level is the air level over its air-over-source coefficient. A path that is not
 * proportional to the source, and a level past the residual-phase limit of a soil source, are solved:
 * the source whose forward air equals the air level, with the engine's root find (`vaporSolve.ts`), up to
 * the solubility, saturation or residual-phase limit; a target beyond it is a row with no level that
 * says so. A path the run could not use for lack of an input, or a feed that holds no forward model, is
 * a row with no level and the reason. Each row says which of the two gave its level.
 */
export function vaporSourceLevels(outcome: CleanupOutcome, feed: VaporRiskFeed): VaporLevelRow[] {
  let byOutcome = cache.get(feed);
  if (byOutcome === undefined) {
    byOutcome = new WeakMap();
    cache.set(feed, byOutcome);
  }
  const held = byOutcome.get(outcome);
  if (held !== undefined) return held;
  const rows = computeRows(outcome, feed);
  byOutcome.set(outcome, rows);
  return rows;
}

function computeRows(outcome: CleanupOutcome, feed: VaporRiskFeed): VaporLevelRow[] {
  const rows: VaporLevelRow[] = [];
  for (const method of ['legacy', 'modern'] as const) {
    const o = outcome[method];
    if (!o.ok) continue;
    for (const path of PATHS) {
      if (feed[path.key] === undefined) continue;
      const medium = o.result.media.find((m) => m.medium === path.medium);
      const air = medium?.levels.find((l) => l.chemical === feed.chemicalId);
      if (!medium || !air) continue;
      const coef = feed.coefficients?.[path.key];
      const notQuantified = (
        reason: string,
        vaporMethod: string | null,
        basis: VaporLevelRow['basis'] = null,
      ): VaporLevelRow => ({
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
        basis,
        warnings: [],
      });
      if (coef === undefined) {
        rows.push(notQuantified(RESEND, feed[path.key]?.origin ?? null));
        continue;
      }
      if (!coef.quantified) {
        if (coef.solve === undefined) {
          rows.push(
            notQuantified(
              coef.nonlinear !== true && oldNonlinear(coef.reason) ? RESEND_SOLVE : coef.reason,
              coef.methodId,
            ),
          );
          continue;
        }
        // not proportional to the source: solve, in the medium the source is measured in
        const kind = coef.solve.sourceKind;
        const src = SOURCE[kind];
        const s = solveRow(coef.solve, air, src, kind === 'soil');
        rows.push({
          method,
          vaporMethod: coef.methodId,
          what: `${src.name} (${path.where})`,
          level: s.level,
          cancerLevel: s.cancerLevel,
          noncancerLevel: s.noncancerLevel,
          limiting: s.level === null ? null : air.limiting,
          unit: src.unit,
          fromSi: src.fromSi,
          reason: s.reason,
          basis: 'solve',
          warnings: s.warnings.map((w) => `${src.name} (${path.where}): ${w}`),
        });
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
        basis: 'linear',
        warnings: lv.warnings.map((w) => w.message),
      };
      const max = coef.maxSource;
      const past = (x: number | null): boolean => max !== undefined && x !== null && x > max;
      if (coef.value === 0) {
        row.reason = 'the model transfers nothing from this source to the air (coefficient 0)';
      } else if (past(lv.level) && coef.solve !== undefined) {
        // past the residual-phase limit: confirm against the forward model, never extrapolate
        const s = solveRow(coef.solve, air, src, true);
        row.level = s.level;
        row.cancerLevel = s.cancerLevel;
        row.noncancerLevel = s.noncancerLevel;
        row.limiting = s.level === null ? null : air.limiting;
        row.reason = s.reason;
        row.basis = 'solve';
        row.warnings.push(...s.warnings.map((w) => `${row.what}: ${w}`));
      } else if (past(lv.level)) {
        row.reason = `the level would exceed the model's residual-phase limit of ${limitText(max!, src)}, above which the vapor no longer rises, so the model does not reach this air level from this source`;
        row.level = null;
        row.cancerLevel = null;
        row.noncancerLevel = null;
        row.limiting = null;
      } else if ([lv.cancerLevel, lv.noncancerLevel].some(past)) {
        if (coef.solve !== undefined) {
          // the governing level is linear and inside the limit; the endpoint past it is checked
          const s = solveRow(coef.solve, air, src, true);
          if (past(lv.cancerLevel)) row.cancerLevel = s.cancerLevel;
          if (past(lv.noncancerLevel)) row.noncancerLevel = s.noncancerLevel;
          row.warnings.push(...s.warnings.map((w) => `${row.what}: ${w}`));
        } else {
          row.warnings.push(
            `${row.what}: a cancer or noncancer level above ${limitText(max!, src)} is beyond the model's residual-phase limit, so the model cannot reach it from this source`,
          );
        }
      }
      rows.push(row);
    }
  }
  return rows;
}
