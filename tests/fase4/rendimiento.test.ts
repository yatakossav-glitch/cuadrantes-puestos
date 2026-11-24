/** Rendimiento del motor: la semana del ejemplo con 800 iteraciones en menos de 3 s (spec §4). */
import { describe, expect, it } from 'vitest';
import { motor } from '../../src/motor/motor';
import { crearEstadoEjemplo, duras, peticion } from './ayudas';

const AVISO_MS = 3000;
const FALLO_MS = 6000; // margen para CI

describe('rendimiento', () => {
  it('genera la semana del ejemplo con 800 iteraciones en menos de 3 s (falla solo si supera 6 s)', () => {
    const datos = crearEstadoEjemplo();
    const t0 = performance.now();
    const r = motor.generar(peticion(datos, 'desdeCero', { maxIteraciones: 800, limiteMs: 60000 }));
    const ms = performance.now() - t0;

    if (ms > AVISO_MS) {
      console.warn(`AVISO de rendimiento: ${Math.round(ms)} ms (objetivo < ${AVISO_MS} ms)`);
    }
    expect(ms, `tardó ${Math.round(ms)} ms`).toBeLessThan(FALLO_MS);
    expect(r.sinCubrir).toHaveLength(0);
    expect(duras(datos, r.asignaciones)).toHaveLength(0);
    expect(r.iteraciones).toBeLessThanOrEqual(800);
  });

  it('con el límite de tiempo por defecto (3 s) devuelve un resultado válido', () => {
    const datos = crearEstadoEjemplo();
    const r = motor.generar(peticion(datos, 'desdeCero', { limiteMs: datos.config.limiteMotorMs }));
    expect(r.asignaciones.length).toBeGreaterThan(0);
    expect(r.ms).toBeLessThan(FALLO_MS);
  });

  it('informa del progreso con fracciones entre 0 y 1', () => {
    const datos = crearEstadoEjemplo();
    const fracciones: number[] = [];
    motor.generar(peticion(datos, 'desdeCero', { maxIteraciones: 400 }), (p) => fracciones.push(p.fraccion));
    expect(fracciones.length).toBeGreaterThan(0);
    expect(fracciones.every((f) => f >= 0 && f <= 1)).toBe(true);
  });
});
