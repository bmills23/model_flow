import {
  at123dConcentration,
  at123dGrid,
  domenicoConcentration,
  domenicoWarnings,
  patchfConcentration,
  patchfGrid,
  patchiConcentration,
  patchiGrid,
  fluxToLoadingSteps,
  toConcentrationSteps,
  wellScreenAverage,
  type At123dInput,
  type ConcentrationStep,
  type DomenicoInput,
  type LoadingStep,
  type VerticalBounds,
  type Warning,
  type WexlerInput,
} from '@model-flow/engine';
import { vadoseFluxSeries } from '../vadose/compute';
import { saturatedFedSteps } from '../saturated/steps';
import type { Scenario } from './form';

/**
 * A vadose-fed schedule is cut into steps of a month, but never into more than this many, which
 * keeps the superposition (cost linear in the step count) responsive: monthly steps over 25 years
 * took about 45 s for a full map and curve. At the cap a step is time / FED_MAX_STEPS long (2.5
 * months at 10 years, 12.5 months at 50 years). Every step carries exactly the mass that crossed
 * the water table during it whatever its length; only the timing within a step is lumped.
 */
export const FED_MAX_STEPS = 48;
const MONTH = (365.25 * 86400) / 12;

/** The step length of a vadose-fed schedule over `time` seconds. */
export const fedStepLength = (time: number): number => Math.max(MONTH, time / FED_MAX_STEPS);

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

/**
 * The mass-release schedule of a vadose-fed source over [0, evaluation time]: the vadose method is
 * run for that time and its water-table flux, projected over the source footprint, is cut into
 * steps that each carry the exact mass that crossed the water table during them (the vadose
 * run's own cumulative delivery). The step length is a month, lengthened only to keep the
 * superposition to FED_MAX_STEPS steps; see FED_MAX_STEPS for the bound.
 */
export function fedSteps(s: Scenario): LoadingStep[] {
  return fedResolved(s).steps;
}

function fedResolved(s: Scenario): { steps: LoadingStep[]; fallback: boolean } {
  if (!s.fed) return { steps: [], fallback: false };
  if (s.fed.saturated) {
    // the saturated release schedule is closed form: the steps carry its exact delivered mass
    return saturatedFedSteps(
      s.fed.saturated,
      s.fed.method,
      s.time,
      fedStepLength(s.time),
      FED_MAX_STEPS,
    );
  }
  const series = vadoseFluxSeries(s.fed.vadose!, s.fed.method, s.time);
  return {
    steps: fluxToLoadingSteps(series, s.srcLength * s.srcWidth, s.time, fedStepLength(s.time)),
    fallback: false,
  };
}

/** The scenario with a vadose-fed schedule resolved once, so per-point calls do not rerun the vadose method. */
export function withFedSteps(s: Scenario): Scenario {
  if (!s.fed || s.fed.steps) return s;
  const { steps, fallback } = fedResolved(s);
  return {
    ...s,
    fed: { ...s.fed, steps, ...(s.fed.saturated ? { seasonalFallback: fallback } : {}) },
  };
}

function requireSteps(s: Scenario): LoadingStep[] {
  if (!s.fed?.steps) throw new Error('The vadose-fed schedule was not resolved before computing.');
  return s.fed.steps;
}

/**
 * Boundary-concentration loading for the engine's Wexler and Domenico methods: c0 times the step
 * factor. Zero-length steps are dropped (the engine rejects them); undefined means continuous.
 * A vadose-fed schedule becomes concentrations by the same source-basis rule as the typed strength:
 * mass rate over the Darcy flux times the source cross-section.
 */
function concentrationLoading(s: Scenario): ConcentrationStep[] | undefined {
  if (s.fed) {
    return toConcentrationSteps(requireSteps(s), s.velocity * s.porosity, s.srcWidth * s.srcDepth);
  }
  if (
    s.terms.length === 1 &&
    s.terms[0]!.start === 0 &&
    s.terms[0]!.end === Infinity &&
    s.terms[0]!.factor === 1
  )
    return undefined;
  return s.terms
    .filter((t) => t.end > t.start)
    .map((t) => ({ start: t.start, end: t.end, concentration: s.c0 * t.factor }));
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
      ...(s.top ? { top: s.top } : {}),
    },
    source: s.source,
    loading: s.fed
      ? requireSteps(s)
      : s.terms.map((t) => ({ start: t.start, end: t.end, rate: s.massRate * t.factor })),
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

