/** Caja negra: estado de la interfaz (§6: deshacer/rehacer ≥ 20 pasos). ARQUITECTURA.md §8.3. */
import { describe, expect, it, vi } from 'vitest';
import { crearEstadoEjemplo } from '../../src/datos-ejemplo/ejemplo';
import { crearAlmacenApp, type AlmacenApp } from '../../src/ui/estado';
import type { EstadoApp } from '../../src/modelo/tipos';
import type { ResultadoGuardado } from '../../src/modelo/esquema';

const sumarSemilla = (n = 1) => (e: EstadoApp): EstadoApp => ({ ...e, config: { ...e.config, semilla: e.config.semilla + n } });
const semilla = (a: AlmacenApp) => a.obtener().config.semilla;

function crear(maxHistorial?: number) {
  const guardar = vi.fn<(e: EstadoApp) => ResultadoGuardado>(() => ({ ok: true }));
  const inicial = crearEstadoEjemplo();
  const almacen = crearAlmacenApp(inicial, maxHistorial === undefined ? { guardar } : { guardar, maxHistorial });
  return { almacen, guardar, inicial };
}

describe('estado inicial', () => {
  it('obtener devuelve el estado inicial; no se puede deshacer ni rehacer; no hay error', () => {
    const { almacen, inicial, guardar } = crear();
    expect(almacen.obtener()).toEqual(inicial);
    expect(almacen.puedeDeshacer()).toBe(false);
    expect(almacen.puedeRehacer()).toBe(false);
    expect(almacen.descripcionDeshacer()).toBeNull();
    expect(almacen.descripcionRehacer()).toBeNull();
    expect(almacen.errorGuardado()).toBeNull();
    expect(guardar).not.toHaveBeenCalled();
  });
});

describe('aplicar', () => {
  it('aplica el cambio, permite deshacer y describe la acción', () => {
    const { almacen, inicial } = crear();
    almacen.aplicar('Cambiar semilla', sumarSemilla(5));
    expect(semilla(almacen)).toBe(inicial.config.semilla + 5);
    expect(almacen.puedeDeshacer()).toBe(true);
    expect(almacen.descripcionDeshacer()).toBe('Cambiar semilla');
  });

  it('cada cambio se guarda, con el estado nuevo', () => {
    const { almacen, guardar, inicial } = crear();
    for (let i = 1; i <= 5; i++) almacen.aplicar(`paso ${i}`, sumarSemilla());
    expect(guardar).toHaveBeenCalledTimes(5);
    expect(guardar.mock.calls.map((c) => c[0].config.semilla)).toEqual([1, 2, 3, 4, 5].map((i) => inicial.config.semilla + i));
    expect(guardar.mock.calls.at(-1)![0]).toEqual(almacen.obtener());
  });

  it('no muta el estado anterior (instantáneas inmutables)', () => {
    const { almacen, inicial } = crear();
    const copia = structuredClone(inicial);
    almacen.aplicar('x', sumarSemilla(3));
    expect(inicial).toEqual(copia);
  });

  it('el cambio recibe el estado vigente', () => {
    const { almacen } = crear();
    const visto: number[] = [];
    almacen.aplicar('a', (e) => (visto.push(e.config.semilla), sumarSemilla()(e)));
    almacen.aplicar('b', (e) => (visto.push(e.config.semilla), sumarSemilla()(e)));
    expect(visto[1]).toBe(visto[0] + 1);
    expect(visto[0]).toBe(crearEstadoEjemplo().config.semilla);
    expect(semilla(almacen)).toBe(visto[0] + 2);
  });
});

