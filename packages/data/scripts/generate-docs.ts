import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { references, registry } from '@model-flow/engine';
import { renderAttributions, type DataEdition } from '../src/attributions.js';
import { localIsoDate, renderStable } from '../src/stable.js';
import {
  buildValidationManifest,
  renderValidationJson,
  renderValidationMarkdown,
} from '../src/validation.js';
import { renderThirdPartyLicenses, type PnpmLicenseReport } from '../src/licenses.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const docs = resolve(root, 'docs');
mkdirSync(docs, { recursive: true });

// A document keeps its previous date unless its content changes.
const today = localIsoDate(new Date());

const pnpm = process.env['npm_execpath'];
const [cmd, args] =
  pnpm?.endsWith('.cjs') || pnpm?.endsWith('.js')
    ? [process.execPath, [pnpm]]
    : [pnpm ?? 'pnpm', []];
const raw = execFileSync(cmd, [...args, 'licenses', 'list', '--json', '--prod', '-r'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const report = JSON.parse(raw) as PnpmLicenseReport;

const write = (name: string, render: (date: string) => string): void => {
  const path = resolve(docs, name);
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  writeFileSync(path, renderStable(render, existing, today));
};

// Edition blocks of the committed criteria pages, from the generated JSON the data build wrote.
const nrwqcDir = resolve(root, 'packages/data/generated/nrwqc-2026-10-16');
const nrwqcEdition = (file: string, label: string): DataEdition => {
  const { source } = JSON.parse(readFileSync(resolve(nrwqcDir, file), 'utf8')) as {
    source: { pageDate: string; retrieved: string; licence: string };
  };
  return { label, pageDate: source.pageDate, retrieved: source.retrieved, licence: source.licence };
};
const sediment = JSON.parse(
  readFileSync(
    resolve(root, 'packages/data/generated/sediment-2026-10-16/benchmarks.json'),
    'utf8',
  ),
) as { sources: { epa2018r4era: { pageDate: string; retrieved: string; licence: string } } };
const ecossl = JSON.parse(
  readFileSync(resolve(root, 'packages/data/generated/ecossl-2026-10-18/ecossl.json'), 'utf8'),
) as { source: { listingPageDate: string; retrieved: string; licence: string } };
interface CriteriaSetHeader {
  label: string;
  source: {
    title: string;
    pageDate?: string;
    retrieved: string;
    redistributed: boolean;
    terms: string;
  };
}
const criteriaDir = resolve(root, 'packages/data/generated/criteria-2026-10-23');
const criteriaEdition = (set: string): DataEdition => {
  const f = JSON.parse(
    readFileSync(resolve(criteriaDir, `${set === 'anzg' ? 'anzg-fresh' : set}.json`), 'utf8'),
  ) as CriteriaSetHeader;
  return {
    label: `${f.label}, ${f.source.title}`,
    pageDate: f.source.pageDate,
    retrieved: f.source.retrieved,
    licence: f.source.redistributed
      ? `Source file committed under its reuse terms. ${f.source.terms}`
      : `Source file not committed, values only. ${f.source.terms}`,
  };
};
const dataEditions = [
  nrwqcEdition(
    'aquatic.json',
    'EPA National Recommended Water Quality Criteria, Aquatic Life Criteria Table',
  ),
  nrwqcEdition(
    'human-health.json',
    'EPA National Recommended Water Quality Criteria, Human Health Criteria Table',
  ),
  {
    label:
      'EPA Region 4 Ecological Risk Assessment Supplemental Guidance, sediment Tables 2a, 2b and 2c',
    pageDate: sediment.sources.epa2018r4era.pageDate,
    retrieved: sediment.sources.epa2018r4era.retrieved,
    licence: sediment.sources.epa2018r4era.licence,
  },
  {
    label:
      'EPA Ecological Soil Screening Levels, 21 interim final per-chemical documents (Table 2.1 and wildlife derivation tables, transcribed)',
    pageDate: ecossl.source.listingPageDate,
    retrieved: ecossl.source.retrieved,
    licence: ecossl.source.licence,
  },
  ...['ccme', 'eu', 'uk', 'anzg', 'macdonald2000'].map(criteriaEdition),
];

write('ATTRIBUTIONS.md', (generatedOn) =>
  renderAttributions({ methods: registry.list(), references, generatedOn, dataEditions }),
);
write('THIRD_PARTY_LICENSES.md', (generatedOn) =>
  renderThirdPartyLicenses({ report, generatedOn }),
);

const validation = buildValidationManifest({
  root,
  references,
  methodIds: registry.list().map((m) => m.id),
  methods: registry.list(),
});
write('VALIDATION.md', (generatedOn) => renderValidationMarkdown(validation, generatedOn));
// The JSON the web page imports carries no date, so it changes only when the manifest does.
const validationDir = resolve(root, 'packages/data/generated/validation');
mkdirSync(validationDir, { recursive: true });
writeFileSync(resolve(validationDir, 'validation.json'), renderValidationJson(validation));
console.log(
  'Wrote docs/ATTRIBUTIONS.md, docs/THIRD_PARTY_LICENSES.md, docs/VALIDATION.md and packages/data/generated/validation/validation.json',
);
