/**
 * Almacén de estado de la interfaz con deshacer/rehacer (ARQUITECTURA §8.3).
 * Puro: sin DOM. El guardado se inyecta.
 */
import type { EstadoApp } from '../modelo/tipos';
import type { ResultadoGuardado } from '../modelo/esquema';

export interface OpcionesAlmacenApp {
  guardar: (e: EstadoApp) => ResultadoGuardado;
  maxHistorial?: number;
}

export interface AlmacenApp {
  obtener(): EstadoApp;
  suscribir(fn: () => void): () => void;
  aplicar(descripcion: string, cambio: (e: EstadoApp) => EstadoApp): void;
  reemplazar(descripcion: string, estado: EstadoApp): void;
  deshacer(): void;
  rehacer(): void;
  puedeDeshacer(): boolean;
  puedeRehacer(): boolean;
  descripcionDeshacer(): string | null;
  descripcionRehacer(): string | null;
  errorGuardado(): string | null;
}

interface Paso {
  /** Estado al que se vuelve al recorrer este paso. */
  estado: EstadoApp;
  /** Acción que se deshace (o se rehace). */
  descripcion: string;
}

export function crearAlmacenApp(inicial: EstadoApp, opciones: OpcionesAlmacenApp): AlmacenApp {
  const maxHistorial = Math.max(1, opciones.maxHistorial ?? 50);
  let actual = inicial;
  let pasado: Paso[] = [];
  let futuro: Paso[] = [];
  let error: string | null = null;
  const suscriptores = new Set<() => void>();

  function guardar(): void {
    let resultado: ResultadoGuardado;
    try {
      resultado = opciones.guardar(actual);
    } catch (e) {
      resultado = { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar.' };
    }
    error = resultado.ok ? null : resultado.error;
  }

  function notificar(): void {
    for (const fn of [...suscriptores]) fn();
  }

  function nuevoEstado(descripcion: string, siguiente: EstadoApp): void {
    if (siguiente === actual) return;
    pasado.push({ estado: actual, descripcion });
    if (pasado.length > maxHistorial) pasado = pasado.slice(pasado.length - maxHistorial);
    futuro = [];
    actual = siguiente;
    guardar();
    notificar();
  }

  return {
    obtener: () => actual,
    suscribir(fn) {
      suscriptores.add(fn);
      return () => {
        suscriptores.delete(fn);
      };
    },
    aplicar(descripcion, cambio) {
      nuevoEstado(descripcion, cambio(actual));
    },
    reemplazar(descripcion, estado) {
      // Un estado nuevo siempre cuenta como cambio, aunque sea la misma referencia.
      if (estado === actual) return;
      nuevoEstado(descripcion, estado);
    },
    deshacer() {
      const paso = pasado.pop();
      if (!paso) return;
      futuro.push({ estado: actual, descripcion: paso.descripcion });
      actual = paso.estado;
      guardar();
      notificar();
    },
    rehacer() {
      const paso = futuro.pop();
      if (!paso) return;
      pasado.push({ estado: actual, descripcion: paso.descripcion });
      actual = paso.estado;
      guardar();
      notificar();
    },
    puedeDeshacer: () => pasado.length > 0,
    puedeRehacer: () => futuro.length > 0,
    descripcionDeshacer: () => pasado[pasado.length - 1]?.descripcion ?? null,
    descripcionRehacer: () => futuro[futuro.length - 1]?.descripcion ?? null,
    errorGuardado: () => error,
  };
}
