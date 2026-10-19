import type { MethodDescriptor, Warning } from '../../registry/index.js';
import { irrigationEpcs, type IrrigationEpcs, type IrrigationInput } from './pathways.js';
import {
  sprinklerAir,
  type SprinklerAirResult,
  type SprinklerBox,
  type SprinklerInput,
} from './sprinkler.js';
import { sprinklerUncertainInputs, irrigationPathwaysUncertainInputs } from './uncertain.js';

export interface SprinklerMethodInput {
  /** Irrigation water concentration, kg/m^3. */
  waterConcentration: number;
  sprinkler: SprinklerInput;
  box: SprinklerBox;
}

export const irrigationSprinklerFc: MethodDescriptor<SprinklerMethodInput, SprinklerAirResult> = {
  id: 'irrigation.sprinkler-fc',
  uncertainInputs: sprinklerUncertainInputs(),
  process: 'irrigation',
  kind: 'legacy',
  name: 'Sprinkler volatilization into the outdoor box',
  summary:
    'The shared two-resistance droplet fraction with outdoor droplet parameters gives a mass rate E = f_v Q_spr C_w that enters the outdoor box as a mass-rate emission: C_a = E / (u delta W).',
  citations: ['waldenspence1997', 'little1992'],
  assumptions: [
    'The droplet kernel is the one used for the shower, with outdoor droplet size, fall time (including ponding in the box) and flow supplied by the caller; none has a default.',
    'The box is fully mixed and ventilated by the wind; the width defaults to 1 m (the RISC5 choice) and is warned, because for a real sprinkler the plume width matters.',
    'Linear in the irrigation water concentration.',
    'little1992 is cited for the two-resistance film theory only. The stagnant, no-back-pressure stall is the approach that paper corrects, not a model it presents; the original source for the stagnant stall (foster1986) is a planned, unverified record and is not cited.',
  ],
  risc5Choice:
    'RISC5 feeds the outdoor box with the sprinkler droplet loss and fixes the box width at 1 m; the film reference coefficients are the unverified RISC5 values and are warned when defaulted.',
  validate: (input): Warning[] =>
    sprinklerAir(input.waterConcentration, input.sprinkler, input.box).warnings,
  run: (input) => sprinklerAir(input.waterConcentration, input.sprinkler, input.box),
};

export type IrrigationMethodInput = IrrigationInput & { waterConcentration: number };

export const irrigationPathways: MethodDescriptor<IrrigationMethodInput, IrrigationEpcs> = {
  id: 'irrigation.pathways',
  uncertainInputs: irrigationPathwaysUncertainInputs(),
  process: 'irrigation',
  kind: 'modern',
  name: 'Irrigation water exposure point concentrations',
  summary:
    'Irrigation water feeds incidental ingestion and dermal contact through the existing exposure kernels (the EPC is the water concentration), spray inhalation through the sprinkler box, and garden vegetables through the irrigation source handed to plant uptake.',
  citations: ['waldenspence1997'],
  assumptions: [
    'The irrigation exposure factors (contact times, ingestion volumes, skin areas) are caller inputs; none is defaulted because the source factors were not read.',
    'A source that is also the potable supply is warned, because the indoor pathways will dominate.',
    'Linear in the irrigation water concentration.',
  ],
  validate: (input): Warning[] => irrigationEpcs(input.waterConcentration, input).warnings,
  run: (input) => irrigationEpcs(input.waterConcentration, input),
};
