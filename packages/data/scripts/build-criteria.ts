// Builds generated/criteria-<edition>/<set>.json (ccme, eu, uk, anzg, macdonald2000) from the committed CSVs
// under raw/. Never touches the network and fails on a checksum mismatch.
//
//   tsx scripts/build-criteria.ts              build the JSON
//   tsx scripts/build-criteria.ts --manifest   rewrite raw/criteria-sets.manifest.json from the files on
//                                              disk and the acquisition manifests (manual use, after
//                                              re-running an extract script)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCriteria, serializeSet } from '../src/criteria/build.js';
import {
  MANIFEST_FILE,
  sha256,
  type CriteriaManifest,
  type CriteriaManifestFile,
  type CriteriaManifestSet,
} from '../src/criteria/manifest.js';
import type { CriteriaSetId } from '../src/criteria/types.js';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(pkg, 'raw');
const generatedDir = join(pkg, 'generated');
const edition = '2026-10-23';

if (process.argv.includes('--manifest')) {
  const json = <T>(rel: string): T => JSON.parse(readFileSync(join(rawDir, rel), 'utf8')) as T;
  const pin = (file: string, role: 'table' | 'source'): CriteriaManifestFile => {
    const bytes = readFileSync(join(rawDir, file));
    return { file, role, bytes: bytes.length, sha256: sha256(bytes) };
  };
  type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const ccme = json<Loose>('ccme/manifest.json');
  const eu = json<Loose>('eu-eqs/manifest.json');
  const uk = json<Loose>('uk-eqs/manifest.json');
  const anzg = json<Loose>('anzg/manifest.json');
  const mac = json<Loose>('macdonald2000/manifest.json');
  const retrieved = '2026-10-23';
  const sets: Record<CriteriaSetId, CriteriaManifestSet> = {
    ccme: {
      source: {
        title:
          'Canadian Environmental Quality Guidelines, summary table (aquatic life water and sediment columns)',
        references: ['ccme2026summary'],
        url: ccme.files[0].pageUrl,
        retrieved,
        terms:
          'No reuse licence is stated: the site footer reads "All rights reserved". The fetched file is therefore not redistributed; only the guideline values ship, as facts, with the citation, the retrieval date and the SHA-256 of the fetched file. CCME describes its guidance as voluntary and advises consulting the federal, provincial or territorial authority having jurisdiction.',
        termsUrl: ccme.terms.url,
        redistributed: false,
        sourceSha256: ccme.files[0].sha256,
        csv: 'packages/data/raw/ccme/ccme.csv',
      },
      files: [pin('ccme/ccme.csv', 'table')],
    },
    eu: {
      source: {
        title: eu.instrument,
        references: ['eudir2008105', 'eudir201339'],
        url: eu.files[0].url,
        pageDate: '2013-09-13',
        retrieved,
        terms: eu.terms.statement,
        termsUrl: eu.terms.url,
        redistributed: true,
        sourceSha256: eu.files[0].sha256,
        csv: 'packages/data/raw/eu-eqs/eqs.csv',
      },
      files: [
        pin('eu-eqs/consolidated-02008L0105-20130913.xhtml', 'source'),
        pin('eu-eqs/eqs.csv', 'table'),
      ],
    },
    uk: {
      source: {
        title: uk.instrument,
        references: ['ukwfdstandards2015'],
        url: uk.files[0].url,
        retrieved,
        terms: uk.terms.statement,
        termsUrl: uk.terms.url,
        redistributed: true,
        sourceSha256: uk.files[0].sha256,
        csv: 'packages/data/raw/uk-eqs/eqs.csv',
      },
      files: [
        pin('uk-eqs/directions-2015.pdf', 'source'),
        pin('uk-eqs/eqs.csv', 'table'),
        pin('uk-eqs/zinc-abc.csv', 'table'),
      ],
    },
    anzg: {
      source: {
        title:
          'Australian and New Zealand Guidelines for Fresh and Marine Water Quality, toxicant default guideline values master table',
        references: ['anzg2018', 'warne2018'],
        url: anzg.source.url,
        pageDate: '2026-09-10',
        retrieved,
        terms: anzg.terms.summary,
        termsUrl: anzg.terms.url,
        redistributed: false,
        sourceSha256: anzg.source.sha256,
        csv: 'packages/data/raw/anzg/anzg-2018-dgv.csv',
      },
      files: [pin('anzg/anzg-2018-dgv.csv', 'table')],
    },
    macdonald2000: {
      source: {
        title:
          'Development and evaluation of consensus-based sediment quality guidelines for freshwater ecosystems, Tables 2 and 3',
        references: ['macdonald2000', 'macdonald2000copy', 'macdonald2000epacopy'],
        url: mac.transcribedFrom.url,
        retrieved,
        terms: mac.terms.statement,
        termsUrl: mac.terms.termsUrl,
        redistributed: false,
        sourceSha256: mac.transcribedFrom.sha256,
        csv: 'packages/data/raw/macdonald2000/consensus-tec-pec.csv',
      },
      files: [pin('macdonald2000/consensus-tec-pec.csv', 'table')],
    },
  };
  const manifest: CriteriaManifest = { edition, retrieved, sets };
  writeFileSync(join(rawDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n');
  console.log('wrote the manifest');
  process.exit(0);
}

const built = buildCriteria(rawDir, generatedDir);
const outDir = join(generatedDir, `criteria-${built.edition}`);
mkdirSync(outDir, { recursive: true });
const counts: string[] = [];
for (const [set, file] of Object.entries(built.sets)) {
  writeFileSync(join(outDir, `${set}.json`), serializeSet(file));
  counts.push(`${set} ${file.rows.length}`);
}
console.log(`criteria ${built.edition}: ${counts.join(', ')} rows`);
