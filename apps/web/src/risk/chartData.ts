import { PATHWAY_IDS, type PathwayId, type ReceptorRiskSummary } from '@model-flow/engine';
import { omittedLabels, omittedPathways, type Quantification } from './quantified';

export const PATHWAY_LABELS: Record<PathwayId, string> = {
  soilIngestion: 'Soil ingestion',
  soilDermal: 'Soil dermal contact',
  waterIngestion: 'Drinking water',
  waterDermal: 'Bathing dermal contact',
  showerInhalation: 'Shower inhalation',
  indoorInhalation: 'Indoor air inhalation',
  outdoorInhalation: 'Outdoor air inhalation',
  swimIngestion: 'Swimming ingestion',
  swimDermal: 'Swimming dermal contact',
  produce: 'Homegrown produce',
};

/** Risk in scientific form with two figures, 3.2e-6. */
export function fmtRisk(x: number): string {
  if (x === 0) return '0';
  const [m, e] = x.toExponential(1).split('e');
  return `${m}e${Number(e)}`;
}

/** Hazard index with three figures. */
export function fmtHi(x: number): string {
  return x === 0 ? '0' : String(Number(x.toPrecision(3)));
}

export type Measure = 'risk' | 'hi';
export type Split = 'pathway' | 'chemical';

export interface Segment {
  id: string;
  label: string;
  value: number;
  /** Index into the categorical colour slots; the same id has the same slot in every row. */
  slot: number;
}

export interface BarRow {
  label: string;
  total: number;
  segments: Segment[];
  /**
   * Segment labels with no value at all (nothing could be quantified for them), with the reason. A label
   * in the row's table but in neither `segments` nor here is a true zero.
   */
  gaps: Record<string, string>;
  /** Why the row's total is not quantified, or null when it is. */
  totalGap: string | null;
  /**
   * Labels of the pathways a quantified total leaves out (none of their cells quantified the measure):
   * the total is partial and says so. Empty for a fully quantified total.
   */
  partialOmits: string[];
}

export const SLOTS = 8;

/** Stacked-bar rows: one per receptor and method, a segment per pathway or chemical with a value. */
export function barRows(
  measure: Measure,
  by: Split,
  rows: readonly { label: string; summary: ReceptorRiskSummary; quant?: Quantification }[],
  names: Readonly<Record<string, string>>,
): BarRow[] {
  const pick = (r: { summary: ReceptorRiskSummary }) =>
    by === 'pathway' ? r.summary.byPathway : r.summary.byChemical;
  const ids: string[] = [];
  for (const r of rows) for (const c of pick(r)) if (!ids.includes(c.id)) ids.push(c.id);
  if (by === 'pathway') {
    ids.sort((a, b) => PATHWAY_IDS.indexOf(a as PathwayId) - PATHWAY_IDS.indexOf(b as PathwayId));
  }
  const label = (id: string): string =>
    by === 'pathway' ? (PATHWAY_LABELS[id as PathwayId] ?? id) : (names[id] ?? id);
  return rows.map((r) => {
    const segments = pick(r)
      .map((c) => ({
        id: c.id,
        label: label(c.id),
        value: measure === 'risk' ? c.risk : c.hi,
        slot: ids.indexOf(c.id) % SLOTS,
      }))
      .filter((s) => s.value > 0);
    const gaps: Record<string, string> = {};
    const split = by === 'pathway' ? r.quant?.byPathway : r.quant?.byChemical;
    for (const c of pick(r)) {
      const gap = split?.get(c.id)?.[measure];
      if (gap !== undefined && gap !== null) gaps[label(c.id)] = gap;
    }
    return {
      label: r.label,
      total: segments.reduce((s, x) => s + x.value, 0),
      segments,
      gaps,
      totalGap: r.quant?.total[measure] ?? null,
      partialOmits: r.quant ? omittedLabels(omittedPathways(r.quant, measure)) : [],
    };
  });
}
