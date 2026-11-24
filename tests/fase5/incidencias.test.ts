import { describe, expect, it } from 'vitest';
import { afectadasPor, describirIncidencia, erroresIncidencia, liberarAfectadas, impactoIncidencia, momentoIncidencia } from '../../src/edicion/incidencias';
import { sumarDias } from '../../src/modelo/fechas';
import type { Asignacion, EstadoApp, Incidencia } from '../../src/modelo/tipos';
import { LUNES, P, aMinutos, asig, conCuadrante, datosMini, franjasSeguidas, fecha, pausa, puestoMini, puestoP1 } from './ayudas';

const LUNES_2 = sumarDias(LUNES, 7);

function ausencia(n: number, desde: string, hasta: string, tramo: { inicio: number; fin: number } | null = null): Incidencia {
  return { id: `inc-${n}-${desde}`, tipo: 'ausencia', personaId: P(n), desde, hasta, tramo, nota: '' };
}
function cierre(puestoId: string, desde: string, hasta: string): Incidencia {
  return { id: `cierre-${puestoId}-${desde}`, tipo: 'puestoCerrado', puestoId, desde, hasta, nota: '' };
}

function estado(): EstadoApp {
  const p2 = puestoMini('p2', 'a2', franjasSeguidas('g', ['10:00', '11:00', '12:00']), { nombre: 'Caja 2', orden: 2 });
  const d = datosMini({ puestos: [puestoP1({ nombre: 'Caja 1' }), p2] });
  const semana1: Asignacion[] = [
    asig(0, 'p1', 'f1', P(1)),
    asig(0, 'p1', 'f2', P(1)),
    asig(0, 'p1', 'f3', P(2)),
    asig(1, 'p1', 'f1', P(1)),
    asig(1, 'p2', 'g1', P(3)),
    asig(3, 'p1', 'f1', P(1)),
    pausa(0, P(1), '14:00', '15:00'),
  ];
  const semana2: Asignacion[] = [
    { ...asig(0, 'p1', 'f1', P(1)), id: 's2-a', fecha: LUNES_2 },
    { ...asig(2, 'p1', 'f1', P(1), 0, { bloqueada: true }), id: 's2-b', fecha: sumarDias(LUNES_2, 2) },
    { ...asig(2, 'p1', 'f2', P(4)), id: 's2-c', fecha: sumarDias(LUNES_2, 2) },
  ];
  return conCuadrante(conCuadrante(d, LUNES, semana1), LUNES_2, semana2);
}

function ids(a: { asignacionIds: string[] }[]): string[] {
  return a.flatMap((x) => x.asignacionIds);
}

