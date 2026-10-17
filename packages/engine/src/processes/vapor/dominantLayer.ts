import type { MethodDescriptor, Warning } from '../../registry/index.js';
import { jeAlpha } from './building.js';
import {
  buildingWarnings,
  layerDeff,
  legacyBuildingTerms,
  type LegacyBuilding,
  type ProfilePoint,
  type SoilLayer,
  type VaporChemical,
} from './legacyJe.js';
import { sourceVapor, type SourceVaporInput } from './source.js';
import { checkNonNeg } from './units.js';

/**
 * Dominant-layer model with first-order degradation in a middle layer (Johnson 1998 / Johnson and
 * Ettinger 1991 building), indoor or outdoor. Degradation acts on the dissolved concentration, so per
 * unit soil volume the loss is rate * theta_w * C_v / H. Fluxes are positive upward.
 */

export interface DegradingLayer extends SoilLayer {
  /** First-order degradation rate in the water phase, 1/s (0 allowed). */
  rate: number;
}

export type DominantReceptor = { kind: 'indoor'; building: LegacyBuilding } | { kind: 'outdoor' };

export interface DominantLayerInput {
  chemical: VaporChemical;
  /** Next to the source, no degradation. */
  layer1: SoilLayer;
  /** Degrading layer. */
  layer2: DegradingLayer;
  /** Next to the foundation or the ground surface, no degradation. */
  layer3: SoilLayer;
  receptor: DominantReceptor;
  source: SourceVaporInput;
}

export interface DominantLayerResult {
  /** Indoor air concentration, kg/m^3 (indoor receptor only). */
  concentration?: number;
  /** Receptor coefficient: indoor concentration per unit source vapor (indoor only). */
  coefficient: number;
  /** Vapor concentration at the top of layer 1 (bottom of layer 2), kg/m^3. */
  Ca: number;
  /** Vapor concentration at the top of layer 2, kg/m^3. */
  Cb: number;
  /** Normalized to the source vapor: Ca / C_vs (0 when the source is 0). */
  concentrationTopLayer1: number;
  sourceVapor: number;
  /** Flux through layer 1, kg/(m^2 s). */
  fluxLayer1: number;
  /** Flux at the bottom and top of layer 2, kg/(m^2 s). */
  fluxBottomLayer2: number;
  fluxTopOfLayer2: number;
  /** Area flux out of layer 3 (indoor: entry rate over A_B; outdoor: the emission), kg/(m^2 s). */
  fluxTop: number;
  phi: number;
  alpha3?: number;
  QB: number;
  AB: number;
  profile: ProfilePoint[];
  warnings: Warning[];
}

/** phi coth(phi) and phi csch(phi), stable for small and large phi. */
function hyperbolic(phi: number): { P: number; Q: number } {
  if (phi < 1e-4) {
    const p2 = phi * phi;
    return { P: 1 + p2 / 3, Q: 1 - p2 / 6 };
  }
  const e = Math.exp(-2 * phi);
  // coth = (1 + e) / (1 - e); csch = 2 exp(-phi) / (1 - e)
  return { P: (phi * (1 + e)) / (1 - e), Q: (2 * phi * Math.exp(-phi)) / (1 - e) };
}

const PROFILE_POINTS_LAYER2 = 20;

