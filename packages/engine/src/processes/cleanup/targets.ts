import type { Warning } from '../../registry/index.js';
import { pos } from './checks.js';

/**
 * Targets of the cleanup levels (`docs/methods/cleanup-levels.md`, "Targets"): the risk targets of both
 * back-calculation methods and the groundwater concentration targets (an MCL or a user value). SI inside
 * (kg/m^3); the caller converts from mg/L or ug/L at the boundary.
 */

export const DEFAULT_TARGET_RISK = 1e-6;
export const DEFAULT_TARGET_HQ = 1;
/** Above this the linear risk form is itself warned in the forward process (M4). */
export const RISK_LINEAR_LIMIT = 0.01;

export interface RiskTargets {
  /** Target incremental lifetime cancer risk; default 1e-6. */
  risk?: number;
  /** Target hazard quotient; default 1. */
  hq?: number;
}

export interface ResolvedRiskTargets {
  risk: number;
  hq: number;
  warnings: Warning[];
}

export function resolveRiskTargets(t: RiskTargets = {}): ResolvedRiskTargets {
  const risk = t.risk ?? DEFAULT_TARGET_RISK;
  const hq = t.hq ?? DEFAULT_TARGET_HQ;
  pos('target risk', risk);
  pos('target hazard quotient', hq);
  const warnings: Warning[] = [];
  if (risk > RISK_LINEAR_LIMIT) {
    warnings.push({
      code: 'cleanup.target-above-0.01',
      message: `target cancer risk ${risk} exceeds 0.01; the linear risk form overstates risk at that level`,
    });
  }
  return { risk, hq, warnings };
}

export type ConcentrationTargetSpec = { kind: 'user'; value: number } | { kind: 'mcl' };

/** The MCL of a chemical from the database, kg/m^3; `group` marks a value that applies to a group. */
export interface Mcl {
  value: number;
  group?: boolean;
}

export interface ResolvedConcentrationTarget {
  /** kg/m^3, or null when the MCL was asked for and the database has none (risk targets stay in force). */
  value: number | null;
  warnings: Warning[];
}

export function resolveConcentrationTarget(
  chemical: string,
  spec: ConcentrationTargetSpec,
  mcl?: Mcl,
): ResolvedConcentrationTarget {
  if (spec.kind === 'user') {
    pos(`${chemical}: concentration target`, spec.value);
    return { value: spec.value, warnings: [] };
  }
  if (mcl === undefined) {
    return {
      value: null,
      warnings: [
        {
          code: 'cleanup.mcl-missing',
          message: `${chemical}: no MCL in the database; the risk targets stay in force`,
        },
      ],
    };
  }
  pos(`${chemical}: MCL`, mcl.value);
  const warnings: Warning[] =
    mcl.group === true
      ? [
          {
            code: 'cleanup.mcl-group-value',
            message: `${chemical}: the MCL applies to a group of chemicals, not to this one alone`,
          },
        ]
      : [];
  return { value: mcl.value, warnings };
}

export type Allocation = 'individual' | 'cumulative' | 'equal';

/** Concentration targets ignore additivity, so only the individual mode accepts them (RangeError). */
export function checkAllocationTargets(
  allocation: Allocation,
  withTargets: readonly string[],
): void {
  if (allocation !== 'individual' && withTargets.length > 0) {
    throw new RangeError(
      `concentration targets are not accepted with ${allocation} allocation (${withTargets.join(', ')})`,
    );
  }
}
