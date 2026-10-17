import type { MethodDescriptor, ProcessId, Reference } from '@model-flow/engine';
import { formatReference } from '@model-flow/engine';

export interface AttributionInput {
  methods: readonly MethodDescriptor<unknown, unknown>[];
  references: readonly Reference[];
  generatedOn: string;
  /** Committed web pages that carry no numbered edition: their page date, fetch date and licence status. */
  dataEditions?: readonly DataEdition[];
}

export interface DataEdition {
  label: string;
  /** The page's own "last updated" date, ISO 8601. */
  pageDate: string;
  /** Date the committed copy was fetched, ISO 8601. */
  retrieved: string;
  licence: string;
}

const KIND_LABEL = { legacy: 'Legacy (RISC5 default)', modern: 'Modern' } as const;

/** Full citation, with a DOI or URL rendered as a link when present. */
function citationLine(ref: Reference): string {
  let line = formatReference(ref);
  if (ref.doi) line += ` <https://doi.org/${ref.doi}>`;
  else if (ref.url) line += ` <${ref.url}>`;
  return line;
}

const compareRefs = (a: Reference, b: Reference): number =>
  a.authors.localeCompare(b.authors) || a.year - b.year || a.key.localeCompare(b.key);

export function renderAttributions({
  methods,
  references,
  generatedOn,
  dataEditions = [],
}: AttributionInput): string {
  const byKey = new Map(references.map((r) => [r.key, r]));
  const out: string[] = [];

  out.push('# Attributions', '');
  out.push(
    `Generated ${generatedOn} from \`packages/engine/src/references/references.json\` and the method registry. Do not edit by hand.`,
    '',
  );
  out.push(
    'Lineage: the methods implemented here were first implemented in, or popularised by, the RISC family of software (BP RISC and its successors). They are reimplemented from the primary literature listed below. This project is independent and is not affiliated with, endorsed by, or derived from the software of the RISC authors or vendors.',
    '',
  );
  out.push(
    'Software dependencies and their licences are listed separately in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).',
    '',
  );

  out.push('## Methods by process', '');
  const processes: ProcessId[] = [...new Set(methods.map((m) => m.process))];
  if (processes.length === 0) out.push('No methods are registered yet.', '');
  for (const process of processes) {
    out.push(`### ${process}`, '');
    for (const m of methods.filter((x) => x.process === process)) {
      out.push(`#### ${m.name}`, '');
      out.push(`- Kind: ${KIND_LABEL[m.kind]}`);
      out.push(`- Method id: \`${m.id}\``);
      out.push(`- Summary: ${m.summary}`);
      if (m.assumptions.length > 0) {
        out.push('- Assumptions:');
        for (const a of m.assumptions) out.push(`  - ${a}`);
      }
      if (m.risc5Choice) out.push(`- RISC5 choice: ${m.risc5Choice}`);
      out.push('- Sources:');
      for (const key of m.citations) {
        const ref = byKey.get(key);
        out.push(`  - ${ref ? citationLine(ref) : `Unknown reference "${key}"`}`);
      }
      out.push('');
    }
  }

  const section = (
    title: string,
    intro: string,
    items: Reference[],
    extra: readonly string[] = [],
  ): void => {
    out.push(`## ${title}`, '', intro, '');
    if (items.length === 0) out.push('None yet.', '');
    else {
      for (const ref of [...items].sort(compareRefs)) out.push(`- ${citationLine(ref)}`);
      out.push('');
    }
    if (extra.length > 0) out.push(...extra, '');
  };

  section(
    'Planned methods',
    'Sources for methods on the roadmap that are not implemented yet. Nothing here affects a result today.',
    references.filter((r) => r.status === 'planned'),
  );
  section(
    'Data sources',
    'Public datasets that the chemical and toxicity database is built from.',
    references.filter((r) => r.status === 'data'),
    dataEditions.length === 0
      ? []
      : [
          'Editions of committed web pages (the pages are not numbered editions, so each is identified by its own last-updated date):',
          '',
          ...dataEditions.map(
            (e) =>
              `- ${e.label} (page dated ${e.pageDate}; retrieved ${e.retrieved}). ${e.licence}`,
          ),
        ],
  );
  section(
    'Validation sources',
    'Reviews, codes and packages used to produce test fixtures. They are checks on this software, not parts of it.',
    references.filter((r) => r.status === 'fixture'),
  );

  out.push(
    '## References',
    '',
    'Every entry in the reference database, alphabetical by author.',
    '',
  );
  for (const ref of [...references].sort(compareRefs)) {
    out.push(`- ${citationLine(ref)} [${ref.status}]`);
  }
  out.push('');
  return out.join('\n');
}
