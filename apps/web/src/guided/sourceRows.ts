import { fmtSource } from '../cleanup/format';
import { solubilityFlag, type SolubilityCeiling } from '../cleanup/solubility';
import type { SurfaceWaterLevelRow } from '../cleanup/surfaceWaterLevels';
import type { VaporLevelRow } from '../cleanup/vaporLevels';
import { methodName } from '../project/runInputs';

/** The method names step 5 and step 6 print, and the rows of their vapor and surface water source level tables. */
export const METHOD_LABEL: Record<'legacy' | 'modern', string> = {
  legacy: 'Legacy',
  modern: 'Modern',
};

export interface SourceRow {
  key: string;
  chemical: string;
  source: string;
  method: string;
  level: string;
  flag: boolean;
  reason: string | null;
  limiting: string;
  cancer: string;
  noncancer: string;
  foundBy: string;
  warnings: string[];
}

export function vaporRow(
  r: VaporLevelRow,
  chemical: string,
  ceiling: SolubilityCeiling | null,
): SourceRow {
  const unitText = r.level === null ? '' : ` ${r.unit}`;
  return {
    key: `${chemical}|${r.method}|${r.what}`,
    chemical,
    source: `${r.what}, ${methodName(r.vaporMethod ?? undefined)}`,
    method: METHOD_LABEL[r.method],
    level: `${fmtSource(r.level, r.fromSi)}${unitText}`,
    flag:
      r.unit === 'mg/L' && r.level !== null
        ? solubilityFlag(chemical, r.level * r.fromSi, ceiling) !== null
        : false,
    reason: r.reason,
    limiting: r.limiting ?? 'none',
    cancer: fmtSource(r.cancerLevel, r.fromSi),
    noncancer: fmtSource(r.noncancerLevel, r.fromSi),
    foundBy:
      r.basis === null ? 'none' : r.basis === 'linear' ? 'proportional to the source' : 'solved',
    warnings: r.warnings.map((w) => `${chemical}: ${w}`),
  };
}

export function surfaceRow(
  r: SurfaceWaterLevelRow,
  names: Record<string, string>,
  ceilingOf: (id: string) => SolubilityCeiling | null,
): SourceRow {
  const chemical = names[r.chemical] ?? r.chemical;
  const unitText = r.level === null ? '' : ` ${r.unit}`;
  return {
    key: `${r.chemical}|${r.method}|surface`,
    chemical,
    source: `${r.sourceMedium === 'groundwater' ? 'Groundwater' : 'Soil'} (surface water)`,
    method: METHOD_LABEL[r.method],
    level: r.pending ? 'solving' : `${fmtSource(r.level, r.fromSi)}${unitText}`,
    flag:
      r.unit === 'mg/L' && r.level !== null
        ? solubilityFlag(chemical, r.level * r.fromSi, ceilingOf(r.chemical)) !== null
        : false,
    reason: r.reason,
    limiting: r.limiting ?? 'none',
    cancer: fmtSource(r.cancerLevel, r.fromSi),
    noncancer: fmtSource(r.noncancerLevel, r.fromSi),
    foundBy:
      r.path === null ? 'none' : r.path === 'linear' ? 'proportional to the source' : 'solved',
    warnings: r.warnings.map((w) => `${chemical}: ${w}`),
  };
}
