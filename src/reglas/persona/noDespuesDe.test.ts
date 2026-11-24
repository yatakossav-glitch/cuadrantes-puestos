import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { definicion, metadatos } from './noDespuesDe';
import { CAJA1, JUEVES, VIERNES, contexto, franjaCaja, persona, puesto, restriccion, verificarCoherencia, verificarVelocidad } from '../../../tests/ayudas/reglasPersona';

const datos = crearEstadoEjemplo();

describe('noDespuesDe', () => {
  it('describe', () => {
    expect(metadatos.describir({ hora: 1200, dias: [] }, datos)).toBe('No terminar después de las 20:00');
    expect(metadatos.describir({ hora: 1200, dias: [4] }, datos)).toBe('No terminar después de las 20:00 (viernes)');
  });
  it('acepta lo válido y la muestra del ejemplo', () => {
    expect(metadatos.validarParams(metadatos.paramsPorDefecto(datos), datos)).toEqual([]);
    const muestra = datos.personas.flatMap((p) => p.restricciones).find((r) => r.tipo === 'noDespuesDe');
    expect(muestra).toBeDefined();
    if (muestra?.tipo === 'noDespuesDe') expect(metadatos.validarParams(muestra.params, datos)).toEqual([]);
  });
  it('rechaza hora y días inválidos', () => {
    expect(metadatos.validarParams({ hora: 1500, dias: [] }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ hora: 90.5, dias: [] }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ hora: 600, dias: [1, 1] }, datos)).not.toEqual([]);
  });
});

describe('noDespuesDe · evaluar y comprobar', () => {
  const r = restriccion('noDespuesDe', { hora: 1200, dias: [] }); // no después de las 20:00
  it('cumple si termina a la hora o antes', () => {
    const ctx = contexto([puesto('a1', JUEVES, CAJA1, franjaCaja(6), 'per-12')]); // termina 19:00
    expect(definicion.evaluar(r, persona(ctx, 'per-12'), ctx)).toEqual([]);
  });
  it('incumple con la hora de fin más tardía del día', () => {
    const ctx = contexto([puesto('a1', JUEVES, CAJA1, franjaCaja(7), 'per-12'), puesto('a2', JUEVES, CAJA1, franjaCaja(8), 'per-12')]);
    const res = definicion.evaluar(r, persona(ctx, 'per-12'), ctx);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ marca: 'noDisponible', fecha: JUEVES, asignacionIds: ['a1', 'a2'] });
    expect(res[0]?.mensaje).toBe('EMP-12 termina después de las 20:00 el jueves 26/11 (22:00)');
  });
  it('solo en sus días si `dias` no está vacío', () => {
    const soloViernes = restriccion('noDespuesDe', { hora: 1200, dias: [4] });
    const ctx = contexto([puesto('a1', JUEVES, CAJA1, franjaCaja(8), 'per-12')]);
    expect(definicion.evaluar(soloViernes, persona(ctx, 'per-12'), ctx)).toEqual([]);
    const ctx2 = contexto([puesto('a1', VIERNES, CAJA1, franjaCaja(8), 'per-12')]);
    expect(definicion.evaluar(soloViernes, persona(ctx2, 'per-12'), ctx2)).toHaveLength(1);
  });
  it('comprobar coherente y solo de su persona', () => {
    const ctx = contexto();
    const p = persona(ctx, 'per-12');
    expect(definicion.comprobar(r, p, ctx, puesto('n', JUEVES, CAJA1, franjaCaja(8), 'per-12')).permitido).toBe(false);
    expect(definicion.comprobar(r, p, ctx, puesto('n', JUEVES, CAJA1, franjaCaja(5), 'per-12'))).toEqual({ permitido: true, coste: 0, motivos: [] });
    expect(definicion.comprobar(r, p, ctx, puesto('n', JUEVES, CAJA1, franjaCaja(8), 'per-13'))).toEqual({ permitido: true, coste: 0, motivos: [] });
  });
});

describe('noDespuesDe · comprobar especializado', () => {
  it('coincide con evaluar antes y después (dura y blanda)', () => {
    verificarCoherencia({ definicion, params: { hora: 1020, dias: [0, 2, 4, 5] } });
  });
  it('es rápido: 2000 comprobaciones con ~150 asignaciones', () => {
    verificarVelocidad(definicion, { hora: 1020, dias: [0, 2, 4, 5] });
  });
});
