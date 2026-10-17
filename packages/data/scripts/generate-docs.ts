import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { references, registry } from '@model-flow/engine';
import { renderAttributions, type DataEdition } from '../src/attributions.js';
import { localIsoDate, renderStable } from '../src/stable.js';
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
const dataEditions = [
  nrwqcEdition(
    'aquatic.json',
    'EPA National Recommended Water Quality Criteria, Aquatic Life Criteria Table',
  ),
  nrwqcEdition(
    'human-health.json',
    'EPA National Recommended Water Quality Criteria, Human Health Criteria Table',
  ),
];

write('ATTRIBUTIONS.md', (generatedOn) =>
  renderAttributions({ methods: registry.list(), references, generatedOn, dataEditions }),
);
write('THIRD_PARTY_LICENSES.md', (generatedOn) =>
  renderThirdPartyLicenses({ report, generatedOn }),
);
console.log('Wrote docs/ATTRIBUTIONS.md and docs/THIRD_PARTY_LICENSES.md');
