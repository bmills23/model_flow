import type {
  DirectReceptor,
  LegacyChemical,
  LegacyReceptor,
  ModeledEndpoint,
  ModeledResult,
  ModernChemical,
  ModernReceptor,
  RiskTargets,
  SaturatedSourceInput,
} from '@model-flow/engine';
import type { Scenario } from '../transport/form';
import type { VadoseScenario } from '../vadose/form';

export type ModeledSource =
  | { kind: 'dissolved' }
  | { kind: 'vadose'; vadose: VadoseScenario }
  | { kind: 'saturated'; input: SaturatedSourceInput };

export type ModeledTarget = { kind: 'risk' } | { kind: 'mcl' } | { kind: 'user'; value: number };

/**
 * Everything a modeled-chain run needs, as plain data (structured-cloneable, so it can be posted to a
 * worker). SI throughout: kg/kg, kg/m3, s.
 */
export interface ModeledRequest {
  /** The groundwater screen's scenario without its `zOf` closure (rebuilt from `thickness`). */
  transport: Omit<Scenario, 'zOf'>;
  source: ModeledSource;
  chemical: {
    id: string;
    name: string;
    /** Soil saturation concentration, kg/kg. */
    csat?: number;
    /** Aqueous solubility, kg/m3: the ceiling of a dissolved source. */
    solubility?: number;
    /** Database MCL, kg/m3. */
    mcl?: number;
    mclGroup?: boolean;
  };
  legacy: { receptors: DirectReceptor<LegacyReceptor>[]; chemical: LegacyChemical };
  modern: { receptors: DirectReceptor<ModernReceptor>[]; chemical: ModernChemical };
  targets: RiskTargets;
  target: ModeledTarget;
  /** Averaging time of a concentration target, s; 0 is the peak. */
  windowSeconds: number;
  additive: boolean;
  secantParity: boolean;
  tphHeld: boolean;
  /** Starting source concentration, SI. */
  start?: number;
  /** Run one method only (tests). */
  only?: 'legacy' | 'modern';
}

export interface MetricCurve {
  /** Source concentration, SI. */
  conc: number[];
  cancer: number[];
  hi: number[];
  /** Averaged well peak, kg/m3 (null entries when the chain has no well series). */
  peak: (number | null)[];
}

export interface Convergence {
  method: 'linear' | 'brent' | 'cap' | 'none';
  evaluations: number;
  iterations: number;
  /** Relative residual |metric / target - 1| at the level; NaN when not reachable. */
  residual: number;
  /** The residual the solve accepts (1e-9, or 1e-3 for the layered finite-volume chain). */
  acceptance: number;
  secant?: { level: number; iterations: number; converged: boolean };
}

export interface ModeledRun {
  result: ModeledResult;
  /** The endpoint drawn and reported on, with its target in the metric's own unit. */
  shown: { endpoint: ModeledEndpoint; target: number };
  curve: MetricCurve;
  convergence: Convergence;
  /** Search start and ceiling, SI. */
  start: number;
  cap: number | null;
  numerical: boolean;
  /** The transport method behind this run. */
  transportLabel: string;
}

export type ModeledMethodOutcome = { ok: true; run: ModeledRun } | { ok: false; error: string };

export interface ModeledOutcome {
  /** Medium of the solved concentration. */
  medium: 'soil' | 'groundwater';
  legacy?: ModeledMethodOutcome;
  modern?: ModeledMethodOutcome;
}
