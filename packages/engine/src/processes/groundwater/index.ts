import type { MethodDescriptor, Warning } from '../../registry/index.js';
import { at123dConcentration, type At123dInput } from './kernel.js';
import { domenicoConcentration, domenicoWarnings, type DomenicoInput } from './domenico.js';
import { patchfConcentration, patchiConcentration, type WexlerInput } from './wexler.js';
import type { Point3 } from './common.js';

export * from './common.js';
export * from './kernel.js';
export * from './wexler.js';
export * from './domenico.js';

export interface At123dRunInput extends Omit<At123dInput, 'time'> {
  time: number;
  points: readonly Point3[];
}

export interface GroundwaterOutput {
  /** Concentration at each requested point, in input order. */
  concentrations: number[];
}

export const groundwaterAt123d: MethodDescriptor<At123dRunInput, GroundwaterOutput> = {
  id: 'groundwater.at123d',
  process: 'groundwater',
  kind: 'legacy',
  name: 'AT123D-class Green function solution with a finite volume source',
  summary:
    'Three-dimensional advection-dispersion with retardation and first-order decay, uniform flow along x, a finite rectangular volume source and piecewise-constant mass loading, in an aquifer of infinite or finite thickness.',
  citations: ['yeh1981', 'galya1987'],
  assumptions: [
    'Uniform one-dimensional flow along x; constant dispersion coefficients.',
    'Aquifer infinite in x and y; infinite depth or finite thickness with no-flux top and bottom.',
    'Source mass is released uniformly through the box; concentration input is converted to a mass rate through the Darcy flux and source area.',
    'First-order decay acts on dissolved and sorbed mass alike.',
  ],
  risc5Choice:
    'RISC5 applies the AT123D Green function solution with a finite rectangular volume source, vertical well-screen averaging and Gelhar-based dispersivity ratios.',
  run: ({ points, ...rest }) => ({
    concentrations: points.map((p) => at123dConcentration(rest, p)),
  }),
};

export interface WexlerRunInput {
  params: WexlerInput;
  /** Omit both for PATCHI (infinite width and depth); give both for PATCHF. */
  width?: number;
  thickness?: number;
  /** Time, or Infinity for steady state. */
  time: number;
  points: readonly Point3[];
}

export const groundwaterWexler: MethodDescriptor<WexlerRunInput, GroundwaterOutput> = {
  id: 'groundwater.wexler1992',
  process: 'groundwater',
  kind: 'modern',
  name: 'Wexler (1992) exact patch-source solutions (PATCHI and PATCHF)',
  summary:
    'Exact solutions for a patch source on the inflow plane held at fixed concentration: infinite width and depth (PATCHI) or finite width and thickness with no-flux boundaries (PATCHF), steady or transient.',
  citations: ['wexler1992'],
  assumptions: [
    'Uniform one-dimensional flow along x; constant dispersion coefficients.',
    'Fixed-concentration boundary over the patch on x = 0; semi-infinite in x.',
    'PATCHF has no-flux boundaries at y = 0, y = W, z = 0 and z = H.',
  ],
  validate: ({ width, thickness }) => {
    const w: Warning[] = [];
    if ((width === undefined) !== (thickness === undefined)) {
      w.push({
        code: 'wexler.partial-finite',
        message:
          'Give both width and thickness for PATCHF; with only one, the infinite PATCHI solution is used.',
      });
    }
    return w;
  },
  run: ({ params, width, thickness, time, points }) => ({
    concentrations: points.map((p) =>
      width !== undefined && thickness !== undefined
        ? patchfConcentration(params, p, time, { width, thickness }).value
        : patchiConcentration(params, p, time),
    ),
  }),
};

export interface DomenicoRunInput {
  params: DomenicoInput;
  /** Time, or Infinity for steady state. */
  time: number;
  points: readonly Point3[];
}

export const groundwaterDomenico: MethodDescriptor<DomenicoRunInput, GroundwaterOutput> = {
  id: 'groundwater.domenico1987',
  process: 'groundwater',
  kind: 'modern',
  name: 'BIOSCREEN/RBCA-compatible comparison (Domenico 1987 approximation)',
  summary:
    'Approximate patch-source solution used by BIOSCREEN-class screening tools, offered to reproduce those results; not the recommended method, because it is inexact for nonzero longitudinal dispersivity.',
  citations: ['domenico1987', 'west2007', 'guyonnet2004', 'srinivasan2007', 'newell1996'],
  assumptions: [
    'Vertical planar source of width Y and thickness Z at the water table, centred on y = 0.',
    'Transient behaviour only through the longitudinal erfc term; transverse spreading evaluated at steady state.',
    'Plume centreline accuracy depends on dispersivity, time and dimensionality; see the emitted warnings.',
  ],
  validate: ({ params, time, points }) => {
    const seen = new Map<string, Warning>();
    for (const p of points) {
      for (const w of domenicoWarnings(params, p, time)) if (!seen.has(w.code)) seen.set(w.code, w);
    }
    return [...seen.values()];
  },
  run: ({ params, time, points }) => ({
    concentrations: points.map((p) => domenicoConcentration(params, p, time)),
  }),
};
