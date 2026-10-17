import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ManifestFile {
  file: string;
  semsId: number;
  title: string;
  role: 'summary' | 'parameters' | 'tapwater';
  bytes: number;
  sha256: string;
}

export interface Manifest {
  edition: string;
  reference: string;
  baseUrl: string;
  retrieved: string;
  files: ManifestFile[];
}

export const readManifest = (dir: string): Manifest =>
  JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest;

export const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

/** Throws if a listed file is missing or its SHA-256 differs from the manifest. */
export const verifyManifest = (dir: string): Manifest => {
  const manifest = readManifest(dir);
  for (const f of manifest.files) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(dir, f.file));
    } catch {
      throw new Error(`RSL raw file ${f.file} is missing from ${dir}`);
    }
    const actual = sha256(bytes);
    if (actual !== f.sha256) {
      throw new Error(
        `RSL raw file ${f.file} checksum mismatch: manifest ${f.sha256}, file ${actual}`,
      );
    }
  }
  return manifest;
};
