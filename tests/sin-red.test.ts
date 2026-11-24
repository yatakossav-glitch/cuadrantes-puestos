/** Test de red (ARQUITECTURA.md §8): la aplicación no debe hacer ninguna petición de red. */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAIZ = resolve(__dirname, '..');
const PATRONES: [string, RegExp][] = [
  ['fetch(', /\bfetch\s*\(/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['WebSocket', /WebSocket/],
  ['EventSource', /EventSource/],
  ['sendBeacon', /sendBeacon/],
  ['importScripts(', /importScripts\s*\(/],
  ['URL http(s)://', /https?:\/\/(?!www\.w3\.org\/)/],
];

function archivos(dir: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta));
    else if (/\.(ts|tsx|css)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}
function hallazgos(ruta: string): string[] {
  const texto = readFileSync(ruta, 'utf8');
  return PATRONES.filter(([, re]) => re.test(texto)).map(([n]) => `${ruta.replace(RAIZ, '')}: ${n}`);
}

describe('sin red · código fuente', () => {
  it('src/ no contiene APIs de red ni URLs externas', () => {
    const lista = archivos(join(RAIZ, 'src'));
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.flatMap(hallazgos)).toEqual([]);
  });
});

describe('sin red · dist/index.html', () => {
  const dist = join(RAIZ, 'dist', 'index.html');
  const caso = existsSync(dist) ? it : it.skip;
  caso('no contiene APIs de red y declara CSP con connect-src \'none\' (si falta dist: ejecutar npm run build antes)', () => {
    expect(hallazgos(dist)).toEqual([]);
    const html = readFileSync(dist, 'utf8');
    const meta = html.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i);
    expect(meta).not.toBeNull();
    expect(meta![0]).toContain("connect-src 'none'");
  });
});
