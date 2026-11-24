import { describe, expect, it } from 'vitest';
import { semanaDelCiclo } from '../../src/rotacion/ciclo';
import { calendarioCiclo } from '../../src/rotacion/semanaTipo';
import { cambiarRotacion, erroresRotacion, etiquetasPorDefecto } from '../../src/edicion/rotacion';
import type { Rotacion, SemanaTipo } from '../../src/modelo/tipos';
import { datosMini, personaMini, P } from './ayudas';

const rot2: Rotacion = { longitudCiclo: 2, lunesReferencia: '2026-11-23', etiquetas: ['A', 'B'] };
const rot3: Rotacion = { longitudCiclo: 3, lunesReferencia: '2026-11-23', etiquetas: ['A', 'B', 'C'] };

describe('semanaDelCiclo', () => {
  it('ciclo de 2 semanas alterna A/B', () => {
    expect(semanaDelCiclo(rot2, '2026-11-23')).toEqual({ indice: 0, etiqueta: 'A' });
    expect(semanaDelCiclo(rot2, '2026-11-30')).toEqual({ indice: 1, etiqueta: 'B' });
    expect(semanaDelCiclo(rot2, '2026-12-07')).toEqual({ indice: 0, etiqueta: 'A' });
  });
  it('cualquier día de la semana cae en la misma semana (lunes y domingo)', () => {
    expect(semanaDelCiclo(rot2, '2026-11-29').indice).toBe(0);
    expect(semanaDelCiclo(rot2, '2026-11-30').indice).toBe(1);
    expect(semanaDelCiclo(rot2, '2026-12-06').indice).toBe(1);
  });
  it('ciclo de 3 semanas', () => {
    expect(semanaDelCiclo(rot3, '2026-11-30').etiqueta).toBe('B');
    expect(semanaDelCiclo(rot3, '2026-12-07').etiqueta).toBe('C');
    expect(semanaDelCiclo(rot3, '2026-12-14')).toEqual({ indice: 0, etiqueta: 'A' });
  });
  it('fechas anteriores a la referencia (módulo positivo)', () => {
    expect(semanaDelCiclo(rot2, '2026-11-16')).toEqual({ indice: 1, etiqueta: 'B' });
    expect(semanaDelCiclo(rot2, '2026-11-09')).toEqual({ indice: 0, etiqueta: 'A' });
    expect(semanaDelCiclo(rot3, '2026-11-16')).toEqual({ indice: 2, etiqueta: 'C' });
    expect(semanaDelCiclo(rot3, '2026-11-09')).toEqual({ indice: 1, etiqueta: 'B' });
    expect(semanaDelCiclo(rot3, '2025-11-24').indice).toBeGreaterThanOrEqual(0);
  });
  it('usa las etiquetas personalizadas', () => {
    const r: Rotacion = { longitudCiclo: 2, lunesReferencia: '2026-11-23', etiquetas: ['Par', 'Impar'] };
    expect(semanaDelCiclo(r, '2026-11-30').etiqueta).toBe('Impar');
  });
  it('ciclo de 1 semana: siempre índice 0', () => {
    const r: Rotacion = { longitudCiclo: 1, lunesReferencia: '2026-11-23', etiquetas: ['A'] };
    expect(semanaDelCiclo(r, '2027-03-01').indice).toBe(0);
    expect(semanaDelCiclo(r, '2026-01-05').indice).toBe(0);
  });
});

describe('calendarioCiclo', () => {
  it('devuelve N semanas consecutivas con índice y etiqueta', () => {
    const c = calendarioCiclo(rot3, '2026-11-23', 4);
    expect(c).toEqual([
      { lunes: '2026-11-23', indice: 0, etiqueta: 'A' },
      { lunes: '2026-11-30', indice: 1, etiqueta: 'B' },
      { lunes: '2026-12-07', indice: 2, etiqueta: 'C' },
      { lunes: '2026-12-14', indice: 0, etiqueta: 'A' },
    ]);
  });
  it('puede empezar antes de la referencia', () => {
    const c = calendarioCiclo(rot2, '2026-11-16', 3);
    expect(c.map((x) => x.etiqueta)).toEqual(['B', 'A', 'B']);
    expect(c.map((x) => x.lunes)).toEqual(['2026-11-16', '2026-11-23', '2026-11-30']);
  });
  it('0 semanas da lista vacía', () => {
    expect(calendarioCiclo(rot2, '2026-11-23', 0)).toEqual([]);
  });
});

