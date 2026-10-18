import type { MethodDescriptor, Warning } from '../../registry/index.js';
import type { ShowerInput, ShowerResult } from './common.js';
import { showerHouseholdAir, type HouseholdInput, type HouseholdResult } from './household.js';
import { showerLegacyStall } from './legacyStall.js';
import { showerLittle, type LittleInput, type LittleResult } from './little.js';

export const showerFc1986: MethodDescriptor<ShowerInput, ShowerResult> = {
  id: 'shower.fc-1986',
  process: 'shower',
  kind: 'legacy',
  name: 'Stagnant stall shower volatilization with two-resistance droplet transfer',
  summary:
    'Fraction volatilized from a falling droplet by two films in series (gas film scaled from water vapour, liquid film from carbon dioxide, by the square root of the molecular weight ratio), with all the mass sitting in a fully mixed, unventilated stall: C_a = f_v Q_w t_s C_w / V_s.',
  citations: ['little1992'],
  assumptions: [
    'Two-resistance transfer across the droplet surface into clean air (no gas-phase back-pressure), a single fall time for every droplet.',
    'The whole mass volatilized during the shower is in the stall from the start and stays there; the stall is fully mixed with no exchange with the bathroom.',
    'A stall value above the equilibrium concentration H C_w follows from the stagnant assumption and is warned, not clipped.',
    'Linear in the tap water concentration, so cleanup levels are the target over the coefficient.',
  ],
  risc5Choice:
    'RISC5 treats the shower as a stagnant stall fed by two-resistance droplet transfer with film reference coefficients of 3000 cm/h (gas, water vapour) and 20 cm/h (liquid, carbon dioxide) and the stagnant mass balance; the primary paper behind these values could not be verified, so they are inputs and the defaults are warned.',
  validate: (input): Warning[] => showerLegacyStall(input).warnings,
  run: showerLegacyStall,
};

export const showerLittle1992: MethodDescriptor<LittleInput, LittleResult> = {
  id: 'shower.little-1992',
  process: 'shower',
  kind: 'modern',
  name: 'Two-resistance stall with gas-phase back-pressure and ventilation',
  summary:
    'Keeps the gas-phase driving force and the stall ventilation: dC/dt = alpha - beta C with alpha = Q_w f C_w / V_s and beta = (Q_w f / H + Q_g) / V_s, solved in closed form and averaged over the shower plus an optional stay after the water is off.',
  citations: ['little1992'],
  assumptions: [
    'The mass balance is our statement of the two-resistance theory, checked by the limit identities (legacy stall at large H and no ventilation, equilibrium H C_w at long times); it is not a transcription of the paper.',
    'The stall is fully mixed and the supply air is clean; the receptor is in the stall for the shower time plus the stay.',
    'Linear in the tap water concentration.',
  ],
  validate: (input): Warning[] => showerLittle(input).warnings,
  run: showerLittle,
};

export const showerRslHousehold: MethodDescriptor<HouseholdInput, HouseholdResult> = {
  id: 'shower.rsl-household',
  process: 'shower',
  kind: 'modern',
  name: 'RSL whole-house water-to-air volatilization term',
  summary:
    'Whole-house air concentration as the tap water concentration times a fixed transfer factor K (L water per m^3 air), added to the tap water inhalation level for volatile chemicals only.',
  citations: ['epa2024rslug'],
  assumptions: [
    'A chemical is volatile when its Henry constant exceeds 1E-5 atm m^3/mol or its vapor pressure exceeds 1 mm Hg; others return zero with a warning.',
    'The transfer factor K is an entered value: it could not be verified against a primary page and is always warned.',
    'Linear in the tap water concentration.',
  ],
  validate: (input): Warning[] => showerHouseholdAir(input).warnings,
  run: showerHouseholdAir,
};
