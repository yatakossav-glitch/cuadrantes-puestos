import { describe, expect, it } from 'vitest';
import { guardarSemanaTipo, impactoGuardarSemanaTipo } from '../../src/edicion/rotacion';
import { asignacionesDeSemanaTipo, aSemanaTipo, semanaTipoDeCiclo } from '../../src/rotacion/semanaTipo';
import { sumarDias } from '../../src/modelo/fechas';
import type { Asignacion, AsignacionPuesto } from '../../src/modelo/tipos';
import { LUNES, P, asig, conCuadrante, contadorIds, datosMini, personaMini, puestoP1, puestoMini, franjasSeguidas } from './ayudas';

const LUNES_B = sumarDias(LUNES, 7);
const LUNES_A2 = sumarDias(LUNES, 14);

function clave(a: Asignacion): string {
  if (a.tipo === 'pausa') return `pausa|${a.fecha}|${a.personaId}|${a.inicio}|${a.fin}`;
  return `${a.fecha}|${a.puestoId}|${a.franjaId}|${a.plaza}|${a.personaId}`;
}

function semanaBase() {
  return [
    asig(0, 'p1', 'f1', P(1)),
    asig(0, 'p1', 'f2', P(2)),
    asig(2, 'p1', 'f3', P(3)),
    asig(4, 'p1', 'f6', P(4)),
  ];
}

