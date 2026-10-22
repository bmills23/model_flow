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

// BASE_PATH is set by the Pages workflow to "/model_flow/" for project-pages hosting.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  define: { __BUILD_COMMIT__: JSON.stringify(shortCommit()) },
  plugins: [react(), minifyJsonAssets()],
  build: {
    target: 'es2022',
    sourcemap: true,
    rolldownOptions: {
      output: {
        // React and its renderer are about 190 kB on their own; a separate vendor chunk keeps the
        // entry chunk to the shell and caches across releases. Sizes are enforced by bundleSize.test.ts.
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
});
