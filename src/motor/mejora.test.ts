import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../datos-ejemplo/ejemplo';
import { CATALOGO } from '../reglas/catalogo';
import { validarSemana } from '../validacion/validador';
import type { Asignacion, EstadoApp } from '../modelo/tipos';
import { mulberry32 } from './azar';
import { construir } from './construccion';
import { mejorar, type EntradaMejora } from './mejora';
import { preparar } from './preparacion';
import { asignacionesDeUnidad, crearComprobador } from './unidades';

const LUNES = '2026-11-23';

/** Ejemplo con objetivos de horas distintos por persona: da penalizaciones blandas que mejorar. */
function datosConObjetivos(): EstadoApp {
  const datos = crearEstadoEjemplo();
  datos.personas.forEach((p, i) => {
    p.objetivoCoberturaMinSemana = 500 + (i % 5) * 100;
  });
  return datos;
}

function entrada(datos: EstadoApp, extra: Partial<EntradaMejora> = {}): EntradaMejora {
  const comprobador = crearComprobador(datos, CATALOGO);
  const prep = preparar({ datos, lunes: LUNES, actuales: [], modo: 'desdeCero', semilla: 1, maxIteraciones: 0, limiteMs: 3000 }, CATALOGO);
  const azar = mulberry32(1);
  const c = construir(datos, comprobador, prep, azar);
  return {
    datos,
    catalogos: CATALOGO,
    comprobador,
    lunes: LUNES,
    fijas: prep.fijas,
    unidades: prep.unidades,
    personas: c.personas,
    azar,
    maxIteraciones: 150,
    limiteMs: 60_000,
    reloj: () => 0,
    inicio: 0,
    ...extra,
  };
}

function asignacionesDe(e: EntradaMejora, personas: readonly (string | null)[]): Asignacion[] {
  const lista: Asignacion[] = [...e.fijas];
  e.unidades.forEach((u, i) => {
    const p = personas[i];
    if (p != null) lista.push(...asignacionesDeUnidad(u, p));
  });
  return lista;
}

describe('mejorar', () => {
  it('reduce la penalización blanda sin romper ninguna regla dura ni descubrir nada', () => {
    const datos = datosConObjetivos();
    const base = entrada(datos, { maxIteraciones: 0 });
    const antes = mejorar(base);
    const e = entrada(datos);
    const despues = mejorar(e);
    expect(despues.iteraciones).toBe(150);
    expect(despues.objetivo).toBeLessThan(antes.objetivo);
    expect(despues.personas.every((p) => p !== null)).toBe(true);
    const v = validarSemana(datos, LUNES, asignacionesDe(e, despues.personas), CATALOGO);
    expect(v.incumplimientos.filter((i) => i.dura && i.tipo !== 'comidasEscalonadas')).toEqual([]);
    const v0 = validarSemana(datos, LUNES, asignacionesDe(e, antes.personas), CATALOGO);
    expect(v.penalizacionBlanda).toBeLessThan(v0.penalizacionBlanda);
  });

  it('con presupuesto 0 devuelve la solución de partida', () => {
    const e = entrada(datosConObjetivos(), { maxIteraciones: 0 });
    const r = mejorar(e);
    expect(r.personas).toEqual([...e.personas]);
    expect(r.iteraciones).toBe(0);
    expect(r.cortadoPorTiempo).toBe(false);
  });

  it('es determinista', () => {
    const datos = datosConObjetivos();
    const a = mejorar(entrada(datos, { maxIteraciones: 60 }));
    const b = mejorar(entrada(datos, { maxIteraciones: 60 }));
    expect(a.personas).toEqual(b.personas);
    expect(a.objetivo).toBe(b.objetivo);
  });

  it('se detiene por tiempo si se agota la salvaguarda', () => {
    let ahora = 0;
    const r = mejorar(entrada(datosConObjetivos(), { maxIteraciones: 500, limiteMs: 5, reloj: () => (ahora += 1) }));
    expect(r.cortadoPorTiempo).toBe(true);
    expect(r.iteraciones).toBeLessThan(500);
  });

  it('avisa del progreso cada 200 iteraciones', () => {
    const avisos: number[] = [];
    mejorar(entrada(datosConObjetivos(), { maxIteraciones: 400, alProgresar: (it) => avisos.push(it) }));
    expect(avisos).toEqual([200, 400]);
  });

  it('pesa como un hueco un mínimo semanal duro imposible de cumplir', () => {
    const datos = crearEstadoEjemplo();
    datos.personas.find((p) => p.codigo === 'EMP-25')!.restricciones.push({
      id: 'r-min', tipo: 'minutosSemana', params: { minMin: 3000, maxMin: null }, dura: true, peso: 0, activa: true, nota: '',
    });
    const r = mejorar(entrada(datos, { maxIteraciones: 5 }));
    expect(r.objetivo).toBeGreaterThanOrEqual(1_000_000);
    expect(r.iteraciones).toBe(5);
  });

  it('no hace nada si ya no hay nada que mejorar (objetivo 0)', () => {
    const r = mejorar(entrada(crearEstadoEjemplo(), { maxIteraciones: 300 }));
    expect(r.objetivo).toBe(0);
    expect(r.iteraciones).toBe(0);
  });
});
