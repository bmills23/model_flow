import { convert } from '@model-flow/engine';
import type { RunSummary } from './compute';

const DAY = 86400;
const YR = convert(1, 'yr', 's');

/** Four significant figures; zero as 0, no depletion as "none". */
export function fmt(v: number): string {
  if (v === 0) return '0';
  if (!Number.isFinite(v)) return 'none';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-3) return v.toExponential(3).replace('e-0', 'e-').replace('e+0', 'e+');
  return String(Number(v.toPrecision(4)));
}

export interface Row {
  label: string;
  values: string[];
}

/** Unsaturated and saturated thickness of the source at low and high water, m. */
export function sectionLevels(
  levels: RunSummary['levels'],
  thickness: number,
): { low: { unsat: number; sat: number }; high: { unsat: number; sat: number } } {
  return {
    low: { unsat: thickness - levels.hLo, sat: levels.hLo },
    high: { unsat: thickness - levels.hHi, sat: levels.hHi },
  };
}

const MG_PER_L = 1e3;
const MG_PER_KG = 1e6;

/** Per-region state, region 1 (above the water table) then region 2 (below it). */
export function regionRows(run: RunSummary): Row[] {
  const regions = [run.regions.unsaturated, run.regions.saturated];
  const row = (label: string, f: (r: NonNullable<(typeof regions)[number]>) => string): Row => ({
    label,
    values: regions.map((r) => (r ? f(r) : 'none')),
  });
  return [
    row('Water content (-)', (r) => fmt(r.theta)),
    row('Equilibrium pore water, no separate phase (mg/L)', (r) => fmt(r.ceq * MG_PER_L)),
    row('Mole fraction in the hydrocarbon x (-)', (r) => fmt(r.x)),
    row('Effective solubility x S (mg/L)', (r) => fmt(r.effS * MG_PER_L)),
    row('Separate phase present', (r) => (r.residual ? 'Yes' : 'No')),
    row('Pore-water concentration released (mg/L)', (r) => fmt(r.c * MG_PER_L)),
    row('Soil saturation limit (mg/kg)', (r) => fmt(r.fSat * MG_PER_KG)),
  ];
}

const KG_D = (kgPerS: number): string => fmt(kgPerS * DAY);

/** Rates, mass and time scales, one column per method. */
export function releaseRows(runs: readonly RunSummary[]): Row[] {
  const col = (f: (r: RunSummary) => string): string[] => runs.map(f);
  const td = (r: RunSummary): string =>
    Number.isFinite(r.depletionTime)
      ? `${fmt(r.depletionTime / DAY)} d (${fmt(r.depletionTime / YR)} yr)`
      : 'none';
  return [
    { label: 'Initial mass M0 (kg)', values: col((r) => fmt(r.initialMass)) },
    { label: 'Region 1 rate at low water (kg/d)', values: col((r) => KG_D(r.rates.low.q1)) },
    { label: 'Region 2 rate at low water (kg/d)', values: col((r) => KG_D(r.rates.low.q2)) },
    { label: 'Region 1 rate at high water (kg/d)', values: col((r) => KG_D(r.rates.high.q1)) },
    { label: 'Region 2 rate at high water (kg/d)', values: col((r) => KG_D(r.rates.high.q2)) },
    { label: 'Annual mean rate (kg/d)', values: col((r) => KG_D(r.rates.mean)) },
    { label: 'Source exhausted at t_d', values: col(td) },
    {
      label: 'Decline constant gamma',
      values: col((r) => (r.gamma === undefined ? 'none' : `${fmt(r.gamma * YR)} per year`)),
    },
    {
      label: 'Half-life of the source (yr)',
      values: col((r) =>
        r.gamma !== undefined && r.gamma > 0 ? fmt(Math.LN2 / (r.gamma * YR)) : 'none',
      ),
    },
    { label: 'Delivered by the horizon (kg)', values: col((r) => fmt(r.budget.delivered)) },
    {
      label: 'Left in the source at the horizon (kg)',
      values: col((r) => fmt(r.budget.remaining)),
    },
    { label: 'Lost to source decay (kg)', values: col((r) => fmt(r.budget.decayed)) },
  ];
}
