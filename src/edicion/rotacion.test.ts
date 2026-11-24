import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../datos-ejemplo/ejemplo';
import { crearGeneradorIds } from '../modelo/ids';
import type { Asignacion, EstadoApp, Rotacion } from '../modelo/tipos';
import {
  MAX_CICLO, borrarSemanaTipo, cambiarPasoPatron, cambiarRotacion, erroresRotacion, etiquetasPorDefecto,
  guardarSemanaTipo, impactoCambiarRotacion, impactoGuardarSemanaTipo, pasoPatron, quitarPatron, renombrarSemanaTipo,
} from './rotacion';

const LUNES = '2026-11-23';
const { caja1 } = IDS_EJEMPLO.puestos;
const rot = (c: Partial<Rotacion> = {}): Rotacion => ({ longitudCiclo: 2, lunesReferencia: LUNES, etiquetas: ['A', 'B'], ...c });
const puesto = (id: string, fecha: string, puestoId: string = caja1): Asignacion => ({
  id, tipo: 'puesto', fecha, puestoId, franjaId: 'franja-caja-1', plaza: 0, personaId: 'per-07', bloqueada: false, origen: 'manual',
});
function conSemana(asig: Asignacion[]): EstadoApp {
  const e = crearEstadoEjemplo();
  return { ...e, cuadrantes: { [LUNES]: { lunes: LUNES, asignaciones: asig, meta: { modo: null, semilla: null, generado: null } } } };
}

describe('etiquetas y errores', () => {
  it('etiquetas por defecto', () => {
    expect(etiquetasPorDefecto(3)).toEqual(['A', 'B', 'C']);
    expect(etiquetasPorDefecto(0)).toEqual([]);
    expect(MAX_CICLO).toBe(12);
  });
  it('acepta una rotación válida y detecta los fallos', () => {
    expect(erroresRotacion(rot())).toEqual([]);
    expect(erroresRotacion(rot({ longitudCiclo: 0, etiquetas: [] }))).toHaveLength(1);
    expect(erroresRotacion(rot({ longitudCiclo: 13, etiquetas: etiquetasPorDefecto(13) }))[0]).toContain('entre 1 y 12');
    expect(erroresRotacion(rot({ longitudCiclo: 1.5 })).length).toBeGreaterThan(0);
    expect(erroresRotacion(rot({ lunesReferencia: '2026-11-24' }))).toEqual(['La fecha de referencia debe ser un lunes']);
    expect(erroresRotacion(rot({ lunesReferencia: 'x' }))).toEqual(['La fecha de referencia no es válida']);
    expect(erroresRotacion(rot({ etiquetas: ['A'] }))).toEqual(['Debe haber una etiqueta por cada semana del ciclo']);
    expect(erroresRotacion(rot({ etiquetas: ['A', ' '] }))).toEqual(['Las etiquetas no pueden estar vacías']);
    expect(erroresRotacion(rot({ etiquetas: ['A', 'A'] }))).toEqual(['La etiqueta «A» está repetida']);
    expect(erroresRotacion(rot({ etiquetas: ['A', 'x'.repeat(13)] }))[0]).toContain('supera');
  });
});

describe('cambiar la rotación', () => {
  const base = (): EstadoApp => {
    const e = guardarSemanaTipo(conSemana([puesto('a', '2026-11-26')]), LUNES, 1, 'Semana B', crearGeneradorIds('g'));
    return cambiarPasoPatron(e, 'per-07', { indiceCiclo: 1, equipo: 'T', diasLibres: [5] });
  };
  it('avisa de lo que se borra y de la semana actual que cambia de letra', () => {
    const e = base();
    const nueva = rot({ longitudCiclo: 1, etiquetas: ['A'], lunesReferencia: '2026-11-30' });
    const imp = impactoCambiarRotacion(e, nueva, '2026-12-02');
    expect(imp.bloqueos).toEqual([]);
    expect(imp.efectos).toEqual([
      'Se borrará la semana tipo B (1 asignación)',
      'Se borrará 1 paso de patrón de las semanas que desaparecen',
      'La semana del 30 nov pasará a ser la A (antes B)',
    ]);
  });
  it('sin cambios no hay efectos y una rotación inválida bloquea', () => {
    const e = crearEstadoEjemplo();
    expect(impactoCambiarRotacion(e, e.rotacion, '2026-11-25')).toEqual({ bloqueos: [], efectos: [] });
    expect(impactoCambiarRotacion(e, rot({ etiquetas: [] }), '2026-11-25').bloqueos).not.toEqual([]);
  });
  it('aplica y borra huérfanos', () => {
    const r = cambiarRotacion(base(), rot({ longitudCiclo: 1, etiquetas: ['A '] }));
    expect(r.rotacion.etiquetas).toEqual(['A']);
    expect(r.semanasTipo).toEqual([]);
    expect(r.personas.find((p) => p.id === 'per-07')?.patron).toEqual([]);
  });
});