describe('afectadasPor', () => {
  it('ausencia de día entero: puestos y pausas de esa persona ese día', () => {
    const e = estado();
    const r = afectadasPor(e, ausencia(1, fecha(0), fecha(0)));
    expect(r).toHaveLength(1);
    expect(r[0]!.lunes).toBe(LUNES);
    expect(r[0]!.asignacionIds).toHaveLength(3); // dos franjas de puesto + la pausa
    expect(r[0]!.conCandado).toBe(0);
    const personas = new Set(
      e.cuadrantes[LUNES]!.asignaciones.filter((a) => r[0]!.asignacionIds.includes(a.id)).map((a) => a.personaId),
    );
    expect([...personas]).toEqual([P(1)]);
  });
  it('rango de varios días: incluye todos los días del rango, ninguno fuera', () => {
    const r = afectadasPor(estado(), ausencia(1, fecha(0), fecha(1)));
    expect(r[0]!.asignacionIds).toHaveLength(4); // lunes (2 + pausa) y martes (1); jueves no
  });
  it('rango que cruza dos semanas devuelve una entrada por semana, en orden', () => {
    const r = afectadasPor(estado(), ausencia(1, fecha(3), sumarDias(LUNES_2, 2)));
    expect(r.map((x) => x.lunes)).toEqual([LUNES, LUNES_2]);
    expect(r[1]!.conCandado).toBe(1);
    expect(r[1]!.asignacionIds).toHaveLength(2); // lunes 2.ª semana y miércoles con candado
  });
  it('ausencia por tramo: solo las asignaciones que se solapan con el tramo', () => {
    const e = estado();
    // 11:00–12:00 solo pisa f2 (11:00–12:00); f1 y f3 solo tocan, no se solapan.
    const tramo = { inicio: aMinutos('11:00'), fin: aMinutos('12:00') };
    const r = afectadasPor(e, ausencia(1, fecha(0), fecha(0), tramo));
    const todas = ids(r);
    expect(todas).toHaveLength(1);
    const a = e.cuadrantes[LUNES]!.asignaciones.find((x) => x.id === todas[0])!;
    expect(a.tipo === 'puesto' && a.franjaId).toBe('f2');
  });
  it('tramo que solo toca el borde de una franja no la afecta', () => {
    const tramo = { inicio: aMinutos('12:00'), fin: aMinutos('13:00') };
    // f2 de EMP-01 acaba a las 12:00; f3 es de EMP-02. Nadie de EMP-01 en 12:00–13:00.
    expect(ids(afectadasPor(estado(), ausencia(1, fecha(0), fecha(0), tramo)))).toEqual([]);
  });
  it('ausencia por tramo también afecta a una pausa solapada', () => {
    const tramo = { inicio: aMinutos('14:30'), fin: aMinutos('15:30') };
    expect(ids(afectadasPor(estado(), ausencia(1, fecha(0), fecha(0), tramo)))).toHaveLength(1);
  });
  it('cierre de puesto: todas las asignaciones de ese puesto en esas fechas, de cualquier persona', () => {
    const e = estado();
    const r = afectadasPor(e, cierre('p1', fecha(0), fecha(0)));
    expect(r[0]!.asignacionIds).toHaveLength(3); // f1, f2 (EMP-01) y f3 (EMP-02); no la pausa ni p2
  });
  it('cierre de un puesto no toca otro puesto', () => {
    const r = afectadasPor(estado(), cierre('p2', fecha(0), fecha(6)));
    expect(ids(r)).toHaveLength(1);
  });
  it('incidencia sin asignaciones afectadas: lista vacía', () => {
    expect(afectadasPor(estado(), ausencia(6, fecha(0), fecha(6)))).toEqual([]);
  });
  it('no mira las semanas tipo', () => {
    const e = estado();
    const conTipo: EstadoApp = {
      ...e,
      semanasTipo: [{ id: 'st', indiceCiclo: 0, nombre: 'A', asignaciones: [{ id: 'x', tipo: 'puesto', dia: 0, puestoId: 'p1', franjaId: 'f1', plaza: 0, personaId: P(6), bloqueada: false }] }],
    };
    expect(afectadasPor(conTipo, ausencia(6, fecha(0), fecha(6)))).toEqual([]);
  });
});

describe('liberarAfectadas', () => {
  it('quita las afectadas sin candado y respeta las que tienen candado', () => {
    const e = estado();
    const inc = ausencia(1, sumarDias(LUNES_2, 0), sumarDias(LUNES_2, 2));
    const antes = afectadasPor(e, inc);
    expect(antes[0]!.conCandado).toBe(1);
    const r = liberarAfectadas(e, inc);
    const s2 = r.cuadrantes[LUNES_2]!.asignaciones.map((a) => a.id);
    expect(s2).not.toContain('s2-a');
    expect(s2).toContain('s2-b'); // con candado
    expect(s2).toContain('s2-c'); // de otra persona
    // después de liberar solo queda la de candado como afectada
    const despues = afectadasPor(r, inc);
    expect(ids(despues)).toEqual(['s2-b']);
  });
  it('no toca semanas sin afectadas', () => {
    const e = estado();
    const r = liberarAfectadas(e, ausencia(1, sumarDias(LUNES_2, 0), sumarDias(LUNES_2, 0)));
    expect(r.cuadrantes[LUNES]!.asignaciones).toHaveLength(7);
  });
  it('no muta el estado original', () => {
    const e = estado();
    liberarAfectadas(e, ausencia(1, fecha(0), fecha(0)));
    expect(e.cuadrantes[LUNES]!.asignaciones).toHaveLength(7);
  });
});

describe('impactoIncidencia', () => {
  it('menciona cuántas asignaciones afecta y cuántas tienen candado', () => {
    const imp = impactoIncidencia(estado(), ausencia(1, fecha(3), sumarDias(LUNES_2, 2)));
    const texto = imp.efectos.join(' | ');
    expect(texto).toMatch(/3 asignaciones/);
    expect(texto).toMatch(/candado/);
  });
});

