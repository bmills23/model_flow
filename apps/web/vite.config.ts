import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { shortCommit } from './src/buildCommit';

// The chemical property file is imported with ?url, which copies it unchanged. The committed file is
// pretty-printed (1.2 MB); this rewrites emitted JSON assets minified (0.6 MB) without touching the source.
function minifyJsonAssets(): Plugin {
  return {
    name: 'minify-json-assets',
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== 'asset' || !item.fileName.endsWith('.json')) continue;
        const text =
          typeof item.source === 'string' ? item.source : Buffer.from(item.source).toString('utf8');
        item.source = JSON.stringify(JSON.parse(text));
      }
    },
  };
}

// The engine is one package with one entry point, so without help the bundler puts all of it in one chunk
// (498 kB once, with the worker bundles over 570 kB). These groups split it by folder under
// packages/engine/src/processes, into chunks that never import each other in a loop: the value imports between
// the folders form one cycle (vapor, vadose and groundwater import one another), so those three share a chunk,
// and a chunk that imports another folder's chunk is never imported back by it. A loop between chunks fails at
// run time (a binding read before its module has run), and bundleSize.test.ts rejects one. Each chunk stays under
// 400 kB (ENGINE_LIMIT there). Dependencies are not pulled in with a group's modules, so a chunk holds its own
// folders only. The pages and the workers use the same groups.
const ENGINE_FAMILY = /packages[\\/]engine[\\/]src[\\/]processes[\\/]([^\\/]+)[\\/]/;
const ENGINE_FAMILY_CHUNK: Record<string, string> = {
  vapor: 'engine-vapor',
  vadose: 'engine-vapor',
  groundwater: 'engine-vapor',
  exposure: 'engine-exposure',
  risk: 'engine-exposure',
  saturatedSource: 'engine-saturatedSource',
  cleanup: 'engine-cleanup',
  surfaceWater: 'engine-surfaceWater',
  uncertainty: 'engine-uncertainty',
};
function engineChunk(id: string): string | null {
  const family = ENGINE_FAMILY.exec(id)?.[1];
  if (family) return ENGINE_FAMILY_CHUNK[family] ?? 'engine-processes';
  if (/packages[\\/]engine[\\/]src[\\/](numerics|references|registry)[\\/]/.test(id))
    return 'engine-core';
  if (/node_modules[\\/](\.pnpm[\\/])?(zod|@stdlib)/.test(id)) return 'engine-libs';
  return null;
}
function codeSplitting() {
  return {
    includeDependenciesRecursively: false,
    groups: [
      // React and its renderer are about 190 kB on their own; a separate vendor chunk keeps the entry chunk
      // to the shell and caches across releases.
      {
        name: 'react-vendor',
        test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
        priority: 20,
      },
      { name: engineChunk, priority: 10 },
    ],
  };
}

// BASE_PATH is set by the Pages workflow to "/model_flow/" for project-pages hosting.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  define: { __BUILD_COMMIT__: JSON.stringify(shortCommit()) },
  plugins: [react(), minifyJsonAssets()],
  build: {
    target: 'es2022',
    sourcemap: true,
    rolldownOptions: { output: { codeSplitting: codeSplitting() } },
  },
  worker: {
    // A worker is bundled apart from the page. ES modules let it share chunks and split its code the same way;
    // every worker is created with { type: 'module' }.
    format: 'es',
    rolldownOptions: { output: { codeSplitting: codeSplitting() } },
  },
});
