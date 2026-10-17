import type { MethodDescriptor, Warning } from '../../registry/index.js';
import {
  runLegacySurfaceWater,
  runModernSurfaceWater,
  type LegacySurfaceWaterInput,
  type LegacySurfaceWaterResult,
  type ModernSurfaceWaterInput,
  type ModernSurfaceWaterResult,
} from './scenario.js';

export * from './legacy.js';
export * from './reach.js';
export * from './sediment.js';
export * from './discharge.js';
export * from './transient.js';
export * from './downstream.js';
export * from './modern.js';
export * from './coupling.js';
export * from './criteria.js';
export * from './scenario.js';
export type { SurfaceWaterWarning } from './checks.js';
export * as surfaceWaterUnits from './units.js';

const COMMON_ASSUMPTIONS = [
  'The plume discharges into the water body (a gaining reach); a losing reach is refused.',
  'The mixing volume is uniformly mixed; the mixing fraction f scales both the upstream flow and the volume.',
  'The sediment is in equilibrium with its pore water; there is no degradation, burial, resuspension or sorption kinetics in the bed.',
  'There is no runoff, erosion, point discharge or upstream source other than the background concentration.',
  'A chemical with neither a Koc nor a Kd has no sediment concentration and is reported as not quantified, never as zero.',
];

export const surfaceWaterLegacy: MethodDescriptor<
  LegacySurfaceWaterInput,
  LegacySurfaceWaterResult
> = {
  id: 'surfaceWater.well-mixed',
  process: 'surfaceWater',
  kind: 'legacy',
  name: 'Well-mixed surface water box with Darcy groundwater discharge and equilibrium sediment',
  summary:
    'The groundwater concentration at the bank times a Darcy discharge across the bed, mixed into a fraction of the upstream flow and the water body volume with first-order decay, evaluated at steady state for the loading at each time, and sediment in equilibrium with the groundwater.',
  citations: ['chapra1997', 'domenico1987', 'ditoro1991'],
  assumptions: [
    ...COMMON_ASSUMPTIONS,
    'Storage in the water body is ignored: the box is re-evaluated at steady state at each sample time (warned when the residence time exceeds 30 d).',
    'The groundwater concentration is the plume centreline value at the bank averaged over the discharge thickness, held across the whole reach width, so the loading can exceed the mass the source releases.',
    'The reach length is entered or the full width of the steady Domenico plume between its 5 percent points.',
  ],
  risc5Choice:
    'RISC5 loads the water body with the centreline groundwater concentration times a Darcy flow across the bed (bed conductivity, discharge thickness, reach length and gradient), mixes it with a fraction of the upstream flow and the body volume at steady state for each time, sets the reach length from the 5 percent Domenico plume width with its own dispersivities, and takes sediment as Kd times the groundwater concentration.',
  validate: (input): Warning[] => runLegacySurfaceWater(input).warnings,
  run: runLegacySurfaceWater,
};

export const surfaceWaterModern: MethodDescriptor<
  ModernSurfaceWaterInput,
  ModernSurfaceWaterResult
> = {
  id: 'surfaceWater.mass-discharge',
  process: 'surfaceWater',
  kind: 'modern',
  name: 'Mass discharge across the bank plane into a transient well-mixed box',
  summary:
    'The advective mass the groundwater run carries across the vertical plane at the bank over the reach and the discharge thickness, a transient well-mixed box with storage, plug flow with first-order decay to a river receptor, and equilibrium sediment with a selectable pore water and an organic-carbon-normalized output.',
  citations: ['chapra1997', 'ditoro1991'],
  assumptions: [
    ...COMMON_ASSUMPTIONS,
    'The loading is the mass discharge across the plane, so the mass the groundwater run delivers is conserved; dispersive flux across the plane is neglected and the plane passes the plume without reflection.',
    'The groundwater flow is the Darcy flux of the groundwater run over the same area, so no bed conductivity or gradient is needed.',
    'The loading is linear between sample times and held after the last; the box starts at the steady state of the first loading unless an initial concentration is given.',
    'Downstream of the reach the whole river is mixed and moves as plug flow with first-order decay.',
  ],
  validate: (input): Warning[] => runModernSurfaceWater(input).warnings,
  run: runModernSurfaceWater,
};
