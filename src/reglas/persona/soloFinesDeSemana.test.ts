import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { definicion, metadatos } from './soloFinesDeSemana';
import { CAJA1, JUEVES, SABADO, contexto, franjaCaja, persona, puesto, restriccion, verificarCoherencia, verificarVelocidad } from '../../../tests/ayudas/reglasPersona';

const datos = crearEstadoEjemplo();

describe('soloFinesDeSemana', () => {
  it('describe', () => {
    expect(metadatos.describir({}, datos)).toBe('Solo sábado y domingo');
  });
  it('acepta la muestra del ejemplo y no tiene campos', () => {
    expect(metadatos.validarParams(metadatos.paramsPorDefecto(datos), datos)).toEqual([]);
    const muestra = datos.personas.flatMap((p) => p.restricciones).find((r) => r.tipo === 'soloFinesDeSemana');
    expect(muestra).toBeDefined();
    expect(metadatos.campos).toEqual([]);
  });
});

describe('soloFinesDeSemana · evaluar y comprobar', () => {
  const r = restriccion('soloFinesDeSemana', {});
  it('cumple en sábado y domingo', () => {
    const ctx = contexto([puesto('a1', SABADO, CAJA1, franjaCaja(1), 'per-08'), puesto('a2', '2026-11-29', CAJA1, franjaCaja(1), 'per-08')]);
    expect(definicion.evaluar(r, persona(ctx, 'per-08'), ctx)).toEqual([]);
  });
  it('incumple entre semana, uno por día', () => {
    const ctx = contexto([puesto('a1', JUEVES, CAJA1, franjaCaja(1), 'per-08'), puesto('a2', JUEVES, CAJA1, franjaCaja(2), 'per-08'), puesto('a3', '2026-11-23', CAJA1, franjaCaja(1), 'per-08')]);
    const res = definicion.evaluar(r, persona(ctx, 'per-08'), ctx);
    expect(res.map((i) => i.mensaje)).toEqual([
      'EMP-08 trabaja el lunes 23/11 y solo puede trabajar sábado y domingo',
      'EMP-08 trabaja el jueves 26/11 y solo puede trabajar sábado y domingo',
    ]);
    expect(res.every((i) => i.marca === 'noDisponible')).toBe(true);
  });
  it('comprobar coherente', () => {
    const ctx = contexto();
    const p = persona(ctx, 'per-08');
    expect(definicion.comprobar(r, p, ctx, puesto('n', JUEVES, CAJA1, franjaCaja(1), 'per-08')).permitido).toBe(false);
    expect(definicion.comprobar(r, p, ctx, puesto('n', SABADO, CAJA1, franjaCaja(1), 'per-08'))).toEqual({ permitido: true, coste: 0, motivos: [] });
    expect(definicion.comprobar(r, p, ctx, puesto('n', JUEVES, CAJA1, franjaCaja(1), 'per-09'))).toEqual({ permitido: true, coste: 0, motivos: [] });
  });
});

describe('soloFinesDeSemana · comprobar especializado', () => {
  it('coincide con evaluar antes y después (dura y blanda)', () => {
    verificarCoherencia({ definicion, params: {} });
  });
  it('es rápido: 2000 comprobaciones con ~150 asignaciones', () => {
    verificarVelocidad(definicion, {});
  });
});
