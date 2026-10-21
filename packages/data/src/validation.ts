import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MethodDescriptor, Reference } from '@model-flow/engine';
import { validationCatalog } from './validationCatalog.js';

/**
 * The validation manifest: for each published worked example the test suite reproduces, its source, the
 * method it checks, what is compared, the number of cases, the tolerance the test enforces and its status.
 * The descriptive text lives in `validationCatalog.ts`; this module checks it against the tree (fixture
 * files, READMEs, test sources, references.json, the method registry) so the document cannot drift, and
 * renders the markdown document and the small JSON file the web page imports.
 */

export type ValidationStatus =
  'reproduced' | 'named exception' | 'pending or deferred' | 'smoke test only';

export interface ValidationExample {
  id: string;
  title: string;
  /** Fixture files, relative to `packages/engine/test/fixtures`. */
  files: string[];
  /** A key in references.json, or null when the source is not a references.json record. */
  referenceKey: string | null;
  /** The reference's title (or the plain source text when there is no key). */
  source: string;
  methodIds: string[];
  compares: string;
  cases: number;
  casesUnit: string;
  tolerance: string;
  status: ValidationStatus;
  /** Test file under `packages/engine/test`. */
  testFile: string;
  note: string;
}

export interface WarnedDefault {
  subject: string;
  methodIds: string[];
  warningCode: string | null;
  referenceKey: string | null;
  referenceStatus: string | null;
  note: string;
}

export interface PlannedReference {
  key: string;
  title: string;
  /** Registered methods whose own text names the key. */
  reliedOnBy: string[];
}

export interface ValidationManifest {
  examples: ValidationExample[];
  unverified: {
    plannedReferences: PlannedReference[];
    otherPlannedReferences: { key: string; title: string }[];
    defaults: WarnedDefault[];
    notChecked: { subject: string; note: string }[];
  };
}

/** Parsed fixture JSON; shapes differ per file, so the catalog reads them structurally. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export interface ExampleSpec {
  id: string;
  title: string;
  files: string[];
  referenceKey: string | null;
  /** Plain source text, used when `referenceKey` is null. */
  sourceText?: string;
  methodIds: string[];
  compares: string;
  /** Case count read from the parsed fixture files (in the order of `files`) and the test source. */
  count: (json: Json[], testSource: string) => number;
  casesUnit: string;
  tolerance: string;
  status: ValidationStatus;
  testFile: string;
  /** Strings that must appear in the test source: they pin the tolerance the text states. */
  evidence: string[];
  /** A string that must appear in the README of the fixture directory. */
  readmeNeedle: string;
  note?: string;
}

export interface DefaultSpec {
  subject: string;
  methodIds: string[];
  warningCode: string | null;
  referenceKey: string | null;
  note: string;
  /** Where the claim lives: a repo-relative file that must contain `needle`. */
  where: { file: string; needle: string };
}

export interface CatalogInput {
  examples: ExampleSpec[];
  /** Examples derived from fields of a fixture file (named exceptions and deferred rows). */
  derived: (read: (file: string) => Json) => ExampleSpec[];
  defaults: DefaultSpec[];
  notChecked: { subject: string; note: string; where: { file: string; needle: string } }[];
}

export interface BuildInput {
  root: string;
  references: readonly Reference[];
  methodIds: readonly string[];
  methods: readonly MethodDescriptor<unknown, unknown>[];
  /** Test hook: replaces every spec's evidence strings. */
  overrideEvidence?: string;
  catalog?: CatalogInput;
}

const FIXTURES = 'packages/engine/test/fixtures';
const TESTS = 'packages/engine/test';

function methodText(m: MethodDescriptor<unknown, unknown>): string {
  return [m.name, m.summary, m.risc5Choice ?? '', ...m.assumptions].join('\n');
}

