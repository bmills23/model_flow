import validation from '@model-flow/data/generated/validation/validation.json';
import type { CsvTable } from '../export/DownloadCsv';
import type { CsvRow } from '../export/csv';
import { STALE_COLUMN, STALE_NAME_SUFFIX } from '../export/staleCsv';
import type { BasisKind, BasisRow, ProjectBasis } from './basis';
import type { Report } from './buildReport';
import { SCREEN_NAMES } from './buildReport';

/** What the report and the CSV read from the run basis: labels, the summary counts, the evidence per method. */

export const KIND_LABEL: Record<BasisKind, string> = {
  'unverified-default': 'Unverified default',
  'entered-unsourced': 'Entered, no source',
  'typed-over-database': 'Typed over database value',
  'user-override': 'User toxicity value',
  'user-chemical': 'User chemical value',
  'receptor-edit': 'Receptor factor edit',
};

export const KIND_ORDER = Object.keys(KIND_LABEL) as BasisKind[];

/**
 * How many published worked examples check a method: the examples of validation.json that name it and
 * whose status is `reproduced`. A named exception, a pending case or a smoke test is not a check.
 */
export function publishedExampleCount(methodId: string): number {
  return validation.examples.filter(
    (e) => e.status === 'reproduced' && e.methodIds.includes(methodId),
  ).length;
}

export interface BasisSummary {
  /** Distinct rows per kind over every section and the project. */
  counts: Record<BasisKind, number>;
  total: number;
  /** The subjects of the unverified defaults the run used, once each. */
  defaults: string[];
}

const distinctKey = (r: BasisRow): string => `${r.kind}|${r.subject}|${r.value}`;

export function basisSummary(basis: ProjectBasis): BasisSummary {
  const seen = new Set<string>();
  const counts = Object.fromEntries(KIND_ORDER.map((k) => [k, 0])) as Record<BasisKind, number>;
  const defaults: string[] = [];
  const all = [...Object.values(basis.sections).flat(), ...basis.project];
  for (const r of all) {
    const k = distinctKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    counts[r.kind] += 1;
    if (r.kind === 'unverified-default') defaults.push(r.subject);
  }
  return { counts, total: seen.size, defaults };
}

export const BASIS_CSV_NAME = 'run-basis';

const COLUMNS = [
  { key: 'screen', header: 'screen' },
  { key: 'kind', header: 'kind' },
  { key: 'subject', header: 'subject' },
  { key: 'value', header: 'value' },
  { key: 'detail', header: 'detail' },
  { key: 'note', header: 'source note' },
  { key: 'reference', header: 'reference' },
  { key: 'referenceStatus', header: 'reference status' },
  { key: 'defaultId', header: 'default id' },
  { key: 'via', header: 'via screen' },
] as const;

/**
 * The run basis as one report-level CSV table with a screen column. Rows inherited through a feed name
 * the sending screen; while any is stale the file gains the `stale inputs` column and name suffix of
 * the other exports (see `markStaleTable`), with the mark on the stale rows only.
 */
export function basisCsvTable(report: Report, basis: ProjectBasis): CsvTable {
  const rows: CsvRow[] = [];
  const push = (screen: string, r: BasisRow) =>
    rows.push({
      screen,
      kind: KIND_LABEL[r.kind],
      subject: r.subject,
      value: r.value,
      detail: r.detail,
      note: r.note,
      reference: r.referenceKey ?? '',
      referenceStatus: r.referenceStatus ?? '',
      defaultId: r.defaultId ?? '',
      via: r.via === null ? '' : SCREEN_NAMES[r.via],
      [STALE_COLUMN.key]: r.stale
        ? `out of date inputs, inherited from ${r.via === null ? 'a sending screen' : SCREEN_NAMES[r.via]}`
        : '',
    });
  for (const sec of report.sections)
    for (const r of basis.sections[sec.key] ?? []) push(sec.name, r);
  for (const r of basis.project) push('Project', r);
  const anyStale = rows.some((r) => r[STALE_COLUMN.key] !== '');
  return {
    name: anyStale ? `${BASIS_CSV_NAME}${STALE_NAME_SUFFIX}` : BASIS_CSV_NAME,
    label: 'run basis',
    rows,
    columns: anyStale ? [...COLUMNS, STALE_COLUMN] : COLUMNS,
  };
}
