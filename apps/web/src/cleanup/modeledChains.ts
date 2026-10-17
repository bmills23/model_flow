import {
  dissolvedChain,
  layeredChain,
  saturatedChain,
  tphSource,
  vadsatChain,
  type Chain,
  type TphReport,
  type TphSource,
  type Transport,
  type VerticalBounds,
} from '@model-flow/engine';
import { fedStepLength } from '../transport/compute';
import { makeZOf, type Scenario } from '../transport/form';
import type { ModeledRequest } from './modeledTypes';

export type Method = 'legacy' | 'modern';

const N_TIMES = 24;

/** The scenario with its closure back, for a request that crossed a worker boundary. */
export function sceneOf(req: ModeledRequest): Scenario {
  return { ...req.transport, zOf: makeZOf(req.transport.thickness) };
}

/** Depths of the well screen: one point, or the midpoints of four equal intervals. */
function screenDepths(s: Scenario): number[] {
  const { top, bottom } = s.receptorDepths;
  if (!(bottom > top)) return [top];
  return Array.from({ length: 4 }, (_, k) => top + ((k + 0.5) * (bottom - top)) / 4);
}

/**
 * The M1 method that carries a load to the well: the AT123D-class method for the legacy side, the
 * Wexler method (PATCHF with a finite width, otherwise PATCHI with the screen's vertical bounds) for
 * the modern side, both for the screen's aquifer, source box and receptor.
 */
export function transportOf(s: Scenario, method: Method): Transport {
  const darcyFlux = s.velocity * s.porosity;
  const crossSection = s.srcWidth * s.srcDepth;
  const depths = screenDepths(s);
  if (method === 'legacy') {
    return {
      kind: 'at123d',
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
      darcyFlux,
      crossSection,
      points: depths.map((d) => ({ x: s.receptor.x, y: s.receptor.y, z: s.zOf(d) })),
    };
  }
  const finite = s.thickness !== undefined && s.width !== undefined;
  const yOff = finite ? s.width! / 2 : 0;
  let bounds: VerticalBounds | undefined;
  if (!finite) {
    if (s.thickness !== undefined) bounds = { thickness: s.thickness };
    else if (s.top === 'no-flux') bounds = { waterTable: s.zOf(0) };
  }
  return {
    kind: 'wexler',
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
    ...(finite ? { width: s.width!, thickness: s.thickness! } : {}),
    bounds,
    darcyFlux,
    crossSection,
    points: depths.map((d) => ({ x: s.receptor.x, y: s.receptor.y + yOff, z: s.zOf(d) })),
  };
}

export const LABELS: Record<Method, string> = {
  legacy: 'AT123D-class transport',
  modern: 'Wexler (1992) transport',
};

export interface BuiltChain {
  chain: Chain;
  tph?: TphReport;
  /** Search start from the screen's own source concentration, SI (the chemical in the source soil). */
  sourceStart?: number;
}

function times(time: number): number[] {
  return Array.from({ length: N_TIMES }, (_, k) => (time * (k + 1)) / N_TIMES);
}

/** TPH of the screen's source soil along the search, or none when the screen has no TPH. */
function tphOf(
  F0: number,
  FT: number | undefined,
  MT: number | undefined,
  M: number,
  held: boolean,
): TphSource | null {
  if (FT === undefined) return null;
  return tphSource(F0, FT, held ? 'held' : 'kept', MT === undefined ? undefined : { M, MT });
}

/** The chain of one method for the request's source; throws RangeError for a source the method cannot describe. */
export function buildChain(req: ModeledRequest, method: Method): BuiltChain {
  const s = sceneOf(req);
  const transport = transportOf(s, method);
  const t = times(s.time);
  const src = req.source;
  const base = {
    times: t,
    transport,
    ...(req.start !== undefined ? { reference: req.start } : {}),
  };
  if (src.kind === 'dissolved') {
    return {
      chain: dissolvedChain({
        ...base,
        ...(req.chemical.solubility !== undefined ? { cap: req.chemical.solubility } : {}),
      }),
    };
  }
  const stepLength = fedStepLength(s.time);
  if (src.kind === 'vadose') {
    const v = src.vadose;
    const input = method === 'legacy' ? v.legacy : v.modern;
    if (input === null) {
      throw new RangeError(v.legacyReason ?? 'The legacy method cannot describe this profile.');
    }
    const { F, FT, MT } = input.source;
    const tph = tphOf(F, FT, MT, input.chemical.M, req.tphHeld);
    const at = (f: number) => (tph ? tph.at(f) : { F: f, FT: undefined });
    const withSource = <I extends typeof input>(i: I, f: number): I => {
      const a = at(f);
      return {
        ...i,
        duration: s.time,
        depths: [0],
        profileTimes: [],
        source: { ...i.source, F: a.F, ...(a.FT !== undefined ? { FT: a.FT } : {}) },
      };
    };
    const common = { ...base, stepLength, ...(tph ? { cap: tph.cap } : {}) };
    const chain =
      method === 'legacy'
        ? vadsatChain({ ...common, makeInput: (f) => withSource(v.legacy!, f) })
        : layeredChain({ ...common, makeInput: (f) => withSource(v.modern, f) });
    return {
      chain,
      ...(tph && FT !== undefined ? { tph: { mode: tph.mode, F0: F, FT0: FT } } : {}),
      ...(F > 0 ? { sourceStart: F } : {}),
    };
  }
  // saturated source
  const input = src.input;
  const { F, FT, MT, M } = input.chemical;
  const tph = tphOf(F, FT, MT, M, req.tphHeld);
  const makeInput = (f: number) => {
    const a = tph ? tph.at(f) : { F: f, FT: undefined };
    const { sourceDecayRate: decay, ...rest } = input;
    return {
      ...(method === 'modern' && decay !== undefined ? { ...rest, sourceDecayRate: decay } : rest),
      tEnd: s.time,
      chemical: { ...input.chemical, F: a.F, ...(a.FT !== undefined ? { FT: a.FT } : {}) },
    };
  };
  return {
    chain: saturatedChain({
      ...base,
      stepLength,
      ...(tph ? { cap: tph.cap } : {}),
      method: method === 'legacy' ? 'two-region' : 'exponential',
      makeInput,
    }),
    ...(tph && FT !== undefined ? { tph: { mode: tph.mode, F0: F, FT0: FT } } : {}),
    ...(F > 0 ? { sourceStart: F } : {}),
  };
}