export function buildValidationManifest(input: BuildInput): ValidationManifest {
  const catalog = input.catalog ?? validationCatalog;
  const refByKey = new Map(input.references.map((r) => [r.key, r]));
  const cache = new Map<string, Json>();
  const read = (file: string): Json => {
    let v = cache.get(file);
    if (v === undefined) {
      v = JSON.parse(readFileSync(resolve(input.root, FIXTURES, file), 'utf8')) as Json;
      cache.set(file, v);
    }
    return v;
  };
  const fileText = (path: string): string => readFileSync(resolve(input.root, path), 'utf8');

  const specs = [...catalog.examples, ...catalog.derived(read)];
  const examples: ValidationExample[] = specs.map((s) => {
    for (const f of s.files) {
      if (!existsSync(resolve(input.root, FIXTURES, f))) {
        throw new Error(`Validation example ${s.id}: fixture file ${f} does not exist`);
      }
    }
    const dir = s.files[0]!.split('/')[0]!;
    const readme = resolve(input.root, FIXTURES, dir, 'README.md');
    if (!existsSync(readme) || !readFileSync(readme, 'utf8').includes(s.readmeNeedle)) {
      throw new Error(
        `Validation example ${s.id}: README of ${dir} does not mention "${s.readmeNeedle}"`,
      );
    }
    const testPath = `${TESTS}/${s.testFile}`;
    if (!existsSync(resolve(input.root, testPath))) {
      throw new Error(`Validation example ${s.id}: test file ${s.testFile} does not exist`);
    }
    const testSource = fileText(testPath);
    for (const ev of input.overrideEvidence !== undefined ? [input.overrideEvidence] : s.evidence) {
      if (!testSource.includes(ev)) {
        throw new Error(`Validation example ${s.id}: evidence "${ev}" is not in ${s.testFile}`);
      }
    }
    for (const m of s.methodIds) {
      if (!input.methodIds.includes(m))
        throw new Error(`Validation example ${s.id}: unknown method ${m}`);
    }
    let source = s.sourceText ?? '';
    if (s.referenceKey !== null) {
      const ref = refByKey.get(s.referenceKey);
      if (!ref) throw new Error(`Validation example ${s.id}: unknown reference ${s.referenceKey}`);
      source = ref.title;
    }
    return {
      id: s.id,
      title: s.title,
      files: s.files,
      referenceKey: s.referenceKey,
      source,
      methodIds: s.methodIds,
      compares: s.compares,
      cases: s.count(s.files.map(read), testSource),
      casesUnit: s.casesUnit,
      tolerance: s.tolerance,
      status: s.status,
      testFile: s.testFile,
      note: s.note ?? '',
    };
  });

  const defaults: WarnedDefault[] = catalog.defaults.map((d) => {
    if (!fileText(d.where.file).includes(d.where.needle)) {
      throw new Error(
        `Unverified default "${d.subject}": "${d.where.needle}" is not in ${d.where.file}`,
      );
    }
    if (d.warningCode !== null && !fileText(d.where.file).includes(d.warningCode)) {
      throw new Error(
        `Unverified default "${d.subject}": warning code ${d.warningCode} is not in ${d.where.file}`,
      );
    }
    for (const m of d.methodIds) {
      if (!input.methodIds.includes(m))
        throw new Error(`Unverified default "${d.subject}": unknown method ${m}`);
    }
    let referenceStatus: string | null = null;
    if (d.referenceKey !== null) {
      const ref = refByKey.get(d.referenceKey);
      if (!ref)
        throw new Error(`Unverified default "${d.subject}": unknown reference ${d.referenceKey}`);
      referenceStatus = ref.status;
    }
    return {
      subject: d.subject,
      methodIds: d.methodIds,
      warningCode: d.warningCode,
      referenceKey: d.referenceKey,
      referenceStatus,
      note: d.note,
    };
  });

  for (const n of catalog.notChecked) {
    if (!fileText(n.where.file).includes(n.where.needle)) {
      throw new Error(
        `Not-checked item "${n.subject}": "${n.where.needle}" is not in ${n.where.file}`,
      );
    }
  }

  // Planned references a shipped method relies on: the key appears in a registered method's own text, or a
  // warned default names it.
  const planned = input.references.filter((r) => r.status === 'planned');
  const plannedReferences: PlannedReference[] = [];
  const otherPlannedReferences: { key: string; title: string }[] = [];
  for (const r of planned) {
    const byText = input.methods.filter((m) => methodText(m).includes(r.key)).map((m) => m.id);
    const byDefault = defaults.filter((d) => d.referenceKey === r.key).flatMap((d) => d.methodIds);
    const reliedOnBy = [...new Set([...byText, ...byDefault])].sort();
    if (reliedOnBy.length > 0) plannedReferences.push({ key: r.key, title: r.title, reliedOnBy });
    else otherPlannedReferences.push({ key: r.key, title: r.title });
  }

  return {
    examples,
    unverified: {
      plannedReferences,
      otherPlannedReferences,
      defaults,
      notChecked: catalog.notChecked.map(({ subject, note }) => ({ subject, note })),
    },
  };
}

