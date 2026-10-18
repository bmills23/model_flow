import { checkFinite } from './checks.js';

/**
 * Root concentration factor of Briggs, Bromilow and Evans (1982), barley roots from growth solution,
 * with the constants as printed in the HHRAP appendix A-2 (Equations A-2-14 and A-2-15, read
 * 2026-10-18): log RCF = 0.77 log Kow - 1.52 for log Kow >= 2, and log (RCF - 0.82) = 0.77 log Kow
 * - 1.52 below 2. The ratio is of root (fresh weight) to water concentration, in L/kg. The
 * regression was fitted on log Kow -0.57 to 4.6; HHRAP caps the input at -0.57 and 8.2 (the top of
 * a dioxin validation), applied here and reported through `clamped`.
 */
export const BRIGGS_LOGKOW_MIN = -0.57;
export const BRIGGS_FIT_LOGKOW_MAX = 4.6;
export const BRIGGS_CAP_LOGKOW_MAX = 8.2;

export interface Capped {
  value: number;
  clamped: boolean;
}

export function briggsRootConcentrationFactor(logKow: number): Capped {
  checkFinite('log Kow', logKow);
  const x = Math.min(Math.max(logKow, BRIGGS_LOGKOW_MIN), BRIGGS_CAP_LOGKOW_MAX);
  const base = Math.pow(10, 0.77 * x - 1.52);
  return { value: x >= 2 ? base : base + 0.82, clamped: x !== logKow };
}
