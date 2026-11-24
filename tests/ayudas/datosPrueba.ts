/** Utilidades solo para los tests de edición y de pantallas. */
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../../src/datos-ejemplo/ejemplo';
import type { AsignacionPuesto, AsignacionTipo, EstadoApp, Id } from '../../src/modelo/tipos';

export function asigPuesto(id: Id, fecha: string, puestoId: Id, franjaId: Id, personaId: Id, plaza = 0): AsignacionPuesto {
  return { id, tipo: 'puesto', fecha, puestoId, franjaId, plaza, personaId, bloqueada: false, origen: 'manual' };
}

/** Estado de ejemplo con 2 semanas de cuadrante, una semana tipo e incidencias. */
export function estadoConAsignaciones(): EstadoApp {
  const e = crearEstadoEjemplo();
  const { caja1, lego } = IDS_EJEMPLO.puestos;
  e.cuadrantes = {
    '2026-11-23': {
      lunes: '2026-11-23',
      asignaciones: [
        asigPuesto('a1', '2026-11-23', caja1, 'franja-caja-1', 'per-01'),
        asigPuesto('a2', '2026-11-24', caja1, 'franja-caja-2', 'per-02'),
        asigPuesto('a3', '2026-11-25', lego, 'franja-lego-1', 'per-01'),
        { id: 'p1', tipo: 'pausa', fecha: '2026-11-23', inicio: 840, fin: 900, personaId: 'per-01', bloqueada: false, origen: 'manual' },
      ],
      meta: { modo: null, semilla: null, generado: null },
    },
    '2026-11-30': {
      lunes: '2026-11-30',
      asignaciones: [
        asigPuesto('a4', '2026-11-30', caja1, 'franja-caja-1', 'per-01'),
        asigPuesto('a5', '2026-12-06', caja1, 'franja-caja-1', 'per-03'),
      ],
      meta: { modo: null, semilla: null, generado: null },
    },
    '2026-12-07': { lunes: '2026-12-07', asignaciones: [], meta: { modo: null, semilla: null, generado: null } },
  };
  const t1: AsignacionTipo = { id: 't1', tipo: 'puesto', dia: 0, puestoId: caja1, franjaId: 'franja-caja-1', plaza: 0, personaId: 'per-01', bloqueada: false };
  const t2: AsignacionTipo = { id: 't2', tipo: 'puesto', dia: 1, puestoId: lego, franjaId: 'franja-lego-1', plaza: 0, personaId: 'per-02', bloqueada: false };
  e.semanasTipo = [{ id: 'st-1', indiceCiclo: 0, nombre: 'Semana A', asignaciones: [t1, t2] }];
  e.incidencias = [
    { id: 'i1', tipo: 'ausencia', personaId: 'per-01', desde: '2026-11-23', hasta: '2026-11-24', tramo: null, nota: '' },
    { id: 'i2', tipo: 'puestoCerrado', puestoId: caja1, desde: '2026-11-25', hasta: '2026-11-25', nota: '' },
    { id: 'i3', tipo: 'ausencia', personaId: 'per-02', desde: '2026-11-23', hasta: '2026-11-23', tramo: null, nota: '' },
  ];
  return e;
}
