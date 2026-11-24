import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { definicion, metadatos } from './noAntesDe';
import { CAJA1, JUEVES, VIERNES, contexto, franjaCaja, persona, puesto, restriccion, verificarCoherencia, verificarVelocidad } from '../../../tests/ayudas/reglasPersona';

const datos = crearEstadoEjemplo();

describe('noAntesDe', () => {
  it('describe', () => {
    expect(metadatos.describir({ hora: 600, dias: [] }, datos)).toBe('No empezar antes de las 10:00');
    expect(metadatos.describir({ hora: 600, dias: [5, 6] }, datos)).toBe('No empezar antes de las 10:00 (sábado y domingo)');
  });
  it('acepta lo válido', () => {
    expect(metadatos.validarParams(metadatos.paramsPorDefecto(datos), datos)).toEqual([]);
    expect(metadatos.validarParams({ hora: 1440, dias: [0] }, datos)).toEqual([]);
  });
  it('rechaza hora y días inválidos', () => {
    expect(metadatos.validarParams({ hora: -1, dias: [] }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ hora: 1441, dias: [] }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ hora: 600, dias: [8] as never }, datos)).not.toEqual([]);
  });
});

describe('noAntesDe · evaluar y comprobar', () => {
  const r = restriccion('noAntesDe', { hora: 660, dias: [3] }); // no antes de 11:00, solo jueves
  it('cumple si empieza a la hora o después', () => {
    const ctx = contexto([puesto('a1', JUEVES, CAJA1, franjaCaja(2), 'per-05')]); // 11:30
    expect(definicion.evaluar(r, persona(ctx, 'per-05'), ctx)).toEqual([]);
  });
  it('incumple en su día con la hora de la primera asignación, uno por día', () => {
    const ctx = contexto([puesto('a1', JUEVES, CAJA1, franjaCaja(1), 'per-05')]); // 10:00
    const res = definicion.evaluar(r, persona(ctx, 'per-05'), ctx);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ marca: 'noDisponible', fecha: JUEVES, asignacionIds: ['a1'] });
    expect(res[0]?.mensaje).toBe('EMP-05 empieza antes de las 11:00 el jueves 26/11 (10:00)');
  });
  it('no mira los días fuera de `dias`, pero vacío vale para todos', () => {
    const ctx = contexto([puesto('a1', VIERNES, CAJA1, franjaCaja(1), 'per-05')]);
    expect(definicion.evaluar(r, persona(ctx, 'per-05'), ctx)).toEqual([]);
    const todos = restriccion('noAntesDe', { hora: 660, dias: [] });
    expect(definicion.evaluar(todos, persona(ctx, 'per-05'), ctx)).toHaveLength(1);
  });
  it('comprobar coherente y solo de su persona', () => {
    const ctx = contexto();
    const p = persona(ctx, 'per-05');
    expect(definicion.comprobar(r, p, ctx, puesto('n', JUEVES, CAJA1, franjaCaja(1), 'per-05'))).toMatchObject({ permitido: false, motivos: ['EMP-05 empieza antes de las 11:00 el jueves 26/11 (10:00)'] });
    expect(definicion.comprobar(r, p, ctx, puesto('n', VIERNES, CAJA1, franjaCaja(1), 'per-05')).permitido).toBe(true);
    expect(definicion.comprobar(r, p, ctx, puesto('n', JUEVES, CAJA1, franjaCaja(1), 'per-06'))).toEqual({ permitido: true, coste: 0, motivos: [] });
  });
});

describe('noAntesDe · comprobar especializado', () => {
  it('coincide con evaluar antes y después (dura y blanda)', () => {
    verificarCoherencia({ definicion, params: { hora: 780, dias: [] } });
  });
  it('es rápido: 2000 comprobaciones con ~150 asignaciones', () => {
    verificarVelocidad(definicion, { hora: 780, dias: [] });
  });
});
