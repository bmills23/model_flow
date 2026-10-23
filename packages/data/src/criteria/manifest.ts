import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CriteriaSetId, CriteriaSource } from './types.js';

export interface CriteriaManifestFile {
  /** Path relative to the raw directory. */
  file: string;
  role: 'table' | 'source';
  bytes: number;
  sha256: string;
}

export interface CriteriaManifestSet {
  source: CriteriaSource;
  /** The committed files the build reads, each pinned by size and SHA-256. */
  files: CriteriaManifestFile[];
}

export interface CriteriaManifest {
  edition: string;
  retrieved: string;
  sets: Record<CriteriaSetId, CriteriaManifestSet>;
}

export const MANIFEST_FILE = 'criteria-sets.manifest.json';

export const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

export const readCriteriaManifest = (rawDir: string): CriteriaManifest =>
  JSON.parse(readFileSync(join(rawDir, MANIFEST_FILE), 'utf8')) as CriteriaManifest;

/** Throws if a listed file is missing or its SHA-256 or size differs from the manifest. */
export const verifyCriteriaManifest = (rawDir: string): CriteriaManifest => {
  const manifest = readCriteriaManifest(rawDir);
  for (const [set, entry] of Object.entries(manifest.sets)) {
    for (const f of entry.files) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(join(rawDir, f.file));
      } catch {
        throw new Error(`criteria raw file ${f.file} (${set}) is missing from ${rawDir}`);
      }
      const actual = sha256(bytes);
      if (actual !== f.sha256) {
        throw new Error(
          `criteria raw file ${f.file} checksum mismatch: manifest ${f.sha256}, file ${actual}`,
        );
      }
      if (bytes.length !== f.bytes) {
        throw new Error(
          `criteria raw file ${f.file} size mismatch: manifest ${f.bytes}, file ${bytes.length}`,
        );
      }
    }
  }
  return manifest;
};
