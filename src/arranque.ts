/**
 * Lógica de arranque (pura, probada en Node): qué estado mostrar al abrir la app y cómo guardar
 * sin perder datos guardados que no se pudieron leer.
 */
import { CLAVE_ALMACEN, type ResultadoGuardado } from './modelo/esquema';
import type { EstadoApp } from './modelo/tipos';
import { cargarEstado, guardarEstado, type AlmacenClaveValor } from './persistencia/almacen';

export const CLAVE_ILEGIBLE = `${CLAVE_ALMACEN}.ilegible`;

export interface Arranque {
  inicial: EstadoApp;
  avisosCarga: string[];
  avisoArranque: string | null;
  guardar: (e: EstadoApp) => ResultadoGuardado;
  /** Llamar justo antes de reemplazar el estado (importar o cargar ejemplo). */
  alReemplazar: () => void;
  /** Texto guardado que no se pudo leer (en memoria o conservado aparte), o null. */
  textoIlegible: () => string | null;
}

function leer(almacen: AlmacenClaveValor | null, clave: string): string | null {
  try {
    return almacen ? almacen.getItem(clave) : null;
  } catch {
    return null;
  }
}

export function prepararArranque(almacen: AlmacenClaveValor | null, crearEjemplo: () => EstadoApp): Arranque {
  const carga = cargarEstado(almacen);
  let guardadoActivo = true;
  let originalIlegible: string | null = null;
  let copiaPendiente = false;
  let inicial: EstadoApp;
  let avisosCarga: string[] = [];
  let avisoArranque: string | null = null;

  if (carga.tipo === 'ok') {
    inicial = carga.estado;
    avisosCarga = carga.avisos;
  } else if (carga.tipo === 'error') {
    inicial = crearEjemplo();
    guardadoActivo = false;
    originalIlegible = leer(almacen, CLAVE_ALMACEN);
    copiaPendiente = originalIlegible !== null;
    avisoArranque = `No se han podido leer los datos guardados (${carga.error}). Se muestran datos de ejemplo y NO se guardará nada hasta que importes una copia o cargues datos. Lo que había guardado no se ha tocado.`;
  } else {
    inicial = crearEjemplo();
  }

  const guardar = (e: EstadoApp): ResultadoGuardado => {
    if (!guardadoActivo) {
      return { ok: false, error: 'Los datos guardados no se han podido leer y no se sobrescriben todavía. Importa una copia o carga datos para empezar a guardar.' };
    }
    if (copiaPendiente && almacen && originalIlegible !== null) {
      try {
        if (almacen.getItem(CLAVE_ILEGIBLE) === null) almacen.setItem(CLAVE_ILEGIBLE, originalIlegible);
        copiaPendiente = false;
      } catch {
        return { ok: false, error: 'No se ha podido conservar aparte una copia de los datos no legibles, así que no se guardan los cambios para no perderlos.' };
      }
    }
    return guardarEstado(e, almacen);
  };

  return {
    inicial,
    avisosCarga,
    avisoArranque,
    guardar,
    alReemplazar: () => {
      guardadoActivo = true;
    },
    textoIlegible: () => originalIlegible ?? leer(almacen, CLAVE_ILEGIBLE),
  };
}
