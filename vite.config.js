import { defineConfig } from 'vite';

// base relativa: o build funciona em qualquer pasta (GitHub Pages, subdomínio etc.)
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 1200 } });
