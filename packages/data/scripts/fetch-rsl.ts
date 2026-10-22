// Manual use only, when EPA publishes a new RSL edition (semiannual). Never run by the gate or CI.
//
//   tsx scripts/fetch-rsl.ts <edition> <summaryId> <parametersId> <tapwaterId>
//   tsx scripts/fetch-rsl.ts --add <edition> <role>=<semsId> [<role>=<semsId> ...] [--title <role>=<text>]
//
// --add fetches further published sheets of an existing edition (roles soil-resident,
// soil-industrial, air-resident) and appends them to its manifest; a file already listed is refused.
//
// A new edition is a new directory under raw/rsl/, never an in-place overwrite: this script refuses
// to write into an existing edition directory. It records the sizes and SHA-256 values it observed
// in manifest.json; review them, then run build-rsl and review the diff of the generated JSON.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readManifest,
  sha256,
  type Manifest,
  type ManifestFile,
  type ManifestRole,
} from '../src/rsl/checksums.js';

const baseUrl = 'https://semspub.epa.gov/src/document/HQ/';
const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extraRoles: readonly ManifestRole[] = ['soil-resident', 'soil-industrial', 'air-resident'];

const addToEdition = async (args: string[]): Promise<void> => {
  const [edition, ...rest] = args;
  if (!edition || rest.length === 0) {
    console.error('usage: fetch-rsl --add <edition> <role>=<semsId> ... [--title <role>=<text>]');
    process.exit(2);
  }
  const dir = join(pkgDir, 'raw/rsl', edition);
  const manifest = readManifest(dir);
  const titles = new Map<string, string>();
  const wanted: [ManifestRole, string][] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === '--title') {
      const [role, ...t] = (rest[++i] ?? '').split('=');
      titles.set(role ?? '', t.join('='));
      continue;
    }
    const [role, id] = a.split('=');
    if (!extraRoles.includes(role as ManifestRole) || !id || !/^\d+$/.test(id)) {
      console.error(`bad argument ${a}; roles are ${extraRoles.join(', ')}`);
      process.exit(2);
    }
    wanted.push([role as ManifestRole, id]);
  }
  const retrieved = new Date().toISOString().slice(0, 10);
  for (const [role, id] of wanted) {
    if (manifest.files.some((f) => f.semsId === Number(id) || f.role === role)) {
      console.error(`${role} or ${id} is already in the manifest of ${edition}`);
      process.exit(1);
    }
    const res = await fetch(`${baseUrl}${id}`);
    if (!res.ok) {
      console.error(`fetch ${id} failed: ${res.status}; not added`);
      continue;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const file = `sems-${id}.xlsx`;
    writeFileSync(join(dir, file), bytes);
    manifest.files.push({
      file,
      semsId: Number(id),
      title: titles.get(role) ?? `${role} (set the title from the EPA document page)`,
      role,
      bytes: bytes.length,
      sha256: sha256(bytes),
      retrieved,
    });
    console.log(`added ${file} (${bytes.length} bytes)`);
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
};

if (process.argv[2] === '--add') {
  await addToEdition(process.argv.slice(3));
  process.exit(0);
}

const [edition, summaryId, parametersId, tapwaterId] = process.argv.slice(2);
if (!edition || !summaryId || !parametersId || !tapwaterId) {
  console.error('usage: fetch-rsl <edition> <summaryId> <parametersId> <tapwaterId>');
  process.exit(2);
}

const dir = join(pkgDir, 'raw/rsl', edition);
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
