import {
  PRODUCE_CLASSES,
  efhHomeProducedIntake,
  producePlantFactor,
  type ProduceBoundary,
  type ProduceClass,
  type ProduceFactors,
  type ProduceFactorRequest,
} from '@model-flow/engine';
import { CLASS_LABELS, readNumber, readOptional, type PlantsEcoForm, type Section } from './form';
import type { ProduceRiskFeed } from './feeds';

export const LEGACY_PLANT_ID = 'plantUptake.trapp-matthies-1995';
export const MODERN_PLANT_ID = 'plantUptake.hhrap-2005';

export interface ProduceWarning {
  code: string;
  message: string;
}

export interface ProduceClassRow {
  cls: ProduceClass;
  label: string;
  /** kg fresh produce per kg soil per unit soil concentration; null when the engine cannot quantify it. */
  factor: number | null;
  /** Fresh-weight plant concentration at the entered soil concentration, mg/kg; undefined without one. */
  plantMgPerKg: number | undefined;
}

export interface ProduceRow {
  methodId: string;
  classes: ProduceClassRow[];
  factors: ProduceFactors;
  intakes: ProduceBoundary;
  intakeLabel: string;
  /** Classes the intake preset leaves out because the handbook withholds that food group. */
  omitted: ProduceClass[];
  warnings: ProduceWarning[];
}

/** A leaf the root-only run never reads: the engine's type wants one, the root branch ignores it. */
const UNUSED_LEAF = {
  tscf: 0,
  transpiration_m3_per_d: 0,
  conductance_m_per_d: 0,
  leafArea_m2: 0,
  mass_kg: 1,
  kLeafAir_m3_per_kg: 1,
  lossRate_per_d: 0,
};

/** The intake of the form, in the engine's boundary units, and what it was taken from. */
export function intakeOf(
  form: PlantsEcoForm,
  errors: string[],
): { intakes: ProduceBoundary; label: string; omitted: ProduceClass[] } {
  if (form.intakeMode === 'efh') {
    const p = efhHomeProducedIntake(form.ageGroup);
    return {
      intakes: p.intakes,
      label: `Exposure Factors Handbook chapter 13, ages ${p.ageGroup}`,
      omitted: p.omitted,
    };
  }
  const intakes: ProduceBoundary = {};
  for (const cls of PRODUCE_CLASSES) {
    const c = form.custom[cls];
    const tag = CLASS_LABELS[cls];
    if (c.gPerKgDay.trim() === '') continue;
    const g = readNumber(c.gPerKgDay, `${tag}, intake`, errors, { min: 'nonneg' });
    const loss = readOptional(c.loss, `${tag}, preparation loss`, errors, { min: 'unitOpen' });
    const home = readNumber(c.homegrown, `${tag}, fraction homegrown`, errors, { min: 'unit' });
    if (Number.isNaN(g) || Number.isNaN(home)) continue;
    intakes[cls] = {
      gPerKgDay: g,
      ...(loss !== undefined ? { lossFraction: loss } : {}),
      fractionHomegrown: home,
    };
  }
  if (Object.keys(intakes).length === 0 && errors.length === 0) {
    errors.push('Enter an intake for at least one produce class');
  }
  return { intakes, label: 'user entered', omitted: [] };
}

/** Classes with a positive intake, the ones whose plant factor the pathway needs. */
function usedClasses(intakes: ProduceBoundary): ProduceClass[] {
  return PRODUCE_CLASSES.filter((c) => {
    const v = intakes[c];
    return v !== undefined && (v.gPerKgDay ?? v.kgPerDay ?? 0) > 0 && v.fractionHomegrown > 0;
  });
}

/** Kd in L/kg: the entered value, else Koc times foc. */
function readKd(form: PlantsEcoForm, errors: string[]): number {
  if (form.kd.trim() !== '') return readNumber(form.kd, 'Kd (L/kg)', errors);
  const koc = readNumber(form.koc, 'Koc (L/kg), or enter Kd', errors);
  const foc = readNumber(form.foc, 'Organic carbon fraction foc, or enter Kd', errors, {
    min: 'unit',
  });
  return koc * foc;
}

/**
 * Plant factors of the produce pathway for the form's chemical, from the chosen plant uptake engine at a
 * unit soil concentration. Soil-derived uptake only: vapor and irrigation terms are not soil-proportional
 * and are not part of the factor (DECISIONS 20).
 */
