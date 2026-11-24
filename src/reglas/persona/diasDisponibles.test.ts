import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { definicion, metadatos } from './diasDisponibles';
import { CAJA1, JUEVES, SABADO, contexto, franjaCaja, persona, puesto, restriccion, verificarCoherencia, verificarVelocidad } from '../../../tests/ayudas/reglasPersona';

const datos = crearEstadoEjemplo();

describe('diasDisponibles', () => {
  it('describe', () => {
    expect(metadatos.describir({ dias: [0, 1, 2, 3, 4] }, datos)).toBe('Solo trabaja de lunes a viernes');
    expect(metadatos.describir({ dias: [5, 6] }, datos)).toBe('Solo trabaja sábado y domingo');
  });
  it('acepta lo válido', () => {
    expect(metadatos.validarParams(metadatos.paramsPorDefecto(datos), datos)).toEqual([]);
  });
  it('rechaza vacío, fuera de rango y repetidos', () => {
    expect(metadatos.validarParams({ dias: [] }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ dias: [7] as never }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ dias: [1, 1] }, datos)).not.toEqual([]);
  });
});

describe('diasDisponibles · evaluar y comprobar', () => {
  const r = restriccion('diasDisponibles', { dias: [0, 1, 2, 3] });
  it('no incumple si trabaja un día permitido', () => {
    const ctx = contexto([puesto('a1', JUEVES, CAJA1, franjaCaja(1), 'per-05')]);
    expect(definicion.evaluar(r, persona(ctx, 'per-05'), ctx)).toEqual([]);
  });
  it('incumple un día no permitido, con marca noDisponible y sin motivo', () => {
    const ctx = contexto([puesto('a1', SABADO, CAJA1, franjaCaja(1), 'per-05')]);
    const [i] = definicion.evaluar(r, persona(ctx, 'per-05'), ctx);
    expect(i).toMatchObject({ origen: 'persona', tipo: 'diasDisponibles', marca: 'noDisponible', fecha: SABADO, personaId: 'per-05', asignacionIds: ['a1'], dura: true });
    expect(i?.mensaje).toBe('EMP-05 trabaja el sábado 28/11 y no está disponible ese día');
  });
  it('comprobar: bloquea el día no permitido, permite el permitido y no afecta a otra persona', () => {
    const ctx = contexto();
    const p = persona(ctx, 'per-05');
    expect(definicion.comprobar(r, p, ctx, puesto('n', SABADO, CAJA1, franjaCaja(1), 'per-05'))).toMatchObject({ permitido: false, motivos: ['EMP-05 trabaja el sábado 28/11 y no está disponible ese día'] });
    expect(definicion.comprobar(r, p, ctx, puesto('n', JUEVES, CAJA1, franjaCaja(1), 'per-05'))).toEqual({ permitido: true, coste: 0, motivos: [] });
    expect(definicion.comprobar(r, p, ctx, puesto('n', SABADO, CAJA1, franjaCaja(1), 'per-06'))).toEqual({ permitido: true, coste: 0, motivos: [] });
  });
  it('blanda: permitido con coste', () => {
    const ctx = contexto();
    const c = definicion.comprobar(restriccion('diasDisponibles', { dias: [0] }, false, 4), persona(ctx, 'per-05'), ctx, puesto('n', SABADO, CAJA1, franjaCaja(1), 'per-05'));
    expect(c).toMatchObject({ permitido: true, coste: 4 });
  });
});

describe('diasDisponibles · comprobar especializado', () => {
  it('coincide con evaluar antes y después (dura y blanda)', () => {
    verificarCoherencia({ definicion, params: { dias: [0, 1, 2, 3, 4] } });
  });
  it('es rápido: 2000 comprobaciones con ~150 asignaciones', () => {
    verificarVelocidad(definicion, { dias: [0, 1, 2, 3, 4] });
  });
});
