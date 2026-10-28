import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: 'development-csp',
    apply: 'serve',
    // Vite's refresh preamble and injected styles need inline permission in development only.
    // Electron supplies a separate development CSP response header. Packaged HTML keeps its strict policy.
    transformIndexHtml: html => html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*\/>/, ''),
  }],
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { sourcemap: false, target: 'es2022' },
});
