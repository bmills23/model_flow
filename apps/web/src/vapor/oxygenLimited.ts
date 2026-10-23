import {
  R_GAS,
  baselineRespirationRate,
  celsiusToKelvin,
  crackTransferCoefficient,
  legacyBuildingTerms,
  type DevaullInput,
  type DevaullOxygen,
  type FoundationType,
  type LegacyJeInput,
  type SoilLayer,
  type Stratum,
} from '@model-flow/engine';
import { Reader } from './reader';
import type { VaporForm } from './form';

/**
 * The oxygen-limited indoor method (`vapor.devaull-2007`) on the vapor screen: the form fields it adds
 * and the engine input built from them. The screen's strata, source and building are the ones the
 * other methods read; only the aerobic biodegradation and its oxygen are new.
 */
export type OxygenMode = 'entered' | 'fastReaction' | 'coupled';

export const OXYGEN_MODES: { value: OxygenMode; label: string }[] = [
  { value: 'entered', label: 'Aerobic depth entered' },
  { value: 'fastReaction', label: 'Fast reaction front' },
  { value: 'coupled', label: 'Coupled oxygen balance' },
];

/** The method id the result is tagged with in the exposure feed and the CSV. */
export const DEVAULL_ID = 'vapor.devaull-2007';

/** Ambient oxygen in dry air, percent by volume (the default for the base of the foundation). */
export const AMBIENT_OXYGEN_PERCENT = '20.9';

const P_ATM = 101325; // Pa
const M_O2 = 0.031998; // kg/mol

/** Oxygen concentration in soil gas at 1 atm, kg/m3, from percent by volume and the soil temperature. */
export function oxygenKgPerM3(percent: number, temperatureC: number): number {
  return ((percent / 100) * P_ATM * M_O2) / (R_GAS * celsiusToKelvin(temperatureC));
}

export type DevaullParse = { ok: true; input: DevaullInput } | { ok: false; errors: string[] };

/** The part of the other methods' parse that the oxygen-limited column is built from. */
export interface DevaullContext {
  legacy: LegacyJeInput;
  strata: readonly Stratum[];
  floorDepth: number;
  foundation: FoundationType;
}

/** The column below the floor as one layer: thickness-weighted porosity and moisture. */
export function homogeneousColumn(legacy: LegacyJeInput): SoilLayer {
  const layers = legacy.capillaryFringe
    ? [legacy.capillaryFringe, ...legacy.layers]
    : legacy.layers;
  const thickness = layers.reduce((s, l) => s + l.thickness, 0);
  const avg = (pick: (l: SoilLayer) => number): number =>
    layers.reduce((s, l) => s + l.thickness * pick(l), 0) / thickness;
  return {
    thickness,
    porosity: avg((l) => l.porosity),
    moisture: avg((l) => l.moisture),
  };
}

/** Organic carbon fraction and bulk density (kg/m3) of the strata below the floor, thickness-weighted. */
function strataBelowFloor(
  strata: readonly Stratum[],
  floorDepth: number,
): { foc: number; bulkDensity: number } | null {
  let top = 0;
  let total = 0;
  let foc = 0;
  let rho = 0;
  for (const s of strata) {
    const hi = top + s.thickness;
    const t = hi - Math.max(top, floorDepth);
    if (t > 0) {
      total += t;
      foc += t * s.foc;
      rho += t * s.bulkDensity;
    }
    top = hi;
  }
  return total > 0 ? { foc: foc / total, bulkDensity: rho / total } : null;
}

/**
 * The engine input for the oxygen-limited method, or every field that fails. Its errors are kept
 * apart from the main parse: a fault here must not stop the other two methods.
 */
export function parseDevaull(f: VaporForm, ctx: DevaullContext): DevaullParse {
  const r = new Reader();
  const layer = homogeneousColumn(ctx.legacy);
  const rate = r.optional(f.dvKw, 'Aerobic first-order rate');
  if (rate !== undefined && rate < 0)
    r.errors.push('Aerobic first-order rate must not be negative');

  let foundation: DevaullInput['foundation'] | undefined;
  try {
    const t = legacyBuildingTerms(ctx.legacy.building, ctx.legacy.chemical);
    const dirt = ctx.foundation === 'basementDirt' || ctx.foundation === 'crawlDirt';
    foundation = {
      h: dirt
        ? Infinity
        : crackTransferCoefficient({
            crackFraction: ctx.legacy.building.crackFraction,
            thickness: t.Lcrack,
            Dcrack: t.Dcrack,
          }),
      soilGasVelocity: t.Qsoil / t.AB,
    };
  } catch (e) {
    r.errors.push(e instanceof Error ? e.message : String(e));
  }

  let oxygen: DevaullOxygen | undefined;
  if (f.dvOxMode === 'entered') {
    const depth = r.num(f.dvAerobicDepth, 'Aerobic layer depth', 'nonneg');
    if (Number.isFinite(depth) && depth > layer.thickness) {
      r.errors.push(
        `Aerobic layer depth must not exceed the ${Number(layer.thickness.toPrecision(6))} m between the source and the foundation`,
      );
    }
    oxygen = { mode: 'entered', aerobicDepth: depth };
  } else {
    const Da = r.num(f.dvDa, 'Oxygen diffusion in air');
    const Dw = r.num(f.dvDw, 'Oxygen diffusion in water', 'nonneg');
    const H = r.num(f.dvH, "Oxygen Henry's constant");
    const pct = r.num(f.dvO2Percent, 'Oxygen at the base of the foundation', 'nonneg');
    if (Number.isFinite(pct) && pct > 100) {
      r.errors.push('Oxygen at the base of the foundation must not exceed 100 percent');
    }
    const Y = r.num(f.dvMassRatio, 'Oxygen mass ratio');
    const temperature = r.num(f.temperature, 'Soil temperature', 'any');
    const total = r.optional(f.dvTotalHc, 'Total hydrocarbon vapor');
    let respiration: number | undefined;
    if (f.dvRespiration) {
      const col = strataBelowFloor(ctx.strata, ctx.floorDepth);
      if (col === null) r.errors.push('No soil stratum lies below the floor');
      else respiration = baselineRespirationRate({ foc: col.foc, bulkDensity: col.bulkDensity });
    }
    oxygen = {
      mode: f.dvOxMode,
      Da: Da * 1e-4,
      Dw: Dw * 1e-4,
      H,
      atmosphericConcentration: oxygenKgPerM3(pct, temperature),
      massRatio: Y,
      ...(respiration !== undefined ? { respiration } : {}),
      ...(total !== undefined ? { totalHydrocarbonVapor: total * 1e-6 } : {}),
    };
  }

  if (r.errors.length > 0 || foundation === undefined || oxygen === undefined) {
    return { ok: false, errors: r.errors };
  }
  return {
    ok: true,
    input: {
      chemical: ctx.legacy.chemical,
      layer,
      ...(rate !== undefined ? { degradationRate: rate / 3600 } : {}),
      foundation,
      building: {
        mixingHeight: ctx.legacy.building.volume / ctx.legacy.building.floorArea,
        airExchangeRate: ctx.legacy.building.airExchangeRate,
      },
      source: ctx.legacy.source,
      oxygen,
    },
  };
}
