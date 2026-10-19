import {
  fluxToLoadingSteps,
  loadedMass,
  waterTableSource,
  type FluxSeries,
} from '../src/processes/vadose/index.js';
import { at123dGrid, type At123dAquifer } from '../src/processes/groundwater/kernel.js';

/** Shared setup of the mass-balance checks of the vadose coupling (split over files so the slow sums run side by side). */
export const day = 86400;
const series: FluxSeries = {
  times: [0, 90 * day, 200 * day, 365 * day],
  flux: [4e-9, 6e-9, 2e-9, 1e-9],
};
export const L = 6;
export const W = 4;
export const A = L * W;
export const steps = fluxToLoadingSteps(series, A, 365 * day, 60 * day);
export const loaded = loadedMass(steps);
export const thickness = 3;
// observe after the loading has ended, when every release age is at least two years and the plume
// is smooth on the 2 m summation grid
export const observe = 3 * 365 * day;
export const aq: At123dAquifer = {
  velocity: 2e-7,
  porosity: 0.3,
  retardation: 1.7,
  decayRate: 0,
  dx: 4e-7,
  dy: 1e-7,
  dz: 2e-8,
  thickness,
};

export function aquiferMass(
  withThickness: boolean | 'water-table',
  zs: number[],
  dz: number,
): number {
  const free: At123dAquifer = { ...aq, top: 'unbounded' };
  delete free.thickness;
  const a =
    withThickness === 'water-table'
      ? { ...free, top: 'no-flux' as const }
      : withThickness
        ? aq
        : free;
  const source =
    withThickness === 'water-table'
      ? waterTableSource(L, W, { aquifer: a })
      : waterTableSource(L, W, withThickness ? { thickness } : {});
  const dx = 2;
  const xs: number[] = [];
  for (let x = -30; x <= 60; x += dx) xs.push(x);
  const ys: number[] = [];
  for (let y = -26; y <= 26; y += dx) ys.push(y);
  let total = 0;
  for (const z of zs) {
    const g = at123dGrid({ aquifer: a, source, loading: steps, time: observe }, xs, ys, z);
    let s = 0;
    for (const row of g) for (const c of row) s += c;
    total += s * dx * dx * dz;
  }
  return total * aq.porosity * (aq.retardation ?? 1);
}
