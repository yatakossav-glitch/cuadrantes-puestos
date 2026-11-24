import { describe, expect, it } from 'vitest';
import { crearGeneradorIds } from '../modelo/ids';
import type { EstadoApp, Incidencia } from '../modelo/tipos';
import { estadoConAsignaciones } from '../../tests/ayudas/datosPrueba';
import {
  afectadasPor, anadirIncidencia, avisosIncidencia, borrarIncidencia, crearAusencia, crearCierre,
  describirIncidencia, erroresIncidencia, impactoIncidencia, liberarAfectadas, momentoIncidencia, reemplazarIncidencia,
} from './incidencias';

const base = (): EstadoApp => ({ ...estadoConAsignaciones(), incidencias: [] });
const ausencia = (extra: Partial<Extract<Incidencia, { tipo: 'ausencia' }>> = {}) => ({
  ...crearAusencia('per-01', '2026-11-23', crearGeneradorIds('inc')), ...extra,
});

describe('incidencias · alta y edición', () => {
  it('crea con valores por defecto', () => {
    expect(crearAusencia('per-01', '2026-11-24', crearGeneradorIds('inc'))).toEqual({
      id: 'inc-1', tipo: 'ausencia', personaId: 'per-01', desde: '2026-11-24', hasta: '2026-11-24', tramo: null, nota: '',
    });
    expect(crearCierre('puesto-caja1', '2026-11-24', crearGeneradorIds('inc'))).toMatchObject({ tipo: 'puestoCerrado', hasta: '2026-11-24' });
  });
  it('añade, reemplaza y borra sin mutar', () => {
    const e = base();
    const a = ausencia();
    const n = anadirIncidencia(e, a);
    expect(e.incidencias).toHaveLength(0);
    expect(reemplazarIncidencia(n, { ...a, nota: 'x' }).incidencias[0]).toMatchObject({ nota: 'x' });
    expect(borrarIncidencia(n, a.id).incidencias).toEqual([]);
  });
});

describe('incidencias · errores y avisos', () => {
  it('detecta errores', () => {
    const e = base();
    expect(erroresIncidencia(e, ausencia())).toEqual([]);
    expect(erroresIncidencia(e, ausencia({ desde: '2026-11-25', hasta: '2026-11-24' }))).toHaveLength(1);
    expect(erroresIncidencia(e, ausencia({ desde: '2026-02-30' }))[0]).toMatch(/desde/);
    expect(erroresIncidencia(e, ausencia({ personaId: 'nadie' }))[0]).toMatch(/persona/);
    expect(erroresIncidencia(e, ausencia({ tramo: { inicio: 600, fin: 600 } }))[0]).toMatch(/tramo/);
    expect(erroresIncidencia(e, ausencia({ tramo: { inicio: 600, fin: 1500 } }))[0]).toMatch(/tramo/);
    expect(erroresIncidencia(e, ausencia({ tramo: { inicio: 0, fin: 1440 } }))).toEqual([]);
    expect(erroresIncidencia(e, ausencia({ nota: 'x'.repeat(201) }))[0]).toMatch(/200/);
    expect(erroresIncidencia(e, { ...crearCierre('nada', '2026-11-24'), id: 'c' })[0]).toMatch(/puesto/);
  });
  it('avisa de solapes, duración larga y persona inactiva o de baja', () => {
    const e = base();
    const existente = ausencia({ id: 'otra', desde: '2026-11-23', hasta: '2026-11-25' });
    const con = anadirIncidencia(e, existente);
    expect(avisosIncidencia(con, ausencia({ id: 'nueva', desde: '2026-11-25', hasta: '2026-11-26' }))[0]).toMatch(/se solapa/);
    expect(avisosIncidencia(con, ausencia({ id: 'nueva', desde: '2026-11-26', hasta: '2026-11-26' }))).toEqual([]);
    expect(avisosIncidencia(con, existente)).toEqual([]);
    expect(avisosIncidencia(e, ausencia({ hasta: '2027-03-01' }))[0]).toMatch(/más de 92/);
    const inactiva = { ...e, personas: e.personas.map((p) => (p.id === 'per-01' ? { ...p, activa: false, baja: '2026-11-24' } : p)) };
    const avisos = avisosIncidencia(inactiva, ausencia({ hasta: '2026-11-25' }));
    expect(avisos[0]).toMatch(/EMP-01 está marcada como inactiva/);
    expect(avisos[1]).toMatch(/causa baja/);
  });
});

