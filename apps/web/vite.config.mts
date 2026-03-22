/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  server: {
    port: 4300,
    host: '0.0.0.0',
    https: true,
  },
  preview: {
    port: 4300,
    host: '0.0.0.0',
  },
  plugins: [react(), basicSsl()],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
}));
