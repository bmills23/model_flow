import type { MethodDescriptor, Warning } from '../../registry/index.js';
import { erf, erfcx } from '../../numerics/special.js';
import { integrate } from '../../numerics/quadrature.js';
import { millingtonQuirkDeff } from '../vadose/index.js';
import type { VaporChemical } from './legacyJe.js';
import { checkNonNeg, checkPos } from './units.js';
import { juryUncertainInputs } from './uncertain.js';

/**
 * Jury behaviour-assessment soil volatilization for zero water flux (`vapor.jury-bam`): a chemical at
 * uniform concentration in a layer of thickness L under a clean cover of thickness a, in semi-infinite
 * soil, moving by vapor and liquid diffusion with linear equilibrium sorption and first-order
 * degradation, lost through a stagnant air boundary layer (or none) at the surface. The closed form is
 * derived in docs/methods/vapor-models.md (DEFAULT ruling 15). SI throughout.
 */

export interface JurySoil {
  /** Total porosity. */
  porosity: number;
  /** Water-filled porosity. */
  moisture: number;
  /** Dry bulk density, kg/m^3. */
  bulkDensity: number;
  /** Soil-water partition coefficient K_d = K_oc f_oc, m^3/kg. */
  kd: number;
}

export interface JuryInput {
  chemical: VaporChemical;
  soil: JurySoil;
  /** Clean cover over the contaminated layer, m (default 0). */
  coverThickness?: number;
  /** Thickness of the contaminated layer, m (Infinity allowed). */
  layerThickness: number;
  /** Initial total concentration in the contaminated layer, kg per m^3 of soil. */
  initialConcentration: number;
  /** Stagnant air boundary layer thickness, m (default none, the conservative limit). */
  boundaryLayerThickness?: number;
  /** First-order degradation rate, 1/s (default 0). */
  decayRate?: number;
}

export interface JuryTransport {
  /** Gas-referenced capacity R_g = rho_b K_d / H + theta_w / H + theta_a. */
  Rg: number;
  /** Gas-referenced diffusion coefficient (Millington-Quirk), m^2/s. */
  Dg: number;
  /** Effective diffusivity D_E = D_g / R_g, m^2/s. */
  DE: number;
  /** Boundary layer conductance D_a / d, m/s (Infinity with no boundary layer). */
  hb: number;
  /** h_b / D_g, 1/m (Infinity with no boundary layer). */
  k: number;
}

export function juryTransport(input: JuryInput): JuryTransport {
  const { chemical: c, soil: s } = input;
  checkPos('H', c.H);
  checkPos('bulk density', s.bulkDensity);
  checkNonNeg('kd', s.kd);
  const Rg = (s.bulkDensity * s.kd + s.moisture) / c.H + (s.porosity - s.moisture);
  const Dg = millingtonQuirkDeff({ thetaS: s.porosity, theta: s.moisture }, c);
  checkPos('effective diffusion coefficient', Dg);
  const d = input.boundaryLayerThickness;
  let hb = Infinity;
  if (d !== undefined && d > 0) {
    checkPos('boundary layer thickness', d);
    hb = c.Da / d;
  } else if (d !== undefined && d < 0) {
    throw new RangeError(`boundary layer thickness must be >= 0, got ${d}`);
  }
  return { Rg, Dg, DE: Dg / Rg, hb, k: hb / Dg };
}

function check(input: JuryInput): { a: number; L: number; mu: number } {
  const a = input.coverThickness ?? 0;
  checkNonNeg('cover thickness', a);
  const L = input.layerThickness;
  if (!(L > 0) || Number.isNaN(L)) throw new RangeError(`layer thickness must be > 0, got ${L}`);
  checkNonNeg('initial concentration', input.initialConcentration);
  const mu = input.decayRate ?? 0;
  checkNonNeg('decay rate', mu);
  return { a, L, mu };
}

/**
 * E(z) = exp(k z + k^2 D_E t) erfc(z / (2 s) + k s), s = sqrt(D_E t), evaluated through erfcx so it
 * cannot overflow; zero at z = Infinity.
 */
function Ez(z: number, k: number, s: number): number {
  if (z === Infinity) return 0;
  const x = z / (2 * s) + k * s;
  return Math.exp(-(z * z) / (4 * s * s)) * erfcx(x);
}

/**
 * Surface emission flux, kg/(m^2 s), at time t > 0 (positive upward). With a boundary layer,
 * J = h_b C_g(0, t) = (h_b / R_g) C_T0 e^(-mu t) [E(a) - E(a + L)]; with none, the limit
 * J = C_T0 e^(-mu t) (D_E / (pi t))^(1/2) [exp(-a^2 / 4 D_E t) - exp(-(a + L)^2 / 4 D_E t)].
 */
export function juryFlux(input: JuryInput, t: number): number {
  const { a, L, mu } = check(input);
  if (!Number.isFinite(t) || t < 0) throw new RangeError(`time must be >= 0, got ${t}`);
  if (t === 0) return 0;
  const { Rg, DE, hb, k } = juryTransport(input);
  const s = Math.sqrt(DE * t);
  const decay = Math.exp(-mu * t);
  if (hb === Infinity) {
    const lower = L === Infinity ? 0 : Math.exp(-((a + L) * (a + L)) / (4 * s * s));
    const upper = Math.exp(-(a * a) / (4 * s * s));
    return input.initialConcentration * decay * Math.sqrt(DE / (Math.PI * t)) * (upper - lower);
  }
  const diff = Ez(a, k, s) - Ez(a + L, k, s);
  return (hb / Rg) * input.initialConcentration * decay * diff;
}

