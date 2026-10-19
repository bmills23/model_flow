import type { ReceptorRiskSummary } from '@model-flow/engine';
import type { CsvColumn, CsvRow } from '../export/csv';
import type { CsvTable } from '../export/DownloadCsv';
import { PATHWAY_LABELS } from './chartData';
import type { RiskOutcome } from './compute';
import type { PathwayId } from '@model-flow/engine';

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
];

const CONTRIBUTION_COLUMNS: CsvColumn[] = [
  { key: 'method', header: 'method' },
  { key: 'receptor', header: 'receptor' },
  { key: 'split', header: 'split' },
  { key: 'item', header: 'pathway or chemical' },
  { key: 'cancerRisk', header: 'incremental lifetime cancer risk', unit: '-' },
  { key: 'hazardIndex', header: 'hazard index', unit: '-' },
];

function receptors(outcome: RiskOutcome, m: Method): ReceptorRiskSummary[] {
  const o = outcome[m];
  return o.ok ? o.result.summary.receptors : [];
}

/** One row per method and receptor: the cancer risk and the headline hazard index. */
export function riskResultRows(outcome: RiskOutcome): CsvRow[] {
  return METHODS.flatMap((m) =>
    receptors(outcome, m).map((r) => ({
      method: RISK_METHOD_IDS[m],
      receptor: r.label,
      cancerRisk: r.cancerRisk,
      hazardIndex: r.headlineGroup === null ? null : r.hi,
      hazardGroup: r.headlineGroup,
    })),
  );
}

/** The pathway and chemical splits behind the charts, long format. */
export function riskContributionRows(
  outcome: RiskOutcome,
  names: Readonly<Record<string, string>>,
): CsvRow[] {
  return METHODS.flatMap((m) =>
    receptors(outcome, m).flatMap((r) => [
      ...r.byPathway.map((c) => ({
        method: RISK_METHOD_IDS[m],
        receptor: r.label,
        split: 'pathway',
        item: PATHWAY_LABELS[c.id as PathwayId] ?? c.id,
        cancerRisk: c.risk,
        hazardIndex: c.hi,
      })),
      ...r.byChemical.map((c) => ({
        method: RISK_METHOD_IDS[m],
        receptor: r.label,
        split: 'chemical',
        item: names[c.id] ?? c.id,
        cancerRisk: c.risk,
        hazardIndex: c.hi,
      })),
    ]),
  );
}

export function riskCsvTables(
  outcome: RiskOutcome,
  names: Readonly<Record<string, string>>,
): CsvTable[] {
  return [
    {
      name: 'risk-results',
      label: 'results',
      rows: riskResultRows(outcome),
      columns: RESULT_COLUMNS,
    },
    {
      name: 'risk-contributions',
      label: 'by pathway and chemical',
      rows: riskContributionRows(outcome, names),
      columns: CONTRIBUTION_COLUMNS,
    },
  ];
}
