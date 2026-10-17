import type { Warning } from '../../registry/index.js';
import { boxConcentration, checkBox, type OutdoorBox } from './box.js';

/**
 * The outdoor air interface: contributions to one chemical's outdoor air concentration. Box emissions
 * (area fluxes or mass rates) enter the ventilated box; direct contributions are already air
 * concentrations from a dispersion-factor (Q/C) model. M7 adds sources through this interface.
 */

export type OutdoorEmission =
  | {
      origin: string;
      kind: 'areaFlux';
      /** kg/(m^2 s) as a function of time, s. */
      flux: (t: number) => number;
      /** Source area, m^2 (default: the box footprint). */
      area?: number;
    }
  | {
      origin: string;
      kind: 'massRate';
      /** kg/s as a function of time, s. */
      rate: (t: number) => number;
    };

export interface OutdoorDirect {
  origin: string;
  /** kg/m^3 as a function of time, s. */
  concentration: (t: number) => number;
}

export interface OutdoorAirInput {
  /** Required if any emission is present. */
  box?: OutdoorBox;
  emissions: OutdoorEmission[];
  direct: OutdoorDirect[];
}

export interface OutdoorContribution {
  origin: string;
  via: 'box' | 'direct';
  /** kg/m^3 as a function of time, s. */
  concentration: (t: number) => number;
}

export interface OutdoorAirResult {
  /** Sum of all contributions, kg/m^3. */
  concentration: (t: number) => number;
  /** Each contribution kept separately, in input order (emissions first). */
  contributions: OutdoorContribution[];
  warnings: Warning[];
}

export function outdoorAirEpc(input: OutdoorAirInput): OutdoorAirResult {
  const { box, emissions, direct } = input;
  const warnings: Warning[] = [];
  const contributions: OutdoorContribution[] = [];
  if (emissions.length > 0) {
    if (!box) throw new RangeError('a box is required when any emission is present');
    checkBox(box);
    for (const e of emissions) {
      if (e.kind === 'areaFlux') {
        const area = e.area ?? box.length * box.width;
        if (!Number.isFinite(area) || !(area > 0)) {
          throw new RangeError(`source area must be finite and > 0, got ${area}`);
        }
        if (area > box.length * box.width * (1 + 1e-12)) {
          warnings.push({
            code: 'outdoorAir.box-shorter-than-source',
            message: `source "${e.origin}" (${area} m^2) is larger than the box footprint (${box.length * box.width} m^2): the box is shorter than the source along the wind, so the model concentrates vapor`,
          });
        }
        contributions.push({
          origin: e.origin,
          via: 'box',
          concentration: (t) => boxConcentration(box, e.flux(t) * area),
        });
      } else {
        contributions.push({
          origin: e.origin,
          via: 'box',
          concentration: (t) => boxConcentration(box, e.rate(t)),
        });
      }
    }
  }
  for (const d of direct) {
    contributions.push({ origin: d.origin, via: 'direct', concentration: d.concentration });
  }
  if (emissions.length > 0 && direct.length > 0) {
    warnings.push({
      code: 'outdoorAir.mixed-dispersion',
      message:
        'box emissions and dispersion-factor (Q/C) contributions are both present: adding them double counts when they describe the same source area; confirm they are different sources',
    });
  }
  return {
    concentration: (t) => contributions.reduce((s, c) => s + c.concentration(t), 0),
    contributions,
    warnings,
  };
}
