import { checkFinite, checkNonNegative, type SurfaceWaterWarning } from './checks.js';
import { mgPerKgToKgPerKg, mgPerLToKgPerM3, ugPerLToKgPerM3 } from './units.js';

/**
 * Comparison of a modelled concentration with water quality criteria and sediment benchmarks
 * (`docs/methods/surface-water.md`, "Criteria comparison"). Not a registered method: it is a comparison
 * against data and has no science citation of its own. Ratios are per criterion and never summed.
 *
 * The criterion record is the shape the criteria data builds (slices D1 and D2) emit: values stay in the
 * publishing agency's unit and are converted to SI here, at the boundary.
 */

export type CriterionUnit = 'ug/L' | 'mg/L' | 'ug/kg' | 'mg/kg';

/** Conversion factor: a constant, or intercept + slope ln(hardness) (some published factors depend on hardness). */
export type ConversionFactor = { constant: number } | { intercept: number; slope: number };

/** Parameter record of a hardness-dependent dissolved metal criterion: exp(slope ln(h) + intercept) times CF, in ug/L. */
export interface HardnessEquation {
  slope: number;
  intercept: number;
  conversionFactor: ConversionFactor;
}

export interface Criterion {
  id: string;
  /** Hyphenated CAS number (or the database id) of the chemical. */
  chemicalId: string;
  medium: 'surfaceWater' | 'sediment';
  /** Which criterion this is, for example `aquatic-freshwater-chronic` or `region4-marine-screening`. */
  endpoint: string;
  /** The published value, in `unit`; absent for a hardness-dependent or site-specific criterion. */
  value?: number | undefined;
  unit: CriterionUnit;
  /** Present for a hardness-dependent metal; the value is computed at the user hardness (ug/L). */
  hardness?: HardnessEquation | undefined;
  /** The criterion depends on site water chemistry and is not computed. */
  siteSpecific?: boolean | undefined;
  /** A dissolved-metal criterion (the model's concentration is taken as all dissolved). */
  dissolved?: boolean | undefined;
  /** Freshwater or saltwater (aquatic life only; human health criteria have none). */
  waterType?: 'fresh' | 'salt' | undefined;
  /** A sediment benchmark published at this organic carbon fraction (for example 0.01), else dry weight. */
  ocBasis?: number | undefined;
  /** `database` for a published value, `user` for one the user entered. */
  source: 'database' | 'user';
}

/** Hardness range of the national criteria table, mg/L as CaCO3; outside it the equation is extrapolated. */
export const HARDNESS_MIN = 25;
export const HARDNESS_MAX = 400;
/** The hardness at which the aquatic life table prints its values, mg/L as CaCO3. */
export const DEFAULT_HARDNESS = 100;
/** A ratio within this of 1 is rounding from the unit conversions, not an exceedance (exactly 1 is not flagged). */
const EXCEED_ROUNDOFF = 1e-12;

function conversionFactorAt(cf: ConversionFactor, h: number): number {
  return 'constant' in cf ? cf.constant : cf.intercept + cf.slope * Math.log(h);
}

/** The dissolved criterion in ug/L at a hardness in mg/L as CaCO3: exp(m ln(h) + b) times the conversion factor. */
export function hardnessCriterion(eq: HardnessEquation, hardness: number): number {
  checkFinite('hardness', hardness);
  if (!(hardness > 0)) throw new RangeError('hardness must be positive');
  checkFinite('hardness slope', eq.slope);
  checkFinite('hardness intercept', eq.intercept);
  const cf = conversionFactorAt(eq.conversionFactor, hardness);
  if (!(cf > 0)) throw new RangeError('the conversion factor must be positive');
  return Math.exp(eq.slope * Math.log(hardness) + eq.intercept) * cf;
}

/** A site-specific or other criterion replaced by a value the user entered. */
export function withUserValue(c: Criterion, value: number, unit: CriterionUnit): Criterion {
  checkNonNegative('criterion', value);
  return { ...c, hardness: undefined, value, unit, siteSpecific: false, source: 'user' };
}

/** Criterion value to SI: kg/m^3 for water, kg/kg for sediment. */
function toSi(value: number, unit: CriterionUnit, medium: Criterion['medium']): number {
  const water = unit === 'ug/L' || unit === 'mg/L';
  if (water !== (medium === 'surfaceWater')) {
    throw new RangeError(`a ${medium} criterion cannot be in ${unit}`);
  }
  switch (unit) {
    case 'ug/L':
      return ugPerLToKgPerM3(value);
    case 'mg/L':
      return mgPerLToKgPerM3(value);
    case 'ug/kg':
      return value * 1e-9;
    case 'mg/kg':
      return mgPerKgToKgPerKg(value);
  }
}

export type CriterionStatus = 'compared' | 'site-specific' | 'not-available';

