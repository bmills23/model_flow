// Manual use only, when EPA publishes a new RSL edition (semiannual). Never run by the gate or CI.
//
//   tsx scripts/fetch-rsl.ts <edition> <summaryId> <parametersId> <tapwaterId>
//   tsx scripts/fetch-rsl.ts 2025-05 40xxxx 40yyyy 40zzzz --title-summary "..." ...
//
// A new edition is a new directory under raw/rsl/, never an in-place overwrite: this script refuses
// to write into an existing edition directory. It records the sizes and SHA-256 values it observed
// in manifest.json; review them, then run build-rsl and review the diff of the generated JSON.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, type Manifest, type ManifestFile } from '../src/rsl/checksums.js';

const baseUrl = 'https://semspub.epa.gov/src/document/HQ/';
const [edition, summaryId, parametersId, tapwaterId] = process.argv.slice(2);
if (!edition || !summaryId || !parametersId || !tapwaterId) {
  console.error('usage: fetch-rsl <edition> <summaryId> <parametersId> <tapwaterId>');
  process.exit(2);
}

const dir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'raw/rsl', edition);
if (existsSync(dir)) {
  console.error(`${dir} already exists; a new edition needs a new directory`);
  process.exit(1);
}

const roles: [ManifestFile['role'], string][] = [
  ['summary', summaryId],
  ['parameters', parametersId],
  ['tapwater', tapwaterId],
];
mkdirSync(dir, { recursive: true });
const files: ManifestFile[] = [];
for (const [role, id] of roles) {
  const res = await fetch(`${baseUrl}${id}`);
  if (!res.ok) throw new Error(`fetch ${id} failed: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const file = `sems-${id}.xlsx`;
  writeFileSync(join(dir, file), bytes);
  files.push({
    file,
    semsId: Number(id),
    title: `${role} (set the title from the EPA document page)`,
    role,
    bytes: bytes.length,
    sha256: sha256(bytes),
  });
}
const manifest: Manifest = {
  edition,
  reference: `epa${edition.slice(0, 4)}rsl`,
  baseUrl,
  retrieved: new Date().toISOString().slice(0, 10),
  files,
};
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `wrote ${files.length} files and manifest.json to ${dir}; set titles and the reference key`,
);
