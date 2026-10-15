import {
  at123dConcentration,
  at123dGrid,
  domenicoConcentration,
  domenicoWarnings,
  patchfConcentration,
  patchfGrid,
  patchiConcentration,
  patchiGrid,
  wellScreenAverage,
  type At123dInput,
  type DomenicoInput,
  type Warning,
  type WexlerInput,
} from '@model-flow/engine';
import type { LoadingTerm, Scenario } from './form';

export type MethodKey = 'legacy' | 'modern' | 'domenico';

export interface ComputeRequest {
  scenario: Scenario;
  mapMethod: 'legacy' | 'modern';
  domenico: boolean;
  nx?: number;
  ny?: number;
  /** Number of time steps on the breakthrough curve (the curve also has the t = 0 point). */
  nCurve?: number;
}

export interface Readouts {
  legacy: number;
  modern: number;
  domenico?: number;
}

export interface ComputeResult {
  xs: number[];
  ys: number[];
  /** Plan-view grid c[ix][iy] in kg/m3 for the chosen map method. */
  grid: number[][];
  /** Times in seconds and concentrations in kg/m3 at the receptor. */
  times: number[];
  series: { legacy: number[]; modern: number[]; domenico?: number[] };
  readouts: Readouts;
  warnings: Warning[];
}

export type ComputeOutcome = { ok: true; result: ComputeResult } | { ok: false; error: string };

const linspace = (a: number, b: number, n: number): number[] =>
  Array.from({ length: n }, (_, i) => (n === 1 ? a : a + ((b - a) * i) / (n - 1)));

/** Superpose constant-source responses F(tau) over loading terms (the problem is linear in the source). */
export function superpose(
  terms: readonly LoadingTerm[],
  time: number,
  f: (tau: number) => number,
): number {
  let sum = 0;
  for (const t of terms) {
    if (t.factor === 0) continue;
    const on = time - t.start;
    if (on <= 0) continue;
    const off = Number.isFinite(t.end) ? time - t.end : -1;
    sum += t.factor * (f(on) - (off > 0 ? f(off) : 0));
  }
  return sum;
}

function superposeGrid(
  terms: readonly LoadingTerm[],
  time: number,
  g: (tau: number) => number[][],
): number[][] {
  let out: number[][] | undefined;
  const add = (grid: number[][], w: number): void => {
    if (!out) out = grid.map((row) => row.map(() => 0));
    grid.forEach((row, i) => row.forEach((v, j) => (out![i]![j]! += w * v)));
  };
  for (const t of terms) {
    if (t.factor === 0) continue;
    const on = time - t.start;
    if (on <= 0) continue;
    add(g(on), t.factor);
    const off = Number.isFinite(t.end) ? time - t.end : -1;
    if (off > 0) add(g(off), -t.factor);
  }
  return out ?? [];
}

function at123dInput(s: Scenario, time: number): At123dInput {
  return {
    aquifer: {
      velocity: s.velocity,
      porosity: s.porosity,
      retardation: s.retardation,
      decayRate: s.decayRate,
      dx: s.dx,
      dy: s.dy,
      dz: s.dz,
      ...(s.thickness !== undefined ? { thickness: s.thickness } : {}),
    },
    source: s.source,
    loading: s.terms.map((t) => ({ start: t.start, end: t.end, rate: s.massRate * t.factor })),
    time,
  };
}

/** PATCHF needs y in [0, W], so a finite aquifer is centred on the source with an offset of W/2. */
function wexler(s: Scenario): {
  params: WexlerInput;
  finite?: { width: number; thickness: number } | undefined;
  yOff: number;
} {
  const finite =
    s.thickness !== undefined && s.width !== undefined
      ? { width: s.width, thickness: s.thickness }
      : undefined;
  const yOff = finite ? finite.width / 2 : 0;
  return {
    params: {
      velocity: s.velocity,
      retardation: s.retardation,
      decayRate: s.decayRate,
      dx: s.dx,
      dy: s.dy,
      dz: s.dz,
      c0: s.c0,
      patch: { y1: s.source.y1 + yOff, y2: s.source.y2 + yOff, z1: s.source.z1, z2: s.source.z2 },
    },
    finite,
    yOff,
  };
}

function domenicoInput(s: Scenario): DomenicoInput {
  return {
    velocity: s.velocity,
    retardation: s.retardation,
    decayRate: s.decayRate,
    alphaL: s.alphaL,
    alphaT: s.alphaT,
    alphaV: s.alphaV,
    c0: s.c0,
    sourceWidth: s.srcWidth,
    sourceThickness: s.srcDepth,
  };
}

function depthAverage(s: Scenario, profile: (depth: number) => number, intervals: number): number {
  const { top, bottom } = s.receptorDepths;
  return bottom > top ? wellScreenAverage(profile, top, bottom, intervals) : profile(top);
}

/** Receptor concentration for one method and time, averaged over the screen when there is one. */
export function receptorConcentration(
  s: Scenario,
  method: MethodKey,
  time: number,
  intervals = 4,
  flags?: { notConverged: boolean },
): number {
  const { x, y } = s.receptor;
  if (method === 'legacy') {
    const input = at123dInput(s, time);
    return depthAverage(s, (d) => at123dConcentration(input, { x, y, z: s.zOf(d) }), intervals);
  }
  if (method === 'modern') {
    const w = wexler(s);
    return depthAverage(
      s,
      (d) =>
        superpose(s.terms, time, (tau) => {
          const p = { x, y: y + w.yOff, z: s.zOf(d) };
          if (!w.finite) return patchiConcentration(w.params, p, tau);
          const r = patchfConcentration(w.params, p, tau, w.finite);
          if (!r.converged && flags) flags.notConverged = true;
          return r.value;
        }),
      intervals,
    );
  }
  const input = domenicoInput(s);
  return depthAverage(
    s,
    (d) => superpose(s.terms, time, (tau) => domenicoConcentration(input, { x, y, z: d }, tau)),
    intervals,
  );
}

