import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// BASE_PATH is set by the Pages workflow to "/model_flow/" for project-pages hosting.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  build: { target: 'es2022', sourcemap: true },
});