describe('semanas tipo', () => {
  it('bloquea sin asignaciones válidas o con un índice fuera del ciclo', () => {
    expect(impactoGuardarSemanaTipo(conSemana([]), LUNES, 0).bloqueos).toHaveLength(1);
    expect(impactoGuardarSemanaTipo(conSemana([puesto('x', '2026-11-26', 'no-existe')]), LUNES, 0).bloqueos).toHaveLength(1);
    expect(impactoGuardarSemanaTipo(conSemana([puesto('x', '2026-11-26')]), LUNES, 5).bloqueos).toEqual(['Esa semana no existe en el ciclo']);
  });
  it('crea, reemplaza conservando el id, renombra y borra', () => {
    const e0 = conSemana([puesto('a', '2026-11-26'), puesto('b', '2026-11-27'), puesto('c', '2026-11-27', 'no-existe')]);
    const imp = impactoGuardarSemanaTipo(e0, LUNES, 0);
    expect(imp.efectos).toEqual(['Creará la semana tipo A con 2 asignaciones', 'Se omite 1 asignación fuera del horario']);
    const e1 = guardarSemanaTipo(e0, LUNES, 0, ' Normal ', crearGeneradorIds('g'));
    expect(e1.semanasTipo).toHaveLength(1);
    expect(e1.semanasTipo[0]).toMatchObject({ indiceCiclo: 0, nombre: 'Normal' });
    expect(e1.semanasTipo[0]?.asignaciones).toHaveLength(2);
    const id = e1.semanasTipo[0]!.id;
    expect(impactoGuardarSemanaTipo(e1, LUNES, 0).efectos[0]).toBe('Reemplazará la semana tipo A (2 asignaciones) por otra de 2 asignaciones');
    const e2 = guardarSemanaTipo(e1, LUNES, 0, 'Otra');
    expect(e2.semanasTipo).toHaveLength(1);
    expect(e2.semanasTipo[0]?.id).toBe(id);
    const e3 = guardarSemanaTipo(e2, LUNES, 1, 'B');
    expect(e3.semanasTipo.map((s) => s.indiceCiclo)).toEqual([0, 1]);
    expect(renombrarSemanaTipo(e3, id, ' Nueva ').semanasTipo[0]?.nombre).toBe('Nueva');
    expect(borrarSemanaTipo(e3, id).semanasTipo.map((s) => s.indiceCiclo)).toEqual([1]);
  });
});

describe('patrones', () => {
  it('ignora pasos fuera del ciclo', () => {
    const e = crearEstadoEjemplo();
    const largo = e.rotacion.longitudCiclo;
    expect(cambiarPasoPatron(e, 'per-07', { indiceCiclo: largo, equipo: 'T', diasLibres: [] })).toBe(e);
    expect(cambiarPasoPatron(e, 'per-07', { indiceCiclo: -1, equipo: 'T', diasLibres: [] })).toBe(e);
  });
  it('lee, añade, ordena, quita pasos vacíos y borra el patrón', () => {
    const e0 = crearEstadoEjemplo();
    const persona = (e: EstadoApp) => e.personas.find((p) => p.id === 'per-07')!;
    expect(pasoPatron(persona(e0), 1)).toEqual({ indiceCiclo: 1, equipo: null, diasLibres: [] });
    const e1 = cambiarPasoPatron(cambiarPasoPatron(e0, 'per-07', { indiceCiclo: 1, equipo: null, diasLibres: [6, 5, 5] }), 'per-07', { indiceCiclo: 0, equipo: 'T', diasLibres: [] });
    expect(persona(e1).patron).toEqual([
      { indiceCiclo: 0, equipo: 'T', diasLibres: [] },
      { indiceCiclo: 1, equipo: null, diasLibres: [5, 6] },
    ]);
    expect(pasoPatron(persona(e1), 1).diasLibres).toEqual([5, 6]);
    const e2 = cambiarPasoPatron(e1, 'per-07', { indiceCiclo: 1, equipo: null, diasLibres: [] });
    expect(persona(e2).patron.map((p) => p.indiceCiclo)).toEqual([0]);
    expect(persona(quitarPatron(e1, 'per-07')).patron).toEqual([]);
  });
});
