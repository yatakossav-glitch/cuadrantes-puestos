/** Caja negra: edición de puestos. ARQUITECTURA.md §9.2. */
import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../src/datos-ejemplo/ejemplo';
import { crearGeneradorIds } from '../../src/modelo/ids';
import type { Ambito, Puesto, ReglaGeneral } from '../../src/modelo/tipos';
import {
  aplicarCambioPuesto, borrarPuesto, crearPuesto, duplicarPuesto, erroresPuesto, impactoBorrarPuesto,
  impactoCambioPuesto, moverPuesto,
} from '../../src/edicion/puestos';
import {
  asigPuesto, congelar, copiar, DOMINGO, estadoConDatos, idsAsignaciones, idsAsignacionesTipo, IDS_EJEMPLO, LUNES, puestoDe,
} from './ayudas';

const { caja1, caja2, pedidos, lego } = IDS_EJEMPLO.puestos;

describe('cambio de días', () => {
  it('quitar el domingo anuncia y quita las asignaciones de ese día (cuadrantes y semana tipo)', () => {
    const e = congelar(estadoConDatos());
    const nuevo: Puesto = { ...puestoDe(e, caja1), dias: [0, 1, 2, 3, 4, 5] };
    const imp = impactoCambioPuesto(e, nuevo);
    expect(imp.bloqueos).toEqual([]);
    expect(imp.efectos.join(' ')).toMatch(/asignaci/i);
    const e2 = aplicarCambioPuesto(e, nuevo);
    // a2 (domingo, caja1) fuera; a3 es pausa y a5 es de Pedidos: se quedan
    expect(idsAsignaciones(e2).sort()).toEqual(['a1', 'a3', 'a4', 'a5', 'a6']);
    // t2 (domingo, caja1) fuera; t3 es LEGO
    expect(idsAsignacionesTipo(e2).sort()).toEqual(['t1', 't3']);
    expect(puestoDe(e2, caja1).dias).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('un cambio que no afecta a nada no anuncia efectos', () => {
    const e = estadoConDatos();
    const imp = impactoCambioPuesto(e, { ...puestoDe(e, caja1), nombre: 'Caja uno' });
    expect(imp.efectos).toEqual([]);
    expect(imp.bloqueos).toEqual([]);
  });
});

describe('cambio de plazas y franjas', () => {
  it('reducir plazas quita las asignaciones de plazas sobrantes', () => {
    const e = estadoConDatos();
    e.puestos.find((p) => p.id === caja1)!.plazas = 2;
    e.cuadrantes[LUNES]!.asignaciones.push(asigPuesto('a7', LUNES, caja1, 'franja-caja-1', 1, 'per-08'));
    const nuevo = { ...puestoDe(e, caja1), plazas: 1 };
    expect(impactoCambioPuesto(e, nuevo).efectos.join(' ')).toMatch(/asignaci/i);
    const e2 = aplicarCambioPuesto(congelar(e), nuevo);
    expect(idsAsignaciones(e2)).not.toContain('a7');
    expect(idsAsignaciones(e2)).toContain('a1');
    expect(puestoDe(e2, caja1).plazas).toBe(1);
  });
  it('aumentar plazas no quita nada', () => {
    const e = estadoConDatos();
    const e2 = aplicarCambioPuesto(e, { ...puestoDe(e, caja1), plazas: 3 });
    expect(idsAsignaciones(e2)).toEqual(idsAsignaciones(e));
  });
  it('quitar una franja quita las asignaciones a esa franja', () => {
    const e = estadoConDatos();
    const p = copiar(puestoDe(e, caja1));
    p.horario.general.franjas = p.horario.general.franjas.filter((f) => f.id !== 'franja-caja-1');
    p.horario.general.bloques = [];
    const e2 = aplicarCambioPuesto(e, p);
    expect(idsAsignaciones(e2)).not.toContain('a1');
    expect(idsAsignacionesTipo(e2)).not.toContain('t1');
    expect(idsAsignaciones(e2)).toContain('a2');
  });
});

describe('borrar puesto', () => {
  function estadoReferenciado() {
    const e = estadoConDatos();
    const regla = (id: string) => e.reglas.find((r) => r.id === id)!;
    (regla('regla-exclusividad-pedidos').params as { puestoIds: string[] }).puestoIds.push(caja1);
    (regla('regla-rotar-caja').params as { ambito: Ambito }).ambito = { areaIds: [], puestoIds: [caja1, caja2] };
    e.personas[0]!.habilitaciones.push(caja1);
    return e;
  }
  it('quita el puesto, sus asignaciones, su cierre y todas las referencias', () => {
    const e = congelar(estadoReferenciado());
    expect(impactoBorrarPuesto(e, caja1).bloqueos).toEqual([]);
    expect(impactoBorrarPuesto(e, caja1).efectos.length).toBeGreaterThan(0);
    const e2 = borrarPuesto(e, caja1);
    expect(e2.puestos.map((p) => p.id)).toEqual([pedidos, caja2, lego]);
    expect(idsAsignaciones(e2).sort()).toEqual(['a3', 'a5', 'a6']);
    expect(idsAsignacionesTipo(e2)).toEqual(['t3']);
    expect(e2.incidencias.map((i) => i.id).sort()).toEqual(['i1', 'i2']);
    const ex = e2.reglas.find((r) => r.id === 'regla-exclusividad-pedidos') as ReglaGeneral<'exclusividadDiaria'>;
    expect(ex.params.puestoIds).toEqual([pedidos]);
    const rot = e2.reglas.find((r) => r.id === 'regla-rotar-caja') as ReglaGeneral<'rotarEntreBloques'>;
    expect(rot.params.ambito.puestoIds).toEqual([caja2]);
    expect(e2.personas[0]!.habilitaciones).not.toContain(caja1);
    expect(JSON.stringify(e2)).not.toContain(caja1);
  });
});

describe('crear, duplicar y mover', () => {
  it('crearPuesto: valores por defecto', () => {
    const e = crearEstadoEjemplo();
    const p = crearPuesto(e, IDS_EJEMPLO.areas.caja, crearGeneradorIds('p'));
    expect(p.areaId).toBe(IDS_EJEMPLO.areas.caja);
    expect(p.nombre).toBe('Puesto nuevo');
    expect(p.plazas).toBe(1);
    expect(p.dias).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(p.horario.general.franjas).toHaveLength(1);
    expect(p.horario.general.franjas[0]).toMatchObject({ inicio: 600, fin: 1320 });
    expect(p.requiereHabilitacion).toBe(false);
    expect(p.activo).toBe(true);
  });
  it('duplicarPuesto: «(copia)», mismos ids de franja, justo detrás, sin mutar', () => {
    const e = congelar(crearEstadoEjemplo());
    const e2 = duplicarPuesto(e, caja1, crearGeneradorIds('p'));
    const i = e2.puestos.findIndex((p) => p.id === caja1);
    const copia = e2.puestos[i + 1]!;
    expect(copia.nombre).toBe('Caja 1 (copia)');
    expect(copia.id).not.toBe(caja1);
    expect(copia.horario).toEqual(puestoDe(e, caja1).horario);
    expect(e2.puestos).toHaveLength(5);
  });
  it('moverPuesto intercambia con el vecino de su área', () => {
    const e = congelar(crearEstadoEjemplo());
    const e2 = moverPuesto(e, caja2, -1);
    expect(puestoDe(e2, caja2).orden).toBe(puestoDe(e, caja1).orden);
    expect(puestoDe(e2, caja1).orden).toBe(puestoDe(e, caja2).orden);
    expect(puestoDe(e2, pedidos).orden).toBe(puestoDe(e, pedidos).orden);
  });
});

describe('erroresPuesto', () => {
  it('los puestos del ejemplo (franjas que se tocan sin solaparse) no dan errores', () => {
    const e = crearEstadoEjemplo();
    for (const p of e.puestos) expect(erroresPuesto(e, p)).toEqual([]);
  });
  it('detecta franjas solapadas', () => {
    const e = crearEstadoEjemplo();
    const p = copiar(puestoDe(e, lego));
    p.horario.general.franjas = [
      { id: 'f-1', inicio: 600, fin: 720 },
      { id: 'f-2', inicio: 700, fin: 800 },
    ];
    expect(erroresPuesto(e, p).length).toBeGreaterThan(0);
  });
  it('detecta franja con fin igual o anterior al inicio', () => {
    const e = crearEstadoEjemplo();
    for (const [inicio, fin] of [[600, 600], [700, 600]] as const) {
      const p = copiar(puestoDe(e, lego));
      p.horario.general.franjas = [{ id: 'f-1', inicio, fin }];
      expect(erroresPuesto(e, p).length).toBeGreaterThan(0);
    }
  });
  it('detecta un bloque de franjas no consecutivas', () => {
    const e = crearEstadoEjemplo();
    const p = copiar(puestoDe(e, caja1));
    p.horario.general.bloques = [{ id: 'b-x', nombre: 'malo', franjaIds: ['franja-caja-1', 'franja-caja-3'] }];
    expect(erroresPuesto(e, p).length).toBeGreaterThan(0);
  });
  it('detecta plazas fuera de 1–20, sin días, nombre vacío y área inexistente', () => {
    const e = crearEstadoEjemplo();
    const p = puestoDe(e, caja1);
    expect(erroresPuesto(e, { ...p, plazas: 0 }).length).toBeGreaterThan(0);
    expect(erroresPuesto(e, { ...p, plazas: 21 }).length).toBeGreaterThan(0);
    expect(erroresPuesto(e, { ...p, plazas: 20 })).toEqual([]);
    expect(erroresPuesto(e, { ...p, dias: [] }).length).toBeGreaterThan(0);
    expect(erroresPuesto(e, { ...p, nombre: ' ' }).length).toBeGreaterThan(0);
    expect(erroresPuesto(e, { ...p, areaId: 'area-fantasma' }).length).toBeGreaterThan(0);
  });
  it('nombre repetido en la misma área da error (con otro id)', () => {
    const e = crearEstadoEjemplo();
    expect(erroresPuesto(e, { ...puestoDe(e, caja2), nombre: 'Caja 1' }).length).toBeGreaterThan(0);
  });
  it('un día personalizado que no está en dias da error', () => {
    const e = crearEstadoEjemplo();
    const p = copiar(puestoDe(e, pedidos));
    p.dias = [0, 1, 2, 3, 4, 5];
    p.horario.porDia[6] = { franjas: [{ id: 'f-9', inicio: 600, fin: 700 }], bloques: [] };
    expect(erroresPuesto(e, p).length).toBeGreaterThan(0);
  });
  it('DOMINGO sigue siendo día 6 (sanidad del fixture)', () => {
    expect(DOMINGO).toBe('2026-11-29');
  });
});
