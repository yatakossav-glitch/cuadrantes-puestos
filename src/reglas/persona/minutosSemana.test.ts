import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { definicion, metadatos } from './minutosSemana';
import { CAJA1, JUEVES, LUNES, contexto, franjaCaja, persona, puesto, restriccion, verificarCoherencia, verificarVelocidad } from '../../../tests/ayudas/reglasPersona';

const datos = crearEstadoEjemplo();

describe('minutosSemana', () => {
  it('describe', () => {
    expect(metadatos.describir({ minMin: 1200, maxMin: 1800 }, datos)).toBe('Entre 20h y 30h a la semana');
    expect(metadatos.describir({ minMin: null, maxMin: 1800 }, datos)).toBe('Como mucho 30h a la semana');
    expect(metadatos.describir({ minMin: 600, maxMin: null }, datos)).toBe('Al menos 10h a la semana');
  });
  it('acepta lo válido', () => {
    expect(metadatos.validarParams(metadatos.paramsPorDefecto(datos), datos)).toEqual([]);
    expect(metadatos.validarParams({ minMin: 600, maxMin: 600 }, datos)).toEqual([]);
  });
  it('rechaza sin límites, mínimo > máximo y valores no válidos', () => {
    expect(metadatos.validarParams({ minMin: null, maxMin: null }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ minMin: 1800, maxMin: 1200 }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ minMin: 0, maxMin: 600 }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ minMin: null, maxMin: 20000 }, datos)).not.toEqual([]);
  });
});

describe('minutosSemana · evaluar y comprobar', () => {
  const franjas = (n: number) => Array.from({ length: n }, (_, i) => puesto(`a${i}`, JUEVES, CAJA1, franjaCaja(i + 1), 'per-05'));
  it('cumple dentro del rango', () => {
    const ctx = contexto(franjas(2)); // 180 min
    expect(definicion.evaluar(restriccion('minutosSemana', { minMin: 120, maxMin: 180 }), persona(ctx, 'per-05'), ctx)).toEqual([]);
  });
  it('por debajo del mínimo: penaliza por 15 min', () => {
    const ctx = contexto(franjas(1)); // 90 min
    const [i] = definicion.evaluar(restriccion('minutosSemana', { minMin: 180, maxMin: null }, false, 2), persona(ctx, 'per-05'), ctx);
    expect(i?.mensaje).toBe('EMP-05 no llega a 3h esta semana');
    expect(i?.penalizacion).toBe(2 * 6);
  });
  it('por encima del máximo: penaliza por 15 min', () => {
    const ctx = contexto(franjas(3)); // 270 min
    const [i] = definicion.evaluar(restriccion('minutosSemana', { minMin: null, maxMin: 200 }, false, 1), persona(ctx, 'per-05'), ctx);
    expect(i?.mensaje).toBe('EMP-05 supera 3h20 esta semana (4h30)');
    expect(i?.penalizacion).toBe(5);
  });
  it('sin límite en un extremo no incumple por ese extremo', () => {
    const ctx = contexto([]);
    expect(definicion.evaluar(restriccion('minutosSemana', { minMin: null, maxMin: 100 }), persona(ctx, 'per-05'), ctx)).toEqual([]);
  });
  it('comprobar: el máximo duro bloquea; acercarse al mínimo duro no bloquea y no cuesta', () => {
    const ctx = contexto(franjas(2));
    const p = persona(ctx, 'per-05');
    const candidata = puesto('n', LUNES, CAJA1, franjaCaja(1), 'per-05');
    expect(definicion.comprobar(restriccion('minutosSemana', { minMin: null, maxMin: 180 }), p, ctx, candidata).permitido).toBe(false);
    expect(definicion.comprobar(restriccion('minutosSemana', { minMin: 600, maxMin: null }), p, ctx, candidata)).toEqual({ permitido: true, coste: 0, motivos: [] });
    expect(definicion.comprobar(restriccion('minutosSemana', { minMin: null, maxMin: 180 }, false, 2), p, ctx, candidata)).toMatchObject({ permitido: true, coste: 12 });
    expect(definicion.comprobar(restriccion('minutosSemana', { minMin: null, maxMin: 180 }), p, ctx, puesto('n', LUNES, CAJA1, franjaCaja(1), 'per-06')).permitido).toBe(true);
  });
});

describe('minutosSemana · comprobar especializado', () => {
  it('coincide con evaluar antes y después (dura y blanda)', () => {
    verificarCoherencia({ definicion, params: { minMin: 300, maxMin: 600 }, bloquea: (i) => !i.mensaje.includes('no llega') });
  });
  it('es rápido: 2000 comprobaciones con ~150 asignaciones', () => {
    verificarVelocidad(definicion, { minMin: 300, maxMin: 600 });
  });
});
