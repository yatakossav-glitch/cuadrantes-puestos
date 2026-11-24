/**
 * Almacén local (localStorage) del estado de la aplicación.
 * Recibe el almacén por parámetro para poder probarse en Node.
 */
import { CLAVE_ALMACEN, VERSION_ESQUEMA, type DocumentoPersistido, type ResultadoGuardado } from '../modelo/esquema';
import type { EstadoApp } from '../modelo/tipos';
import { comprobarCoherencia, validarEstructura } from './coherencia';
import { migrar } from './migraciones';

export interface AlmacenClaveValor {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export type ResultadoCarga =
  | { tipo: 'vacio' }
  | { tipo: 'ok'; estado: EstadoApp; versionOrigen: number; avisos: string[] }
  | { tipo: 'error'; error: string };

/** localStorage si es accesible; null si el navegador lo bloquea o no existe. */
export function obtenerAlmacenNavegador(): AlmacenClaveValor | null {
  try {
    const almacen = globalThis.localStorage;
    if (!almacen) return null;
    // Algunos navegadores solo fallan al escribir (modo privado, bloqueo de datos).
    const prueba = `${CLAVE_ALMACEN}.prueba`;
    almacen.setItem(prueba, '1');
    almacen.removeItem(prueba);
    return almacen;
  } catch {
    return null;
  }
}

function esErrorDeCuota(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const { name, code, message } = e as { name?: unknown; code?: unknown; message?: unknown };
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014 ||
    (typeof message === 'string' && /quota/i.test(message))
  );
}

/** Guarda el estado. Nunca lanza. */
export function guardarEstado(estado: EstadoApp, almacen: AlmacenClaveValor | null, ahora: Date = new Date()): ResultadoGuardado {
  if (!almacen) {
    return { ok: false, error: 'Este navegador no permite guardar datos. Usa «Exportar datos» para no perder tu trabajo.' };
  }
  try {
    const documento: DocumentoPersistido = { version: VERSION_ESQUEMA, guardado: ahora.toISOString(), estado };
    almacen.setItem(CLAVE_ALMACEN, JSON.stringify(documento));
    return { ok: true };
  } catch (e) {
    if (esErrorDeCuota(e)) {
      return { ok: false, error: 'No queda espacio en el navegador para guardar los cambios. Usa «Exportar datos» para no perder tu trabajo.' };
    }
    return { ok: false, error: 'No se han podido guardar los cambios en este navegador. Usa «Exportar datos» para no perder tu trabajo.' };
  }
}

/** Carga el estado guardado, migrado, validado y con avisos de coherencia. Nunca lanza. */
export function cargarEstado(almacen: AlmacenClaveValor | null): ResultadoCarga {
  if (!almacen) return { tipo: 'vacio' };
  let texto: string | null;
  try {
    texto = almacen.getItem(CLAVE_ALMACEN);
  } catch {
    return { tipo: 'error', error: 'No se ha podido leer el almacenamiento del navegador.' };
  }
  if (texto === null) return { tipo: 'vacio' };

  let documento: unknown;
  try {
    documento = JSON.parse(texto);
  } catch {
    return { tipo: 'error', error: 'Los datos guardados están dañados y no se pueden leer.' };
  }
  if (typeof documento !== 'object' || documento === null || Array.isArray(documento)) {
    return { tipo: 'error', error: 'Los datos guardados no tienen el formato esperado.' };
  }
  const { version, estado } = documento as { version?: unknown; estado?: unknown };
  if (typeof version !== 'number') return { tipo: 'error', error: 'Los datos guardados no indican su versión.' };

  const migrado = migrar(estado, version);
  if (!migrado.ok) return { tipo: 'error', error: migrado.error };
  const valido = validarEstructura(migrado.datos);
  if (!valido.ok) return { tipo: 'error', error: valido.error };
  return { tipo: 'ok', estado: valido.estado, versionOrigen: version, avisos: comprobarCoherencia(valido.estado) };
}
