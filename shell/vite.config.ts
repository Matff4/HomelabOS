import { defineConfig } from 'vite';
import { resolve } from 'path';
import { writeFileSync } from 'fs';

export default defineConfig({
  root: '.',
  // Assets served from /assets/* — index.html served from / by FastAPI
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  plugins: [
    {
      name: 'strip-crossorigin',
      transformIndexHtml(html) {
        return html.replace(/\s+crossorigin/g, '');
      },
    },
    {
      name: 'shell-version',
      closeBundle() {
        const out = resolve(__dirname, 'dist/shell-version.json');
        writeFileSync(
          out,
          JSON.stringify({ layout: 'grid-launchers-v2', builtAt: new Date().toISOString() }),
        );
      },
    },
  ],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/apps': 'http://127.0.0.1:8000',
    },
  },
});
