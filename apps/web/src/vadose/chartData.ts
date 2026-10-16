import { convert } from '@model-flow/engine';
import type { Budget, RunSummary, VadoseMethod } from './compute';

const MG_PER_L = 1e3;
const DAY = 86400;

/** Flux through the water table, kg/m2/s to g/m2/d. */
export const fluxGPerM2Day = (kgM2s: number): number => kgM2s * 1e3 * DAY;
/** Mass rate to groundwater, kg/s to kg/d. */
export const massRateKgPerDay = (kgS: number): number => kgS * DAY;

const toYr = (s: number): number => convert(s, 's', 'yr');
const yrLabel = (s: number): string => `${Number(toYr(s).toPrecision(3))} yr`;

export interface ProfileCurve {
  label: string;
  timeYr: number;
  /** Concentration at each depth, mg/L. */
  values: number[];
}

/** The depth profiles of a run, one curve per profile time, in mg/L. */
export function profileCurves(run: RunSummary): { depths: number[]; curves: ProfileCurve[] } {
  return {
    depths: run.profiles.depths,
    curves: run.profiles.times.map((t, k) => ({
      label: yrLabel(t),
      timeYr: toYr(t),
      values: run.profiles.concentrations[k]!.map((c) => c * MG_PER_L),
    })),
  };
}

export interface LayerBand {
  name: string;
  /** Depth below the base of the source, m. */
  top: number;
  bottom: number;
}

/** The layers between the base of the source and the water table, as depth bands. */
export function layerBands(run: RunSummary): LayerBand[] {
  const below = run.layers.filter((l) => l.retardation !== undefined);
  let top = 0;
  return below.map((l) => {
    const band = { name: l.name, top, bottom: top + l.thickness };
    top += l.thickness;
    return band;
  });
}

export type Measure = 'concentration' | 'flux';

/** Water-table concentration (mg/L) or flux (g/m2/d) against time in years, per available method. */
export function waterTableSeries(
  runs: Partial<Record<VadoseMethod, RunSummary>>,
  measure: Measure,
): { timesYr: number[]; values: Partial<Record<VadoseMethod, number[]>> } {
  const first = runs.legacy ?? runs.modern;
  const values: Partial<Record<VadoseMethod, number[]>> = {};
  for (const m of ['legacy', 'modern'] as const) {
    const r = runs[m];
    if (!r) continue;
    values[m] =
      measure === 'concentration'
        ? r.series.waterTable.map((c) => c * MG_PER_L)
        : r.series.flux.map(fluxGPerM2Day);
  }
  return { timesYr: (first?.series.times ?? []).map(toYr), values };
}

export type BudgetKey = 'source' | 'volatilized' | 'transit' | 'delivered' | 'sourceDecayed';

/**
 * Stack order, bottom to top, and the colour slot of each category. The slots are the third to the
 * seventh categorical hues, a run of the validated palette, so every adjacent pair is validated
 * (source decay is last because it is zero unless the person enters a source decay rate).
 */
export const BUDGET_ORDER: BudgetKey[] = [
  'source',
  'volatilized',
  'transit',
  'delivered',
  'sourceDecayed',
];

export const BUDGET_LABEL: Record<BudgetKey, string> = {
  source: 'Still in the source',
  volatilized: 'Volatilized',
  transit: 'In transit',
  delivered: 'Delivered to the water table',
  sourceDecayed: 'Decayed in the source',
};

export interface StackBand {
  key: BudgetKey;
  lower: number[];
  upper: number[];
}

/** Cumulative mass over time (kg) in the stacked categories; the categories add up to the initial mass. */
export function budgetStack(run: RunSummary): {
  timesYr: number[];
  categories: { key: BudgetKey; label: string; values: number[] }[];
  bands: StackBand[];
} {
  const s = run.series;
  const n = s.times.length;
  const series: Record<BudgetKey, number[]> = {
    source: s.sourceMass,
    volatilized: s.volatilized,
    transit: s.leached.map((l, k) => Math.max(0, l - s.delivered[k]!)),
    delivered: s.delivered,
    sourceDecayed: s.sourceDecayed,
  };
  const keys = BUDGET_ORDER.filter(
    (k) => k !== 'sourceDecayed' || series.sourceDecayed.some((v) => v > 0),
  );
  const categories = keys.map((key) => ({ key, label: BUDGET_LABEL[key], values: series[key] }));
  let running: number[] = new Array<number>(n).fill(0);
  const bands = categories.map((c) => {
    const lower = running;
    const upper = lower.map((v, k) => v + c.values[k]!);
    running = upper;
    return { key: c.key, lower, upper };
  });
  return { timesYr: s.times.map(toYr), categories, bands };
}

export interface BudgetRow {
  key: string;
  label: string;
  kg: number;
  percent: number;
  /** Nesting level in the table (0 = a part of the initial mass). */
  level: 0 | 1;
  note?: string;
}

/** The end-of-run mass budget as table rows. */
export function budgetRows(run: RunSummary): BudgetRow[] {
  const b: Budget = run.budget;
  const pct = (kg: number): number => (b.initial > 0 ? (100 * kg) / b.initial : 0);
  const row = (key: string, label: string, kg: number, level: 0 | 1, note?: string): BudgetRow => ({
    key,
    label,
    kg,
    percent: pct(kg),
    level,
    ...(note ? { note } : {}),
  });
  const rows: BudgetRow[] = [
    row('initial', 'Initial mass in the source', b.initial, 0),
    row('source', 'Still in the source', b.source, 0),
    row('volatilized', 'Volatilized to the ground surface', b.volatilized, 0),
  ];
  if (b.sourceDecayed > 0)
    rows.push(row('sourceDecayed', 'Decayed in the source', b.sourceDecayed, 0));
  rows.push(row('leached', 'Leached from the source', b.leached, 0));
  rows.push(row('delivered', 'Delivered to the water table', b.delivered, 1));
  rows.push(row('inProfile', 'Held in the profile', b.inProfile, 1));
  rows.push(
    row(
      'transitLoss',
      run.method === 'legacy' ? 'Lost in transit' : 'Decayed in transit',
      b.transitLoss,
      1,
      run.method === 'legacy'
        ? 'Decay plus the dispersive flux across the water table, which the legacy delivery (advective only) leaves out.'
        : undefined,
    ),
  );
  if (run.method === 'legacy') {
    rows.push(
      row(
        'inletExcess',
        'Admitted by the inlet beyond the leaching loss',
        b.inletExcess,
        1,
        'The legacy first-type inlet also admits a dispersive influx that is not debited from the source. The three rows above add up to leached plus this row.',
      ),
    );
  }
  return rows;
}

/**
 * Vertical label positions: keeps `gap` between neighbours, in order, inside [lo, hi]. Labels are
 * ordered by their wanted position; a crowd is spread symmetrically about its centre.
 */
export function spreadLabels(
  wanted: readonly number[],
  gap: number,
  lo: number,
  hi: number,
): number[] {
  const order = wanted.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const pos = order.map((o) => Math.min(hi, Math.max(lo, o.y)));
  // forward pass pushes down, backward pass pulls up from the bottom edge
  for (let k = 1; k < pos.length; k++) pos[k] = Math.max(pos[k]!, pos[k - 1]! + gap);
  for (let k = pos.length - 1; k >= 0; k--) {
    const limit = k === pos.length - 1 ? hi : pos[k + 1]! - gap;
    pos[k] = Math.min(pos[k]!, limit);
  }
  const out = new Array<number>(wanted.length);
  order.forEach((o, k) => (out[o.i] = pos[k]!));
  return out;
}