describe('erroresIncidencia', () => {
  const e = estado();
  it('incidencia válida: sin errores', () => {
    expect(erroresIncidencia(e, ausencia(1, fecha(0), fecha(2)))).toEqual([]);
    expect(erroresIncidencia(e, ausencia(1, fecha(0), fecha(0)))).toEqual([]);
    expect(erroresIncidencia(e, cierre('p1', fecha(0), fecha(1)))).toEqual([]);
  });
  it('hasta anterior a desde', () => {
    expect(erroresIncidencia(e, ausencia(1, fecha(3), fecha(1))).length).toBeGreaterThan(0);
    expect(erroresIncidencia(e, cierre('p1', fecha(3), fecha(1))).length).toBeGreaterThan(0);
  });
  it('tramo invertido o vacío', () => {
    expect(erroresIncidencia(e, ausencia(1, fecha(0), fecha(0), { inicio: aMinutos('13:00'), fin: aMinutos('12:00') })).length).toBeGreaterThan(0);
    expect(erroresIncidencia(e, ausencia(1, fecha(0), fecha(0), { inicio: aMinutos('12:00'), fin: aMinutos('12:00') })).length).toBeGreaterThan(0);
  });
  it('tramo pasado de las 24:00', () => {
    expect(erroresIncidencia(e, ausencia(1, fecha(0), fecha(0), { inicio: 600, fin: 1500 })).length).toBeGreaterThan(0);
  });
  it('fecha inválida', () => {
    expect(erroresIncidencia(e, ausencia(1, '2026-02-30', '2026-03-01')).length).toBeGreaterThan(0);
  });
  it('persona o puesto inexistente', () => {
    expect(erroresIncidencia(e, { ...(ausencia(1, fecha(0), fecha(0)) as Extract<Incidencia, { tipo: 'ausencia' }>), personaId: 'per-99' }).length).toBeGreaterThan(0);
    expect(erroresIncidencia(e, cierre('no-existe', fecha(0), fecha(0))).length).toBeGreaterThan(0);
  });
  it('nota de más de 200 caracteres', () => {
    expect(erroresIncidencia(e, { ...ausencia(1, fecha(0), fecha(0)), nota: 'x'.repeat(201) }).length).toBeGreaterThan(0);
  });
});

describe('describirIncidencia', () => {
  const e = estado();
  it('ausencia de varios días', () => {
    expect(describirIncidencia(ausencia(1, '2026-11-23', '2026-11-27'), e)).toBe('EMP-01 ausente del lunes 23 nov al viernes 27 nov');
  });
  it('ausencia de un día', () => {
    expect(describirIncidencia(ausencia(1, '2026-11-24', '2026-11-24'), e)).toBe('EMP-01 ausente el martes 24 nov');
  });
  it('ausencia por tramo', () => {
    const t = { inicio: aMinutos('10:00'), fin: aMinutos('13:00') };
    expect(describirIncidencia(ausencia(1, '2026-11-24', '2026-11-24', t), e)).toBe('EMP-01 ausente el martes 24 nov de 10:00 a 13:00');
  });
  it('cierre de puesto con su área', () => {
    expect(describirIncidencia(cierre('p2', '2026-11-28', '2026-11-28'), e)).toBe('Caja 2 (Área dos) cerrada el sábado 28 nov');
  });
  it('no incluye notas ni motivos', () => {
    const inc = { ...ausencia(1, '2026-11-24', '2026-11-24'), nota: 'texto-de-nota' };
    expect(describirIncidencia(inc, e)).not.toContain('texto-de-nota');
  });
});

describe('momentoIncidencia', () => {
  it('pasada, en curso y futura', () => {
    const inc = ausencia(1, '2026-11-24', '2026-11-26');
    expect(momentoIncidencia(inc, '2026-11-23')).toBe('futura');
    expect(momentoIncidencia(inc, '2026-11-24')).toBe('enCurso');
    expect(momentoIncidencia(inc, '2026-11-26')).toBe('enCurso');
    expect(momentoIncidencia(inc, '2026-11-27')).toBe('pasada');
  });
});
