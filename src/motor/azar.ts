/** Generador pseudoaleatorio determinista (mulberry32). Función pura salvo por el estado propio del generador. */

/** Devuelve una función que produce números en [0, 1) a partir de una semilla entera. */
export function mulberry32(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entero aleatorio en [0, n). Devuelve 0 si n ≤ 1. */
export function enteroHasta(azar: () => number, n: number): number {
  return n <= 1 ? 0 : Math.floor(azar() * n);
}
