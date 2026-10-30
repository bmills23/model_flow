// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';

// DECISIONS M11 ruling 12: entry chunk under 200 kB, no chunk over 500 kB (minified, uncompressed).
const ENTRY_LIMIT = 200 * 1000;
// The entry chunk measured 24 kB with the shared chunk split out (162 kB without it); 100 kB keeps real headroom.
const ENTRY_HEADROOM_LIMIT = 100 * 1000;
const CHUNK_LIMIT = 500 * 1000;
// DECISIONS wave Y ruling 1: the engine's code chunks and every worker bundle stay under 400 kB, so each has at
// least 100 kB of headroom under the 500 kB rule. Generated criteria and chemical data chunks keep the 500 kB rule.
const ENGINE_LIMIT = 400 * 1000;
// Built JSON assets (the chemical property file is 633,152 bytes minified, 1,218,894 pretty-printed).
const JSON_ASSET_LIMIT = 700 * 1000;

// The engine split names its chunks engine-<group>; the worker entry
// files are <name>.worker-<hash>. The chunks a worker loads are the engine chunks and the shared chunks.
const ENGINE_CHUNK = /^engine-/;
const WORKER_FILE = /\.worker-/;

interface ManifestEntry {
  file: string;
  isEntry?: boolean;
}

// Vitest runs with the package directory as the working directory.
const root = process.cwd();
/** Every .js file under dir, relative to it: entry, route, worker and engine chunks alike. */
function jsFiles(dir: string, sub = ''): string[] {
  return readdirSync(join(dir, sub), { withFileTypes: true }).flatMap((d) => {
    const rel = sub ? `${sub}/${d.name}` : d.name;
    if (d.isDirectory()) return jsFiles(dir, rel);
    return d.name.endsWith('.js') ? [rel] : [];
  });
}

/** The chunks a built file imports statically (import"./x.js", import{a}from"./x.js", export*from"./x.js"). */
function staticImports(dir: string, file: string): string[] {
  const base = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
  const text = readFileSync(join(dir, file), 'utf8');
  const found = [
    ...text.matchAll(
      /(?:^|[;}\n])\s*(?:import|export)\s*(?:[^'"()]*?from\s*)?(["'])\.\/([^"']+\.js)\1/g,
    ),
  ];
  return found.map((m) => base + m[2]);
}

/** A loop of static imports among the files, or null. A loop between chunks reads a binding before it is set. */
function findImportLoop(dir: string, files: string[]): string | null {
  const done = new Set<string>();
  const path: string[] = [];
  const visit = (f: string): string | null => {
    const at = path.indexOf(f);
    if (at >= 0) return [...path.slice(at), f].join(' -> ');
    if (done.has(f)) return null;
    path.push(f);
    for (const g of staticImports(dir, f)) {
      const loop = visit(g);
      if (loop) return loop;
    }
    path.pop();
    done.add(f);
    return null;
  };
  for (const f of files) {
    const loop = visit(f);
    if (loop) return loop;
  }
  return null;
}

const outDir = mkdtempSync(join(tmpdir(), 'model-flow-size-'));

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('production bundle size', () => {
  it('keeps the entry chunk under 200 kB, every chunk and worker file under 500 kB, engine code under 400 kB', async () => {
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
    const entryFile = Object.values(manifest).find(
      (e) => e.isEntry === true && e.file.endsWith('.js'),
    );
    expect(entryFile, 'manifest has an entry chunk').toBeDefined();
    expect(statSync(join(outDir, entryFile!.file)).size, `entry ${entryFile!.file}`).toBeLessThan(
      ENTRY_LIMIT,
    );
    expect(statSync(join(outDir, entryFile!.file)).size, `entry ${entryFile!.file}`).toBeLessThan(
      ENTRY_HEADROOM_LIMIT,
    );
    // The manifest lists only the chunks the page graph reaches; the worker bundles and the chunks they load
    // are not in it, so the size rule reads every emitted .js file.
    const sizes = jsFiles(outDir).map((file) => ({
      file,
      size: statSync(join(outDir, file)).size,
    }));
    const names = sizes.map((s) => s.file.split('/').pop()!);
    expect(
      names.filter((n) => WORKER_FILE.test(n)).length,
      'emitted worker files',
    ).toBeGreaterThanOrEqual(7);
    // the guided flow's chunks: the step 3d Run worker and one lazy chunk per built step screen (each is
    // measured by the 500 kB rule below, the worker by the 400 kB rule)
    expect(names.filter((n) => /^run\.worker-/.test(n)).length, 'guided run worker').toBe(1);
    for (const step of [
      'Chemicals',
      'Site',
      'Properties',
      'Sources',
      'Run',
      'Pathways',
      'Receptors',
      'Toxicity',
      'Targets',
      'Results',
    ]) {
      expect(names.filter((n) => n.startsWith(`${step}Step-`)).length, `${step}Step chunk`).toBe(1);
    }
    expect(
      names.filter((n) => n.startsWith('engine-')).length,
      'engine chunks',
    ).toBeGreaterThanOrEqual(3);
    // The loop check below reads import statements; prove it finds them, so a change in the output's quoting or
    // syntax cannot make it pass by seeing nothing.
    expect(
      staticImports(outDir, entryFile!.file).length,
      'imports found in the entry',
    ).toBeGreaterThan(0);
    for (const s of sizes.filter((x) => WORKER_FILE.test(x.file.split('/').pop()!))) {
      expect(staticImports(outDir, s.file).length, `imports found in ${s.file}`).toBeGreaterThan(0);
    }
    // Engine chunks split by folder must not import one another in a loop (it fails when the worker starts).
    const engineFiles = sizes
      .map((s) => s.file)
      .filter((f) => ENGINE_CHUNK.test(f.split('/').pop()!));
    expect(
      engineFiles.filter((f) => staticImports(outDir, f).length > 0).length,
      'engine chunks that import another chunk',
    ).toBeGreaterThan(0);
    expect(
      findImportLoop(outDir, engineFiles),
      'static import loop among engine chunks',
    ).toBeNull();
    for (const s of sizes) {
      expect(s.size, s.file).toBeLessThan(CHUNK_LIMIT);
      const name = s.file.split('/').pop()!;
      if (ENGINE_CHUNK.test(name) || WORKER_FILE.test(name)) {
        expect(s.size, `${s.file} (engine code or worker)`).toBeLessThan(ENGINE_LIMIT);
      }
    }
    const jsonAssets = readdirSync(join(outDir, 'assets')).filter((f) => f.endsWith('.json'));
    expect(jsonAssets.length, 'built JSON assets').toBeGreaterThan(0);
    for (const f of jsonAssets) {
      expect(statSync(join(outDir, 'assets', f)).size, f).toBeLessThan(JSON_ASSET_LIMIT);
    }
  }, 120_000);
});
