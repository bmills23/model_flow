import { solveSourceLevel } from '@model-flow/engine';
import { forwardAir, type VaporSolveSpec } from '../vapor/forward';

/**
 * One source level solved against a vapor path's forward model (wave V slice V2a): the source whose
 * forward air equals the air level the cleanup screen back-calculated. It is the engine's solve of the
 * modeled cleanup (`cleanup.modeled-chains`: the verified linear shortcut, else a bracket and Brent's
 * method in the logarithm of the source, Brent 1973), run on `forwardAir`; nothing here is a second
 * root finder.
 */
export interface VaporSolved {
  /** The source (SI) whose forward air meets the target; null when it is not reached or the run failed. */
  level: number | null;
  /** The target is above everything the model gives up to the search limit. */
  notReached: boolean;
  /** Why the run failed, when it did (a forward run the engine refused). */
  error?: string;
  /** The largest air (kg/m3) the model gave in the search. */
  maxAir: number;
  /** Relative miss of the air at the level against the target. */
  residual: number;
  /** Messages of the solver (for example a residual above its acceptance). */
  warnings: string[];
}

/** Starting source of the search: 1 mg/kg of soil, or 1 mg/L (1000 mg/m3 of soil gas), in SI. */
const START = { soil: 1e-6, other: 1e-3 } as const;

/**
 * The source (SI) at which `spec`'s forward model gives `target` (kg/m3 of air), searched up to the
 * spec's limit. A target of zero is met at a source of zero (the model is nondecreasing and gives no
 * air from none).
 */
export function solveVaporSource(spec: VaporSolveSpec, target: number, soil: boolean): VaporSolved {
  if (target === 0) {
    return { level: 0, notReached: false, maxAir: 0, residual: 0, warnings: [] };
  }
  const cap = spec.cap?.value;
  const start = soil ? START.soil : START.other;
  try {
    const r = solveSourceLevel({
      metric: (c) => forwardAir(spec, c),
      target,
      reference: cap !== undefined ? Math.min(start, cap / 10) : start,
      cap,
    });
    return {
      level: r.reachable ? r.level : null,
      notReached: !r.reachable,
      maxAir: r.maxMetric,
      residual: r.residual,
      warnings: r.warnings
        .filter((w) => w.code !== 'cleanup.target-not-reachable')
        .map((w) => w.message),
    };
  } catch (e) {
    return {
      level: null,
      notReached: false,
      error: e instanceof Error ? e.message : String(e),
      maxAir: Number.NaN,
      residual: Number.NaN,
      warnings: [],
    };
  }
}
