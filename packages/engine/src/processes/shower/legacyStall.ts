import {
  checkShower,
  showerDropletFraction,
  type ShowerInput,
  type ShowerResult,
} from './common.js';

/**
 * Legacy stagnant stall (RISC5 choice): the whole mass volatilized during the shower sits in the fully
 * mixed stall from the start, C_a = f_v Q_w t_s C_w / V_s. Above the equilibrium value H C_w it is
 * warned, not clipped.
 */
export function showerLegacyStall(p: ShowerInput): ShowerResult {
  checkShower(p);
  const { fv, warnings } = showerDropletFraction(p);
  const coefficient = (fv * p.waterFlow * p.showerTime) / p.stallVolume;
  const concentration = coefficient * p.waterConcentration;
  if (concentration > p.henry * p.waterConcentration) {
    warnings.push({
      code: 'shower.exceeds-equilibrium',
      message:
        'The stagnant stall concentration exceeds the equilibrium value H C_w; this follows from the stagnant assumption and is not clipped.',
    });
  }
  return { concentration, coefficient, exposureTime: p.showerTime, warnings };
}
