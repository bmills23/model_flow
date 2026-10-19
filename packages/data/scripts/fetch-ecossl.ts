// Manual use. The Eco-SSL PDFs (about 26 MB) are not committed; this script fetches them and checks
// them against the committed checksum manifest.
//
//   tsx scripts/fetch-ecossl.ts verify <edition>   fetch any missing PDF into raw/ecossl/<edition>/ and
//                                                  verify every checksum against manifest.json
//   tsx scripts/fetch-ecossl.ts create <edition>   first fetch of a new edition: refuses to write into
//                                                  an existing directory, then writes manifest.json
//
// A new fetch is a new directory, never an in-place overwrite. After `create`, review the sizes and
// checksums, check the cover dates against documents.ts, then run build-ecossl and review the diff.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCUMENTS, GUIDANCE, GUIDANCE_FILE, documentUrl } from '../src/ecossl/documents.js';
import {
  sha256,
  verifyManifest,
  type EcosslManifest,
  type EcosslManifestFile,
} from '../src/ecossl/manifest.js';

const [mode, edition] = process.argv.slice(2);
if ((mode !== 'verify' && mode !== 'create') || !edition) {
  console.error('usage: fetch-ecossl <verify|create> <edition-directory-name>');
  process.exit(2);
}
const dir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'raw/ecossl', edition);

const get = async (file: string): Promise<Uint8Array> => {
  const url = documentUrl(file);
  const res = await fetch(url, { headers: { 'user-agent': 'model-flow-data-build' } });
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

if (mode === 'create') {
  if (existsSync(dir)) {
    console.error(`${dir} already exists; a new fetch needs a new directory`);
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });
  const files: EcosslManifestFile[] = [];
  const guidance = await get(GUIDANCE_FILE);
  writeFileSync(join(dir, GUIDANCE_FILE), guidance);
  files.push({
    file: GUIDANCE_FILE,
    role: 'guidance',
    reference: 'epaecosslguidance',
    url: documentUrl(GUIDANCE_FILE),
    directive: GUIDANCE.directive,
    date: GUIDANCE.date,
    revised: GUIDANCE.revised,
    bytes: guidance.length,
    sha256: sha256(guidance),
  });
  for (const d of DOCUMENTS) {
    const bytes = await get(d.file);
    writeFileSync(join(dir, d.file), bytes);
    files.push({
      file: d.file,
      role: 'chemical',
      reference: 'epaecossl',
      url: documentUrl(d.file),
      directive: d.directive,
      date: d.date,
      ...(d.revised ? { revised: d.revised } : {}),
      bytes: bytes.length,
      sha256: sha256(bytes),
    });
  }
  const manifest: EcosslManifest = {
    edition,
    retrieved: new Date().toISOString().slice(0, 10),
    listingPageDate: process.env['ECOSSL_LISTING_PAGE_DATE'] ?? '',
    files,
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`wrote ${files.length} files and manifest.json to ${dir}`);
} else {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as EcosslManifest;
  mkdirSync(dir, { recursive: true });
  for (const f of manifest.files) {
    if (existsSync(join(dir, f.file))) continue;
    writeFileSync(join(dir, f.file), await get(f.file));
    console.log(`fetched ${f.file}`);
  }
  const { present } = verifyManifest(dir);
  console.log(`verified ${present.length} files against manifest.json`);
}