describe('incidencias · impacto', () => {
  it('ausencia de día completo: puestos y pausas de esa persona en las fechas', () => {
    const e = base();
    const r = afectadasPor(e, ausencia({ desde: '2026-11-23', hasta: '2026-11-30' }));
    expect(r).toEqual([
      { lunes: '2026-11-23', asignacionIds: ['a1', 'a3', 'p1'], conCandado: 0 },
      { lunes: '2026-11-30', asignacionIds: ['a4'], conCandado: 0 },
    ]);
  });
  it('ausencia con tramo: solo las que se solapan', () => {
    const e = base();
    // franja-caja-1 = 10:00–11:30; pausa 14:00–15:00.
    expect(afectadasPor(e, ausencia({ desde: '2026-11-23', hasta: '2026-11-23', tramo: { inicio: 660, fin: 720 } }))[0]?.asignacionIds).toEqual(['a1']);
    expect(afectadasPor(e, ausencia({ desde: '2026-11-23', hasta: '2026-11-23', tramo: { inicio: 690, fin: 840 } }))).toEqual([]);
    expect(afectadasPor(e, ausencia({ desde: '2026-11-23', hasta: '2026-11-23', tramo: { inicio: 870, fin: 900 } }))[0]?.asignacionIds).toEqual(['p1']);
  });
  it('cierre: asignaciones de ese puesto en esas fechas', () => {
    const e = base();
    const cierre = { ...crearCierre('puesto-caja1', '2026-11-23', crearGeneradorIds('c')), hasta: '2026-12-06' };
    expect(afectadasPor(e, cierre).map((s) => s.asignacionIds)).toEqual([['a1', 'a2'], ['a4', 'a5']]);
  });
  it('impacto con texto y candados', () => {
    const e = base();
    e.cuadrantes['2026-11-30'] = {
      ...e.cuadrantes['2026-11-30']!,
      asignaciones: e.cuadrantes['2026-11-30']!.asignaciones.map((a) => (a.id === 'a4' ? { ...a, bloqueada: true } : a)),
    };
    const inc = ausencia({ desde: '2026-11-23', hasta: '2026-11-30' });
    expect(impactoIncidencia(e, inc)).toEqual({
      bloqueos: [],
      efectos: [
        'Afecta a 4 asignaciones ya hechas en 2 semanas (23 nov y 30 nov)',
        '1 tiene candado y no se quitará sola',
      ],
    });
    expect(impactoIncidencia(e, ausencia({ personaId: 'per-09' })).efectos).toEqual([]);
  });
  it('liberarAfectadas quita las que no tienen candado y no muta', () => {
    const e = base();
    e.cuadrantes['2026-11-30']!.asignaciones[0]!.bloqueada = true;
    const copia = structuredClone(e);
    const n = liberarAfectadas(e, ausencia({ desde: '2026-11-23', hasta: '2026-11-30' }));
    expect(e).toEqual(copia);
    expect(n.cuadrantes['2026-11-23']!.asignaciones.map((a) => a.id)).toEqual(['a2']);
    expect(n.cuadrantes['2026-11-30']!.asignaciones.map((a) => a.id)).toEqual(['a4', 'a5']);
    expect(liberarAfectadas(e, ausencia({ personaId: 'per-09' }))).toBe(e);
  });
  it('liberarAfectadas con soloLunes limita a esa semana', () => {
    const e = base();
    const inc = ausencia({ desde: '2026-11-23', hasta: '2026-11-30' });
    const n = liberarAfectadas(e, inc, '2026-11-30');
    expect(n.cuadrantes['2026-11-23']).toBe(e.cuadrantes['2026-11-23']);
    expect(n.cuadrantes['2026-11-30']!.asignaciones.length).toBeLessThan(e.cuadrantes['2026-11-30']!.asignaciones.length);
  });
});

describe('incidencias · momento y texto', () => {
  it('momentoIncidencia', () => {
    const i = ausencia({ desde: '2026-11-23', hasta: '2026-11-25' });
    expect(momentoIncidencia(i, '2026-11-22')).toBe('futura');
    expect(momentoIncidencia(i, '2026-11-23')).toBe('enCurso');
    expect(momentoIncidencia(i, '2026-11-25')).toBe('enCurso');
    expect(momentoIncidencia(i, '2026-11-26')).toBe('pasada');
  });
  it('describirIncidencia', () => {
    const e = base();
    expect(describirIncidencia(ausencia({ desde: '2026-11-30', hasta: '2026-12-04' }), e)).toBe('EMP-01 ausente del lunes 30 nov al viernes 4 dic');
    expect(describirIncidencia(ausencia({ desde: '2026-12-01', hasta: '2026-12-01', tramo: { inicio: 600, fin: 780 } }), e)).toBe(
      'EMP-01 ausente el martes 1 dic de 10:00 a 13:00',
    );
    expect(describirIncidencia({ ...crearCierre('puesto-caja2', '2026-12-05'), id: 'c' }, e)).toBe('Caja 2 (Caja) cerrada el sábado 5 dic');
  });
});
