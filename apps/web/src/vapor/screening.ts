import {
  attenuationFactorRun,
  pviScreenRun,
  type AttenuationFactorResult,
  type AttenuationMedium,
  type PviInput,
  type PviResult,
} from '@model-flow/engine';
import type { SourceKind, VaporForm } from './form';

export type Outcome<R> = { ok: true; result: R } | { ok: false; error: string };

export const AF_LABEL: Record<AttenuationMedium, string> = {
  groundwater: 'Groundwater, generic factor 0.001',
  groundwaterFineGrained: 'Groundwater under fine-grained soil, factor 0.0005',
  subSlabSoilGas: 'Sub-slab soil gas, factor 0.03',
  exteriorSoilGas: 'Exterior soil gas, factor 0.03',
  crawlspace: 'Crawl space air, factor 1',
};

/** The generic factors act on soil gas and groundwater concentrations; a soil source has none. */
export function afMediaFor(source: SourceKind): { value: AttenuationMedium; label: string }[] {
  const pick = (...m: AttenuationMedium[]): { value: AttenuationMedium; label: string }[] =>
    m.map((value) => ({ value, label: AF_LABEL[value] }));
  if (source === 'soilGas') return pick('subSlabSoilGas', 'exteriorSoilGas');
  if (source === 'groundwater') return pick('groundwater', 'groundwaterFineGrained');
  return [];
}

export interface AfOptions {
  medium: AttenuationMedium;
  /** Depth of the source below the foundation, m. */
  depthBelowFoundation: number;
  preferential: boolean;
}

const num = (raw: string): number => (raw.trim() === '' ? NaN : Number(raw));

/** The empirical attenuation factor applied to the entered soil gas or groundwater concentration. */
export function runAttenuation(f: VaporForm, o: AfOptions): Outcome<AttenuationFactorResult> {
  if (!afMediaFor(f.source).some((m) => m.value === o.medium)) {
    return {
      ok: false,
      error:
        f.source === 'soil'
          ? 'The generic attenuation factors act on soil gas and groundwater concentrations; choose one of those sources.'
          : 'That factor does not act on this source kind.',
    };
  }
  const raw = f.source === 'groundwater' ? f.cgw : f.soilGas;
  const c = num(raw);
  const H = num(f.H);
  if (!Number.isFinite(c) || c < 0)
    return { ok: false, error: 'The source concentration must be a number from 0 up.' };
  if (f.source === 'groundwater' && !(H > 0)) {
    return { ok: false, error: "Henry's constant must be a number above 0." };
  }
  try {
    const result = attenuationFactorRun({
      medium: o.medium,
      // mg/L to kg/m3 is 1e-3; mg/m3 to kg/m3 is 1e-6
      concentration: f.source === 'groundwater' ? c * 1e-3 : c * 1e-6,
      ...(f.source === 'groundwater' ? { H } : {}),
      depthBelowFoundation: o.depthBelowFoundation,
      preferentialPathway: o.preferential,
    });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface PviForm {
  sourceType: 'auto' | 'dissolved' | 'lnapl';
  fuel: 'unweathered' | 'weathered';
  soilBenzene: string; // mg/kg
  soilTph: string; // mg/kg
  gwBenzene: string; // mg/L
  gwTph: string; // mg/L
  /** m of clean soil; blank = the source to building distance of the indoor air run. */
  separation: string;
  /** m; blank = the side of a square floor of the entered area. */
  smallestDimension: string;
  /** Ethanol volume fraction of the fuel; blank = none. */
  ethanol: string;
  preferential: boolean;
  leadScavengers: boolean;
  surfaceCover: boolean;
  contactsBuilding: boolean;
}

export const DEFAULT_PVI: PviForm = {
  sourceType: 'auto',
  fuel: 'unweathered',
  soilBenzene: '',
  soilTph: '',
  gwBenzene: '',
  gwTph: '',
  separation: '',
  smallestDimension: '',
  ethanol: '',
  preferential: false,
  leadScavengers: false,
  surfaceCover: false,
  contactsBuilding: false,
};

/**
 * The vertical separation screen. `defaultSeparation` (m) and `floorArea` (m2) fill the blanks from the
 * indoor air inputs.
 */
export function runPvi(
  p: PviForm,
  defaultSeparation: number,
  floorArea: number,
): Outcome<PviResult> {
  const errors: string[] = [];
  const opt = (raw: string, label: string, scale: number): number | undefined => {
    if (raw.trim() === '') return undefined;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0) {
      errors.push(`${label} must be a number from 0 up`);
      return undefined;
    }
    return v * scale;
  };
  const soilBenzene = opt(p.soilBenzene, 'Soil benzene', 1e-6);
  const soilTph = opt(p.soilTph, 'Soil TPH', 1e-6);
  const gwBenzene = opt(p.gwBenzene, 'Groundwater benzene', 1e-3);
  const gwTph = opt(p.gwTph, 'Groundwater TPH', 1e-3);
  const separation = opt(p.separation, 'Vertical separation', 1) ?? defaultSeparation;
  const dim = opt(p.smallestDimension, 'Smallest building dimension', 1) ?? Math.sqrt(floorArea);
  const ethanol = opt(p.ethanol, 'Ethanol fraction', 1);
  if (ethanol !== undefined && ethanol > 1) errors.push('Ethanol fraction must be from 0 to 1');
  if (!(dim > 0)) errors.push('Smallest building dimension must be above 0');
  if (errors.length > 0) return { ok: false, error: errors.join('; ') };
  // No verdict without a source concentration: with all four blank the screen has nothing to judge
  const missing = [
    soilBenzene === undefined ? 'soil benzene (mg/kg)' : null,
    soilTph === undefined ? 'soil TPH (mg/kg)' : null,
    gwBenzene === undefined ? 'groundwater benzene (mg/L)' : null,
    gwTph === undefined ? 'groundwater TPH (mg/L)' : null,
  ].filter((m): m is string => m !== null);
  if (missing.length === 4) {
    return {
      ok: false,
      error: `No verdict yet: enter at least one source concentration. Missing: ${missing.join(', ')}.`,
    };
  }
  const input: PviInput = {
    separation,
    smallestBuildingDimension: dim,
    fuel: p.fuel,
    ...(soilBenzene !== undefined ? { soilBenzene } : {}),
    ...(soilTph !== undefined ? { soilTph } : {}),
    ...(gwBenzene !== undefined ? { groundwaterBenzene: gwBenzene } : {}),
    ...(gwTph !== undefined ? { groundwaterTph: gwTph } : {}),
    ...(p.sourceType !== 'auto' ? { sourceType: p.sourceType } : {}),
    ...(ethanol !== undefined ? { ethanolFraction: ethanol } : {}),
    preferentialPathways: p.preferential,
    leadScavengers: p.leadScavengers,
    extensiveSurfaceCover: p.surfaceCover,
    contaminationContactsBuilding: p.contactsBuilding,
  };
  try {
    return { ok: true, result: pviScreenRun(input) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
