/**
 * CONTRATO · Esquema versionado de persistencia y copias de seguridad (§2).
 * No modificar sin permiso del director.
 *
 * - Almacén local: localStorage[CLAVE_ALMACEN] = JSON de DocumentoPersistido.
 * - Copia de seguridad: PREFIJO_RESPALDO + base64( gzip( JSON de Respaldo ) ).
 *   Se comprime con CompressionStream('gzip'), nativo en Edge y Chrome.
 * - Al cargar o importar: se lee `version` y se aplican en cadena las MIGRACIONES
 *   desde esa versión hasta VERSION_ESQUEMA. Una versión mayor que la actual se rechaza.
 */
import type { EstadoApp } from './tipos';

export const VERSION_ESQUEMA = 2 as const;

export const CLAVE_ALMACEN = 'cuadrantes-puestos';
export const PREFIJO_RESPALDO = 'CUADRANTES1.';
export const FORMATO_RESPALDO = 'cuadrantes-puestos' as const;

export interface DocumentoPersistido {
  version: number;
  /** Fecha y hora ISO de la última escritura. */
  guardado: string;
  estado: EstadoApp;
}

export interface Respaldo {
  formato: typeof FORMATO_RESPALDO;
  version: number;
  /** Fecha y hora ISO de la exportación. */
  exportado: string;
  /** true si se exportó con la casilla «exportar sin alias» (todos los alias a null). */
  sinAlias: boolean;
  estado: EstadoApp;
}

/** Migra datos de la versión `desde` a `desde + 1`. Trabaja sobre JSON sin tipar. */
export interface Migracion {
  desde: number;
  migrar(datos: unknown): unknown;
}

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Lista ordenada de migraciones. */
export const MIGRACIONES: readonly Migracion[] = [
  {
    // v1 → v2: los puestos ganan vigencia (vigenteDesde / vigenteHasta); null = sin límite.
    desde: 1,
    migrar(datos: unknown): unknown {
      if (!esObjeto(datos) || !Array.isArray(datos['puestos'])) return datos;
      return {
        ...datos,
        puestos: datos['puestos'].map((p: unknown) => (esObjeto(p) ? { vigenteDesde: null, vigenteHasta: null, ...p } : p)),
      };
    },
  },
];

/** Resultado de importar una copia de seguridad. */
export type ResultadoImportacion =
  | {
      ok: true;
      estado: EstadoApp;
      versionOrigen: number;
      /** Avisos no bloqueantes: duplicados probables de código, referencias huérfanas… */
      avisos: string[];
    }
  | { ok: false; error: string };

/** Resultado de una escritura en el almacén local (para avisar a la usuaria si falla). */
export type ResultadoGuardado = { ok: true } | { ok: false; error: string };