export interface CriterionResult {
  criterion: Criterion | undefined;
  status: CriterionStatus;
  source?: 'database' | 'user';
  /** The criterion in SI (kg/m^3 or kg/kg), as compared. */
  criterionValue?: number;
  /** The concentration compared with it, SI (organic carbon normalized for a benchmark at 1 percent OC). */
  comparedConcentration?: number;
  /** Concentration over criterion. */
  ratio?: number;
  /** Ratio above 1 (exactly 1 is not flagged). Absent when nothing was compared. */
  exceeds?: boolean;
}

export interface CompareInput {
  medium: Criterion['medium'];
  chemicalId: string;
  /** The modelled series (kg/m^3 or kg/kg dry weight); its peak is compared. */
  series: readonly number[];
  criteria: readonly Criterion[];
  /** Hardness, mg/L as CaCO3, for the hardness-dependent metals. Default 100. */
  hardness?: number;
  /** Keep only the freshwater or the saltwater aquatic life criteria. */
  waterType?: 'fresh' | 'salt';
  /** Sediment f_oc, kg/kg; required when a benchmark at a stated organic carbon applies. */
  fractionOrganicCarbon?: number;
}

export interface CompareResult {
  /** The peak of the series, SI. */
  concentration: number;
  results: CriterionResult[];
  warnings: SurfaceWaterWarning[];
}

/**
 * Compares the peak of the series with every applicable criterion of the chemical and medium (DEFAULT
 * ruling 11: the criteria average over an hour, four days or a lifetime, which the model's time steps cannot
 * resolve, and the peak is never lower, so the comparison is conservative).
 */
export function compareToCriteria(input: CompareInput): CompareResult {
  if (input.series.length === 0) throw new RangeError('a series needs at least one value');
  for (const v of input.series) checkNonNegative('modelled concentration', v);
  const peak = Math.max(...input.series);
  const hardness = input.hardness ?? DEFAULT_HARDNESS;
  checkFinite('hardness', hardness);
  if (!(hardness > 0)) throw new RangeError('hardness must be positive');
  const applicable = input.criteria.filter(
    (c) =>
      c.chemicalId === input.chemicalId &&
      c.medium === input.medium &&
      (c.waterType === undefined ||
        input.waterType === undefined ||
        c.waterType === input.waterType),
  );
  const warnings = new Map<string, SurfaceWaterWarning>();
  const warn = (code: string, message: string): void => {
    warnings.set(`${code}|${message}`, { code, message });
  };
  if (applicable.length === 0) {
    warn('criteria.not-available', `no ${input.medium} criterion for ${input.chemicalId}`);
    return {
      concentration: peak,
      results: [{ criterion: undefined, status: 'not-available' }],
      warnings: [...warnings.values()],
    };
  }
  const results: CriterionResult[] = applicable.map((c): CriterionResult => {
    let value = c.value;
    let unit = c.unit;
    if (c.hardness !== undefined && value === undefined) {
      if (c.unit !== 'ug/L') throw new RangeError('a hardness-dependent criterion is in ug/L');
      value = hardnessCriterion(c.hardness, hardness);
      unit = 'ug/L';
      if (hardness < HARDNESS_MIN || hardness > HARDNESS_MAX) {
        warn(
          'criteria.hardness-range',
          `hardness ${hardness} mg/L as CaCO3 is outside ${HARDNESS_MIN} to ${HARDNESS_MAX}; the criterion is extrapolated`,
        );
      }
    }
    if (value === undefined) {
      if (c.siteSpecific === true) {
        warn(
          'criteria.site-specific',
          `${c.endpoint} for ${c.chemicalId} depends on site water chemistry and is not computed`,
        );
        return { criterion: c, status: 'site-specific', source: c.source };
      }
      warn('criteria.not-available', `${c.endpoint} for ${c.chemicalId} has no value`);
      return { criterion: c, status: 'not-available', source: c.source };
    }
    checkNonNegative('criterion', value);
    const criterionValue = toSi(value, unit, c.medium);
    let compared = peak;
    if (c.medium === 'sediment' && c.ocBasis !== undefined) {
      const foc = input.fractionOrganicCarbon;
      if (foc === undefined || !(foc > 0) || foc > 1) {
        throw new RangeError(
          'a benchmark at a stated organic carbon needs a fraction organic carbon in (0, 1]',
        );
      }
      compared = (peak * c.ocBasis) / foc;
      warn(
        'criteria.oc-normalized',
        `${c.endpoint} for ${c.chemicalId} is at ${100 * c.ocBasis} percent organic carbon; the sediment value is normalized to it`,
      );
    }
    if (c.dissolved === true && c.medium === 'surfaceWater') {
      warn(
        'criteria.dissolved-assumed',
        `${c.endpoint} for ${c.chemicalId} is for the dissolved metal; the modelled concentration is taken as all dissolved`,
      );
    }
    const ratio = criterionValue > 0 ? compared / criterionValue : compared > 0 ? Infinity : 0;
    return {
      criterion: c,
      status: 'compared',
      source: c.source,
      criterionValue,
      comparedConcentration: compared,
      ratio,
      exceeds: ratio > 1 + EXCEED_ROUNDOFF,
    };
  });
  return { concentration: peak, results, warnings: [...warnings.values()] };
}
