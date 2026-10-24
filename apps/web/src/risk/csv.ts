import type { ReceptorRiskSummary } from '@model-flow/engine';
import type { CsvColumn, CsvRow } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import { PATHWAY_LABELS } from './chartData';
import type { RiskOutcome } from './compute';
import type { PathwayId } from '@model-flow/engine';
import { gapNote, NO_GAP, omittedPathways, quantificationsOf, type Gap } from './quantified';

export const RISK_METHOD_IDS = {
  legacy: 'exposure.rags-a-1989',
  modern: 'exposure.rags-e-f-2014',
} as const;

type Method = keyof typeof RISK_METHOD_IDS;
const METHODS: readonly Method[] = ['legacy', 'modern'];

const RESULT_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'receptor', header: 'receptor' },
  { key: 'cancerRisk', header: 'incremental lifetime cancer risk', unit: '-' },
  { key: 'hazardIndex', header: 'hazard index', unit: '-' },
  { key: 'hazardGroup', header: 'hazard index group' },
  { key: 'note', header: 'not quantified or partial because' },
];

/** The value columns that stay empty when a value could not be quantified, and where the reason is. */
const MISSING = { keys: ['cancerRisk', 'hazardIndex'], because: 'note' } as const;

/** A value as the engine gave it, or null when it is a gap and not a result. */
const valueOf = (v: number, gap: Gap): number | null => (gap === null ? v : null);

const CONTRIBUTION_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'receptor', header: 'receptor' },
  { key: 'split', header: 'split' },
  { key: 'item', header: 'pathway or chemical' },
  { key: 'cancerRisk', header: 'incremental lifetime cancer risk', unit: '-' },
  { key: 'hazardIndex', header: 'hazard index', unit: '-' },
  { key: 'note', header: 'not quantified or partial because' },
];

function receptors(outcome: RiskOutcome, m: Method): ReceptorRiskSummary[] {
  const o = outcome[m];
  return o.ok ? o.result.summary.receptors : [];
}

/**
 * One row per method and receptor: the cancer risk and the headline hazard index. A total no cell
 * quantified is empty, with the reason in the note, never 0. A total that leaves a pathway out keeps
 * its number and the note says it is partial and names the pathways.
 */
export function riskResultRows(outcome: RiskOutcome): CsvRow[] {
  return METHODS.flatMap((m) => {
    const q = quantificationsOf(outcome, m);
    return receptors(outcome, m).map((r, i) => {
      const gap = q[i]?.total ?? NO_GAP;
      const omitted = q[i]
        ? { risk: omittedPathways(q[i]!, 'risk'), hi: omittedPathways(q[i]!, 'hi') }
        : undefined;
      return {
        method: RISK_METHOD_IDS[m],
        receptor: r.label,
        cancerRisk: valueOf(r.cancerRisk, gap.risk),
        hazardIndex: r.headlineGroup === null ? null : valueOf(r.hi, gap.hi),
        hazardGroup: r.headlineGroup,
        note: gapNote(
          r.headlineGroup === null && gap.hi === null
            ? { ...gap, hi: 'no noncancer toxicity value for this route' }
            : gap,
          omitted,
        ),
      };
    });
  });
}

/** The pathway and chemical splits behind the charts, long format. */
export function riskContributionRows(
  outcome: RiskOutcome,
  names: Readonly<Record<string, string>>,
): CsvRow[] {
  return METHODS.flatMap((m) => {
    const q = quantificationsOf(outcome, m);
    return receptors(outcome, m).flatMap((r, i) => {
      const row = (
        split: 'pathway' | 'chemical',
        item: string,
        c: { id: string; risk: number; hi: number },
      ) => {
        const gap = (split === 'pathway' ? q[i]?.byPathway : q[i]?.byChemical)?.get(c.id) ?? NO_GAP;
        return {
          method: RISK_METHOD_IDS[m],
          receptor: r.label,
          split,
          item,
          cancerRisk: valueOf(c.risk, gap.risk),
          hazardIndex: valueOf(c.hi, gap.hi),
          note: gapNote(gap),
        };
      };
      return [
        ...r.byPathway.map((c) => row('pathway', PATHWAY_LABELS[c.id as PathwayId] ?? c.id, c)),
        ...r.byChemical.map((c) => row('chemical', names[c.id] ?? c.id, c)),
      ];
    });
  });
}

export function riskCsvTables(
  outcome: RiskOutcome,
  names: Readonly<Record<string, string>>,
): CsvTable[] {
  return [
    {
      name: 'risk-results',
      editions: ['rsl'],
      label: 'results',
      rows: riskResultRows(outcome),
      columns: RESULT_COLUMNS,
      missing: MISSING,
    },
    {
      name: 'risk-contributions',
      editions: ['rsl'],
      label: 'by pathway and chemical',
      rows: riskContributionRows(outcome, names),
      columns: CONTRIBUTION_COLUMNS,
      missing: MISSING,
    },
  ];
}
