import { defineConfig } from 'vite';

export default defineConfig({
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: 'dist/client',
  },
});
