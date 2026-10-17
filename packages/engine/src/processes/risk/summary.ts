import type { LegacyReceptorResult, LegacyTotals } from '../exposure/receptorsLegacy.js';
import type { ModernReceptorResult, ModernTotals } from '../exposure/receptorsModern.js';
import type { PathwayId } from '../exposure/units.js';
import { additiveCancerRisk } from './additivity.js';

/**
 * A common summary of a receptor's result for display and charts, the same for both methods: totals,
 * the contribution of each pathway and chemical, and what was not quantified. A hazard quotient or risk
 * that is not quantified is listed, never counted as zero.
 */

export interface Contribution {
  /** Pathway id or chemical id. */
  id: string;
  risk: number;
  /** Share of the receptor's cancer risk, null when that risk is zero. */
  riskShare: number | null;
  /** Hazard index contribution (the headline group's, for the modern method). */
  hi: number;
  hiShare: number | null;
}

export interface NotQuantified {
  chemical: string;
  pathway: PathwayId;
  /** What is missing: the cancer endpoint, the noncancer endpoint, or an input of the pathway. */
  what: ('cancer' | 'noncancer' | 'inputs')[];
}

export interface ReceptorRiskSummary {
  label: string;
  cancerRisk: number;
  /** Headline hazard index (the largest group's). */
  hi: number;
  /** Hazard index of each noncancer group, never added across groups. */
  hiByGroup: Record<string, number>;
  /** The group the headline hazard index comes from; null with no hazard quotient. */
  headlineGroup: string | null;
  byPathway: Contribution[];
  byChemical: Contribution[];
  notQuantified: NotQuantified[];
}

export interface RunRiskSummary {
  receptors: ReceptorRiskSummary[];
  /** Sum of the receptors' cancer risks under the additive option; null when the option is off. */
  additiveCancerRisk: number | null;
}

const share = (part: number, total: number): number | null => (total > 0 ? part / total : null);

function contributions(
  entries: [string, number, number][],
  totalRisk: number,
  totalHi: number,
): Contribution[] {
  return entries
    .map(([id, risk, hi]) => ({
      id,
      risk,
      riskShare: share(risk, totalRisk),
      hi,
      hiShare: share(hi, totalHi),
    }))
    .sort((a, b) => b.risk - a.risk || b.hi - a.hi || a.id.localeCompare(b.id));
}

interface CellLike {
  chemical: string;
  pathway: PathwayId;
  cell: { computable: boolean; risk: number | null; hq: number | null };
}

function notQuantified(cells: readonly CellLike[]): NotQuantified[] {
  const out: NotQuantified[] = [];
  for (const { chemical, pathway, cell } of cells) {
    const what: NotQuantified['what'] = [];
    if (!cell.computable) what.push('inputs');
    else {
      if (cell.risk === null) what.push('cancer');
      if (cell.hq === null) what.push('noncancer');
    }
    if (what.length > 0) out.push({ chemical, pathway, what });
  }
  return out;
}

export function summarizeLegacyReceptor(r: LegacyReceptorResult): ReceptorRiskSummary {
  const pick = (t: LegacyTotals): [number, number] => [t.risk, t.hi];
  return {
    label: r.label,
    cancerRisk: r.totals.risk,
    hi: r.totals.hi,
    hiByGroup: { total: r.totals.hi },
    headlineGroup: r.cells.some((c) => c.cell.hq !== null) ? 'total' : null,
    byPathway: contributions(
      Object.entries(r.byPathway).map(([id, t]) => [id, ...pick(t)]),
      r.totals.risk,
      r.totals.hi,
    ),
    byChemical: contributions(
      Object.entries(r.byChemical).map(([id, t]) => [id, ...pick(t)]),
      r.totals.risk,
      r.totals.hi,
    ),
    notQuantified: notQuantified(r.cells),
  };
}

export function summarizeModernReceptor(r: ModernReceptorResult): ReceptorRiskSummary {
  const groups = Object.entries(r.totals.hiByGroup);
  const hasHq = r.cells.some((c) => c.cell.hq !== null);
  let headline: string | null = null;
  for (const [g, v] of groups) {
    if (headline === null || v > r.totals.hiByGroup[headline]!) headline = g;
  }
  if (!hasHq) headline = null;
  const hiOf = (t: ModernTotals): number => (headline === null ? 0 : (t.hiByGroup[headline] ?? 0));
  return {
    label: r.label,
    cancerRisk: r.totals.risk,
    hi: r.totals.hi,
    hiByGroup: { ...r.totals.hiByGroup },
    headlineGroup: headline,
    byPathway: contributions(
      Object.entries(r.byPathway).map(([id, t]) => [id, t.risk, hiOf(t)]),
      r.totals.risk,
      r.totals.hi,
    ),
    byChemical: contributions(
      Object.entries(r.byChemical).map(([id, t]) => [id, t.risk, hiOf(t)]),
      r.totals.risk,
      r.totals.hi,
    ),
    notQuantified: notQuantified(r.cells),
  };
}

export function summarizeRun(
  receptors: readonly ReceptorRiskSummary[],
  additive: boolean,
): RunRiskSummary {
  return {
    receptors: [...receptors],
    additiveCancerRisk: additive ? additiveCancerRisk(receptors.map((r) => r.cancerRisk)) : null,
  };
}
