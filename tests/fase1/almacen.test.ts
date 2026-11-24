/** Caja negra: almacén local (§2: localStorage con try/catch y aviso si falla). ARQUITECTURA.md §8.2. */
import { describe, expect, it, vi } from 'vitest';
import { crearEstadoEjemplo, crearEstadoVacio } from '../../src/datos-ejemplo/ejemplo';
import { cargarEstado, guardarEstado, obtenerAlmacenNavegador, type AlmacenClaveValor } from '../../src/persistencia/almacen';
import { CLAVE_ALMACEN, VERSION_ESQUEMA } from '../../src/modelo/esquema';

function almacenMemoria(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  const a: AlmacenClaveValor & { datos: Map<string, string> } = {
    datos,
    getItem: (k) => (datos.has(k) ? datos.get(k)! : null),
    setItem: (k, v) => void datos.set(k, v),
    removeItem: (k) => void datos.delete(k),
  };
  return a;
}
function cuotaLlena(): AlmacenClaveValor {
  return {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    },
    removeItem: () => {},
  };
}

describe('guardarEstado', () => {
  it('guarda en la clave del esquema un documento con versión, fecha y estado', () => {
    const a = almacenMemoria();
    const estado = crearEstadoEjemplo();
    const ahora = new Date('2026-11-24T09:30:00.000Z');
    expect(guardarEstado(estado, a, ahora)).toEqual({ ok: true });
    const doc = JSON.parse(a.datos.get(CLAVE_ALMACEN)!);
    expect(doc.version).toBe(VERSION_ESQUEMA);
    expect(doc.guardado).toBe(ahora.toISOString());
    expect(doc.estado).toEqual(estado);
  });

  it('sobrescribe la escritura anterior', () => {
    const a = almacenMemoria();
    guardarEstado(crearEstadoEjemplo(), a);
    guardarEstado(crearEstadoVacio(), a);
    const r = cargarEstado(a);
    expect(r.tipo).toBe('ok');
    if (r.tipo === 'ok') expect(r.estado).toEqual(crearEstadoVacio());
  });

  it('fallo de cuota: devuelve ok:false con mensaje en español y NO lanza', () => {
    let r: ReturnType<typeof guardarEstado> | undefined;
    expect(() => {
      r = guardarEstado(crearEstadoEjemplo(), cuotaLlena());
    }).not.toThrow();
    expect(r!.ok).toBe(false);
    if (!r!.ok) expect(r!.error.length).toBeGreaterThan(5);
  });

  it('cualquier otro error de escritura (acceso bloqueado) tampoco lanza', () => {
    const bloqueado: AlmacenClaveValor = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('Access denied', 'SecurityError');
      },
      removeItem: () => {},
    };
    const r = guardarEstado(crearEstadoEjemplo(), bloqueado);
    expect(r.ok).toBe(false);
    const r2 = guardarEstado(crearEstadoEjemplo(), {
      ...bloqueado,
      setItem: () => {
        throw 'cadena suelta, no un Error';
      },
    });
    expect(r2.ok).toBe(false);
  });

  it('almacén no disponible (null): ok:false con aviso, sin lanzar', () => {
    let r: ReturnType<typeof guardarEstado> | undefined;
    expect(() => {
      r = guardarEstado(crearEstadoEjemplo(), null);
    }).not.toThrow();
    expect(r!.ok).toBe(false);
    if (!r!.ok) expect(r!.error.length).toBeGreaterThan(5);
  });

  it('un estado con referencias circulares no rompe: ok:false o ok:true, nunca excepción', () => {
    const e: any = crearEstadoEjemplo();
    e.yo = e;
    expect(() => guardarEstado(e, almacenMemoria())).not.toThrow();
  });
});

