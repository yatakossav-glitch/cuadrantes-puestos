/**
 * Copias de seguridad: PREFIJO + base64( gzip( JSON(Respaldo) ) ).
 * Usa CompressionStream/DecompressionStream, nativos en Edge, Chrome y Node.
 */
import {
  FORMATO_RESPALDO,
  PREFIJO_RESPALDO,
  VERSION_ESQUEMA,
  type Respaldo,
  type ResultadoImportacion,
} from '../modelo/esquema';
import type { EstadoApp } from '../modelo/tipos';
import { comprobarCoherencia, validarEstructura } from './coherencia';
import { migrar } from './migraciones';

const TROZO = 0x8000;

async function procesar(datos: Uint8Array, transformacion: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const escritor = transformacion.writable.getWriter();
  // No se espera a la escritura: el flujo de salida se consume a la vez.
  const escritura = escritor.write(datos as Uint8Array<ArrayBuffer>).then(() => escritor.close());
  // Si el flujo falla, el error llega por la lectura; evita un rechazo sin atender.
  escritura.catch(() => undefined);
  const lector = transformacion.readable.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    partes.push(value);
    total += value.length;
  }
  await escritura;
  const salida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    salida.set(p, pos);
    pos += p.length;
  }
  return salida;
}

function aBase64(bytes: Uint8Array): string {
  let binario = '';
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  }
  return btoa(binario);
}

function desdeBase64(texto: string): Uint8Array {
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** Copia del estado con todos los alias a null; no modifica el original. */
function sinAlias(estado: EstadoApp): EstadoApp {
  return { ...estado, personas: estado.personas.map((p) => ({ ...p, alias: null })) };
}

export async function exportarRespaldo(estado: EstadoApp, opciones: { sinAlias: boolean }, ahora: Date = new Date()): Promise<string> {
  const respaldo: Respaldo = {
    formato: FORMATO_RESPALDO,
    version: VERSION_ESQUEMA,
    exportado: ahora.toISOString(),
    sinAlias: opciones.sinAlias,
    estado: opciones.sinAlias ? sinAlias(estado) : estado,
  };
  const json = new TextEncoder().encode(JSON.stringify(respaldo));
  const comprimido = await procesar(json, new CompressionStream('gzip'));
  return PREFIJO_RESPALDO + aBase64(comprimido);
}

/** Importa un texto de copia de seguridad. Nunca lanza. */
export async function importarRespaldo(texto: string): Promise<ResultadoImportacion> {
  const limpio = texto.replace(/\s+/g, '');
  if (!limpio.startsWith(PREFIJO_RESPALDO)) {
    return { ok: false, error: 'El texto no empieza como una copia de seguridad de esta aplicación. Copia el texto completo, desde el principio.' };
  }
  let datos: unknown;
  try {
    const comprimido = desdeBase64(limpio.slice(PREFIJO_RESPALDO.length));
    const bytes = await procesar(comprimido, new DecompressionStream('gzip'));
    datos = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, error: 'La copia de seguridad está dañada o incompleta. Vuelve a copiarla entera.' };
  }
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) {
    return { ok: false, error: 'La copia de seguridad no tiene el formato esperado.' };
  }
  const { formato, version, estado } = datos as { formato?: unknown; version?: unknown; estado?: unknown };
  if (formato !== FORMATO_RESPALDO) return { ok: false, error: 'El texto no es una copia de seguridad de esta aplicación (formato distinto).' };
  if (typeof version !== 'number') return { ok: false, error: 'La copia de seguridad no indica su versión.' };

  const migrado = migrar(estado, version);
  if (!migrado.ok) return { ok: false, error: migrado.error };
  const valido = validarEstructura(migrado.datos);
  if (!valido.ok) return { ok: false, error: valido.error };
  return { ok: true, estado: valido.estado, versionOrigen: version, avisos: comprobarCoherencia(valido.estado) };
}
