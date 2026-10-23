import {
  SSG_DEFAULT_Q_OVER_C,
  boxConcentrationFromFlux,
  qOverCToSi,
  ssgVolatilizationFactor,
  steadyDiffusionFlux,
  type SoilLayer,
  type Warning,
} from '@model-flow/engine';
import type { VaporOutcome } from './compute';
import { carveFromSource, type Parsed, type VaporForm } from './form';

export interface OutdoorForm {
  windSpeed: string; // m/s
  mixingHeight: string; // m
  boxLength: string; // m, along the wind
  boxWidth: string; // m
  qOverC: string; // g/(m2 s) per kg/m3
}

export const DEFAULT_OUTDOOR: OutdoorForm = {
  windSpeed: '2.25',
  mixingHeight: '2',
  boxLength: '10',
  boxWidth: '10',
  qOverC: String(SSG_DEFAULT_Q_OVER_C),
};

export interface OutdoorLegacy {
  /** Outdoor air, kg/m3. */
  concentration: number;
  /** Flux through the whole column to grade, kg/(m2 s). */
  flux: number;
  box: { length: number; width: number; height: number; windSpeed: number };
}

export interface OutdoorModern {
  concentration: number;
  /** Volatilization factor, m3/kg. */
  vf: number;
  massLimited: boolean;
  warnings: Warning[];
}

type Ok<T> = { ok: true } & T;
type Fail = { ok: false; error: string };

export interface OutdoorOutcome {
  legacy: Ok<OutdoorLegacy> | Fail;
  modern: Ok<OutdoorModern> | Fail;
}

const reading = (raw: string): number => (raw.trim() === '' ? NaN : Number(raw));
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The box of the outdoor form in SI, or every field that fails. */
export function parseBox(
  o: OutdoorForm,
): { ok: true; box: OutdoorLegacy['box'] } | { ok: false; errors: string[] } {
  const wind = reading(o.windSpeed);
  const height = reading(o.mixingHeight);
  const length = reading(o.boxLength);
  const width = reading(o.boxWidth);
  const errors: string[] = [];
  if (!(wind > 0)) errors.push('Wind speed must be a number above 0');
  if (!(height > 0)) errors.push('Mixing height must be a number above 0');
  if (!(length > 0)) errors.push('Box length must be a number above 0');
  if (!(width > 0)) errors.push('Box width must be a number above 0');
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, box: { length, width, height, windSpeed: wind } };
}

/** The full soil column to the ground surface, listed from the source upward (the legacy order). */
export function columnToGrade(parsed: Extract<Parsed, { ok: true }>): SoilLayer[] {
  let column: SoilLayer[] = [];
  for (let i = parsed.modern.strata.length - 1; i >= 0; i--) {
    const s = parsed.modern.strata[i]!;
    column.push({ thickness: s.thickness, porosity: s.porosity, moisture: s.moisture });
  }
  // The fringe sits on the water table: it replaces the lowest strata, as in both indoor methods.
  const fringe = parsed.legacy.capillaryFringe;
  if (fringe) column = [fringe, ...(carveFromSource(column, fringe.thickness) ?? [])];
  return column;
}

/**
 * Outdoor air above the same source: the legacy box over the steady diffusion flux through the whole
 * soil column, and the Soil Screening Guidance volatilization factor for a soil source. Neither
 * involves the building.
 */
export function runOutdoor(
  form: VaporForm,
  parsed: Extract<Parsed, { ok: true }>,
  indoor: VaporOutcome,
  o: OutdoorForm,
): OutdoorOutcome {
  const parsedBox = parseBox(o);

  let legacy: OutdoorOutcome['legacy'];
  if (!parsedBox.ok) legacy = { ok: false, error: parsedBox.errors.join('; ') };
  else if (!indoor.legacy.ok) {
    legacy = {
      ok: false,
      error: `The legacy source vapor is not available: ${indoor.legacy.error}`,
    };
  } else {
    try {
      const flux = steadyDiffusionFlux(
        columnToGrade(parsed),
        parsed.legacy.chemical,
        indoor.legacy.result.sourceVapor,
      );
      const box = parsedBox.box;
      legacy = { ok: true, concentration: boxConcentrationFromFlux(box, flux), flux, box };
    } catch (e) {
      legacy = { ok: false, error: message(e) };
    }
  }

  let modern: OutdoorOutcome['modern'];
  const qc = reading(o.qOverC);
  if (form.source !== 'soil') {
    modern = {
      ok: false,
      error:
        'The Soil Screening Guidance volatilization factor applies to a soil source; use the box for soil gas or groundwater.',
    };
  } else if (!(qc > 0)) {
    modern = { ok: false, error: 'Q/C must be a number above 0' };
  } else {
    try {
      const s = parsed.modern.strata[parsed.modern.strata.length - 1]!;
      const vf = ssgVolatilizationFactor({
        chemical: parsed.legacy.chemical,
        soil: {
          porosity: s.porosity,
          moisture: s.moisture,
          bulkDensity: s.bulkDensity,
          kd: (parsed.modern.chemical.koc ?? 0) * s.foc,
        },
        qOverC: qOverCToSi(qc),
      });
      const F = reading(form.soilConc) * 1e-6;
      modern = {
        ok: true,
        concentration: F / vf.vf,
        vf: vf.vf,
        massLimited: vf.massLimited,
        warnings: [
          ...vf.warnings,
          {
            code: 'outdoorAir.ssg-surface-source',
            message:
              'the volatilization factor treats the source soil as exposed at the ground surface (the guidance assumption) and ignores the clean soil above a buried source, so it overstates the emission from one',
          },
        ],
      };
    } catch (e) {
      modern = { ok: false, error: message(e) };
    }
  }
  return { legacy, modern };
}
