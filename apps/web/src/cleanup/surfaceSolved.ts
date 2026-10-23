import { fmtSource } from './format';
import type { SurfaceSolved, SurfaceSolveJob, SurfaceSolves } from './surfaceSolve';

export const SEND_AGAIN =
  'Send the surface water result again from the surface water screen so the level can be solved.';

/** A reason with the instruction to send the result again, one full stop between them. */
export const sendAgain = (why: string): string => `${why.replace(/\.$/, '')}. ${SEND_AGAIN}`;

/** How a surface water source level was found: dividing by the run's coefficient, or solving the forward run. */
export type LevelPath = 'linear' | 'solved';

export const LEVEL_PATH_TEXT: Record<LevelPath, string> = {
  linear: 'linear (target over the run coefficient)',
  solved: 'solved (forward run inverted)',
};

/** The source medium of a surface water source level and the unit it prints in. */
export const SOURCE_UNITS = {
  groundwater: { unit: 'mg/L', fromSi: 1e3, label: 'Groundwater source' },
  soil: { unit: 'mg/kg', fromSi: 1e6, label: 'Soil source' },
} as const;

export interface SolvedLevel {
  level: number | null;
  /** Why there is no level; null when there is one. */
  reason: string | null;
  warnings: string[];
  /** How the solve ended, for the table and the CSV. */
  detail: string;
}

/** The text of the search ceiling that was hit, with the value in the unit of the source. */
function limitText(s: SurfaceSolved, medium: 'groundwater' | 'soil'): string {
  const u = SOURCE_UNITS[medium];
  if (s.limit === null) return 'the search range (40 decades of source concentration)';
  return medium === 'groundwater'
    ? `the solubility entered on the surface water run (${fmtSource(s.limit, u.fromSi)} ${u.unit})`
    : `the limit of a soil source (${fmtSource(s.limit, u.fromSi)} ${u.unit}, pure substance or the bound the TPH sets)`;
}

/**
 * Reads one solve: the level, or why there is none, in the words of the panel. A target the source cannot
 * reach up to its limit is shown as not reached with the limit and the most the surface water gets to
 * there; a source that moves nothing to the surface water stays not quantified. `surface` is the unit the
 * surface water concentrations print in.
 */
export function interpretSolved(
  s: SurfaceSolved,
  medium: 'groundwater' | 'soil',
  surface: { fromSi: number; unit: string },
  csat?: number,
): SolvedLevel {
  const u = SOURCE_UNITS[medium];
  const warnings = [...s.warnings];
  if (s.reason !== null) return { level: null, reason: s.reason, warnings, detail: 'not solved' };
  if (!s.reached || s.level === null) {
    if (!(s.maxSurface > 0)) {
      return {
        level: null,
        reason:
          'Nothing transfers from this source to the surface water (it stays at zero at every source up to the limit), so there is no risk-based source level.',
        warnings,
        detail: 'zero transfer',
      };
    }
    return {
      level: null,
      reason: `The surface water target (${fmtSource(s.target, surface.fromSi)} ${surface.unit}) is not reached: at ${limitText(s, medium)} the surface water peaks at ${fmtSource(s.maxSurface, surface.fromSi)} ${surface.unit}, so no source up to the limit meets it.`,
      warnings,
      detail: 'not reached',
    };
  }
  if (medium === 'soil' && csat !== undefined && s.level > csat) {
    warnings.push(
      `The soil level (${fmtSource(s.level, u.fromSi)} ${u.unit}) exceeds the soil saturation concentration (${fmtSource(csat, u.fromSi)} ${u.unit}); free product may be present.`,
    );
  }
  const detail =
    s.solver === 'linear'
      ? 'linear shortcut, verified by a second forward run'
      : s.solver === 'cap'
        ? 'the limit itself meets the target'
        : `Brent's method in the logarithm of the source, ${s.evaluations} forward runs`;
  return { level: s.level, reason: null, warnings, detail };
}

/** The solved result for one target of a job: undefined while the job has no result or the target no solve. */
export function solvedFor(
  job: SurfaceSolveJob,
  solves: SurfaceSolves | undefined,
  target: number | null,
): {
  pending: boolean;
  error: string | null;
  medium: 'groundwater' | 'soil';
  solved?: SurfaceSolved;
} {
  const res = solves?.get(job.key);
  const medium = job.route === 'groundwater' ? 'groundwater' : 'soil';
  if (res === undefined) return { pending: true, error: null, medium };
  if (res.error !== null) return { pending: false, error: res.error, medium };
  const solved = target === null ? undefined : res.solved.find((x) => x.target === target);
  return { pending: false, error: null, medium, ...(solved ? { solved } : {}) };
}

/** The distinct jobs behind rows, in order of first use. */
export function jobsOf(rows: readonly { job?: SurfaceSolveJob | null }[]): SurfaceSolveJob[] {
  const seen = new Set<string>();
  const out: SurfaceSolveJob[] = [];
  for (const r of rows) {
    if (r.job && !seen.has(r.job.key)) {
      seen.add(r.job.key);
      out.push(r.job);
    }
  }
  return out;
}
