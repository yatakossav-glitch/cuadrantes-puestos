import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../datos-ejemplo/ejemplo';
import type { TipoRestriccion } from '../modelo/tipos';
import {
  METADATOS_RESTRICCION,
  TIPOS_RESTRICCION_ORDENADOS,
  crearRestriccion,
  describirRestriccion,
  erroresRestriccion,
} from './metadatos-persona';

const datos = crearEstadoEjemplo();
const tipos = Object.keys(METADATOS_RESTRICCION) as TipoRestriccion[];

describe('metadatos de restricciones personales', () => {
  it('el orden contiene los 10 tipos una sola vez', () => {
    expect(tipos).toHaveLength(10);
    expect([...TIPOS_RESTRICCION_ORDENADOS].sort()).toEqual([...tipos].sort());
  });

  it.each(tipos)('%s: metadatos coherentes y restricción nueva sin errores', (tipo) => {
    const m = METADATOS_RESTRICCION[tipo];
    expect(m.tipo).toBe(tipo);
    expect(m.dureza).toBe('ambas');
    expect(m.pesoPorDefecto).toBe(5);
    const r = crearRestriccion(tipo, datos, 'restr-x');
    expect(r).toMatchObject({ id: 'restr-x', tipo, activa: true, nota: '', dura: true, peso: 5 });
    expect(erroresRestriccion(r, datos)).toEqual([]);
    expect(describirRestriccion(r, datos)).not.toBe('');
    const claves = Object.keys(r.params).sort();
    expect(m.campos.map((c) => c.clave).sort()).toEqual(claves);
  });

  it('crearRestriccion genera id por defecto', () => {
    expect(crearRestriccion('maxDiasSemana', datos).id).toMatch(/^restr-/);
  });

  it('describe una restricción concreta', () => {
    const r = crearRestriccion('noDespuesDe', datos);
    expect(describirRestriccion(r, datos)).toBe('No terminar después de las 20:00');
  });

  it('las restricciones de muestra del ejemplo son válidas', () => {
    const muestras = datos.personas.flatMap((p) => p.restricciones);
    expect(muestras.length).toBeGreaterThan(0);
    for (const r of muestras) expect(erroresRestriccion(r, datos)).toEqual([]);
  });

  it('rechaza peso mayor que 100 en blandas', () => {
    const r = { ...crearRestriccion('maxDiasSemana', datos), dura: false, peso: 101 };
    expect(erroresRestriccion(r, datos)).toContain('El peso debe ser un número entero entre 1 y 100');
  });
  it('exige peso entero entre 1 y 100 si es blanda y añade errores de params', () => {
    const r = { ...crearRestriccion('maxDiasSemana', datos), dura: false, peso: 0 };
    expect(erroresRestriccion(r, datos)).toContain('El peso debe ser un número entero entre 1 y 100');
    const mala = { ...crearRestriccion('maxDiasSemana', datos), params: { max: 9 } };
    expect(erroresRestriccion(mala, datos)).not.toEqual([]);
  });
});
