import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { definicion, metadatos } from './noAsignarA';
import { AREA_CAJA, CAJA1, CAJA2, PEDIDOS, JUEVES, contexto, franjaCaja, persona, puesto, restriccion, verificarCoherencia, verificarVelocidad } from '../../../tests/ayudas/reglasPersona';

const datos = crearEstadoEjemplo();

describe('noAsignarA', () => {
  it('describe con el nombre del área', () => {
    const area = datos.areas[0];
    expect(area).toBeDefined();
    if (!area) return;
    expect(metadatos.describir({ ambito: { areaIds: [area.id], puestoIds: [] } }, datos)).toBe(`No asignar a ${area.nombre}`);
  });
  it('por defecto usa una área activa existente y es válido', () => {
    const params = metadatos.paramsPorDefecto(datos);
    expect(params.ambito.areaIds).toHaveLength(1);
    expect(metadatos.validarParams(params, datos)).toEqual([]);
  });
  it('rechaza ámbito vacío y ids inexistentes', () => {
    expect(metadatos.validarParams({ ambito: { areaIds: [], puestoIds: [] } }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ ambito: { areaIds: ['no-existe'], puestoIds: [] } }, datos)).not.toEqual([]);
    expect(metadatos.validarParams({ ambito: { areaIds: [], puestoIds: ['no-existe'] } }, datos)).not.toEqual([]);
  });
});

describe('noAsignarA · evaluar y comprobar', () => {
  const rArea = restriccion('noAsignarA', { ambito: { areaIds: [AREA_CAJA], puestoIds: [] } });
  it('cumple fuera del ámbito', () => {
    const ctx = contexto([puesto('a1', JUEVES, PEDIDOS, 'franja-pedidos-m', 'per-05')]);
    expect(definicion.evaluar(rArea, persona(ctx, 'per-05'), ctx)).toEqual([]);
  });
  it('incumple por asignación, con marca noDisponible y hueco', () => {
    const ctx = contexto([puesto('a1', JUEVES, CAJA1, franjaCaja(3), 'per-05'), puesto('a2', JUEVES, CAJA2, franjaCaja(3), 'per-05')]);
    const res = definicion.evaluar(rArea, persona(ctx, 'per-05'), ctx);
    expect(res.map((i) => i.mensaje)).toEqual([
      'EMP-05 no debe cubrir Caja 1 el jueves 26/11 13:00–14:30',
      'EMP-05 no debe cubrir Caja 2 el jueves 26/11 13:00–14:30',
    ]);
    expect(res[0]).toMatchObject({ marca: 'noDisponible', asignacionIds: ['a1'], huecos: [`${JUEVES}|${CAJA1}|${franjaCaja(3)}|0`] });
  });
  it('un puesto concreto del ámbito; el otro puesto del área no cuenta', () => {
    const rPuesto = restriccion('noAsignarA', { ambito: { areaIds: [], puestoIds: [CAJA2] } });
    const ctx = contexto([puesto('a1', JUEVES, CAJA1, franjaCaja(3), 'per-05'), puesto('a2', JUEVES, CAJA2, franjaCaja(3), 'per-05')]);
    expect(definicion.evaluar(rPuesto, persona(ctx, 'per-05'), ctx)).toHaveLength(1);
  });
  it('nombra el área en puestos únicos', () => {
    const r = restriccion('noAsignarA', { ambito: { areaIds: [], puestoIds: [PEDIDOS] } });
    const ctx = contexto([puesto('a1', JUEVES, PEDIDOS, 'franja-pedidos-m', 'per-05')]);
    expect(definicion.evaluar(r, persona(ctx, 'per-05'), ctx)[0]?.mensaje).toBe('EMP-05 no debe cubrir Pedidos Web · Puesto único el jueves 26/11 10:00–15:45');
  });
  it('no evalúa a otra persona; comprobar coherente', () => {
    const ctx = contexto([puesto('a1', JUEVES, CAJA1, franjaCaja(3), 'per-06')]);
    expect(definicion.evaluar(rArea, persona(ctx, 'per-05'), ctx)).toEqual([]);
    const p = persona(ctx, 'per-05');
    expect(definicion.comprobar(rArea, p, ctx, puesto('n', JUEVES, CAJA2, franjaCaja(1), 'per-05')).permitido).toBe(false);
    expect(definicion.comprobar(rArea, p, ctx, puesto('n', JUEVES, PEDIDOS, 'franja-pedidos-m', 'per-05'))).toEqual({ permitido: true, coste: 0, motivos: [] });
    expect(definicion.comprobar(rArea, p, ctx, puesto('n', JUEVES, CAJA2, franjaCaja(1), 'per-06'))).toEqual({ permitido: true, coste: 0, motivos: [] });
  });
});

describe('noAsignarA · comprobar especializado', () => {
  it('coincide con evaluar antes y después (dura y blanda)', () => {
    verificarCoherencia({ definicion, params: { ambito: { areaIds: [], puestoIds: [CAJA1] } } });
  });
  it('es rápido: 2000 comprobaciones con ~150 asignaciones', () => {
    verificarVelocidad(definicion, { ambito: { areaIds: [], puestoIds: [CAJA1] } });
  });
});
