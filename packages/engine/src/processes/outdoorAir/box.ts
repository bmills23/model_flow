import type { MethodDescriptor } from '../../registry/index.js';
import { layerDeff, type SoilLayer, type VaporChemical } from '../vapor/legacyJe.js';
import { checkNonNeg, checkPos } from '../vapor/units.js';
import { outdoorBoxUncertainInputs } from './uncertain.js';

/**
 * Legacy outdoor air box (`outdoorAir.box`). Emissions enter a box over the source of length L along
 * the wind, width W across it and height delta (the breathing zone), ventilated by a wind of speed u
 * and fully mixed: C = sum(E) / (u delta W). An area flux F over the footprint gives E = F L W, so
 * C = F L / (u delta) and the width cancels. SI throughout.
 */

export interface OutdoorBox {
  /** Length along the wind, m. */
  length: number;
  /** Width across the wind, m. */
  width: number;
  /** Mixing (breathing zone) height, m. */
  height: number;
  /** Wind speed, m/s. */
  windSpeed: number;
}

export function checkBox(box: OutdoorBox): void {
  checkPos('box length', box.length);
  checkPos('box width', box.width);
  checkPos('box height', box.height);
  checkPos('wind speed', box.windSpeed);
}

/** Box concentration, kg/m^3, for a total emission rate, kg/s. */
export function boxConcentration(box: OutdoorBox, emissionRate: number): number {
  checkBox(box);
  if (!Number.isFinite(emissionRate)) throw new RangeError('emission rate must be finite');
  return emissionRate / (box.windSpeed * box.height * box.width);
}

/** Box concentration for an area flux, kg/(m^2 s), over the footprint (or over `area`, m^2). */
export function boxConcentrationFromFlux(box: OutdoorBox, flux: number, area?: number): number {
  checkBox(box);
  if (!Number.isFinite(flux)) throw new RangeError('flux must be finite');
  const a = area ?? box.length * box.width;
  checkPos('source area', a);
  return boxConcentration(box, flux * a);
}

/**
 * Steady diffusion flux, kg/(m^2 s), from a source vapor concentration through clean soil layers in
 * series to an open surface at zero concentration: F = D_T C_vs / L_T with D_T = L_T / sum(L_i / D_i).
 * Layers are listed from the source upward.
 */
export function steadyDiffusionFlux(
  layers: readonly SoilLayer[],
  chemical: VaporChemical,
  cvs: number,
): number {
  if (layers.length === 0) throw new RangeError('at least one soil layer is required');
  checkNonNeg('source vapor concentration', cvs);
  let resistance = 0;
  for (const l of layers) resistance += l.thickness / layerDeff(l, chemical);
  return cvs / resistance;
}

export interface OutdoorBoxInput {
  box: OutdoorBox;
  /** Area flux over the footprint, kg/(m^2 s). */
  flux: number;
}

export interface OutdoorBoxResult {
  /** Outdoor air concentration, kg/m^3. */
  concentration: number;
}

export const outdoorAirBox: MethodDescriptor<OutdoorBoxInput, OutdoorBoxResult> = {
  id: 'outdoorAir.box',
  process: 'outdoorAir',
  kind: 'legacy',
  name: 'Outdoor air box model',
  summary:
    'Emissions into a fully mixed box of length, width and breathing-zone height ventilated by the wind: C = sum(E) / (u delta W), which for an area flux over the footprint is F L / (u delta).',
  citations: ['hanna1982'],
  assumptions: [
    'The receptor is at the downwind edge of the box; no vertical dispersion out of the box.',
    'No deposition or decay in air; steady emission.',
    'The width cancels for an area flux over the whole footprint.',
  ],
  risc5Choice:
    'RISC5 ventilates a box over the source by a wind of fixed speed and mixing height and feeds it from the soil, groundwater or unsaturated zone emission; its Table R-6 print is not reproduced (see the fixture README).',
  validate: (input) => {
    checkBox(input.box);
    return [];
  },
  uncertainInputs: outdoorBoxUncertainInputs(),
  run: (input) => ({ concentration: boxConcentrationFromFlux(input.box, input.flux) }),
};
