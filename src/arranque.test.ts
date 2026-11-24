import { describe, expect, it } from 'vitest';
import { prepararArranque, CLAVE_ILEGIBLE } from './arranque';
import { crearEstadoEjemplo, crearEstadoVacio } from './datos-ejemplo/ejemplo';
import { CLAVE_ALMACEN } from './modelo/esquema';
import { guardarEstado, type AlmacenClaveValor } from './persistencia/almacen';

function almacenFalso(datos: Record<string, string> = {}) {
  const escrituras: string[] = [];
  const a: AlmacenClaveValor & { datos: Record<string, string>; escrituras: string[] } = {
    datos,
    escrituras,
    getItem: (k) => (k in datos ? datos[k]! : null),
    setItem: (k, v) => {
      escrituras.push(k);
      datos[k] = v;
    },
    removeItem: (k) => {
      delete datos[k];
    },
  };
  return a;
}

describe('prepararArranque', () => {
  it('almacén vacío: ejemplo, sin avisos y guarda normal', () => {
    const a = almacenFalso();
    const r = prepararArranque(a, crearEstadoEjemplo);
    expect(r.avisoArranque).toBeNull();
    expect(r.avisosCarga).toEqual([]);
    expect(r.guardar(r.inicial)).toEqual({ ok: true });
    expect(a.datos[CLAVE_ALMACEN]).toBeDefined();
    expect(r.textoIlegible()).toBeNull();
  });

  it('almacén correcto: carga el estado guardado', () => {
    const a = almacenFalso();
    guardarEstado(crearEstadoVacio(), a);
    const r = prepararArranque(a, crearEstadoEjemplo);
    expect(r.inicial.personas).toHaveLength(0);
    expect(r.avisoArranque).toBeNull();
  });

  it('error: no escribe hasta reemplazar, conserva el original una sola vez', () => {
    const a = almacenFalso({ [CLAVE_ALMACEN]: '{roto' });
    const r = prepararArranque(a, crearEstadoEjemplo);
    expect(r.avisoArranque).not.toBeNull();
    expect(r.textoIlegible()).toBe('{roto');
    const res = r.guardar(r.inicial);
    expect(res.ok).toBe(false);
    expect(a.escrituras).toEqual([]);
    expect(a.datos[CLAVE_ALMACEN]).toBe('{roto');

    r.alReemplazar();
    expect(r.guardar(r.inicial)).toEqual({ ok: true });
    expect(a.datos[CLAVE_ILEGIBLE]).toBe('{roto');
    expect(a.datos[CLAVE_ALMACEN]).not.toBe('{roto');
    r.guardar(r.inicial);
    expect(a.escrituras.filter((k) => k === CLAVE_ILEGIBLE)).toHaveLength(1);
    expect(r.textoIlegible()).toBe('{roto');
  });

  it('no pisa una copia .ilegible anterior', () => {
    const a = almacenFalso({ [CLAVE_ALMACEN]: '{roto', [CLAVE_ILEGIBLE]: 'antigua' });
    const r = prepararArranque(a, crearEstadoEjemplo);
    r.alReemplazar();
    r.guardar(r.inicial);
    expect(a.datos[CLAVE_ILEGIBLE]).toBe('antigua');
  });

  it('almacén null: ejemplo y guardar devuelve error', () => {
    const r = prepararArranque(null, crearEstadoEjemplo);
    expect(r.inicial.personas.length).toBeGreaterThan(0);
    expect(r.guardar(r.inicial).ok).toBe(false);
    expect(r.textoIlegible()).toBeNull();
  });
});