function mapDepths(s: Scenario): { depths: number[]; weights: number[] } {
  const { top, bottom } = s.receptorDepths;
  if (!(bottom > top)) return { depths: [top], weights: [1] };
  const n = 5;
  const depths = linspace(top, bottom, n);
  const weights = depths.map((_, i) => (i === 0 || i === n - 1 ? 0.5 : 1) / (n - 1));
  return { depths, weights };
}

/** Plan-view grid at the receptor depth (or the trapezoid average over the screen) for one method. */
export function plumeGrid(
  s: Scenario,
  method: 'legacy' | 'modern',
  xs: readonly number[],
  ys: readonly number[],
  flags?: { notConverged: boolean },
): number[][] {
  const { depths, weights } = mapDepths(s);
  let acc: number[][] | undefined;
  depths.forEach((d, k) => {
    const z = s.zOf(d);
    let g: number[][];
    if (method === 'legacy') {
      g = at123dGrid(at123dInput(s, s.time), xs, ys, z);
    } else {
      const w = wexler(s);
      const ysh = ys.map((y) => y + w.yOff);
      g = superposeGrid(s.terms, s.time, (tau) =>
        w.finite
          ? patchfGrid(w.params, xs, ysh, z, tau, w.finite)
          : patchiGrid(w.params, xs, ysh, z, tau),
      );
    }
    if (g.length === 0) g = xs.map(() => ys.map(() => 0));
    const wgt = weights[k]!;
    if (!acc) acc = g.map((row) => row.map(() => 0));
    g.forEach((row, i) => row.forEach((v, j) => (acc![i]![j]! += wgt * v)));
  });
  void flags;
  return acc ?? [];
}

function collectWarnings(
  s: Scenario,
  req: ComputeRequest,
  flags: { notConverged: boolean },
): Warning[] {
  const out: Warning[] = [...s.notes];
  const add = (code: string, message: string): void => {
    if (!out.some((w) => w.code === code)) out.push({ code, message });
  };
  if (s.receptor.x <= 0) {
    add(
      'ui.receptor-in-source',
      'The receptor x is at or upgradient of the source face (x <= 0); Wexler and Domenico report zero there.',
    );
  }
  if (s.thickness !== undefined && s.width === undefined) {
    add(
      'ui.wexler-infinite-width',
      'The aquifer width is blank, so the Wexler method uses PATCHI (infinite width and depth). Enter a width to use the finite PATCHF solution.',
    );
  }
  if (s.thickness !== undefined && req.domenico) {
    add(
      'ui.domenico-ignores-bounds',
      'The Domenico comparison ignores the finite aquifer thickness and width.',
    );
  }
  if (s.terms.some((t) => t.factor !== 1 || Number.isFinite(t.end))) {
    add(
      'ui.superposition',
      'Pulse and stepped loading are applied to the Wexler and Domenico methods by superposing the constant-concentration solution (the transport problem is linear in the source).',
    );
  }
  add(
    'ui.source-basis',
    'The legacy method releases a mass rate (source concentration times Darcy flux times source area) through the source volume; the modern method holds the source concentration fixed on the inflow plane. Expect the two to differ near the source.',
  );
  if (flags.notConverged) {
    add(
      'wexler.series-not-converged',
      'The PATCHF series did not converge at one or more points; those values come from the integral form and carry more numerical uncertainty.',
    );
  }
  if (req.domenico) {
    const z = (s.receptorDepths.top + s.receptorDepths.bottom) / 2;
    for (const w of domenicoWarnings(
      domenicoInput(s),
      { x: s.receptor.x, y: s.receptor.y, z },
      s.time,
    )) {
      add(w.code, w.message);
    }
  }
  return out;
}

export function compute(req: ComputeRequest): ComputeOutcome {
  try {
    const s = req.scenario;
    const nx = req.nx ?? 100;
    const ny = req.ny ?? 60;
    const nCurve = req.nCurve ?? 32;
    const flags = { notConverged: false };
    const xs = linspace(s.extent.xMin, s.extent.xMax, nx);
    const ys = linspace(-s.extent.yHalf, s.extent.yHalf, ny);
    const grid = plumeGrid(s, req.mapMethod, xs, ys, flags);

    const times = [0, ...linspace(s.time / nCurve, s.time, nCurve)];
    const curve = (m: MethodKey): number[] =>
      times.map((t) => (t <= 0 ? 0 : receptorConcentration(s, m, t, 4, flags)));
    const series: ComputeResult['series'] = { legacy: curve('legacy'), modern: curve('modern') };
    if (req.domenico) series.domenico = curve('domenico');

    // readouts use the finer 10-interval screen average at the evaluation time
    const readouts: Readouts = {
      legacy: receptorConcentration(s, 'legacy', s.time, 10, flags),
      modern: receptorConcentration(s, 'modern', s.time, 10, flags),
    };
    if (req.domenico) readouts.domenico = receptorConcentration(s, 'domenico', s.time, 10, flags);

    return {
      ok: true,
      result: { xs, ys, grid, times, series, readouts, warnings: collectWarnings(s, req, flags) },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