describe('erroresRotacion', () => {
  it('rotación válida: sin errores', () => {
    expect(erroresRotacion(rot2)).toEqual([]);
    expect(erroresRotacion({ ...rot3 })).toEqual([]);
  });
  it('lunes de referencia que no es lunes', () => {
    expect(erroresRotacion({ ...rot2, lunesReferencia: '2026-11-24' }).length).toBeGreaterThan(0);
  });
  it('fecha de referencia inválida', () => {
    expect(erroresRotacion({ ...rot2, lunesReferencia: '2026-13-45' }).length).toBeGreaterThan(0);
  });
  it('etiquetas repetidas o vacías', () => {
    expect(erroresRotacion({ ...rot2, etiquetas: ['A', 'A'] }).length).toBeGreaterThan(0);
    expect(erroresRotacion({ ...rot2, etiquetas: ['A', ''] }).length).toBeGreaterThan(0);
  });
  it('etiqueta de más de 12 caracteres', () => {
    expect(erroresRotacion({ ...rot2, etiquetas: ['A', 'X'.repeat(13)] }).length).toBeGreaterThan(0);
    expect(erroresRotacion({ ...rot2, etiquetas: ['A', 'X'.repeat(12)] })).toEqual([]);
  });
  it('número de etiquetas distinto de la longitud', () => {
    expect(erroresRotacion({ ...rot2, etiquetas: ['A'] }).length).toBeGreaterThan(0);
  });
  it('longitud 0, 13 o no entera inválidas; 1 y 12 válidas', () => {
    expect(erroresRotacion({ ...rot2, longitudCiclo: 0, etiquetas: [] }).length).toBeGreaterThan(0);
    const t13 = etiquetasPorDefecto(13);
    expect(erroresRotacion({ ...rot2, longitudCiclo: 13, etiquetas: t13 }).length).toBeGreaterThan(0);
    expect(erroresRotacion({ ...rot2, longitudCiclo: 1.5, etiquetas: ['A', 'B'] }).length).toBeGreaterThan(0);
    expect(erroresRotacion({ ...rot2, longitudCiclo: 1, etiquetas: ['A'] })).toEqual([]);
    expect(erroresRotacion({ ...rot2, longitudCiclo: 12, etiquetas: etiquetasPorDefecto(12) })).toEqual([]);
  });
});

describe('etiquetasPorDefecto', () => {
  it('A, B, C…', () => {
    expect(etiquetasPorDefecto(3)).toEqual(['A', 'B', 'C']);
    expect(etiquetasPorDefecto(1)).toEqual(['A']);
  });
});

describe('cambiarRotacion', () => {
  function estado3() {
    const base = datosMini({
      personas: [
        personaMini(1, { patron: [
          { indiceCiclo: 0, equipo: 'M', diasLibres: [] },
          { indiceCiclo: 1, equipo: null, diasLibres: [5] },
          { indiceCiclo: 2, equipo: 'T', diasLibres: [6] },
        ] }),
        personaMini(2),
      ],
    });
    const tipos: SemanaTipo[] = [0, 1, 2].map((i) => ({ id: `st-${i}`, indiceCiclo: i, nombre: `Tipo ${i}`, asignaciones: [] }));
    return { ...base, rotacion: rot3, semanasTipo: tipos };
  }
  it('acortar el ciclo borra semanas tipo y pasos de patrón huérfanos', () => {
    const r = cambiarRotacion(estado3(), rot2);
    expect(r.rotacion).toEqual(rot2);
    expect(r.semanasTipo.map((s) => s.indiceCiclo)).toEqual([0, 1]);
    const p1 = r.personas.find((p) => p.id === P(1))!;
    expect(p1.patron.map((x) => x.indiceCiclo)).toEqual([0, 1]);
  });
  it('mantener la longitud no borra nada', () => {
    const r = cambiarRotacion(estado3(), { ...rot3, etiquetas: ['X', 'Y', 'Z'] });
    expect(r.semanasTipo).toHaveLength(3);
    expect(r.personas.find((p) => p.id === P(1))!.patron).toHaveLength(3);
  });
  it('alargar el ciclo no borra nada', () => {
    const r = cambiarRotacion(estado3(), { longitudCiclo: 4, lunesReferencia: '2026-11-23', etiquetas: ['A', 'B', 'C', 'D'] });
    expect(r.semanasTipo).toHaveLength(3);
  });
  it('no muta el estado original', () => {
    const e = estado3();
    cambiarRotacion(e, rot2);
    expect(e.semanasTipo).toHaveLength(3);
    expect(e.rotacion).toEqual(rot3);
  });
});
