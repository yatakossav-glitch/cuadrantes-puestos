import { describe, expect, it } from 'vitest';
import { cambiarPasoPatron, pasoPatron, quitarPatron } from '../../src/edicion/rotacion';
import { CATALOGO } from '../../src/reglas/catalogo';
import { validarSemana } from '../../src/validacion/validador';
import { sumarDias } from '../../src/modelo/fechas';
import type { Asignacion } from '../../src/modelo/tipos';
import { LUNES, P, asig, conReglas, datosMini, personaMini, reglaDe } from './ayudas';

const LUNES_B = sumarDias(LUNES, 7);

function datosConPatron() {
  const d = datosMini({
    personas: [
      personaMini(1, { patron: [{ indiceCiclo: 1, equipo: null, diasLibres: [5] }] }),
      personaMini(2),
    ],
  });
  return conReglas(d, reglaDe('personaDisponible', {}));
}

/** Asignación del día `dia` (0..6) en la semana que empieza en `lunes`. */
function en(lunes: string, dia: 0 | 1 | 2 | 3 | 4 | 5 | 6, personaId: string): Asignacion {
  const f = sumarDias(lunes, dia);
  return { ...asig(dia, 'p1', 'f1', personaId), id: `a-${f}-${personaId}`, fecha: f };
}

function noDisponibles(datos: ReturnType<typeof datosConPatron>, lunes: string, asigs: Asignacion[]) {
  return validarSemana(datos, lunes, asigs, CATALOGO).incumplimientos.filter((i) => i.tipo === 'personaDisponible');
}

describe('patrón: días libres por semana del ciclo', () => {
  it('en semana A (sin paso) el sábado de EMP-01 es válido', () => {
    expect(noDisponibles(datosConPatron(), LUNES, [en(LUNES, 5, P(1))])).toEqual([]);
  });
  it('en semana B el sábado de EMP-01 se marca como no disponible', () => {
    const incs = noDisponibles(datosConPatron(), LUNES_B, [en(LUNES_B, 5, P(1))]);
    expect(incs).toHaveLength(1);
    expect(incs[0]!.dura).toBe(true);
    expect(incs[0]!.personaId).toBe(P(1));
    expect(incs[0]!.mensaje).toContain('EMP-01');
  });
  it('en semana B otros días de EMP-01 son válidos', () => {
    expect(noDisponibles(datosConPatron(), LUNES_B, [en(LUNES_B, 4, P(1)), en(LUNES_B, 6, P(1))])).toEqual([]);
  });
  it('en semana B el sábado de otra persona es válido', () => {
    expect(noDisponibles(datosConPatron(), LUNES_B, [en(LUNES_B, 5, P(2))])).toEqual([]);
  });
  it('la semana C del ciclo de 2 vuelve a ser A (la persona no libra)', () => {
    const l = sumarDias(LUNES, 14);
    expect(noDisponibles(datosConPatron(), l, [en(l, 5, P(1))])).toEqual([]);
  });
});

describe('pasoPatron / cambiarPasoPatron / quitarPatron', () => {
  it('pasoPatron devuelve un paso vacío si no hay guardado', () => {
    const p = personaMini(1);
    expect(pasoPatron(p, 1)).toEqual({ indiceCiclo: 1, equipo: null, diasLibres: [] });
  });
  it('pasoPatron devuelve el guardado', () => {
    const p = personaMini(1, { patron: [{ indiceCiclo: 1, equipo: 'T', diasLibres: [2] }] });
    expect(pasoPatron(p, 1)).toEqual({ indiceCiclo: 1, equipo: 'T', diasLibres: [2] });
  });
  it('añade pasos y los deja ordenados por índice', () => {
    let e = datosMini();
    e = cambiarPasoPatron(e, P(1), { indiceCiclo: 1, equipo: 'T', diasLibres: [] });
    e = cambiarPasoPatron(e, P(1), { indiceCiclo: 0, equipo: null, diasLibres: [6] });
    expect(e.personas.find((p) => p.id === P(1))!.patron.map((x) => x.indiceCiclo)).toEqual([0, 1]);
  });
  it('reemplaza un paso existente sin duplicar', () => {
    let e = datosConPatron();
    e = cambiarPasoPatron(e, P(1), { indiceCiclo: 1, equipo: null, diasLibres: [5, 6] });
    const patron = e.personas.find((p) => p.id === P(1))!.patron;
    expect(patron).toHaveLength(1);
    expect(patron[0]!.diasLibres).toEqual([5, 6]);
  });
  it('un paso vacío (sin equipo ni días libres) quita el paso', () => {
    let e = datosConPatron();
    e = cambiarPasoPatron(e, P(1), { indiceCiclo: 1, equipo: null, diasLibres: [] });
    expect(e.personas.find((p) => p.id === P(1))!.patron).toEqual([]);
  });
  it('un paso vacío sobre un índice inexistente no añade nada', () => {
    const e = cambiarPasoPatron(datosMini(), P(2), { indiceCiclo: 0, equipo: null, diasLibres: [] });
    expect(e.personas.find((p) => p.id === P(2))!.patron).toEqual([]);
  });
  it('solo equipo (sin días libres) se conserva', () => {
    const e = cambiarPasoPatron(datosMini(), P(2), { indiceCiclo: 0, equipo: 'M', diasLibres: [] });
    expect(e.personas.find((p) => p.id === P(2))!.patron).toHaveLength(1);
  });
  it('quitarPatron borra todos los pasos de esa persona y no toca a las demás', () => {
    let e = datosConPatron();
    e = cambiarPasoPatron(e, P(2), { indiceCiclo: 0, equipo: 'T', diasLibres: [] });
    e = quitarPatron(e, P(1));
    expect(e.personas.find((p) => p.id === P(1))!.patron).toEqual([]);
    expect(e.personas.find((p) => p.id === P(2))!.patron).toHaveLength(1);
  });
  it('no muta el estado original', () => {
    const e = datosConPatron();
    cambiarPasoPatron(e, P(1), { indiceCiclo: 1, equipo: null, diasLibres: [] });
    expect(e.personas.find((p) => p.id === P(1))!.patron).toHaveLength(1);
  });
});
