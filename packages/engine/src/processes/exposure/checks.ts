import { validateSeries } from './averaging.js';
import type { EpcSpec } from './epc.js';
import { PATHWAYS, type PathwayId } from './units.js';

/** Shared validity checks of the scenario runners (RangeError, never a silent fix). */

export interface StartOption {
  /** 'max-risk' (the default) scans the start time; a number pins the exposure start, s. */
  exposureStart?: 'max-risk' | number;
}

export function checkReceptorCount(n: number, additive: boolean | undefined): void {
  if (n < 1 || n > 2) throw new RangeError('a run has one or two receptors');
  if (additive === true && n !== 2) throw new RangeError('the additive option needs two receptors');
}

export function checkStartOption(o: StartOption['exposureStart']): void {
  if (o === undefined || o === 'max-risk') return;
  if (typeof o !== 'number' || !Number.isFinite(o) || o < 0) {
    throw new RangeError("exposureStart must be 'max-risk' or a finite time not before zero");
  }
}

export function checkEpcSpec(label: string, pathway: PathwayId, spec: EpcSpec): void {
  if (spec.kind === 'constant') {
    if (!Number.isFinite(spec.value) || spec.value < 0) {
      throw new RangeError(`${label}: concentrations must be finite and not negative`);
    }
    return;
  }
  if (spec.kind !== 'series') throw new RangeError(`${label}: unknown EPC kind`);
  if (PATHWAYS[pathway].medium === 'soil') {
    throw new RangeError(`${label}: soil concentrations are constants (a series is not accepted)`);
  }
  validateSeries(spec.series, label);
}

export function checkUniqueChemicals(label: string, ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) {
    throw new RangeError(`${label}: a chemical appears twice (it would be counted twice)`);
  }
}
