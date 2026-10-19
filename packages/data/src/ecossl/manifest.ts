import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface EcosslManifestFile {
  file: string;
  role: 'chemical' | 'guidance';
  /** Key in packages/engine/src/references/references.json. */
  reference: string;
  url: string;
  /** OSWER Directive number printed on the cover. */
  directive?: string;
  /** Cover date, YYYY-MM. */
  date?: string;
  /** Revision date printed on the cover, YYYY-MM. */
  revised?: string;
  bytes: number;
  sha256: string;
}

export interface EcosslManifest {
  /** Directory name: the date the bytes were fetched. */
  edition: string;
  /** Date the bytes were fetched, ISO 8601. */
  retrieved: string;
  /** The EPA listing page's own "last updated" date, ISO 8601. */
  listingPageDate: string;
  files: EcosslManifestFile[];
}

export const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

export const readManifest = (dir: string): EcosslManifest =>
  JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as EcosslManifest;

export interface ManifestCheck {
  manifest: EcosslManifest;
  /** Files found on disk, all matching their recorded checksum and size. */
  present: string[];
  /** Files listed but not on disk (only returned when allowed). */
  missing: string[];
}

/**
 * Throws if a listed file on disk differs in SHA-256 or size from the manifest. The PDFs (about 26 MB)
 * are fetched, not committed, so a missing file is an error only when `allowMissing` is false.
 */
export const verifyManifest = (
  dir: string,
  opts: { allowMissing?: boolean } = {},
): ManifestCheck => {
  const manifest = readManifest(dir);
  const present: string[] = [];
  const missing: string[] = [];
  for (const f of manifest.files) {
    const path = join(dir, f.file);
    if (!existsSync(path)) {
      if (!opts.allowMissing) throw new Error(`Eco-SSL raw file ${f.file} is missing from ${dir}`);
      missing.push(f.file);
      continue;
    }
    const bytes = readFileSync(path);
    const actual = sha256(bytes);
    if (actual !== f.sha256) {
      throw new Error(
        `Eco-SSL raw file ${f.file} checksum mismatch: manifest ${f.sha256}, file ${actual}`,
      );
    }
    if (bytes.length !== f.bytes) {
      throw new Error(
        `Eco-SSL raw file ${f.file} size mismatch: manifest ${f.bytes}, file ${bytes.length}`,
      );
    }
    present.push(f.file);
  }
  return { manifest, present, missing };
};