describe('cargarEstado', () => {
  it('almacén sin datos → vacio', () => {
    expect(cargarEstado(almacenMemoria())).toEqual({ tipo: 'vacio' });
  });

  it('guardar y cargar devuelve el mismo estado, versión actual y sin avisos', () => {
    const a = almacenMemoria();
    const estado = crearEstadoEjemplo();
    guardarEstado(estado, a);
    const r = cargarEstado(a);
    expect(r.tipo).toBe('ok');
    if (r.tipo !== 'ok') return;
    expect(r.estado).toEqual(estado);
    expect(r.versionOrigen).toBe(VERSION_ESQUEMA);
    expect(r.avisos).toEqual([]);
  });

  it('almacén no disponible (null): no lanza y no devuelve un estado', () => {
    let r: ReturnType<typeof cargarEstado> | undefined;
    expect(() => {
      r = cargarEstado(null);
    }).not.toThrow();
    expect(['vacio', 'error']).toContain(r!.tipo);
  });

  it('getItem que lanza: no lanza y devuelve error o vacío', () => {
    const roto: AlmacenClaveValor = {
      getItem: () => {
        throw new DOMException('Access denied', 'SecurityError');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    let r: ReturnType<typeof cargarEstado> | undefined;
    expect(() => {
      r = cargarEstado(roto);
    }).not.toThrow();
    expect(r!.tipo).not.toBe('ok');
  });

  it.each([
    ['texto que no es JSON', 'esto {no es json'],
    ['JSON truncado', '{"version":1,"guardado":"2026-11-24T00:00:00.000Z","estado":{"config":'],
    ['JSON que no es un objeto', '42'],
    ['null', 'null'],
    ['lista', '[1,2,3]'],
    ['documento sin estado', JSON.stringify({ version: 1, guardado: 'x' })],
    ['estado con colecciones que no son listas', JSON.stringify({ version: 1, guardado: 'x', estado: { personas: 'no' } })],
    ['versión no numérica', JSON.stringify({ version: 'uno', guardado: 'x', estado: crearEstadoEjemplo() })],
  ])('datos corruptos (%s): error en español, sin lanzar', (_n, texto) => {
    const a = almacenMemoria({ [CLAVE_ALMACEN]: texto });
    let r: ReturnType<typeof cargarEstado> | undefined;
    expect(() => {
      r = cargarEstado(a);
    }).not.toThrow();
    expect(r!.tipo).toBe('error');
    if (r!.tipo === 'error') expect(r!.error.length).toBeGreaterThan(5);
  });

  it('versión futura: cargar devuelve error y no modifica lo guardado', () => {
    const texto = JSON.stringify({ version: VERSION_ESQUEMA + 1, guardado: 'x', estado: crearEstadoEjemplo() });
    const a = almacenMemoria({ [CLAVE_ALMACEN]: texto });
    const r = cargarEstado(a);
    expect(r.tipo).toBe('error');
    expect(a.datos.get(CLAVE_ALMACEN)).toBe(texto); // cargar no modifica lo guardado
  });

  it('versión 0 o negativa: error', () => {
    for (const version of [0, -3]) {
      const a = almacenMemoria({ [CLAVE_ALMACEN]: JSON.stringify({ version, guardado: 'x', estado: crearEstadoEjemplo() }) });
      expect(cargarEstado(a).tipo).toBe('error');
    }
  });

  it('con códigos casi duplicados carga igualmente, con avisos', () => {
    const e = crearEstadoEjemplo();
    e.personas[1].codigo = ' emp-1';
    const a = almacenMemoria();
    guardarEstado(e, a);
    const r = cargarEstado(a);
    expect(r.tipo).toBe('ok');
    if (r.tipo === 'ok') expect(r.avisos.length).toBeGreaterThanOrEqual(1);
  });
});

describe('obtenerAlmacenNavegador', () => {
  it('sin localStorage (Node) devuelve null sin lanzar', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    try {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => undefined });
      expect(obtenerAlmacenNavegador()).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete (globalThis as any).localStorage;
    }
  });

  it('si acceder a localStorage lanza (cookies bloqueadas), devuelve null', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get: () => {
          throw new DOMException('denied', 'SecurityError');
        },
      });
      expect(() => obtenerAlmacenNavegador()).not.toThrow();
      expect(obtenerAlmacenNavegador()).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete (globalThis as any).localStorage;
    }
  });

  it('con un localStorage funcional devuelve algo con getItem/setItem/removeItem', () => {
    const fake = almacenMemoria();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    try {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: fake });
      const a = obtenerAlmacenNavegador();
      expect(a).not.toBeNull();
      expect(guardarEstado(crearEstadoEjemplo(), a)).toEqual({ ok: true });
      expect(cargarEstado(a).tipo).toBe('ok');
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete (globalThis as any).localStorage;
    }
    vi.restoreAllMocks();
  });
});