/**
 * The vertical boundaries PATCHI must honour when the screen has no PATCHF width. PATCHI has no z
 * boundary of its own, so without this the held concentration would diffuse upward through the
 * water table. An infinitely deep aquifer has a no-flux water table (the AT123D ruling), and a finite
 * thickness without a width has no-flux top and bottom; both are applied as image patches inside
 * the engine's PATCHI (see docs/methods/groundwater-transport.md). A scenario with neither is the
 * whole-space PATCHI.
 */
function verticalBounds(s: Scenario): VerticalBounds | undefined {
  if (s.thickness !== undefined) return { thickness: s.thickness };
  return s.top === 'no-flux' ? { waterTable: s.zOf(0) } : undefined;
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
    const loading = concentrationLoading(s);
    return depthAverage(
      s,
      (d) => {
        const p = { x, y: y + w.yOff, z: s.zOf(d) };
        if (!w.finite) return patchiConcentration(w.params, p, time, loading, verticalBounds(s));
        const r = patchfConcentration(w.params, p, time, w.finite, loading);
        if (!r.converged && flags) flags.notConverged = true;
        return r.value;
      },
      intervals,
    );
  }
  const input = domenicoInput(s);
  const loading = concentrationLoading(s);
  return depthAverage(
    s,
    (d) => domenicoConcentration(input, { x, y, z: d }, time, loading),
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
      const loading = concentrationLoading(s);
      g = w.finite
        ? patchfGrid(w.params, xs, ysh, z, s.time, w.finite, undefined, loading)
        : patchiGrid(w.params, xs, ysh, z, s.time, undefined, loading, verticalBounds(s));
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
      'The aquifer width is blank, so the Wexler method uses PATCHI with infinite width and the no-flux top and bottom of the layer. Enter a width to use the finite PATCHF solution.',
    );
  }
  if (s.thickness !== undefined && req.domenico) {
    add(
      'ui.domenico-ignores-bounds',
      'The Domenico comparison ignores the finite aquifer thickness and width.',
    );
  }
  if (s.fed?.saturated) {
    add(
      'ui.saturated-feed',
      `The source is fed by the saturated soil source (${s.fed.label}) as ${s.fed.steps?.length ?? 0} mass-release steps over the evaluation time, released into a ${s.srcLength} m by ${s.srcWidth} m box ${s.srcDepth} m deep at the water table. The porosity, hydraulic conductivity, gradient and organic carbon partitioning come from the saturated screen, so they set the flow and retardation here too.${
        s.thickness === undefined
          ? ' The infinitely deep aquifer has a no-flux water table at its top (Yeh 1981), so the released mass stays in the aquifer.'
          : ' The top of the finite aquifer is the no-flux water table.'
      }`,
    );
    if (s.fed.seasonalFallback) {
      add(
        'ui.saturated-seasonal-fallback',
        `The seasonal water-table schedule needs more than ${FED_MAX_STEPS} loading steps over this evaluation time, so whole-year steps are fed instead. Each step carries the seasonal schedule's exact mass, so the cumulative mass is exact at every step boundary and only the timing within a step is lost.`,
      );
    }
  } else if (s.fed) {
    add(
      'ui.vadose-feed',
      `The source is fed by the vadose result (${s.fed.label}) as ${s.fed.steps?.length ?? 0} mass-release steps over the evaluation time, over the vadose source footprint. The source box keeps its ${s.srcDepth} m thickness below the water table.${
        s.thickness === undefined
          ? ' The infinitely deep aquifer has a no-flux water table at its top (Yeh 1981), so the delivered mass stays in the aquifer.'
          : ' The top of the finite aquifer is the no-flux water table.'
      }`,
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
      undefined,
      concentrationLoading(s),
    )) {
      add(w.code, w.message);
    }
  }
  return out;
}

export function compute(req: ComputeRequest): ComputeOutcome {
  try {
    const s = withFedSteps(req.scenario);
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
    // The engine throws RangeError for invalid inputs; surface its message as an input error.
    if (e instanceof RangeError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
