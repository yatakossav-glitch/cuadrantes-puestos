import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { definicion, metadatos } from './maxDiasSemana';
import { CAJA1, JUEVES, LUNES, VIERNES, contexto, franjaCaja, persona, puesto, restriccion, verificarCoherencia, verificarVelocidad } from '../../../tests/ayudas/reglasPersona';

const datos = crearEstadoEjemplo();

describe('maxDiasSemana', () => {
  it('describe', () => {
    expect(metadatos.describir({ max: 5 }, datos)).toBe('Máximo 5 días a la semana');
    expect(metadatos.describir({ max: 1 }, datos)).toBe('Máximo 1 día a la semana');
  });
  it('acepta lo válido', () => {
    expect(metadatos.validarParams(metadatos.paramsPorDefecto(datos), datos)).toEqual([]);
    expect(metadatos.validarParams({ max: 7 }, datos)).toEqual([]);
  });
  it('rechaza fuera de 1–7 y no enteros', () => {
    expect(metadatos.validarParams({ max: 0 }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ max: 8 }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ max: 2.5 }, datos)).not.toEqual([]);
  });
});

describe('maxDiasSemana · evaluar y comprobar', () => {
  const r = restriccion('maxDiasSemana', { max: 2 });
  const dosDias = [puesto('a1', LUNES, CAJA1, franjaCaja(1), 'per-05'), puesto('a2', JUEVES, CAJA1, franjaCaja(1), 'per-05'), puesto('a2b', JUEVES, CAJA1, franjaCaja(2), 'per-05')];
  it('cumple en el límite (varias franjas el mismo día cuentan como un día)', () => {
    const ctx = contexto(dosDias);
    expect(definicion.evaluar(r, persona(ctx, 'per-05'), ctx)).toEqual([]);
  });
  it('incumple por encima, uno por persona', () => {
    const ctx = contexto([...dosDias, puesto('a3', VIERNES, CAJA1, franjaCaja(1), 'per-05')]);
    const res = definicion.evaluar(r, persona(ctx, 'per-05'), ctx);
    expect(res).toHaveLength(1);
    expect(res[0]?.mensaje).toBe('EMP-05 trabaja 3 días esta semana y el máximo es 2');
  });
  it('comprobar: un tercer día se bloquea, un día ya trabajado no', () => {
    const ctx = contexto(dosDias);
    const p = persona(ctx, 'per-05');
    expect(definicion.comprobar(r, p, ctx, puesto('n', VIERNES, CAJA1, franjaCaja(1), 'per-05')).permitido).toBe(false);
    expect(definicion.comprobar(r, p, ctx, puesto('n', JUEVES, CAJA1, franjaCaja(3), 'per-05')).permitido).toBe(true);
    expect(definicion.comprobar(r, p, ctx, puesto('n', VIERNES, CAJA1, franjaCaja(1), 'per-06'))).toEqual({ permitido: true, coste: 0, motivos: [] });
  });
});

describe('maxDiasSemana · comprobar especializado', () => {
  it('coincide con evaluar antes y después (dura y blanda)', () => {
    verificarCoherencia({ definicion, params: { max: 2 } });
  });
  it('es rápido: 2000 comprobaciones con ~150 asignaciones', () => {
    verificarVelocidad(definicion, { max: 2 });
  });
});