export function dominantLayerRun(input: DominantLayerInput): DominantLayerResult {
  const { chemical: chem, layer1: l1, layer2: l2, layer3: l3 } = input;
  checkNonNeg('degradation rate', l2.rate);
  const D1 = layerDeff(l1, chem);
  const D2 = layerDeff(l2, chem);
  const D3 = layerDeff(l3, chem);
  const src = sourceVapor(input.source);
  const cvs = src.cvs;
  const g1 = D1 / l1.thickness;
  const w = D2 / l2.thickness;
  const phi = Math.sqrt((l2.rate * l2.moisture * l2.thickness * l2.thickness) / (D2 * chem.H));
  const { P, Q } = hyperbolic(phi);
  const warnings: Warning[] = [...src.warnings];

  let G3: number;
  let QB = 0;
  let AB = 0;
  let alpha3: number | undefined;
  let A3 = 0;
  if (input.receptor.kind === 'indoor') {
    const t = legacyBuildingTerms(input.receptor.building, chem);
    QB = t.QB;
    AB = t.AB;
    const a = jeAlpha({
      DT: D3,
      AB: t.AB,
      QB: t.QB,
      LT: l3.thickness,
      Qsoil: t.Qsoil,
      Lcrack: t.Lcrack,
      Dcrack: t.Dcrack,
      Acrack: t.Acrack,
    });
    alpha3 = a.alpha;
    A3 = a.A;
    G3 = (t.QB * a.alpha) / t.AB;
    const LTall = l1.thickness + l2.thickness + l3.thickness;
    warnings.push(...buildingWarnings(input.receptor.building, LTall, a.xi));
  } else {
    G3 = D3 / l3.thickness;
  }

  // (g1 + wP) Ca - wQ Cb = g1 Cvs ;  wQ Ca - (wP + G3) Cb = 0
  const det = (g1 + w * P) * (w * P + G3) - w * w * Q * Q;
  // Cb and Ca per unit source vapor concentration (Ca avoids dividing by Q, which underflows)
  const kb = (g1 * w * Q) / det;
  const ka = (g1 * (w * P + G3)) / det;
  const Cb = kb * cvs;
  const Ca = ka * cvs;
  const fluxLayer1 = g1 * (cvs - Ca);
  const fluxBottomLayer2 = w * (P * Ca - Q * Cb);
  const fluxTopOfLayer2 = w * (Q * Ca - P * Cb);
  const fluxTop = G3 * Cb;

  const h1 = l1.thickness;
  const h2 = l2.thickness;
  const profile: ProfilePoint[] = [
    { height: 0, concentration: cvs },
    { height: h1, concentration: Ca },
  ];
  for (let i = 1; i <= PROFILE_POINTS_LAYER2; i++) {
    const f = i / PROFILE_POINTS_LAYER2;
    let c: number;
    if (phi < 1e-4) {
      c = Ca + (Cb - Ca) * f;
    } else {
      // C(s) = [Ca sinh(phi (1 - f)) + Cb sinh(phi f)] / sinh(phi), written with exponentials
      const em = Math.exp(-phi);
      const sa = Math.exp(-phi * f) * (1 - Math.exp(-2 * phi * (1 - f)));
      const sb = Math.exp(-phi * (1 - f)) * (1 - Math.exp(-2 * phi * f));
      c = (Ca * sa + Cb * sb) / (1 - em * em);
    }
    profile.push({ height: h1 + f * h2, concentration: c });
  }
  const top = h1 + h2 + l3.thickness;
  // layer 3 is linear; its upper end is the value at the foundation base (indoor) or zero at the
  // ground surface (outdoor)
  profile.push({
    height: top,
    concentration: input.receptor.kind === 'indoor' ? Cb * (1 - (alpha3 as number) / A3) : 0,
  });

  const out: DominantLayerResult = {
    coefficient: (input.receptor.kind === 'indoor' ? (alpha3 as number) : G3) * kb,
    Ca,
    Cb,
    concentrationTopLayer1: cvs > 0 ? Ca / cvs : 0,
    sourceVapor: cvs,
    fluxLayer1,
    fluxBottomLayer2,
    fluxTopOfLayer2,
    fluxTop,
    phi,
    QB,
    AB,
    profile,
    warnings,
  };
  if (input.receptor.kind === 'indoor') {
    out.concentration = (alpha3 as number) * Cb;
    out.alpha3 = alpha3 as number;
  }
  return out;
}

export const vaporDominantLayer1998: MethodDescriptor<DominantLayerInput, DominantLayerResult> = {
  id: 'vapor.dominant-layer-1998',
  process: 'vapor',
  kind: 'legacy',
  name: 'Dominant-layer vapor model with first-order degradation',
  summary:
    'Three homogeneous soil layers above the source, the middle one degrading vapor at a first-order rate acting on the dissolved concentration, solved in closed form (hyperbolic profile) and coupled to the Johnson and Ettinger building for indoor air or to a zero-concentration ground surface for outdoor air.',
  citations: ['johnson1998', 'johnsonettinger1991', 'millingtonquirk1961', 'epa1996ssg'],
  assumptions: [
    'Steady, one-dimensional transport; layers 1 and 3 do not degrade the chemical.',
    'Degradation is proportional to the dissolved concentration and the water content of layer 2.',
    'Infinite source; the receptor coefficient is linear in the source vapor concentration.',
    'Outdoor: zero vapor concentration at the ground surface; the result is an area emission.',
  ],
  risc5Choice:
    'RISC5 applies degradation to the water phase times moisture in the middle layer only, takes the source soil properties separately from the transport layers, and reports the indoor or outdoor result for the same column; with zero degradation the result equals the legacy Johnson and Ettinger model.',
  validate: (input) => dominantLayerRun(input).warnings,
  run: dominantLayerRun,
};
