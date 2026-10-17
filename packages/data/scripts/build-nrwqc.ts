import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNrwqc, serialize } from '../src/nrwqc/build.js';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const edition = process.argv[2] ?? '2026-10-16';
const rawDir = join(pkg, 'raw/nrwqc', edition);
const outDir = join(pkg, 'generated', `nrwqc-${edition}`);

// Fails on a checksum mismatch before reading anything.
const built = buildNrwqc(rawDir);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'aquatic.json'), serialize(built.aquatic));
writeFileSync(join(outDir, 'human-health.json'), serialize(built.humanHealth));
writeFileSync(join(outDir, 'hardness.json'), serialize(built.hardness));
console.log(
  `nrwqc ${edition}: ${built.aquatic.rows.length} aquatic life rows, ${built.humanHealth.rows.length} human health rows, ${built.hardness.metals.length} hardness metals`,
);