/** The JSON file the web page imports: the manifest itself, pretty-printed, no date. */
export function renderValidationJson(manifest: ValidationManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const STATUS_ORDER: ValidationStatus[] = [
  'reproduced',
  'named exception',
  'pending or deferred',
  'smoke test only',
];

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderValidationMarkdown(
  manifest: ValidationManifest,
  generatedOn: string,
): string {
  const out: string[] = [];
  out.push('# Validation', '');
  out.push(
    `Generated ${generatedOn} from the fixtures under \`packages/engine/test/fixtures\`, their READMEs and tests, \`packages/engine/src/references/references.json\` and the method registry. Do not edit by hand.`,
    '',
  );
  out.push(
    'Each published worked example the test suite reproduces is listed with its source, the method it checks, what is compared, the number of cases and the tolerance the test enforces. A test that passes at its tolerance shows agreement with the published value to that tolerance; it is not a statement about model accuracy. The observed largest error is not reported, only the enforced tolerance.',
    '',
  );
  const counts = STATUS_ORDER.map(
    (s) => `${manifest.examples.filter((e) => e.status === s).length} ${s}`,
  );
  out.push(`Summary: ${manifest.examples.length} entries (${counts.join(', ')}).`, '');

  out.push('## Worked examples', '');
  for (const status of STATUS_ORDER) {
    const group = manifest.examples.filter((e) => e.status === status);
    if (group.length === 0) continue;
    out.push(`### ${status[0]!.toUpperCase()}${status.slice(1)}`, '');
    for (const e of group) {
      out.push(`#### ${e.title}`, '');
      out.push(`- Source: ${e.referenceKey !== null ? `\`${e.referenceKey}\`, ` : ''}${e.source}`);
      out.push(`- Method: ${e.methodIds.map((m) => `\`${m}\``).join(', ')}`);
      out.push(`- Compared: ${e.compares}`);
      out.push(`- Cases: ${e.cases} ${e.casesUnit}`);
      out.push(`- Tolerance: ${e.tolerance}`);
      out.push(`- Status: ${e.status}`);
      out.push(`- Fixture: ${e.files.map((f) => `\`${f}\``).join(', ')}; test \`${e.testFile}\``);
      if (e.note) out.push(`- Note: ${e.note}`);
      out.push('');
    }
  }

  out.push('## Unverified', '');
  out.push(
    'What the examples above do not establish: references not yet read that a shipped method relies on, defaults the engine warns about, and published values not checked.',
    '',
  );
  out.push('### Planned references a shipped method relies on', '');
  if (manifest.unverified.plannedReferences.length === 0) out.push('None.', '');
  else {
    out.push('| Key | Title | Relied on by |', '| --- | --- | --- |');
    for (const p of manifest.unverified.plannedReferences) {
      out.push(
        `| \`${p.key}\` | ${cell(p.title)} | ${p.reliedOnBy.map((m) => `\`${m}\``).join(', ')} |`,
      );
    }
    out.push('');
  }
  out.push('### Warned or unverified defaults', '');
  out.push(
    '| Subject | Methods | Warning code | Reference | Note |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const d of manifest.unverified.defaults) {
    out.push(
      `| ${cell(d.subject)} | ${d.methodIds.map((m) => `\`${m}\``).join(', ')} | ${
        d.warningCode !== null ? `\`${d.warningCode}\`` : 'none'
      } | ${d.referenceKey !== null ? `\`${d.referenceKey}\` (${d.referenceStatus})` : 'none'} | ${cell(d.note)} |`,
    );
  }
  out.push('');
  out.push('### Named exceptions', '');
  const exceptions = manifest.examples.filter((e) => e.status === 'named exception');
  for (const e of exceptions) out.push(`- ${e.title}: ${e.note || e.compares}`);
  out.push('');
  out.push('### Pending, deferred and smoke-test-only', '');
  for (const e of manifest.examples.filter(
    (x) => x.status === 'pending or deferred' || x.status === 'smoke test only',
  )) {
    out.push(`- ${e.title} (${e.status}): ${e.note || e.compares}`);
  }
  out.push('');
  out.push('### Published values not checked', '');
  for (const n of manifest.unverified.notChecked) out.push(`- ${n.subject}: ${n.note}`);
  out.push('');
  out.push('### Other planned references', '');
  out.push(
    'Planned references no shipped method relies on yet. They are listed in `references.json` and are not cited by any method.',
    '',
  );
  for (const p of manifest.unverified.otherPlannedReferences)
    out.push(`- \`${p.key}\`: ${p.title}`);
  out.push('');
  return out.join('\n');
}
