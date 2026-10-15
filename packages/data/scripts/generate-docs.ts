import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { references, registry } from '@model-flow/engine';
import { renderAttributions } from '../src/attributions.js';
import { renderThirdPartyLicenses, type PnpmLicenseReport } from '../src/licenses.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const docs = resolve(root, 'docs');
mkdirSync(docs, { recursive: true });

// Generated files carry the date of the build that produced them.
const generatedOn = new Date().toISOString().slice(0, 10);

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

writeFileSync(
  resolve(docs, 'ATTRIBUTIONS.md'),
  renderAttributions({ methods: registry.list(), references, generatedOn }),
);
writeFileSync(
  resolve(docs, 'THIRD_PARTY_LICENSES.md'),
  renderThirdPartyLicenses({ report, generatedOn }),
);
console.log(`Wrote docs/ATTRIBUTIONS.md and docs/THIRD_PARTY_LICENSES.md (${generatedOn})`);
