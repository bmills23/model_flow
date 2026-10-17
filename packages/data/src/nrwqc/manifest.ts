import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface NrwqcManifestFile {
  file: string;
  role: 'aquatic' | 'human-health';
  /** Key in packages/engine/src/references/references.json. */
  reference: string;
  url: string;
  /** The page's own "last updated" date, ISO 8601: this is the table's edition. */
  pageDate: string;
  bytes: number;
  sha256: string;
}

export interface NrwqcManifest {
  /** Directory name: the pages are not numbered editions, so the directory is named by date. */
  edition: string;
  /** Date the committed bytes were fetched, ISO 8601. */
  retrieved: string;
  files: NrwqcManifestFile[];
}

export const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

export const readManifest = (dir: string): NrwqcManifest =>
  JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as NrwqcManifest;

/** Throws if a listed file is missing or its SHA-256 or size differs from the manifest. */
export const verifyManifest = (dir: string): NrwqcManifest => {
  const manifest = readManifest(dir);
  for (const f of manifest.files) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(dir, f.file));
    } catch {
      throw new Error(`NRWQC raw file ${f.file} is missing from ${dir}`);
    }
    const actual = sha256(bytes);
    if (actual !== f.sha256) {
      throw new Error(
        `NRWQC raw file ${f.file} checksum mismatch: manifest ${f.sha256}, file ${actual}`,
      );
    }
    if (bytes.length !== f.bytes) {
      throw new Error(
        `NRWQC raw file ${f.file} size mismatch: manifest ${f.bytes}, file ${bytes.length}`,
      );
    }
  }
  return manifest;
};
