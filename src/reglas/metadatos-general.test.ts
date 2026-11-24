import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, crearEstadoVacio } from '../datos-ejemplo/ejemplo';
import type { ReglaGeneral } from '../modelo/tipos';
import {
  METADATOS_GENERAL,
  TIPOS_GENERAL_ORDENADOS,
  crearReglaGeneral,
  describirRegla,
  erroresRegla,
} from './metadatos-general';

describe('metadatos de reglas generales', () => {
  const datos = crearEstadoEjemplo();

  it('el orden contiene los 15 tipos sin repetir y coincide con el catálogo', () => {
    expect(TIPOS_GENERAL_ORDENADOS).toHaveLength(15);
    expect(new Set(TIPOS_GENERAL_ORDENADOS).size).toBe(15);
    expect([...TIPOS_GENERAL_ORDENADOS].sort()).toEqual(Object.keys(METADATOS_GENERAL).sort());
    for (const tipo of TIPOS_GENERAL_ORDENADOS) expect(METADATOS_GENERAL[tipo].tipo).toBe(tipo);
  });

  it('las reglas del ejemplo no tienen errores y se describen', () => {
    for (const regla of datos.reglas) {
      expect(erroresRegla(regla, datos), regla.id).toEqual([]);
      expect(describirRegla(regla, datos).length).toBeGreaterThan(5);
    }
  });

  it('crea reglas válidas de cada tipo con ids distintos', () => {
    const ids = new Set<string>();
    for (const tipo of TIPOS_GENERAL_ORDENADOS) {
      const regla = crearReglaGeneral(tipo, datos);
      ids.add(regla.id);
      expect(regla.tipo).toBe(tipo);
      expect(regla.activa).toBe(true);
      expect(regla.estado).toBe('validada');
      expect(regla.nota).toBe('');
      expect(regla.nombre).toBe(METADATOS_GENERAL[tipo].nombre);
      expect(regla.peso).toBe(tipo === 'repartoEquitativo' ? 1 : 5);
      expect(regla.dura).toBe(tipo !== 'repartoEquitativo');
      expect(erroresRegla(regla, datos), tipo).toEqual([]);
    }
    expect(ids.size).toBe(15);
    expect(crearReglaGeneral('maxDiasSemana', datos, 'mi-id').id).toBe('mi-id');
  });

  it('con datos vacíos solo fallan las reglas que necesitan áreas o puestos', () => {
    const vacio = crearEstadoVacio();
    const fallan = TIPOS_GENERAL_ORDENADOS.filter((t) => erroresRegla(crearReglaGeneral(t, vacio), vacio).length > 0);
    expect(fallan.sort()).toEqual(['exclusividadDiaria', 'maxFranjasSiSoloArea']);
  });

  it('rechaza pesos fuera de 1-100 o no enteros en blandas', () => {
    for (const peso of [101, 2.5, -3]) {
      const r = { ...crearReglaGeneral('sinSolapes', datos), dura: false, peso } as ReglaGeneral;
      expect(erroresRegla(r, datos)).toEqual(['El peso debe ser un número entero entre 1 y 100']);
    }
    const ok = { ...crearReglaGeneral('sinSolapes', datos), dura: false, peso: 100 } as ReglaGeneral;
    expect(erroresRegla(ok, datos)).toEqual([]);
  });
  it('señala peso inválido en blandas y dureza no admitida', () => {
    const blanda = { ...crearReglaGeneral('sinSolapes', datos), dura: false, peso: 0 } as ReglaGeneral;
    expect(erroresRegla(blanda, datos)).toEqual(['El peso debe ser un número entero entre 1 y 100']);
    const reparto = { ...crearReglaGeneral('repartoEquitativo', datos), dura: true } as ReglaGeneral;
    expect(erroresRegla(reparto, datos)).toHaveLength(1);
  });

  it('incluye los errores de los parámetros', () => {
    const regla = { ...crearReglaGeneral('maxDiasSemana', datos), params: { max: 9 } } as ReglaGeneral;
    expect(erroresRegla(regla, datos)).toHaveLength(1);
  });

  it('cada regla tiene un campo por clave de parámetros', () => {
    for (const tipo of TIPOS_GENERAL_ORDENADOS) {
      const claves = Object.keys(METADATOS_GENERAL[tipo].paramsPorDefecto(datos)).sort();
      expect(METADATOS_GENERAL[tipo].campos.map((c) => c.clave).sort(), tipo).toEqual(claves);
    }
  });
});