describe('guardarSemanaTipo + asignacionesDeSemanaTipo', () => {
  it('ida y vuelta: la semana guardada se lleva a otra semana del mismo ciclo', () => {
    const base = conCuadrante(datosMini(), LUNES, semanaBase());
    const r = guardarSemanaTipo(base, LUNES, 0, 'Semana A', contadorIds());
    expect(r.semanasTipo).toHaveLength(1);
    expect(r.semanasTipo[0]!.indiceCiclo).toBe(0);
    expect(r.semanasTipo[0]!.nombre).toBe('Semana A');
    expect(r.semanasTipo[0]!.asignaciones).toHaveLength(4);

    expect(asignacionesDeSemanaTipo(r, LUNES_A2)).toHaveLength(4);
  });

  it('misma semana: mismas asignaciones por día, puesto, franja, plaza y persona', () => {
    const base = conCuadrante(datosMini(), LUNES, semanaBase());
    const r = guardarSemanaTipo(base, LUNES, 0, 'A', contadorIds());
    const vuelta = asignacionesDeSemanaTipo(r, LUNES).map(clave).sort();
    expect(vuelta).toEqual(semanaBase().map(clave).sort());
  });

  it('otra semana del ciclo: las fechas se desplazan manteniendo el día', () => {
    const base = conCuadrante(datosMini(), LUNES, semanaBase());
    const r = guardarSemanaTipo(base, LUNES, 0, 'A', contadorIds());
    const otra = asignacionesDeSemanaTipo(r, LUNES_A2);
    const esperado = semanaBase().map((a) => ({ ...a, fecha: sumarDias(a.fecha, 14) })).map(clave).sort();
    expect(otra.map(clave).sort()).toEqual(esperado);
    expect(otra.every((a) => a.origen === 'semanaTipo')).toBe(true);
    expect(otra.every((a) => !a.bloqueada)).toBe(true);
  });

  it('una semana B sin semana tipo da lista vacía; con tipo B la usa', () => {
    const base = conCuadrante(datosMini(), LUNES, semanaBase());
    const r = guardarSemanaTipo(base, LUNES, 0, 'A', contadorIds());
    expect(asignacionesDeSemanaTipo(r, LUNES_B)).toEqual([]);
    const r2 = guardarSemanaTipo(r, LUNES, 1, 'B', contadorIds('b'));
    expect(r2.semanasTipo).toHaveLength(2);
    expect(asignacionesDeSemanaTipo(r2, LUNES_B)).toHaveLength(4);
    expect(semanaTipoDeCiclo(r2, 1)?.nombre).toBe('B');
    expect(semanaTipoDeCiclo(r2, 0)?.nombre).toBe('A');
  });

  it('una semana tipo por índice: guardar de nuevo reemplaza y conserva el id', () => {
    const base = conCuadrante(datosMini(), LUNES, semanaBase());
    const r1 = guardarSemanaTipo(base, LUNES, 0, 'Primera', contadorIds());
    const id = r1.semanasTipo[0]!.id;
    const nuevo = conCuadrante(r1, LUNES, [asig(1, 'p1', 'f1', P(5))]);
    const r2 = guardarSemanaTipo(nuevo, LUNES, 0, 'Segunda', contadorIds('z'));
    expect(r2.semanasTipo).toHaveLength(1);
    expect(r2.semanasTipo[0]!.id).toBe(id);
    expect(r2.semanasTipo[0]!.nombre).toBe('Segunda');
    expect(r2.semanasTipo[0]!.asignaciones).toHaveLength(1);
  });

  it('omite asignaciones fuera de horario (franja inexistente o puesto cerrado ese día)', () => {
    const datos = datosMini({ puestos: [puestoP1({ dias: [0, 1, 2, 3, 4] })] });
    const asigs = [
      asig(0, 'p1', 'f1', P(1)),
      asig(0, 'p1', 'franja-que-no-existe', P(2)),
      asig(6, 'p1', 'f1', P(3)), // domingo: el puesto no abre
    ];
    const r = guardarSemanaTipo(conCuadrante(datos, LUNES, asigs), LUNES, 0, 'A', contadorIds());
    expect(r.semanasTipo[0]!.asignaciones).toHaveLength(1);
    expect(r.semanasTipo[0]!.asignaciones[0]!.personaId).toBe(P(1));
  });

  it('aSemanaTipo solo toma fechas de esa semana y convierte fecha en día', () => {
    const datos = datosMini();
    const fuera: AsignacionPuesto = { ...asig(0, 'p1', 'f1', P(2)), id: 'otra', fecha: LUNES_B };
    const res = aSemanaTipo(datos, LUNES, [asig(3, 'p1', 'f2', P(1)), fuera], contadorIds());
    expect(res).toHaveLength(1);
    expect(res[0]!.dia).toBe(3);
    expect(res[0]!.bloqueada).toBe(false);
    expect('fecha' in res[0]!).toBe(false);
    expect('origen' in res[0]!).toBe(false);
  });

  it('las asignaciones con candado se guardan sin candado', () => {
    const datos = conCuadrante(datosMini(), LUNES, [asig(0, 'p1', 'f1', P(1), 0, { bloqueada: true })]);
    const r = guardarSemanaTipo(datos, LUNES, 0, 'A', contadorIds());
    expect(r.semanasTipo[0]!.asignaciones[0]!.bloqueada).toBe(false);
  });

  it('conserva las plazas de un puesto con varias plazas', () => {
    const puesto = puestoMini('pc', 'a1', franjasSeguidas('g', ['10:00', '11:00']), { plazas: 2 });
    const datos = datosMini({ puestos: [puesto] });
    const asigs = [asig(1, 'pc', 'g1', P(1), 0), asig(1, 'pc', 'g1', P(2), 1)];
    const r = guardarSemanaTipo(conCuadrante(datos, LUNES, asigs), LUNES, 0, 'A', contadorIds());
    const vuelta = asignacionesDeSemanaTipo(r, LUNES_A2).map(clave).sort();
    expect(vuelta).toEqual(asigs.map((a) => ({ ...a, fecha: sumarDias(a.fecha, 14) })).map(clave).sort());
  });

  it('no muta el estado de entrada', () => {
    const base = conCuadrante(datosMini(), LUNES, semanaBase());
    guardarSemanaTipo(base, LUNES, 0, 'A', contadorIds());
    expect(base.semanasTipo).toHaveLength(0);
  });
});

describe('impactoGuardarSemanaTipo', () => {
  it('bloquea si la semana no tiene asignaciones válidas', () => {
    const imp = impactoGuardarSemanaTipo(datosMini(), LUNES, 0);
    expect(imp.bloqueos.length).toBeGreaterThan(0);
  });
  it('sin bloqueos si hay asignaciones; avisa de que reemplaza', () => {
    const base = conCuadrante(datosMini(), LUNES, semanaBase());
    expect(impactoGuardarSemanaTipo(base, LUNES, 0).bloqueos).toEqual([]);
    const r = guardarSemanaTipo(base, LUNES, 0, 'A', contadorIds());
    const imp = impactoGuardarSemanaTipo(r, LUNES, 0);
    expect(imp.efectos.join(' ').toLowerCase()).toContain('reemplaz');
  });
});
