/**
 * Dermal kernels of the modern method (RAGS Part E, `ragse2004`), SI throughout.
 *
 * Water: the dose absorbed per event, per unit concentration, as a depth (m) so that
 * DA_event = C x perEpc has units kg/m^2 for C in kg/m^3.
 */

/** Dermal-water parameters of one chemical in SI (Kp m/s, lag time and t* in s). */
export interface DermalWaterParams {
  /** Organic chemicals use the lag-time model; inorganic chemicals use Kp times the event time. */
  organic: boolean;
  /** Dermal permeability coefficient Kp, m/s. */
  kp?: number;
  /** Lag time per event tau, s (organic). */
  tauEvent?: number;
  /** Time to steady state t*, s (organic). */
  tStar?: number;
  /** Ratio B of the stratum corneum to viable epidermis permeability (organic). */
  b?: number;
  /** Fraction absorbed in water FA, [0, 1] (organic); defaults to 1. */
  fa?: number;
}

export type DermalRegime = 'short' | 'long' | 'inorganic';

function nonNegative(name: string, v: number | undefined): void {
  if (v !== undefined && !(Number.isFinite(v) && v >= 0)) {
    throw new RangeError(`${name} must be finite and not negative`);
  }
}

/** Throws a RangeError for out-of-range dermal-water parameters. */
export function validateDermalWater(p: DermalWaterParams): void {
  nonNegative('kp', p.kp);
  nonNegative('tauEvent', p.tauEvent);
  nonNegative('tStar', p.tStar);
  nonNegative('b', p.b);
  if (p.fa !== undefined && !(Number.isFinite(p.fa) && p.fa >= 0 && p.fa <= 1)) {
    throw new RangeError('fa must be in [0, 1]');
  }
}

/**
 * Dose absorbed per event per unit water concentration, m (RAGS Part E equations 3.2 to 3.4):
 *
 * - organic, t_ev <= t*: 2 FA Kp sqrt(6 tau t_ev / pi)
 * - organic, t_ev > t*: FA Kp ( t_ev / (1 + B) + 2 tau (1 + 3B + 3B^2) / (1 + B)^2 )
 * - inorganic: Kp t_ev
 *
 * Returns null when a needed parameter is absent (the chemical has no dermal-water value).
 */
export function dermalWaterEventPerEpc(
  p: DermalWaterParams,
  eventTime: number,
): { perEpc: number; regime: DermalRegime } | null {
  validateDermalWater(p);
  if (!Number.isFinite(eventTime) || eventTime < 0) {
    throw new RangeError('eventTime must be finite and not negative');
  }
  if (p.kp === undefined) return null;
  if (!p.organic) return { perEpc: p.kp * eventTime, regime: 'inorganic' };
  if (p.tauEvent === undefined || p.tStar === undefined || p.b === undefined) return null;
  const fa = p.fa ?? 1;
  if (eventTime <= p.tStar) {
    return {
      perEpc: 2 * fa * p.kp * Math.sqrt((6 * p.tauEvent * eventTime) / Math.PI),
      regime: 'short',
    };
  }
  const b = p.b;
  return {
    perEpc:
      fa *
      p.kp *
      (eventTime / (1 + b) + (2 * p.tauEvent * (1 + 3 * b + 3 * b * b)) / ((1 + b) * (1 + b))),
    regime: 'long',
  };
}

/** Absorbed dose per event per unit soil concentration, kg/m^2 per (kg/kg): AF x ABSd (eq. 3.12). */
export const dermalSoilEventPerEpc = (adherence: number, absd: number): number => adherence * absd;

/**
 * Dermal slope factor and reference dose (RAGS Part E chapter 4): the oral values adjusted by the
 * gastrointestinal absorption fraction when it is below 0.5 (SF / GIABS, RfD x GIABS), otherwise the
 * oral values unchanged. `adjusted` is true only when a present value was changed.
 */
export function dermalToxicity(t: {
  sfo?: number | undefined;
  rfdo?: number | undefined;
  giabs?: number | undefined;
}): {
  sf?: number;
  rfd?: number;
  adjusted: boolean;
} {
  const out: { sf?: number; rfd?: number; adjusted: boolean } = { adjusted: false };
  const adjust = t.giabs !== undefined && t.giabs < 0.5;
  if (t.sfo !== undefined) {
    out.sf = adjust ? t.sfo / (t.giabs as number) : t.sfo;
    if (adjust) out.adjusted = true;
  }
  if (t.rfdo !== undefined) {
    out.rfd = adjust ? t.rfdo * (t.giabs as number) : t.rfdo;
    if (adjust) out.adjusted = true;
  }
  return out;
}