export function computeProduce(form: PlantsEcoForm): Section<{ row: ProduceRow }> {
  const errors: string[] = [];
  const { intakes, label, omitted } = intakeOf(form, errors);
  const used = usedClasses(intakes);
  const needAbove = used.some((c) => c !== 'root');
  const needRoot = used.includes('root');
  const modern = form.uptake === 'modern';
  const inorganic = form.inorganic;

  const logKow = readNumber(form.logKow, 'log Kow', errors, { min: 'any' });
  const soilCs = readOptional(form.soilConcentration, 'Soil concentration', errors, {
    min: 'nonneg',
  });
  const userBcf = inorganic
    ? readNumber(form.userBcf, 'Bioconcentration factor', errors, { min: 'nonneg' })
    : undefined;

  // the legacy engine always forms pore water; the modern one needs Kd for organic roots only
  const needSoil = !modern || (needRoot && !inorganic);
  let rho = 0;
  let theta = 0;
  let kd = 0;
  if (needSoil) {
    rho = readNumber(form.bulkDensity, 'Dry bulk density (kg/L)', errors);
    kd = readKd(form, errors);
    if (!modern) {
      theta = readNumber(form.waterFilledPorosity, 'Water-filled porosity', errors, {
        min: 'unit',
      });
    }
  }

  let leaf = UNUSED_LEAF;
  let growth: number | undefined;
  let moisture = 0;
  if (modern) {
    moisture = readNumber(form.moistureFraction, 'Moisture fraction of the fresh produce', errors, {
      min: 'unitOpen',
    });
  } else if (needAbove && !inorganic) {
    leaf = {
      tscf: readNumber(form.tscf, 'TSCF', errors, { min: 'unit' }),
      transpiration_m3_per_d:
        readNumber(form.transpiration, 'Transpiration rate (L/d)', errors) / 1000,
      conductance_m_per_d: readNumber(form.conductance, 'Leaf conductance (m/d)', errors, {
        min: 'nonneg',
      }),
      leafArea_m2: readNumber(form.leafArea, 'Leaf area (m2)', errors, { min: 'nonneg' }),
      mass_kg: readNumber(form.plantMass, 'Plant mass (kg)', errors),
      kLeafAir_m3_per_kg: readNumber(
        form.kLeafAir,
        'Leaf-air partition coefficient (m3/kg)',
        errors,
      ),
      lossRate_per_d: readNumber(
        form.lossRate,
        'Loss rate, growth dilution and metabolism (1/d)',
        errors,
        { min: 'nonneg' },
      ),
    };
    growth = readOptional(form.growthPeriod, 'Growing period (d)', errors);
  }
  if (used.length === 0 && errors.length === 0) {
    errors.push('The intake has no produce class with a positive homegrown intake');
  }
  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };

  const warnings = new Map<string, ProduceWarning>();
  const factors: ProduceFactors = {};
  const run = (req: ProduceFactorRequest): number | null => {
    const r = producePlantFactor(req);
    for (const w of r.warnings) warnings.set(w.code, { code: w.code, message: w.message });
    return r.factor;
  };
  try {
    for (const cls of used) {
      let f: number | null;
      if (modern) {
        f = run({
          method: 'hhrap',
          moistureFraction: moisture,
          input: {
            logKow,
            kd_m3_per_kg: kd / 1000,
            produce:
              cls === 'root'
                ? 'root'
                : cls === 'abovegroundExposed'
                  ? 'aboveground-exposed'
                  : 'aboveground-protected',
            ...(inorganic ? { inorganic: true, userBr: userBcf! } : {}),
          },
        });
      } else {
        f = run({
          method: 'legacy',
          input: {
            logKow,
            soil: {
              bulkDensity_kg_per_m3: rho * 1000,
              waterFilledPorosity: theta,
              kd_m3_per_kg: kd / 1000,
            },
            produce: cls === 'root' ? 'root' : 'aboveground',
            leaf,
            ...(growth !== undefined ? { growthPeriod_d: growth } : {}),
            ...(form.ionizable ? { ionizable: true } : {}),
            ...(inorganic ? { inorganic: true, userBcf: userBcf! } : {}),
          },
        });
      }
      if (f !== null) factors[cls] = f;
    }
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
  if (modern && form.ionizable) {
    warnings.set('PLANT_IONIZABLE', {
      code: 'PLANT_IONIZABLE',
      message:
        'the chemical is marked ionizable at the soil pH; the neutral-organic model may be badly wrong',
    });
  }
  const classes: ProduceClassRow[] = used.map((cls) => {
    const factor = factors[cls] ?? null;
    return {
      cls,
      label: CLASS_LABELS[cls],
      factor,
      // the factor is kg produce per kg soil per unit concentration, so it scales mg/kg directly
      plantMgPerKg: factor !== null && soilCs !== undefined ? factor * soilCs : undefined,
    };
  });
  return {
    ok: true,
    row: {
      methodId: modern ? MODERN_PLANT_ID : LEGACY_PLANT_ID,
      classes,
      factors,
      intakes,
      intakeLabel: label,
      omitted,
      warnings: [...warnings.values()],
    },
  };
}

/** The feed the risk screen reads, or the reasons it cannot be built. */
export function buildProduceFeed(
  form: PlantsEcoForm,
  result: Section<{ row: ProduceRow }>,
): { ok: true; feed: ProduceRiskFeed; notes: string[] } | { ok: false; reasons: string[] } {
  if (form.chemicalId === '') return { ok: false, reasons: ['Choose a chemical to send'] };
  if (!result.ok) return { ok: false, reasons: result.errors };
  const { row } = result;
  const gaps = row.classes.filter((c) => c.factor === null).map((c) => c.label);
  if (gaps.length === row.classes.length) {
    return { ok: false, reasons: ['No produce class could be quantified for this chemical'] };
  }
  return {
    ok: true,
    feed: {
      chemicalId: form.chemicalId,
      label: `${form.chemicalName}, ${row.methodId}`,
      method: row.methodId,
      factors: row.factors,
      intakes: row.intakes,
      intakeLabel: row.intakeLabel,
      warnings: row.warnings.map((w) => ({ code: w.code, message: w.message })),
    },
    notes:
      gaps.length > 0 ? [`Not quantified, so left out of the pathway: ${gaps.join(', ')}`] : [],
  };
}
