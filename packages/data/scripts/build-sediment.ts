// Builds generated/sediment-2026-10-16/benchmarks.json from the committed CSVs. Never touches the
// network and fails on a checksum mismatch.
//
//   tsx scripts/build-sediment.ts            build the JSON
//   tsx scripts/build-sediment.ts --manifest rewrite the two manifest.json files from the files on disk
//                                            (manual use, after re-running extract-r4-sediment)
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSediment, serialize } from '../src/sediment/build.js';
import { sha256, type SedimentManifest } from '../src/sediment/manifest.js';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(pkg, 'raw/sediment');
const edition = '2026-10-16';

if (process.argv.includes('--manifest')) {
  const R4_URL =
    'https://www.epa.gov/sites/default/files/2018-03/documents/era_regional_supplemental_guidance_report-march-2018_update.pdf';
  const entry = (
    dir: string,
    file: string,
    role: 'report' | 'table' | 'values',
    reference: string,
    extra: { url?: string; pageDate?: string } = {},
  ) => {
    const bytes = readFileSync(join(rawDir, dir, file));
    return { file, role, reference, ...extra, bytes: bytes.length, sha256: sha256(bytes) };
  };
  const manifests: Record<string, SedimentManifest> = {
    'epa-r4-2018': {
      edition,
      retrieved: '2026-10-17',
      files: [
        entry('epa-r4-2018', 'report.pdf', 'report', 'epa2018r4era', {
          url: R4_URL,
          pageDate: '2018-03-19',
        }),
        entry('epa-r4-2018', 'table-2a.csv', 'table', 'epa2018r4era'),
        entry('epa-r4-2018', 'table-2b.csv', 'table', 'epa2018r4era'),
        entry('epa-r4-2018', 'table-2c.csv', 'table', 'epa2018r4era'),
      ],
    },
  };
  for (const [dir, m] of Object.entries(manifests)) {
    writeFileSync(join(rawDir, dir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
  }
  console.log('wrote the manifest');
  process.exit(0);
}

const outDir = join(pkg, 'generated', `sediment-${edition}`);
const built = buildSediment(rawDir);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'benchmarks.json'), serialize(built));
console.log(`sediment ${edition}: ${built.rows.length} benchmark values`);
