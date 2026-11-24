/** Generación de identificadores. */
import type { Id } from './tipos';

/** Id aleatorio corto con prefijo: 'per-3f9a1c2e'. Usa crypto si existe. */
export function nuevoId(prefijo: string): Id {
  const c = globalThis.crypto;
  const azar = c?.randomUUID ? c.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return `${prefijo}-${azar}`;
}

/** Generador determinista para tests y datos de ejemplo: 'asg-1', 'asg-2'… */
export function crearGeneradorIds(prefijo: string): () => Id {
  let n = 0;
  return () => `${prefijo}-${++n}`;
}
