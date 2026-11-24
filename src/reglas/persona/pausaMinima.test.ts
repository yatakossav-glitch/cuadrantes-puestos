import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { definicion, metadatos } from './pausaMinima';
import { CAJA1, JUEVES, contexto, franjaCaja, persona, pausa, puesto, restriccion, verificarCoherencia, verificarVelocidad } from '../../../tests/ayudas/reglasPersona';

const datos = crearEstadoEjemplo();

describe('pausaMinima', () => {
  it('describe', () => {
    expect(metadatos.describir({ siJornadaSuperaMin: 480, pausaMin: 30 }, datos)).toBe('Pausa de 30 min si la jornada pasa de 8h');
  });
  it('acepta lo válido', () => {
    expect(metadatos.validarParams(metadatos.paramsPorDefecto(datos), datos)).toEqual([]);
  });
  it('rechaza duraciones no válidas', () => {
    expect(metadatos.validarParams({ siJornadaSuperaMin: 0, pausaMin: 30 }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ siJornadaSuperaMin: 480, pausaMin: 0 }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ siJornadaSuperaMin: 2000, pausaMin: 30 }, datos)).not.toEqual([]);
  });
});

describe('pausaMinima · evaluar y comprobar', () => {
  // Si la jornada pasa de 6h, pausa de 30 min.
  const r = restriccion('pausaMinima', { siJornadaSuperaMin: 360, pausaMin: 30 }, false, 2);
  const seguidas = [1, 2, 3, 4].map((n) => puesto(`a${n}`, JUEVES, CAJA1, franjaCaja(n), 'per-05')); // 10:00–15:45 = 5h45
  const largaSeguida = [...seguidas, puesto('a5', JUEVES, CAJA1, franjaCaja(5), 'per-05')]; // hasta 17:20 = 7h20
  it('jornada corta: no exige pausa', () => {
    const ctx = contexto(seguidas);
    expect(definicion.evaluar(r, persona(ctx, 'per-05'), ctx)).toEqual([]);
  });
  it('jornada larga sin hueco ni pausa: incumple, penalización por 15 min que faltan', () => {
    const ctx = contexto(largaSeguida);
    const res = definicion.evaluar(r, persona(ctx, 'per-05'), ctx);
    expect(res).toHaveLength(1);
    expect(res[0]?.mensaje).toBe('EMP-05 no tiene una pausa de 30 min el jueves 26/11');
    expect(res[0]).toMatchObject({ dura: false, penalizacion: 2 * 2, fecha: JUEVES });
  });
  it('un hueco de puesto de al menos 30 min la satisface', () => {
    // franjas 1,2 (10:00–13:00) y 6 (17:20–19:00): hueco de más de 4h.
    const ctx = contexto([1, 2, 6].map((n) => puesto(`a${n}`, JUEVES, CAJA1, franjaCaja(n), 'per-05')));
    expect(definicion.evaluar(r, persona(ctx, 'per-05'), ctx)).toEqual([]);
  });
  it('sin hueco, la penalización es proporcional a la pausa exigida', () => {
    const rb = restriccion('pausaMinima', { siJornadaSuperaMin: 360, pausaMin: 60 }, false, 1);
    const ctx = contexto([1, 2, 3, 4, 5, 6].map((n) => puesto(`a${n}`, JUEVES, CAJA1, franjaCaja(n), 'per-05')));
    expect(definicion.evaluar(rb, persona(ctx, 'per-05'), ctx)[0]?.penalizacion).toBe(4);
  });
  it('una pausa asignada cuenta como hueco libre cuando no se solapa con ningún puesto', () => {
    const p = persona(contexto(), 'per-05');
    // Franjas 1, 2 y 5: libre de 13:00 a 15:45 (2h45), la pausa cae dentro.
    const conPausa = contexto([...[1, 2, 5].map((n) => puesto(`c${n}`, JUEVES, CAJA1, franjaCaja(n), 'per-05')), pausa('p9', JUEVES, 'per-05', 810, 870)]);
    expect(definicion.evaluar(r, p, conPausa)).toEqual([]);
  });
  it('comprobar: añadir una franja que alarga la jornada sin pausa cuesta; otra persona no', () => {
    const ctx = contexto(seguidas);
    const p = persona(ctx, 'per-05');
    const candidata = puesto('n', JUEVES, CAJA1, franjaCaja(5), 'per-05');
    expect(definicion.comprobar(r, p, ctx, candidata)).toMatchObject({ permitido: true, coste: 4, motivos: ['EMP-05 no tiene una pausa de 30 min el jueves 26/11'] });
    // Aunque sea dura, la pausa nunca bloquea: solo cuesta.
    expect(definicion.comprobar(restriccion('pausaMinima', { siJornadaSuperaMin: 360, pausaMin: 30 }), p, ctx, candidata)).toMatchObject({ permitido: true, coste: 0 });
    expect(definicion.comprobar(r, p, ctx, puesto('n', JUEVES, CAJA1, franjaCaja(5), 'per-06'))).toEqual({ permitido: true, coste: 0, motivos: [] });
  });
  it('una pausa fuera de la jornada no cuenta; una dentro y libre sí', () => {
    const p = persona(contexto(), 'per-05');
    // Jornada 10:00–17:20 (franjas 1-5 seguidas).
    const fuera = contexto([...largaSeguida, pausa('p1', JUEVES, 'per-05', 480, 540)]);
    expect(definicion.evaluar(r, p, fuera)).toHaveLength(1);
    const dentroLibre = contexto([...[1, 2, 5].map((n) => puesto(`b${n}`, JUEVES, CAJA1, franjaCaja(n), 'per-05')), pausa('p2', JUEVES, 'per-05', 810, 840)]);
    expect(definicion.evaluar(r, p, dentroLibre)).toEqual([]);
  });
  it('una pausa que se solapa con un puesto no cuenta', () => {
    const p = persona(contexto(), 'per-05');
    // 13:00–13:30 cae dentro de la franja 3 (13:00–14:30), que la persona trabaja.
    const conPuesto = contexto([...largaSeguida, pausa('p3', JUEVES, 'per-05', 780, 810)]);
    expect(definicion.evaluar(r, p, conPuesto)).toHaveLength(1);
  });
});

describe('pausaMinima · comprobar especializado', () => {
  it('coincide con evaluar antes y después (dura y blanda)', () => {
    verificarCoherencia({ definicion, params: { siJornadaSuperaMin: 240, pausaMin: 60 }, nuncaBloquea: true });
  });
  it('es rápido: 2000 comprobaciones con ~150 asignaciones', () => {
    verificarVelocidad(definicion, { siJornadaSuperaMin: 240, pausaMin: 60 });
  });
});
