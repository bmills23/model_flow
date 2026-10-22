import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRsl, serialize } from '../src/rsl/build.js';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const edition = process.argv[2] ?? '2024-11';
const rawDir = join(pkg, 'raw/rsl', edition);
const outDir = join(pkg, 'generated', `rsl-${edition}`);

// Fails on a checksum mismatch before reading anything.
const built = await buildRsl(rawDir);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'chemicals.json'), serialize(built.chemicals));
writeFileSync(join(outDir, 'risk-chemicals.json'), serialize(built.risk));
writeFileSync(join(outDir, 'cleanup-chemicals.json'), serialize(built.cleanup));
writeFileSync(join(outDir, 'tox.json'), serialize(built.tox));
writeFileSync(join(outDir, 'screening-levels.json'), serialize(built.screening));
console.log(
  `rsl ${edition}: ${built.chemicals.chemicals.length} chemicals, ${built.tox.toxicity.length} toxicity rows, ${built.screening.columns.length} screening-level columns`,
);
