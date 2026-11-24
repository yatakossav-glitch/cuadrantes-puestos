import { describe, expect, it } from 'vitest';
import { IDS_EJEMPLO, crearEstadoEjemplo } from '../datos-ejemplo/ejemplo';
import type { Asignacion, AsignacionPausa, AsignacionPuesto, EstadoApp } from '../modelo/tipos';
import { conAsignacion, crearIndice } from './indice';

const LUNES = '2026-11-23';
const JUEVES = '2026-11-26';

export function puesto(id: string, fecha: string, puestoId: string, franjaId: string, personaId: string, plaza = 0): AsignacionPuesto {
  return { id, tipo: 'puesto', fecha, puestoId, franjaId, plaza, personaId, bloqueada: false, origen: 'manual' };
}
function pausa(id: string, fecha: string, personaId: string, inicio: number, fin: number): AsignacionPausa {
  return { id, tipo: 'pausa', fecha, personaId, inicio, fin, bloqueada: false, origen: 'manual' };
}

describe('crearIndice', () => {
  const datos: EstadoApp = crearEstadoEjemplo();
  const caja1 = IDS_EJEMPLO.puestos.caja1;

  it('calcula fechas, día y huecos de la semana', () => {
    const ix = crearIndice(datos, LUNES, []);
    expect(ix.fechas).toHaveLength(7);
    expect(ix.diaDe(JUEVES)).toBe(3);
    const huecos = ix.huecos();
    expect(huecos.length).toBeGreaterThan(0);
    // Librería está inactiva: no genera huecos.
    expect(huecos.every((h) => h.areaId !== IDS_EJEMPLO.areas.libreria)).toBe(true);
    const h = ix.hueco(`${JUEVES}|${caja1}|franja-caja-1|0`);
    expect(h).toMatchObject({ inicio: 600, fin: 690, bloqueId: 'bloque-caja-m1', dia: 3 });
  });

  it('horario es null si el puesto está cerrado por incidencia', () => {
    const d = crearEstadoEjemplo();
    d.incidencias.push({ id: 'i1', tipo: 'puestoCerrado', puestoId: caja1, desde: JUEVES, hasta: JUEVES, nota: '' });
    const ix = crearIndice(d, LUNES, []);
    expect(ix.horario(caja1, JUEVES)).toBeNull();
    expect(ix.horario(caja1, '2026-11-27')).not.toBeNull();
    expect(ix.hueco(`${JUEVES}|${caja1}|franja-caja-1|0`)).toBeUndefined();
  });

  it('horario es null si puesto o área están inactivos o el día no existe', () => {
    const d = crearEstadoEjemplo();
    d.puestos.find((p) => p.id === caja1)!.dias = [0];
    d.areas.find((a) => a.id === IDS_EJEMPLO.areas.lego)!.activa = false;
    const ix = crearIndice(d, LUNES, []);
    expect(ix.horario(caja1, JUEVES)).toBeNull();
    expect(ix.horario(caja1, LUNES)).not.toBeNull();
    expect(ix.horario(IDS_EJEMPLO.puestos.lego, LUNES)).toBeNull();
  });

  it('indexa asignaciones, minutos, jornada y días', () => {
    const a1 = puesto('a1', JUEVES, caja1, 'franja-caja-1', 'per-07');
    const a2 = puesto('a2', JUEVES, caja1, 'franja-caja-5', 'per-07');
    const a3 = puesto('a3', LUNES, IDS_EJEMPLO.puestos.pedidos, 'franja-pedidos-m', 'per-07');
    const p = pausa('p1', JUEVES, 'per-07', 780, 810);
    const fuera = puesto('f', '2026-11-30', caja1, 'franja-caja-1', 'per-07');
    const ix = crearIndice(datos, LUNES, [a2, p, a1, a3, fuera]);
    expect(ix.asignaciones()).toHaveLength(4);
    expect(ix.dePersonaDia('per-07', JUEVES).map((a) => a.id)).toEqual(['a1', 'p1', 'a2']);
    expect(ix.pausasDe('per-07', JUEVES)).toEqual([p]);
    expect(ix.minutosDia('per-07', JUEVES)).toBe(90 + 95);
    expect(ix.minutosSemana('per-07')).toBe(90 + 95 + 345);
    expect(ix.jornada('per-07', JUEVES)).toEqual({ inicio: 600, fin: 945 + 95 });
    expect(ix.jornada('per-07', '2026-11-25')).toBeNull();
    expect(ix.diasTrabajados('per-07')).toEqual([LUNES, JUEVES]);
    expect(ix.enHueco(ix.claveDe(a1))).toBe(a1);
    expect(ix.enHueco(`${JUEVES}|${caja1}|franja-caja-2|0`)).toBeUndefined();
    expect(ix.intervalo(p)).toEqual({ inicio: 780, fin: 810 });
  });

  it('ignora en minutos las asignaciones con franja inexistente', () => {
    const rara = puesto('r', JUEVES, caja1, 'no-existe', 'per-07');
    const ix = crearIndice(datos, LUNES, [rara]);
    expect(ix.intervalo(rara)).toBeUndefined();
    expect(ix.minutosDia('per-07', JUEVES)).toBe(0);
    expect(ix.diasTrabajados('per-07')).toEqual([]);
    expect(ix.dePersona('per-07')).toHaveLength(1);
  });

  it('enPlantilla respeta activa, alta y baja', () => {
    const d = crearEstadoEjemplo();
    d.personas[0]!.alta = '2026-11-25';
    d.personas[1]!.baja = '2026-11-25';
    d.personas[2]!.activa = false;
    const ix = crearIndice(d, LUNES, []);
    expect(ix.enPlantilla('per-01', '2026-11-24')).toBe(false);
    expect(ix.enPlantilla('per-01', '2026-11-25')).toBe(true);
    expect(ix.enPlantilla('per-02', '2026-11-24')).toBe(true);
    expect(ix.enPlantilla('per-02', '2026-11-25')).toBe(false);
    expect(ix.enPlantilla('per-03', LUNES)).toBe(false);
    expect(ix.enPlantilla('nadie', LUNES)).toBe(false);
  });

  it('ausente: día entero o tramo', () => {
    const d = crearEstadoEjemplo();
    d.incidencias.push(
      { id: 'i1', tipo: 'ausencia', personaId: 'per-01', desde: LUNES, hasta: '2026-11-24', tramo: null, nota: '' },
      { id: 'i2', tipo: 'ausencia', personaId: 'per-02', desde: JUEVES, hasta: JUEVES, tramo: { inicio: 600, fin: 720 }, nota: '' },
    );
    const ix = crearIndice(d, LUNES, []);
    expect(ix.ausente('per-01', '2026-11-24', { inicio: 900, fin: 960 })).toBe(true);
    expect(ix.ausente('per-01', '2026-11-25', { inicio: 900, fin: 960 })).toBe(false);
    expect(ix.ausente('per-02', JUEVES, { inicio: 700, fin: 800 })).toBe(true);
    expect(ix.ausente('per-02', JUEVES, { inicio: 720, fin: 800 })).toBe(false);
  });

  it('equipoEfectivo sigue el patrón del ciclo', () => {
    const d = crearEstadoEjemplo();
    d.rotacion = { longitudCiclo: 2, lunesReferencia: LUNES, etiquetas: ['A', 'B'] };
    d.personas[0]!.equipo = 'M';
    d.personas[0]!.patron = [{ indiceCiclo: 1, equipo: 'T', diasLibres: [] }];
    expect(crearIndice(d, LUNES, []).equipoEfectivo('per-01', LUNES)).toBe('M');
    expect(crearIndice(d, '2026-11-30', []).equipoEfectivo('per-01', '2026-11-30')).toBe('T');
    expect(crearIndice(d, '2026-11-16', []).equipoEfectivo('per-01', '2026-11-16')).toBe('T');
    expect(crearIndice(d, '2026-12-07', []).equipoEfectivo('per-01', '2026-12-07')).toBe('M');
  });
});

