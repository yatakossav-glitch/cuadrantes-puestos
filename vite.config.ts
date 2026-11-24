/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Política de seguridad del entregable: prohíbe cualquier conexión de red.
 * Solo se inyecta en el build (en desarrollo rompería la recarga en caliente de Vite).
 */
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' blob:",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'worker-src blob:',
  "connect-src 'none'",
  "font-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

function cspSinRed(): Plugin {
  return {
    name: 'csp-sin-red',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

// Entregable: un único dist/index.html autocontenido, sin peticiones externas.
export default defineConfig({
  base: './',
  plugins: [preact(), viteSingleFile({ removeViteModuleLoader: true }), cspSinRed()],
  build: {
    target: 'es2022',
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
  },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    passWithNoTests: true,
  },
});
