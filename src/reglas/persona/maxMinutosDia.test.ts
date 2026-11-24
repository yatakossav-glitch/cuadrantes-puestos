import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { definicion, metadatos } from './maxMinutosDia';
import { CAJA1, JUEVES, contexto, franjaCaja, persona, puesto, restriccion, verificarCoherencia, verificarVelocidad } from '../../../tests/ayudas/reglasPersona';

const datos = crearEstadoEjemplo();

describe('maxMinutosDia', () => {
  it('describe', () => {
    expect(metadatos.describir({ maxMin: 270 }, datos)).toBe('Máximo 4h30 al día');
  });
  it('acepta lo válido', () => {
    expect(metadatos.validarParams(metadatos.paramsPorDefecto(datos), datos)).toEqual([]);
  });
  it('rechaza cero, negativo y más de 24h', () => {
    expect(metadatos.validarParams({ maxMin: 0 }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ maxMin: -5 }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ maxMin: 1441 }, datos)).not.toEqual([]);
  });
});

describe('maxMinutosDia · evaluar y comprobar', () => {
  const r = restriccion('maxMinutosDia', { maxMin: 270 }, true, 2);
  // franjas 1 (90) + 2 (90) + 3 (90) = 270; la 4 añade 75 → 345.
  const tres = [1, 2, 3].map((n) => puesto(`a${n}`, JUEVES, CAJA1, franjaCaja(n), 'per-12'));
  it('cumple en el límite exacto', () => {
    const ctx = contexto(tres);
    expect(definicion.evaluar(r, persona(ctx, 'per-12'), ctx)).toEqual([]);
  });
  it('incumple con mensaje legible y penalización por 15 min (blanda)', () => {
    const rb = restriccion('maxMinutosDia', { maxMin: 270 }, false, 2);
    const ctx = contexto([...tres, puesto('a4', JUEVES, CAJA1, franjaCaja(4), 'per-12')]);
    const [i] = definicion.evaluar(rb, persona(ctx, 'per-12'), ctx);
    expect(i?.mensaje).toBe('EMP-12 supera 4h30 el jueves 26/11 (5h45)');
    expect(i).toMatchObject({ dura: false, penalizacion: 2 * 5, marca: 'aviso', fecha: JUEVES });
  });
  it('dura: penalización 0', () => {
    const ctx = contexto([...tres, puesto('a4', JUEVES, CAJA1, franjaCaja(4), 'per-12')]);
    expect(definicion.evaluar(r, persona(ctx, 'per-12'), ctx)[0]).toMatchObject({ dura: true, penalizacion: 0 });
  });
  it('comprobar: bloquea si es dura, cobra el coste si es blanda, ignora a otra persona', () => {
    const ctx = contexto(tres);
    const p = persona(ctx, 'per-12');
    const candidata = puesto('n', JUEVES, CAJA1, franjaCaja(4), 'per-12');
    expect(definicion.comprobar(r, p, ctx, candidata)).toMatchObject({ permitido: false, motivos: ['EMP-12 supera 4h30 el jueves 26/11 (5h45)'] });
    expect(definicion.comprobar(restriccion('maxMinutosDia', { maxMin: 270 }, false, 2), p, ctx, candidata)).toMatchObject({ permitido: true, coste: 10 });
    expect(definicion.comprobar(r, p, ctx, puesto('n', JUEVES, CAJA1, franjaCaja(4), 'per-13'))).toEqual({ permitido: true, coste: 0, motivos: [] });
  });
});

describe('maxMinutosDia · comprobar especializado', () => {
  it('coincide con evaluar antes y después (dura y blanda)', () => {
    verificarCoherencia({ definicion, params: { maxMin: 180 } });
  });
  it('es rápido: 2000 comprobaciones con ~150 asignaciones', () => {
    verificarVelocidad(definicion, { maxMin: 180 });
  });
});