describe('conAsignacion', () => {
  it('devuelve un índice nuevo sin modificar el original', () => {
    const datos = crearEstadoEjemplo();
    const base = crearIndice(datos, LUNES, []);
    const a: Asignacion = puesto('x', JUEVES, IDS_EJEMPLO.puestos.caja1, 'franja-caja-1', 'per-07');
    const nuevo = conAsignacion(base, datos, a);
    expect(base.asignaciones()).toHaveLength(0);
    expect(nuevo.asignaciones()).toHaveLength(1);
    expect(nuevo.minutosDia('per-07', JUEVES)).toBe(90);
    expect(nuevo.huecos()).toBe(base.huecos());
    expect(nuevo.enHueco(nuevo.claveDe(a))).toBe(a);
  });
});

describe('vigencia del puesto', () => {
  const caja1 = IDS_EJEMPLO.puestos.caja1;
  it('fuera de su vigencia el puesto no existe: sin horario ni huecos', () => {
    const d = crearEstadoEjemplo();
    const p = d.puestos.find((x) => x.id === caja1)!;
    p.vigenteDesde = '2026-11-25';
    p.vigenteHasta = '2026-11-26';
    const ix = crearIndice(d, LUNES, []);
    expect(ix.horario(caja1, LUNES)).toBeNull();
    expect(ix.horario(caja1, '2026-11-24')).toBeNull();
    expect(ix.horario(caja1, '2026-11-25')).not.toBeNull();
    expect(ix.horario(caja1, JUEVES)).not.toBeNull();
    expect(ix.horario(caja1, '2026-11-27')).toBeNull();
    expect(ix.hueco(`${LUNES}|${caja1}|franja-caja-1|0`)).toBeUndefined();
    expect(ix.hueco(`${JUEVES}|${caja1}|franja-caja-1|0`)).toBeDefined();
  });
});