describe('deshacer y rehacer', () => {
  it('al menos 20 pasos de deshacer (§6): 25 cambios se deshacen uno a uno hasta el inicial', () => {
    const { almacen, inicial } = crear();
    const valores = [semilla(almacen)];
    for (let i = 0; i < 25; i++) {
      almacen.aplicar(`paso ${i + 1}`, sumarSemilla());
      valores.push(semilla(almacen));
    }
    for (let i = 24; i >= 0; i--) {
      expect(almacen.puedeDeshacer()).toBe(true);
      almacen.deshacer();
      expect(semilla(almacen)).toBe(valores[i]);
    }
    expect(almacen.obtener()).toEqual(inicial);
    expect(almacen.puedeDeshacer()).toBe(false);
  });

  it('rehacer vuelve a recorrer los 25 pasos hasta el final', () => {
    const { almacen } = crear();
    const inicio = semilla(almacen);
    for (let i = 0; i < 25; i++) almacen.aplicar(`p${i}`, sumarSemilla());
    for (let i = 0; i < 25; i++) almacen.deshacer();
    expect(almacen.puedeRehacer()).toBe(true);
    for (let i = 1; i <= 25; i++) {
      almacen.rehacer();
      expect(semilla(almacen)).toBe(inicio + i);
    }
    expect(almacen.puedeRehacer()).toBe(false);
    expect(almacen.puedeDeshacer()).toBe(true);
  });

  it('por defecto conserva 50 pasos: con 60 cambios se pueden deshacer 50 y no más', () => {
    const { almacen } = crear();
    const inicio = semilla(almacen);
    for (let i = 0; i < 60; i++) almacen.aplicar(`p${i}`, sumarSemilla());
    let n = 0;
    while (almacen.puedeDeshacer()) {
      almacen.deshacer();
      n++;
    }
    expect(n).toBe(50);
    expect(semilla(almacen)).toBe(inicio + 10);
  });

  it('respeta maxHistorial personalizado', () => {
    const { almacen } = crear(3);
    for (let i = 0; i < 10; i++) almacen.aplicar(`p${i}`, sumarSemilla());
    let n = 0;
    while (almacen.puedeDeshacer()) {
      almacen.deshacer();
      n++;
    }
    expect(n).toBe(3);
  });

  it('una acción nueva tras deshacer borra el futuro', () => {
    const { almacen } = crear();
    const s0 = semilla(almacen);
    almacen.aplicar('a', sumarSemilla());
    almacen.aplicar('b', sumarSemilla());
    almacen.deshacer();
    expect(almacen.puedeRehacer()).toBe(true);
    almacen.aplicar('c', sumarSemilla(10));
    expect(almacen.puedeRehacer()).toBe(false);
    expect(almacen.descripcionRehacer()).toBeNull();
    expect(semilla(almacen)).toBe(s0 + 11);
    almacen.rehacer(); // no hace nada
    expect(semilla(almacen)).toBe(s0 + 11);
  });

  it('las descripciones indican qué se deshace y qué se rehace', () => {
    const { almacen } = crear();
    almacen.aplicar('Añadir persona', sumarSemilla());
    almacen.aplicar('Borrar regla', sumarSemilla());
    expect(almacen.descripcionDeshacer()).toBe('Borrar regla');
    almacen.deshacer();
    expect(almacen.descripcionRehacer()).toBe('Borrar regla');
    expect(almacen.descripcionDeshacer()).toBe('Añadir persona');
    almacen.deshacer();
    expect(almacen.descripcionDeshacer()).toBeNull();
    expect(almacen.descripcionRehacer()).toBe('Añadir persona');
  });

  it('deshacer y rehacer sin nada que hacer no lanzan, no cambian nada y no guardan', () => {
    const { almacen, guardar, inicial } = crear();
    expect(() => almacen.deshacer()).not.toThrow();
    expect(() => almacen.rehacer()).not.toThrow();
    expect(almacen.obtener()).toEqual(inicial);
    expect(guardar).not.toHaveBeenCalled();
  });

  it('deshacer y rehacer también guardan, con el estado resultante', () => {
    const { almacen, guardar } = crear();
    const s0 = semilla(almacen);
    almacen.aplicar('a', sumarSemilla());
    almacen.aplicar('b', sumarSemilla());
    guardar.mockClear();
    almacen.deshacer();
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(guardar.mock.calls[0][0].config.semilla).toBe(s0 + 1);
    almacen.rehacer();
    expect(guardar).toHaveBeenCalledTimes(2);
    expect(guardar.mock.calls[1][0].config.semilla).toBe(s0 + 2);
  });
});

describe('reemplazar (importar / cargar ejemplo)', () => {
  it('sustituye el estado, guarda y se puede deshacer', () => {
    const { almacen, guardar, inicial } = crear();
    const otro = crearEstadoEjemplo();
    otro.personas = otro.personas.slice(0, 3);
    almacen.reemplazar('Importar datos', otro);
    expect(almacen.obtener().personas).toHaveLength(3);
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(almacen.descripcionDeshacer()).toBe('Importar datos');
    almacen.deshacer();
    expect(almacen.obtener()).toEqual(inicial);
    almacen.rehacer();
    expect(almacen.obtener().personas).toHaveLength(3);
  });
});

describe('errores de guardado', () => {
  it('errorGuardado refleja el último guardado y se limpia cuando uno sale bien', () => {
    let fallar = true;
    const guardar = vi.fn((): ResultadoGuardado => (fallar ? { ok: false, error: 'Almacenamiento lleno' } : { ok: true }));
    const almacen = crearAlmacenApp(crearEstadoEjemplo(), { guardar });
    almacen.aplicar('a', sumarSemilla());
    expect(almacen.errorGuardado()).toBe('Almacenamiento lleno');
    expect(semilla(almacen)).toBe(crearEstadoEjemplo().config.semilla + 1); // el cambio se aplica igualmente
    fallar = false;
    almacen.aplicar('b', sumarSemilla());
    expect(almacen.errorGuardado()).toBeNull();
  });

  it('un fallo al guardar en deshacer también queda registrado', () => {
    let fallar = false;
    const guardar = vi.fn((): ResultadoGuardado => (fallar ? { ok: false, error: 'sin espacio' } : { ok: true }));
    const almacen = crearAlmacenApp(crearEstadoEjemplo(), { guardar });
    almacen.aplicar('a', sumarSemilla());
    fallar = true;
    almacen.deshacer();
    expect(almacen.errorGuardado()).toBe('sin espacio');
  });
});

describe('suscripción', () => {
  it('avisa tras aplicar, deshacer, rehacer y reemplazar; se puede cancelar', () => {
    const { almacen } = crear();
    const fn = vi.fn();
    const cancelar = almacen.suscribir(fn);
    almacen.aplicar('a', sumarSemilla());
    expect(fn).toHaveBeenCalledTimes(1);
    almacen.deshacer();
    expect(fn).toHaveBeenCalledTimes(2);
    almacen.rehacer();
    expect(fn).toHaveBeenCalledTimes(3);
    almacen.reemplazar('r', crearEstadoEjemplo());
    expect(fn).toHaveBeenCalledTimes(4);
    cancelar();
    almacen.aplicar('b', sumarSemilla());
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('cuando se avisa, obtener() ya devuelve el estado nuevo', () => {
    const { almacen } = crear();
    const s0 = semilla(almacen);
    let visto = -1;
    almacen.suscribir(() => (visto = semilla(almacen)));
    almacen.aplicar('a', sumarSemilla());
    expect(visto).toBe(s0 + 1);
  });

  it('varios suscriptores reciben el aviso', () => {
    const { almacen } = crear();
    const a = vi.fn();
    const b = vi.fn();
    almacen.suscribir(a);
    almacen.suscribir(b);
    almacen.aplicar('x', sumarSemilla());
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
