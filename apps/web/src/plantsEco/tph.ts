import {
  TPH_SURROGATE_IDS,
  checkFractionSaturation,
  checkMixtureSaturation,
  isMapped,
  tphForwardHazard,
  tphTotalLevel,
  type FractionSaturationInput,
  type TphLevelFraction,
  type Warning,
} from '@model-flow/engine';
import type { CleanupProps } from '../cleanup/ssg';
import { readNumber, readOptional, type PlantsEcoForm, type Section } from './form';

export const TPH_LEGACY_ID = 'tph.tphcwg';
export const TPH_MODERN_ID = 'tph.madep';

export interface TphFractionOut {
  label: string;
  family: 'aliphatic' | 'aromatic';
  massFraction: number;
  mapped: boolean;
  /** Level for a hazard quotient of one, mg/kg. */
  levelMgPerKg: number | undefined;
}

export interface TphSaturation {
  /** Sum over fractions of f_j C_TPH over the pure-phase limit; above one the mixture has a separate phase. */
  index: number;
  exceeded: boolean;
  perFraction: { label: string; limitMgPerKg: number; soilMgPerKg: number; exceeded: boolean }[];
}

export interface TphResult {
  methodId: string;
  fractions: TphFractionOut[];
  unmapped: string[];
  /** Total TPH level meeting the target hazard index, mg/kg; null when no mapped fraction carries mass. */
  totalMgPerKg: number | null;
  forward:
    | {
        hazardIndex: number;
        byFraction: { label: string; soilMgPerKg: number; hazardQuotient: number }[];
      }
    | undefined;
  /** Why the saturation check could not run, or its result. */
  saturation: TphSaturation | { missing: string[] } | undefined;
  warnings: Warning[];
}

/**
 * The TPH fraction cleanup level and forward hazard index of the composition in the form. The fraction
 * set (TPHCWG or MADEP) only changes the method id and citation: the caller enters each fraction, its
 * mass fraction, its RSL surrogate and its own level for a hazard quotient of one (no ranges ship).
 */
export function computeTph(
  form: PlantsEcoForm,
  props: CleanupProps,
): Section<{ result: TphResult }> {
  const errors: string[] = [];
  if (form.tphFractions.length === 0) {
    return { ok: false, errors: ['Add at least one fraction'] };
  }
  const target = readNumber(form.tphTargetHi, 'Target hazard index', errors);
  const total = readOptional(form.tphTotal, 'Total TPH concentration (mg/kg)', errors, {
    min: 'nonneg',
  });
  const fractions = form.tphFractions.map((f, i) => {
    const tag = f.label.trim() === '' ? `Fraction ${i + 1}` : f.label.trim();
    if (f.label.trim() === '') errors.push(`${tag}: a name is required`);
    const massFraction = readNumber(f.massFraction, `${tag}, mass fraction`, errors, {
      min: 'unit',
    });
    const mapped = f.surrogate !== '' && TPH_SURROGATE_IDS.includes(f.surrogate);
    const level = mapped
      ? readNumber(f.level, `${tag}, level for a hazard quotient of one (mg/kg)`, errors)
      : readOptional(f.level, `${tag}, level (mg/kg)`, errors);
    return { tag, f, massFraction, mapped, level };
  });
  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };

  const levelFractions: TphLevelFraction[] = fractions.map(({ tag, f, massFraction, level }) => ({
    label: tag,
    family: f.family,
    massFraction,
    surrogate: f.surrogate === '' ? null : f.surrogate,
    levelKgPerKg: (level ?? 1) * 1e-6,
  }));
  try {
    const tot = tphTotalLevel({ fractions: levelFractions, targetHazardIndex: target });
    const warnings: Warning[] = [...tot.warnings];
    const mappedFractions = levelFractions.filter(isMapped);

    let forward: TphResult['forward'];
    if (total !== undefined) {
      const levelOf = new Map(levelFractions.map((f) => [f.label, f.levelKgPerKg]));
      const fw = tphForwardHazard({
        totalKgPerKg: total * 1e-6,
        fractions: levelFractions,
        hazardQuotient: (fr, soil) => soil / levelOf.get(fr.label)!,
      });
      forward = {
        hazardIndex: fw.hazardIndex,
        byFraction: fw.byFraction.map((b) => ({
          label: b.label,
          soilMgPerKg: b.soilKgPerKg * 1e6,
          hazardQuotient: b.hazardQuotient,
        })),
      };
    }

    let saturation: TphResult['saturation'];
    if (total !== undefined) {
      const missing: string[] = [];
      const soilErrors: string[] = [];
      const rho = readNumber(form.bulkDensity, 'Dry bulk density (kg/L)', soilErrors);
      const foc = readNumber(form.foc, 'Organic carbon fraction foc', soilErrors, { min: 'unit' });
      const theta = readNumber(form.waterFilledPorosity, 'Water-filled porosity', soilErrors, {
        min: 'unit',
      });
      const thetaA = readNumber(form.tphThetaA, 'Air-filled porosity', soilErrors, { min: 'unit' });
      missing.push(...soilErrors);
      const inputs: FractionSaturationInput[] = [];
      for (const f of mappedFractions) {
        const p = props.get(f.surrogate!);
        if (p?.koc === undefined || p.hPrime === undefined || p.s === undefined) {
          missing.push(`${f.label}: the RSL record has no Koc, Henry constant or solubility`);
          continue;
        }
        inputs.push({
          label: f.label,
          soil: { rhoB: rho * 1000, foc, theta, thetaA },
          chemical: { S: p.s / 1000, H: p.hPrime, koc: p.koc / 1000 },
          soilKgPerKg: f.massFraction * total * 1e-6,
        });
      }
      if (missing.length > 0 || inputs.length === 0) {
        saturation = {
          missing: missing.length > 0 ? [...new Set(missing)] : ['No mapped fraction'],
        };
      } else {
        const mix = checkMixtureSaturation(inputs);
        warnings.push(...mix.warnings);
        const perFraction = inputs.map((i) => {
          const c = checkFractionSaturation(i);
          if (c.exceeded) warnings.push(...c.warnings);
          return {
            label: i.label,
            limitMgPerKg: c.saturationKgPerKg * 1e6,
            soilMgPerKg: i.soilKgPerKg * 1e6,
            exceeded: c.exceeded,
          };
        });
        saturation = { index: mix.saturationIndex, exceeded: mix.exceeded, perFraction };
      }
    }

    return {
      ok: true,
      result: {
        methodId: form.tphSet === 'tphcwg' ? TPH_LEGACY_ID : TPH_MODERN_ID,
        fractions: fractions.map(({ tag, f, massFraction, mapped, level }) => ({
          label: tag,
          family: f.family,
          massFraction,
          mapped,
          levelMgPerKg: level,
        })),
        unmapped: fractions.filter((x) => !x.mapped).map((x) => x.tag),
        totalMgPerKg: tot.totalKgPerKg === null ? null : tot.totalKgPerKg * 1e6,
        forward,
        saturation,
        warnings: dedupe(warnings),
      },
    };
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
}

function dedupe(ws: Warning[]): Warning[] {
  const seen = new Set<string>();
  return ws.filter((w) => {
    const k = `${w.code}:${w.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
