import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../datos-ejemplo/ejemplo';
import { crearGeneradorIds } from '../modelo/ids';
import type { Asignacion, EstadoApp } from '../modelo/tipos';
import { asignacionesDeSemanaTipo as reexportada } from '../motor/preparacion';
import { aSemanaTipo, asignacionesDeSemanaTipo, calendarioCiclo, semanaTipoDeCiclo } from './semanaTipo';

const LUNES = '2026-11-23';
const { caja1 } = IDS_EJEMPLO.puestos;

const puesto = (id: string, fecha: string, puestoId: string = caja1, franjaId = 'franja-caja-1'): Asignacion => ({
  id, tipo: 'puesto', fecha, puestoId, franjaId, plaza: 0, personaId: 'per-07', bloqueada: true, origen: 'motor',
});
const pausa = (id: string, fecha: string): Asignacion => ({ id, tipo: 'pausa', fecha, inicio: 600, fin: 630, personaId: 'per-07', bloqueada: false, origen: 'manual' });

describe('aSemanaTipo', () => {
  const e = crearEstadoEjemplo();
  it('convierte fechas en días, quita origen y candado, y descarta lo ajeno a la semana', () => {
    const r = aSemanaTipo(e, LUNES, [puesto('a', '2026-11-26'), pausa('p', '2026-11-24'), puesto('fuera', '2026-11-30')], crearGeneradorIds('n'));
    expect(r).toEqual([
      { id: 'n-1', tipo: 'puesto', dia: 3, puestoId: caja1, franjaId: 'franja-caja-1', plaza: 0, personaId: 'per-07', bloqueada: false },
      { id: 'n-2', tipo: 'pausa', dia: 1, inicio: 600, fin: 630, personaId: 'per-07', bloqueada: false },
    ]);
  });
  it('omite puestos fuera de horario', () => {
    expect(aSemanaTipo(e, LUNES, [puesto('a', '2026-11-26', 'no-existe'), puesto('b', '2026-11-26', caja1, 'nada')])).toEqual([]);
  });
});

describe('asignacionesDeSemanaTipo y semanaTipoDeCiclo', () => {
  it('lleva la semana tipo a fechas y se reexporta desde el motor', () => {
    const e: EstadoApp = crearEstadoEjemplo();
    const tipo = aSemanaTipo(e, LUNES, [puesto('a', '2026-11-26')], crearGeneradorIds('n'));
    e.semanasTipo = [{ id: 's', indiceCiclo: 1, nombre: 'B', asignaciones: tipo }];
    expect(semanaTipoDeCiclo(e, 1)?.nombre).toBe('B');
    expect(semanaTipoDeCiclo(e, 0)).toBeUndefined();
    expect(asignacionesDeSemanaTipo(e, LUNES)).toEqual([]);
    const r = asignacionesDeSemanaTipo(e, '2026-11-30');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'n-1@2026-12-03', fecha: '2026-12-03', origen: 'semanaTipo', bloqueada: false });
    expect(reexportada).toBe(asignacionesDeSemanaTipo);
  });
});

describe('calendarioCiclo', () => {
  it('numera semanas consecutivas con su etiqueta', () => {
    const rot = { longitudCiclo: 3, lunesReferencia: LUNES, etiquetas: ['A', 'B', 'C'] };
    expect(calendarioCiclo(rot, '2026-11-30', 4)).toEqual([
      { lunes: '2026-11-30', indice: 1, etiqueta: 'B' },
      { lunes: '2026-12-07', indice: 2, etiqueta: 'C' },
      { lunes: '2026-12-14', indice: 0, etiqueta: 'A' },
      { lunes: '2026-12-21', indice: 1, etiqueta: 'B' },
    ]);
    expect(calendarioCiclo(rot, 'mal', 3)).toEqual([]);
  });
});
