function nonNeg(name: string, x: number): void {
  if (!Number.isFinite(x) || x < 0)
    throw new RangeError(`${name} must be finite and >= 0, got ${x}`);
}
function pos(name: string, x: number): void {
  if (!Number.isFinite(x) || !(x > 0))
    throw new RangeError(`${name} must be finite and > 0, got ${x}`);
}

export interface PoreWaterInput {
  /** Total soil concentration, kg/kg. */
  F: number;
  /** Bulk density, kg/m^3. */
  rhoB: number;
  /** Soil-water distribution coefficient Koc * foc, m^3/kg. */
  kd: number;
  /** Volumetric water content. */
  theta: number;
  /** Air-filled porosity thetaS - theta. */
  thetaA: number;
  /** Dimensionless Henry's constant. */
  H: number;
}

/** Pore-water concentration (kg/m^3) in equilibrium with F when no separate phase exists. */
export function equilibriumPoreWater(p: PoreWaterInput): number {
  nonNeg('F', p.F);
  pos('rhoB', p.rhoB);
  nonNeg('kd', p.kd);
  nonNeg('theta', p.theta);
  nonNeg('thetaA', p.thetaA);
  nonNeg('H', p.H);
  const denom = p.rhoB * p.kd + p.theta + p.thetaA * p.H;
  if (!(denom > 0)) throw new RangeError('partitioning capacity must be positive');
  return (p.F * p.rhoB) / denom;
}

/** Raoult's law: effective solubility x S for mole fraction x in (0, 1]. */
export function effectiveSolubility(S: number, x: number): number {
  pos('S', S);
  if (!Number.isFinite(x) || !(x > 0 && x <= 1)) {
    throw new RangeError(`mole fraction must be in (0, 1], got ${x}`);
  }
  return x * S;
}

export interface ResidualPhaseInput {
  /** Chemical mass fraction in soil, kg/kg. */
  F: number;
  /** Chemical molar mass, kg/mol. */
  M: number;
  /** Aqueous solubility, kg/m^3. */
  S: number;
  /** Equilibrium pore-water concentration without a separate phase, kg/m^3. */
  ceq: number;
  /** Optional TPH mass fraction, kg/kg, and molar mass, kg/mol. */
  FT?: number;
  MT?: number;
}

export interface ResidualPhaseResult {
  x: number;
  effS: number;
  ceq: number;
  residual: boolean;
  /** Source pore-water concentration, kg/m^3: x S when a separate phase exists, else ceq. */
  cs0: number;
  /** F / FT (0 when no TPH is entered): the bound on depletion understatement. */
  tphRatio: number;
}

/** Decide whether a separate phase is present and return the source pore-water concentration. */
export function residualPhaseTest(p: ResidualPhaseInput): ResidualPhaseResult {
  nonNeg('F', p.F);
  pos('M', p.M);
  pos('S', p.S);
  nonNeg('ceq', p.ceq);
  let x = 1;
  let tphRatio = 0;
  if (p.FT !== undefined || p.MT !== undefined) {
    if (p.FT === undefined || p.MT === undefined) throw new RangeError('FT and MT go together');
    pos('FT', p.FT);
    pos('MT', p.MT);
    if (p.F > p.FT) throw new RangeError(`F (${p.F}) must not exceed FT (${p.FT})`);
    x = p.F / p.M / (p.FT / p.MT);
    tphRatio = p.F / p.FT;
  }
  if (!(x > 0)) {
    // F = 0: nothing to partition
    return { x: 0, effS: 0, ceq: p.ceq, residual: false, cs0: p.ceq, tphRatio };
  }
  const effS = effectiveSolubility(p.S, Math.min(x, 1));
  const residual = p.ceq > effS;
  return { x, effS, ceq: p.ceq, residual, cs0: residual ? effS : p.ceq, tphRatio };
}
