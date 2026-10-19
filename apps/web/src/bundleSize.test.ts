// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';

// DECISIONS M11 ruling 12: entry chunk under 200 kB, no chunk over 500 kB (minified, uncompressed).
const ENTRY_LIMIT = 200 * 1000;
const CHUNK_LIMIT = 500 * 1000;
// Built JSON assets (the chemical property file is 633,152 bytes minified, 1,218,894 pretty-printed).
const JSON_ASSET_LIMIT = 700 * 1000;

interface ManifestEntry {
  file: string;
  isEntry?: boolean;
}

// Vitest runs with the package directory as the working directory.
const root = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), 'model-flow-size-'));

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('production bundle size', () => {
  it('keeps the entry chunk under 200 kB and every chunk under 500 kB', async () => {
    // Vitest sets NODE_ENV=test, which would bundle the development build of React.
    const priorEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    await build({
      root,
      mode: 'production',
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true, manifest: true, sourcemap: false },
    });
    process.env.NODE_ENV = priorEnv;
    const manifest = JSON.parse(
      readFileSync(join(outDir, '.vite', 'manifest.json'), 'utf8'),
    ) as Record<string, ManifestEntry>;
    const sizes = Object.values(manifest)
      .filter((e) => e.file.endsWith('.js'))
      .map((e) => ({
        file: e.file,
        entry: e.isEntry === true,
        size: statSync(join(outDir, e.file)).size,
      }));
    const entry = sizes.find((s) => s.entry);
    expect(entry, 'manifest has an entry chunk').toBeDefined();
    expect(entry!.size, `entry ${entry!.file}`).toBeLessThan(ENTRY_LIMIT);
    for (const s of sizes) expect(s.size, s.file).toBeLessThan(CHUNK_LIMIT);
    const jsonAssets = readdirSync(join(outDir, 'assets')).filter((f) => f.endsWith('.json'));
    expect(jsonAssets.length, 'built JSON assets').toBeGreaterThan(0);
    for (const f of jsonAssets) {
      expect(statSync(join(outDir, 'assets', f)).size, f).toBeLessThan(JSON_ASSET_LIMIT);
    }
  }, 120_000);
});
