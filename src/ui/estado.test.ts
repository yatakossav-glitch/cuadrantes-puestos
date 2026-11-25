import { describe, expect, it, vi } from 'vitest';
import type { EstadoApp } from '../modelo/tipos';
import type { ResultadoGuardado } from '../modelo/esquema';
import { crearAlmacenApp } from './estado';

function estadoMinimo(semilla = 1): EstadoApp {
  return {
    config: { corteMananaTarde: 945, exportacionArea: 'diasEnColumnas', semilla, limiteMotorMs: 3000 },
    areas: [],
    puestos: [],
    personas: [],
    reglas: [],
    rotacion: { longitudCiclo: 1, lunesReferencia: '2026-11-23', etiquetas: ['A'] },
    semanasTipo: [],
    incidencias: [],
    horarios: {},
    cuadrantes: {},
  };
}

const poner = (n: number) => (e: EstadoApp): EstadoApp => ({ ...e, config: { ...e.config, semilla: n } });
const semilla = (a: { obtener(): EstadoApp }) => a.obtener().config.semilla;

function crear(max?: number) {
  const guardar = vi.fn<(e: EstadoApp) => ResultadoGuardado>(() => ({ ok: true }));
  const almacen = crearAlmacenApp(estadoMinimo(), { guardar, maxHistorial: max });
  return { almacen, guardar };
}

describe('almacén de la interfaz', () => {
  it('aplica, deshace y rehace', () => {
    const { almacen } = crear();
    almacen.aplicar('Cambiar a 2', poner(2));
    almacen.aplicar('Cambiar a 3', poner(3));
    expect(semilla(almacen)).toBe(3);
    expect(almacen.descripcionDeshacer()).toBe('Cambiar a 3');
    almacen.deshacer();
    expect(semilla(almacen)).toBe(2);
    expect(almacen.descripcionRehacer()).toBe('Cambiar a 3');
    almacen.rehacer();
    expect(semilla(almacen)).toBe(3);
    almacen.deshacer();
    almacen.deshacer();
    expect(semilla(almacen)).toBe(1);
    expect(almacen.puedeDeshacer()).toBe(false);
    expect(almacen.descripcionDeshacer()).toBeNull();
    almacen.deshacer(); // no hace nada
    expect(semilla(almacen)).toBe(1);
  });

  it('una acción nueva borra el rehacer', () => {
    const { almacen } = crear();
    almacen.aplicar('a', poner(2));
    almacen.deshacer();
    expect(almacen.puedeRehacer()).toBe(true);
    almacen.aplicar('b', poner(9));
    expect(almacen.puedeRehacer()).toBe(false);
    expect(almacen.descripcionRehacer()).toBeNull();
    almacen.rehacer();
    expect(semilla(almacen)).toBe(9);
  });

  it('limita el historial a 50 pasos por defecto', () => {
    const { almacen } = crear();
    for (let i = 2; i <= 61; i++) almacen.aplicar(`n${i}`, poner(i));
    let pasos = 0;
    while (almacen.puedeDeshacer()) {
      almacen.deshacer();
      pasos++;
    }
    expect(pasos).toBe(50);
    expect(semilla(almacen)).toBe(11);
  });

  it('respeta un límite personalizado', () => {
    const { almacen } = crear(3);
    for (let i = 2; i <= 10; i++) almacen.aplicar('x', poner(i));
    let pasos = 0;
    while (almacen.puedeDeshacer()) {
      almacen.deshacer();
      pasos++;
    }
    expect(pasos).toBe(3);
  });

  it('guarda en cada cambio, deshacer y rehacer', () => {
    const { almacen, guardar } = crear();
    almacen.aplicar('a', poner(2));
    expect(guardar).toHaveBeenCalledTimes(1);
    almacen.deshacer();
    expect(guardar).toHaveBeenCalledTimes(2);
    expect(guardar).toHaveBeenLastCalledWith(expect.objectContaining({ config: expect.objectContaining({ semilla: 1 }) }));
    almacen.rehacer();
    expect(guardar).toHaveBeenCalledTimes(3);
    almacen.reemplazar('r', estadoMinimo(7));
    expect(guardar).toHaveBeenCalledTimes(4);
  });

  it('no guarda ni apila si el cambio devuelve el mismo estado', () => {
    const { almacen, guardar } = crear();
    almacen.aplicar('nada', (e) => e);
    expect(guardar).not.toHaveBeenCalled();
    expect(almacen.puedeDeshacer()).toBe(false);
  });

  it('expone el error de guardado y lo limpia cuando vuelve a ir bien', () => {
    let fallar = true;
    const almacen = crearAlmacenApp(estadoMinimo(), {
      guardar: () => (fallar ? { ok: false, error: 'Cuota llena' } : { ok: true }),
    });
    expect(almacen.errorGuardado()).toBeNull();
    almacen.aplicar('a', poner(2));
    expect(almacen.errorGuardado()).toBe('Cuota llena');
    fallar = false;
    almacen.aplicar('b', poner(3));
    expect(almacen.errorGuardado()).toBeNull();
  });

  it('trata como error un guardado que lanza', () => {
    const almacen = crearAlmacenApp(estadoMinimo(), {
      guardar: () => {
        throw new Error('boom');
      },
    });
    almacen.aplicar('a', poner(2));
    expect(almacen.errorGuardado()).toBe('boom');
    expect(semilla(almacen)).toBe(2);
  });

  it('notifica a los suscriptores y permite darse de baja', () => {
    const { almacen } = crear();
    const fn = vi.fn();
    const baja = almacen.suscribir(fn);
    almacen.aplicar('a', poner(2));
    almacen.deshacer();
    almacen.rehacer();
    almacen.reemplazar('r', estadoMinimo(5));
    expect(fn).toHaveBeenCalledTimes(4);
    baja();
    almacen.aplicar('b', poner(6));
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('reemplazar se puede deshacer y rehacer', () => {
    const { almacen } = crear();
    almacen.aplicar('a', poner(2));
    almacen.reemplazar('Importar datos', estadoMinimo(40));
    expect(semilla(almacen)).toBe(40);
    expect(almacen.descripcionDeshacer()).toBe('Importar datos');
    almacen.deshacer();
    expect(semilla(almacen)).toBe(2);
    almacen.rehacer();
    expect(semilla(almacen)).toBe(40);
  });
});
