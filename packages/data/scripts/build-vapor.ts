import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialize } from '../src/rsl/build.js';
import type { ChemicalsFile } from '../src/rsl/types.js';
import { buildVapor } from '../src/vapor/build.js';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const edition = process.argv[2] ?? '2024-11';
const rsl = JSON.parse(
  readFileSync(join(pkg, 'generated', `rsl-${edition}`, 'chemicals.json'), 'utf8'),
) as ChemicalsFile;

// Fails on a checksum mismatch before reading anything. Run after build-rsl: it reads that output.
const built = buildVapor(join(pkg, 'raw/vapor/epa2004je'), rsl);
const outDir = join(pkg, 'generated/vapor');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'vapor-chemicals.json'), serialize(built));
console.log(
  `vapor: ${built.chemicals.length} chemicals, ${built.unmatchedEpa2004je.length} lookup rows not in the RSL`,
);
