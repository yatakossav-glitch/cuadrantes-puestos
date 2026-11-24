/** Ayudas comunes de los tests de la fase 2 (solo datos ficticios EMP-xx). */
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../../src/datos-ejemplo/ejemplo';
import type { Asignacion, AsignacionTipo, DiaSemana, EstadoApp, Id, Puesto } from '../../src/modelo/tipos';

export { IDS_EJEMPLO };

export function copiar<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/** Congela en profundidad: cualquier mutación lanza TypeError (los módulos ESM son estrictos). */
export function congelar<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x as Record<string, unknown>)) congelar(v);
  }
  return x;
}

export function puestoDe(estado: EstadoApp, id: Id): Puesto {
  const p = estado.puestos.find((q) => q.id === id);
  if (!p) throw new Error(`Puesto de prueba inexistente: ${id}`);
  return p;
}

export function asigPuesto(
  id: Id, fecha: string, puestoId: Id, franjaId: Id, plaza: number, personaId: Id, bloqueada = false,
): Asignacion {
  return { id, tipo: 'puesto', fecha, puestoId, franjaId, plaza, personaId, bloqueada, origen: 'manual' };
}
export function asigPausa(id: Id, fecha: string, personaId: Id): Asignacion {
  return { id, tipo: 'pausa', fecha, inicio: 840, fin: 900, personaId, bloqueada: false, origen: 'manual' };
}
export function asigTipoPuesto(
  id: Id, dia: DiaSemana, puestoId: Id, franjaId: Id, plaza: number, personaId: Id,
): AsignacionTipo {
  return { id, tipo: 'puesto', dia, puestoId, franjaId, plaza, personaId, bloqueada: false };
}

export const LUNES = '2026-11-23';
export const DOMINGO = '2026-11-29';

/** Ejemplo + un cuadrante, una semana tipo e incidencias de prueba. */
export function estadoConDatos(): EstadoApp {
  const e = crearEstadoEjemplo();
  const { caja1, pedidos, lego } = IDS_EJEMPLO.puestos;
  e.cuadrantes[LUNES] = {
    lunes: LUNES,
    asignaciones: [
      asigPuesto('a1', LUNES, caja1, 'franja-caja-1', 0, 'per-05'),
      asigPuesto('a2', DOMINGO, caja1, 'franja-caja-2', 0, 'per-05'),
      asigPausa('a3', DOMINGO, 'per-05'),
      asigPuesto('a4', LUNES, caja1, 'franja-caja-3', 0, 'per-06'),
      asigPuesto('a5', DOMINGO, pedidos, 'franja-pedidos-m', 0, 'per-06'),
      asigPuesto('a6', LUNES, lego, 'franja-lego-1', 0, 'per-07', true),
    ],
    meta: { modo: null, semilla: null, generado: null },
  };
  e.semanasTipo = [
    {
      id: 'st-1', indiceCiclo: 0, nombre: 'Semana A',
      asignaciones: [
        asigTipoPuesto('t1', 0, caja1, 'franja-caja-1', 0, 'per-05'),
        asigTipoPuesto('t2', 6, caja1, 'franja-caja-2', 0, 'per-06'),
        asigTipoPuesto('t3', 6, lego, 'franja-lego-1', 0, 'per-07'),
      ],
    },
  ];
  e.incidencias = [
    { id: 'i1', tipo: 'ausencia', personaId: 'per-05', desde: LUNES, hasta: DOMINGO, tramo: null, nota: '' },
    { id: 'i2', tipo: 'ausencia', personaId: 'per-06', desde: LUNES, hasta: LUNES, tramo: null, nota: '' },
    { id: 'i3', tipo: 'puestoCerrado', puestoId: caja1, desde: LUNES, hasta: LUNES, nota: '' },
  ];
  return e;
}

export function idsAsignaciones(estado: EstadoApp): string[] {
  return Object.values(estado.cuadrantes).flatMap((c) => c.asignaciones.map((a) => a.id));
}
export function idsAsignacionesTipo(estado: EstadoApp): string[] {
  return estado.semanasTipo.flatMap((s) => s.asignaciones.map((a) => a.id));
}
