// Manual use only, when EPA updates either NRWQC table. Never run by the gate or CI.
//
//   tsx scripts/fetch-nrwqc.ts <edition-directory-name>
//
// The two pages are HTML only. A new fetch is a new directory under raw/nrwqc/, never an in-place
// overwrite: this script refuses to write into an existing directory. It records the size, SHA-256
// and the page's own "last updated" date in manifest.json; review them, then run build-nrwqc and
// review the diff of the generated JSON.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, type NrwqcManifest, type NrwqcManifestFile } from '../src/nrwqc/manifest.js';
import { pageDate } from '../src/nrwqc/parse.js';

const pages: { file: string; role: NrwqcManifestFile['role']; reference: string; url: string }[] = [
  {
    file: 'aquatic-life.html',
    role: 'aquatic',
    reference: 'epanrwqc',
    url: 'https://www.epa.gov/wqc/national-recommended-water-quality-criteria-aquatic-life-criteria-table',
  },
  {
    file: 'human-health.html',
    role: 'human-health',
    reference: 'epanrwqchh',
    url: 'https://www.epa.gov/wqc/national-recommended-water-quality-criteria-human-health-criteria-table',
  },
];

const edition = process.argv[2];
if (!edition) {
  console.error('usage: fetch-nrwqc <edition-directory-name>');
  process.exit(2);
}
const dir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'raw/nrwqc', edition);
if (existsSync(dir)) {
  console.error(`${dir} already exists; a new fetch needs a new directory`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
const files: NrwqcManifestFile[] = [];
for (const p of pages) {
  const res = await fetch(p.url, { headers: { 'user-agent': 'model-flow-data-build' } });
  if (!res.ok) throw new Error(`fetch ${p.url} failed: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  writeFileSync(join(dir, p.file), bytes);
  files.push({
    file: p.file,
    role: p.role,
    reference: p.reference,
    url: p.url,
    pageDate: pageDate(new TextDecoder().decode(bytes)),
    bytes: bytes.length,
    sha256: sha256(bytes),
  });
}
const manifest: NrwqcManifest = {
  edition,
  retrieved: new Date().toISOString().slice(0, 10),
  files,
};
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${files.length} files and manifest.json to ${dir}`);
