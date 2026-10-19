import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEcossl, serialize } from '../src/ecossl/build.js';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const edition = process.argv[2] ?? '2026-10-18';
const rawDir = join(pkg, 'raw/ecossl', edition);
const outDir = join(pkg, 'generated', `ecossl-${edition}`);

// Fails on a checksum mismatch of any fetched PDF before writing anything.
const built = buildEcossl(rawDir);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'ecossl.json'), serialize(built.json));
console.log(
  `ecossl ${edition}: ${built.json.substances.length} substances mapped, ${built.json.unmapped.length} unmapped, ${built.wildlife.length} wildlife rows`,
);
