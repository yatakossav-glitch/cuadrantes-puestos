/** Ayudas de los tests de la fase 5 (solo EMP-xx). Reutiliza las de la fase 3. */
import type { Asignacion, CuadranteSemana, EstadoApp, FechaISO, Id, Rotacion } from '../../src/modelo/tipos';
export * from '../fase3/ayudas';

export function cuadranteDe(lunes: FechaISO, asignaciones: Asignacion[]): CuadranteSemana {
  return { lunes, asignaciones, meta: { modo: null, semilla: null, generado: null } };
}

export function conCuadrante(datos: EstadoApp, lunes: FechaISO, asignaciones: Asignacion[]): EstadoApp {
  return { ...datos, cuadrantes: { ...datos.cuadrantes, [lunes]: cuadranteDe(lunes, asignaciones) } };
}

export function conRotacion(datos: EstadoApp, rotacion: Rotacion): EstadoApp {
  return { ...datos, rotacion };
}

export function contadorIds(prefijo = 'id'): () => Id {
  let n = 0;
  return () => `${prefijo}-${++n}`;
}
