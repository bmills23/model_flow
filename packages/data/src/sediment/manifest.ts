import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SedimentManifestFile {
  file: string;
  role: 'report' | 'table' | 'values';
  /** Key in packages/engine/src/references/references.json. */
  reference: string;
  url?: string;
  /** Date of the document or table, ISO 8601, when it has one. */
  pageDate?: string;
  bytes: number;
  sha256: string;
}

export interface SedimentManifest {
  /** Directory-level edition label shared with the generated file. */
  edition: string;
  /** Date the committed bytes were fetched or the values transcribed, ISO 8601. */
  retrieved: string;
  files: SedimentManifestFile[];
}

export const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

export const readManifest = (dir: string): SedimentManifest =>
  JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as SedimentManifest;

/** Throws if a listed file is missing or its SHA-256 or size differs from the manifest. */
export const verifySedimentManifest = (dir: string): SedimentManifest => {
  const manifest = readManifest(dir);
  for (const f of manifest.files) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(dir, f.file));
    } catch {
      throw new Error(`sediment raw file ${f.file} is missing from ${dir}`);
    }
    const actual = sha256(bytes);
    if (actual !== f.sha256) {
      throw new Error(
        `sediment raw file ${f.file} checksum mismatch: manifest ${f.sha256}, file ${actual}`,
      );
    }
    if (bytes.length !== f.bytes) {
      throw new Error(
        `sediment raw file ${f.file} size mismatch: manifest ${f.bytes}, file ${bytes.length}`,
      );
    }
  }
  return manifest;
};
