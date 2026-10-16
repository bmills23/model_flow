/**
 * Depleting well-mixed source, per unit plan area, SI units. In both the dissolved-only and the
 * separate-phase (Raoult) cases the source pore-water concentration is proportional to the mass
 * left, so C_s(t) = cs0 exp(-gamma t) with
 *
 *   gamma = (q + H Deff / Ld) cs0 / m0 + sourceDecay.
 */
export interface SourceParams {
  /** Initial source pore-water concentration, kg/m^3. */
  cs0: number;
  /** Initial source mass per unit plan area, kg/m^2 (rhoB Ls F). */
  m0: number;
  /** Darcy flux through the source, m/s. */
  q: number;
  /** Vapour loss velocity H Deff / Ld, m/s. */
  volatilization: number;
  /** Optional first-order source decay rate, 1/s. */
  sourceDecay: number;
}

export interface SourceState {
  /** Source pore-water concentration, kg/m^3. */
  cs: number;
  /** Mass left in the source, kg/m^2. */
  mass: number;
  /** Cumulative masses lost by leaching, vapour diffusion and source decay, kg/m^2. */
  leached: number;
  volatilized: number;
  decayed: number;
}

function check(p: SourceParams): void {
  for (const [k, v] of Object.entries(p)) {
    if (!Number.isFinite(v) || v < 0)
      throw new RangeError(`${k} must be finite and >= 0, got ${v}`);
  }
}

/** Source depletion rate gamma, 1/s. */
export function sourceDepletionRate(p: SourceParams): number {
  check(p);
  if (p.m0 === 0) return p.sourceDecay;
  return ((p.q + p.volatilization) * p.cs0) / p.m0 + p.sourceDecay;
}

/** Closed-form source state at time t (s). The three losses add up to m0 minus the mass left. */
export function sourceState(p: SourceParams, t: number): SourceState {
  if (!Number.isFinite(t) || t < 0) throw new RangeError(`t must be finite and >= 0, got ${t}`);
  const gamma = sourceDepletionRate(p);
  if (p.m0 === 0 || p.cs0 === 0) {
    return { cs: 0, mass: p.m0 * Math.exp(-gamma * t), leached: 0, volatilized: 0, decayed: 0 };
  }
  const decay = Math.exp(-gamma * t);
  // (1 - e^(-gamma t)) / gamma without cancellation; equals t when gamma = 0
  const window = gamma === 0 ? t : -Math.expm1(-gamma * t) / gamma;
  return {
    cs: p.cs0 * decay,
    mass: p.m0 * decay,
    leached: p.q * p.cs0 * window,
    volatilized: p.volatilization * p.cs0 * window,
    decayed: p.sourceDecay * p.m0 * window,
  };
}
