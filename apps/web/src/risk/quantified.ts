import type { RiskOutcome } from './compute';
import { PATHWAY_LABELS } from './chartData';

/**
 * Whether a number of the risk screen is a quantified result or a gap. A pathway or chemical none of
 * whose cells could be quantified for a measure has no value for it: the totals and splits the engine
 * sums start from 0, so a zero there is either a true zero (a quantified cell that came to nothing) or
 * nothing at all, and only the cells tell the two apart. Every display and CSV of the risk screen and
 * the report reads this, so a gap reads "not quantified" with the reason and never 0.
 */

export type Measure = 'risk' | 'hi';
export type RiskMethod = 'legacy' | 'modern';

/** The part of an engine cell this module reads (both methods have it). */
interface CellLike {
  chemical: string;
  pathway: string;
  cell: { computable: boolean; risk: number | null; hq: number | null };
}

/** The reason a measure is not quantified, or null when at least one cell quantified it. */
export type Gap = string | null;

export interface Quantification {
  /** The receptor's total. */
  total: Record<Measure, Gap>;
  byPathway: ReadonlyMap<string, Record<Measure, Gap>>;
  byChemical: ReadonlyMap<string, Record<Measure, Gap>>;
}

const MISSING_INPUT = 'an exposure input or chemical property is missing (see the warnings)';
const NO_VALUE: Record<Measure, string> = {
  risk: 'no cancer toxicity value for this route',
  hi: 'no noncancer toxicity value for this route',
};

function gapOf(cells: readonly CellLike[], measure: Measure): Gap {
  if (cells.length === 0) return 'nothing was switched on to quantify it';
  const value = (c: CellLike): number | null => (measure === 'risk' ? c.cell.risk : c.cell.hq);
  if (cells.some((c) => c.cell.computable && value(c) !== null)) return null;
  const reasons: string[] = [];
  if (cells.some((c) => !c.cell.computable)) reasons.push(MISSING_INPUT);
  if (cells.some((c) => c.cell.computable)) reasons.push(NO_VALUE[measure]);
  return reasons.join('; ');
}

const gaps = (cells: readonly CellLike[]): Record<Measure, Gap> => ({
  risk: gapOf(cells, 'risk'),
  hi: gapOf(cells, 'hi'),
});

function groupBy(cells: readonly CellLike[], key: 'pathway' | 'chemical'): Map<string, CellLike[]> {
  const out = new Map<string, CellLike[]>();
  for (const c of cells) {
    const list = out.get(c[key]) ?? [];
    list.push(c);
    out.set(c[key], list);
  }
  return out;
}

/** The quantification of one receptor from its cells. */
export function quantification(cells: readonly CellLike[]): Quantification {
  const split = (key: 'pathway' | 'chemical') =>
    new Map([...groupBy(cells, key)].map(([id, list]) => [id, gaps(list)]));
  return { total: gaps(cells), byPathway: split('pathway'), byChemical: split('chemical') };
}

/** The quantification of every receptor of one method of a run, in receptor order; empty when the method did not run. */
export function quantificationsOf(outcome: RiskOutcome, method: RiskMethod): Quantification[] {
  const o = outcome[method];
  if (!o.ok) return [];
  const receptors = o.result.receptors as readonly { cells: readonly CellLike[] }[] | undefined;
  return (receptors ?? []).map((r) => quantification(r.cells));
}

export const NOT_QUANTIFIED_TEXT = 'not quantified';

/** No gap: the value stands as the engine gave it. */
export const NO_GAP: Record<Measure, Gap> = { risk: null, hi: null };

/**
 * The pathways a quantified total leaves out for a measure: those none of whose cells quantified it.
 * The total sums only the cells that did, so it is a partial total, and the omitted pathways are
 * named wherever it is printed. Empty for a fully quantified total and for a total nothing quantified
 * (that one is a gap, not a partial number).
 */
export function omittedPathways(
  q: Pick<Quantification, 'total' | 'byPathway'>,
  measure: Measure,
): string[] {
  if (q.total[measure] !== null) return [];
  return [...q.byPathway].filter(([, g]) => g[measure] !== null).map(([id]) => id);
}

const pathwayLabel = (id: string): string => (PATHWAY_LABELS as Record<string, string>)[id] ?? id;

/** "partial total, omits Bathing dermal contact (not quantified)" for the pathways a total leaves out. */
export function partialText(ids: readonly string[]): string {
  return `partial total, omits ${ids.map(pathwayLabel).join(', ')} (not quantified)`;
}

/** The pathway labels a total leaves out, for display beside it. */
export const omittedLabels = (ids: readonly string[]): string[] => ids.map(pathwayLabel);

/**
 * "cancer risk: no cancer toxicity value ..." for the gaps of one row, or '' when it has none. With
 * `omitted`, a quantified total that leaves pathways out is noted as partial and names them.
 */
export function gapNote(
  g: Record<Measure, Gap>,
  omitted?: Record<Measure, readonly string[]>,
): string {
  const parts: string[] = [];
  if (g.risk !== null) parts.push(`cancer risk: ${g.risk}`);
  else if (omitted && omitted.risk.length > 0)
    parts.push(`cancer risk: ${partialText(omitted.risk)}`);
  if (g.hi !== null) parts.push(`hazard index: ${g.hi}`);
  else if (omitted && omitted.hi.length > 0) parts.push(`hazard index: ${partialText(omitted.hi)}`);
  return parts.join('; ');
}
