import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { definicion, metadatos } from './diasNoDisponibles';
import { CAJA1, JUEVES, VIERNES, contexto, franjaCaja, persona, puesto, restriccion, verificarCoherencia, verificarVelocidad } from '../../../tests/ayudas/reglasPersona';

const datos = crearEstadoEjemplo();

describe('diasNoDisponibles', () => {
  it('describe', () => {
    expect(metadatos.describir({ dias: [4] }, datos)).toBe('No trabaja el viernes');
    expect(metadatos.describir({ dias: [5, 6] }, datos)).toBe('No trabaja sábado y domingo');
  });
  it('acepta lo válido y la muestra del ejemplo', () => {
    expect(metadatos.validarParams(metadatos.paramsPorDefecto(datos), datos)).toEqual([]);
    const muestra = datos.personas.flatMap((p) => p.restricciones).find((r) => r.tipo === 'diasNoDisponibles');
    expect(muestra).toBeDefined();
    if (muestra?.tipo === 'diasNoDisponibles') expect(metadatos.validarParams(muestra.params, datos)).toEqual([]);
  });
  it('rechaza vacío, fuera de rango y repetidos', () => {
    expect(metadatos.validarParams({ dias: [] }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ dias: [-1] as never }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ dias: [2, 2] }, datos)).not.toEqual([]);
  });
});

describe('diasNoDisponibles · evaluar y comprobar', () => {
  const r = restriccion('diasNoDisponibles', { dias: [4] });
  it('cumple en otros días', () => {
    const ctx = contexto([puesto('a1', JUEVES, CAJA1, franjaCaja(1), 'per-03')]);
    expect(definicion.evaluar(r, persona(ctx, 'per-03'), ctx)).toEqual([]);
  });
  it('incumple el día vetado', () => {
    const ctx = contexto([puesto('a1', VIERNES, CAJA1, franjaCaja(1), 'per-03'), puesto('a2', VIERNES, CAJA1, franjaCaja(2), 'per-03')]);
    const res = definicion.evaluar(r, persona(ctx, 'per-03'), ctx);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ marca: 'noDisponible', fecha: VIERNES, asignacionIds: ['a1', 'a2'] });
    expect(res[0]?.mensaje).toBe('EMP-03 trabaja el viernes 27/11 y no puede trabajar ese día');
  });
  it('solo evalúa a su persona y comprobar es coherente', () => {
    const ctx = contexto([puesto('a1', VIERNES, CAJA1, franjaCaja(1), 'per-04')]);
    expect(definicion.evaluar(r, persona(ctx, 'per-03'), ctx)).toEqual([]);
    const p = persona(ctx, 'per-03');
    expect(definicion.comprobar(r, p, ctx, puesto('n', VIERNES, CAJA1, franjaCaja(2), 'per-04'))).toEqual({ permitido: true, coste: 0, motivos: [] });
    expect(definicion.comprobar(r, p, ctx, puesto('n', VIERNES, CAJA1, franjaCaja(2), 'per-03')).permitido).toBe(false);
    expect(definicion.comprobar(r, p, ctx, puesto('n', JUEVES, CAJA1, franjaCaja(2), 'per-03')).permitido).toBe(true);
  });
});

describe('diasNoDisponibles · comprobar especializado', () => {
  it('coincide con evaluar antes y después (dura y blanda)', () => {
    verificarCoherencia({ definicion, params: { dias: [1, 3, 5] } });
  });
  it('es rápido: 2000 comprobaciones con ~150 asignaciones', () => {
    verificarVelocidad(definicion, { dias: [1, 3, 5] });
  });
});
