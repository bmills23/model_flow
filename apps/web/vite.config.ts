import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// BASE_PATH is set by the Pages workflow to "/model_flow/" for project-pages hosting.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
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