/** Cumulative emission per unit area, kg/m^2, from 0 to T. */
export function juryCumulativeEmission(input: JuryInput, T: number): number {
  checkPos('time', T);
  check(input);
  // t = T u^2 removes the t^(-1/2) singularity of the early flux.
  const r = integrate((u) => 2 * T * u * juryFlux(input, T * u * u), 0, 1, {
    relTol: 1e-10,
    absTol: 1e-14,
    maxDepth: 20,
  });
  return r.value;
}

/** Average emission flux over [0, T], kg/(m^2 s). */
export function juryAverageFlux(input: JuryInput, T: number): number {
  return juryCumulativeEmission(input, T) / T;
}

/**
 * Gas-phase concentration, kg/m^3, at depth z >= 0 and time t > 0, from the Green's function of the
 * semi-infinite medium with the radiation condition integrated over the initial layer:
 * C_g = (C_T0 / R_g) e^(-mu t) [P(a + L) - P(a)], P(zeta) = [erf((zeta - z) / 2s) - erf((zeta + z) / 2s)]
 * / 2 - E(z + zeta) (the Dirichlet limit, no boundary layer, drops E), with P(Infinity) = 0.
 */
export function juryProfile(input: JuryInput, t: number, z: number): number {
  const { a, L, mu } = check(input);
  checkPos('time', t);
  checkNonNeg('depth', z);
  const { Rg, DE, hb, k } = juryTransport(input);
  const s = Math.sqrt(DE * t);
  // Antiderivative in zeta of the Green's function. The Robin term integrates to E(z + zeta) +
  // erf((z + zeta) / 2s), which folds into the image erf; the Dirichlet limit drops E.
  const primitive = (zeta: number): number => {
    if (zeta === Infinity) return 0;
    const image = 0.5 * erf((zeta + z) / (2 * s));
    const direct = 0.5 * erf((zeta - z) / (2 * s));
    return hb === Infinity ? direct - image : direct - image - Ez(z + zeta, k, s);
  };
  const hi = primitive(L === Infinity ? Infinity : a + L);
  const lo = primitive(a);
  return (input.initialConcentration / Rg) * Math.exp(-mu * t) * (hi - lo);
}

/** Mass per unit area remaining in the soil at time t, kg/m^2, by quadrature of the profile. */
export function juryRemainingMass(input: JuryInput, t: number): number {
  const { a, L } = check(input);
  const { Rg, DE } = juryTransport(input);
  const s = Math.sqrt(DE * t);
  const zMax = (L === Infinity ? a + 1 : a + L) + 12 * s;
  const breaks = [0, a, ...(L === Infinity ? [] : [a + L]), zMax].filter(
    (v, i, arr) => v >= 0 && v <= zMax && (i === 0 || v > (arr[i - 1] as number)),
  );
  let total = 0;
  for (let i = 1; i < breaks.length; i++) {
    total += integrate(
      (z) => Rg * juryProfile(input, t, z),
      breaks[i - 1] as number,
      breaks[i] as number,
      {
        relTol: 1e-10,
        absTol: 1e-14,
        maxDepth: 20,
      },
    ).value;
  }
  return total;
}

export function juryWarnings(input: JuryInput): Warning[] {
  const w: Warning[] = [];
  if (input.boundaryLayerThickness === undefined) {
    w.push({
      code: 'vapor.jury-no-boundary-layer',
      message:
        'no stagnant air boundary layer is applied (the conservative limit); low Henry constant chemicals are over-predicted',
    });
  }
  return w;
}

export interface JuryResult {
  /** Surface flux series, kg/(m^2 s), positive upward. */
  flux: (t: number) => number;
  /** Cumulative emission per area from 0 to t, kg/m^2. */
  cumulative: (t: number) => number;
  transport: JuryTransport;
  warnings: Warning[];
}

export function juryRun(input: JuryInput): JuryResult {
  check(input);
  return {
    flux: (t) => juryFlux(input, t),
    cumulative: (t) => (t <= 0 ? 0 : juryCumulativeEmission(input, t)),
    transport: juryTransport(input),
    warnings: juryWarnings(input),
  };
}

export const vaporJuryBam: MethodDescriptor<JuryInput, JuryResult> = {
  id: 'vapor.jury-bam',
  process: 'vapor',
  kind: 'modern',
  name: 'Jury behaviour-assessment soil volatilization',
  summary:
    'Transient, depleting volatilization flux from a contaminated soil layer under an optional clean cover with an optional stagnant air boundary layer and first-order degradation, in closed form for zero water flux; the flux series is an area emission to the outdoor box.',
  citations: ['jury1983', 'jury1990', 'millingtonquirk1961'],
  assumptions: [
    'Zero water flux; semi-infinite soil below the contaminated layer; one homogeneous soil.',
    'Linear equilibrium sorption and Henry partitioning; Millington-Quirk diffusion.',
    'The closed form is derived in the methods note and checked against a finite-difference solution of the same equation and the published reduced solution, not against the full papers.',
  ],
  risc5Choice:
    'RISC5 offers Jury volatilization as a soil emission source; this implementation covers zero water flux only.',
  validate: juryWarnings,
  uncertainInputs: juryUncertainInputs(),
  run: juryRun,
};
