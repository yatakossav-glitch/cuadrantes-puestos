import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../datos-ejemplo/ejemplo';
import { crearGeneradorIds } from '../modelo/ids';
import type { AsignacionPuesto, EstadoApp } from '../modelo/tipos';
import {
  anadirPausa,
  asignar,
  bloquear,
  claveHueco,
  franjasAfectadas,
  leerClaveHueco,
  motivoFueraDeHorario,
  motivoNoDisponible,
  quitar,
  quitarPausa,
  semanaDelCiclo,
  vaciarSemana,
} from './cuadrante';

const LUNES = '2026-11-23';
const JUEVES = '2026-11-26';
const { caja1, lego } = IDS_EJEMPLO.puestos;
const hueco = { fecha: JUEVES, puestoId: caja1, franjaId: 'franja-caja-1', plaza: 0 };

function puestos(e: EstadoApp): AsignacionPuesto[] {
  return (e.cuadrantes[LUNES]?.asignaciones ?? []).filter((a): a is AsignacionPuesto => a.tipo === 'puesto');
}

describe('asignar', () => {
  it('crea la semana y asigna todo el bloque, con origen manual y sin mutar la entrada', () => {
    const e = crearEstadoEjemplo();
    const copia = JSON.stringify(e);
    const r = asignar(e, LUNES, hueco, 'per-07', { todoElBloque: true }, crearGeneradorIds('x'));
    expect(JSON.stringify(e)).toBe(copia);
    expect(puestos(r).map((a) => a.franjaId)).toEqual(['franja-caja-1', 'franja-caja-2']);
    expect(puestos(r).every((a) => a.personaId === 'per-07' && a.origen === 'manual' && !a.bloqueada)).toBe(true);
    expect(r.cuadrantes[LUNES]?.meta).toEqual({ modo: null, semilla: null, generado: null });
  });

  it('sin todoElBloque solo asigna la franja', () => {
    const r = asignar(crearEstadoEjemplo(), LUNES, hueco, 'per-07', { todoElBloque: false });
    expect(puestos(r)).toHaveLength(1);
  });

  it('en un puesto sin bloques asigna solo la franja', () => {
    const r = asignar(crearEstadoEjemplo(), LUNES, { ...hueco, puestoId: lego, franjaId: 'franja-lego-1' }, 'per-07', { todoElBloque: true });
    expect(puestos(r)).toHaveLength(1);
  });

  it('reemplaza lo que hubiera y no toca las asignaciones con candado', () => {
    let e = asignar(crearEstadoEjemplo(), LUNES, hueco, 'per-01', { todoElBloque: true }, crearGeneradorIds('a'));
    e = bloquear(e, LUNES, ['a-2'], true);
    const r = asignar(e, LUNES, hueco, 'per-02', { todoElBloque: true }, crearGeneradorIds('b'));
    const por = Object.fromEntries(puestos(r).map((a) => [a.franjaId, a.personaId]));
    expect(por).toEqual({ 'franja-caja-1': 'per-02', 'franja-caja-2': 'per-01' });
    // Todo bloqueado: no cambia nada.
    const todo = bloquear(e, LUNES, ['a-1'], true);
    expect(asignar(todo, LUNES, hueco, 'per-02', { todoElBloque: true })).toBe(todo);
  });

  it('devuelve el mismo estado si el puesto o la franja no existen', () => {
    const e = crearEstadoEjemplo();
    expect(asignar(e, LUNES, { ...hueco, franjaId: 'nada' }, 'per-01', { todoElBloque: true })).toBe(e);
    expect(asignar(e, LUNES, { ...hueco, puestoId: 'nada' }, 'per-01', { todoElBloque: true })).toBe(e);
  });
});

describe('quitar, bloquear y pausas', () => {
  const base = asignar(crearEstadoEjemplo(), LUNES, hueco, 'per-01', { todoElBloque: true }, crearGeneradorIds('a'));

  it('quita por id y es idempotente', () => {
    const r = quitar(base, LUNES, ['a-1']);
    expect(puestos(r).map((a) => a.id)).toEqual(['a-2']);
    expect(quitar(r, LUNES, ['a-1'])).toBe(r);
    expect(puestos(base)).toHaveLength(2);
  });

  it('bloquea y desbloquea', () => {
    const b = bloquear(base, LUNES, ['a-1'], true);
    expect(puestos(b).map((a) => a.bloqueada)).toEqual([true, false]);
    expect(bloquear(b, LUNES, ['a-1'], true)).toBe(b);
    expect(puestos(bloquear(b, LUNES, ['a-1'], false)).every((a) => !a.bloqueada)).toBe(true);
  });

  it('añade y quita pausas; rechaza tramos no válidos', () => {
    const p = anadirPausa(base, LUNES, { fecha: JUEVES, personaId: 'per-01', inicio: 840, fin: 900 }, () => 'p1');
    const pausa = p.cuadrantes[LUNES]?.asignaciones.find((a) => a.id === 'p1');
    expect(pausa).toMatchObject({ tipo: 'pausa', inicio: 840, fin: 900, origen: 'manual', bloqueada: false });
    expect(anadirPausa(base, LUNES, { fecha: JUEVES, personaId: 'per-01', inicio: 900, fin: 840 })).toBe(base);
    expect(quitarPausa(p, LUNES, 'a-1')).toBe(p);
    expect(quitarPausa(p, LUNES, 'p1').cuadrantes[LUNES]?.asignaciones).toHaveLength(2);
  });

  it('quitarPausa respeta el candado', () => {
    const p = anadirPausa(base, LUNES, { fecha: JUEVES, personaId: 'per-01', inicio: 840, fin: 900 }, () => 'p1');
    const b = bloquear(p, LUNES, ['p1'], true);
    expect(quitarPausa(b, LUNES, 'p1')).toBe(b);
  });

  it('vacía la semana, respetando candados si se pide', () => {
    const b = bloquear(base, LUNES, ['a-1'], true);
    expect(vaciarSemana(b, LUNES, { respetarCandados: false }).cuadrantes[LUNES]?.asignaciones).toEqual([]);
    expect(vaciarSemana(b, LUNES, { respetarCandados: true }).cuadrantes[LUNES]?.asignaciones.map((a) => a.id)).toEqual(['a-1']);
    const e = crearEstadoEjemplo();
    expect(vaciarSemana(e, LUNES, { respetarCandados: false })).toBe(e);
  });
});

describe('semanaDelCiclo', () => {
  const rotacion = { longitudCiclo: 2, lunesReferencia: LUNES, etiquetas: ['A', 'B'] };
  it('alterna A y B, también hacia atrás', () => {
    expect(semanaDelCiclo(rotacion, LUNES)).toEqual({ indice: 0, etiqueta: 'A' });
    expect(semanaDelCiclo(rotacion, '2026-11-30')).toEqual({ indice: 1, etiqueta: 'B' });
    expect(semanaDelCiclo(rotacion, '2026-11-16')).toEqual({ indice: 1, etiqueta: 'B' });
    expect(semanaDelCiclo(rotacion, '2026-12-07').indice).toBe(0);
  });
});

describe('ayudas de edición', () => {
  it('claves e intervalos', () => {
    expect(leerClaveHueco(claveHueco(hueco))).toEqual(hueco);
    expect(leerClaveHueco('mal')).toBeNull();
    const puesto = crearEstadoEjemplo().puestos.find((p) => p.id === caja1)!;
    expect(franjasAfectadas(puesto, JUEVES, 'franja-caja-2', true).map((f) => f.id)).toEqual(['franja-caja-1', 'franja-caja-2']);
    expect(franjasAfectadas(puesto, JUEVES, 'franja-caja-2', false)).toHaveLength(1);
  });

  it('motivos de no disponibilidad', () => {
    const e0 = crearEstadoEjemplo();
    const puesto = e0.puestos.find((p) => p.id === caja1)!;
    const franjas = franjasAfectadas(puesto, JUEVES, 'franja-caja-1', true);
    const persona = (id: string) => e0.personas.find((p) => p.id === id)!;
    const motivo = (e: EstadoApp, id: string) => motivoNoDisponible(e, LUNES, e.personas.find((p) => p.id === id)!, puesto, JUEVES, franjas);
    expect(motivo(e0, 'per-01')).toBeNull();
    expect(persona('per-30')).toBeUndefined();
    const sinHab = { ...e0, personas: e0.personas.map((p) => (p.id === 'per-01' ? { ...p, habilitaciones: [] } : p)) };
    expect(motivo(sinHab, 'per-01')).toBe('sin habilitación');
    const baja = { ...e0, personas: e0.personas.map((p) => (p.id === 'per-01' ? { ...p, baja: '2026-11-25' } : p)) };
    expect(motivo(baja, 'per-01')).toBe('fuera de plantilla');
    const aus = {
      ...e0,
      incidencias: [{ id: 'i', tipo: 'ausencia' as const, personaId: 'per-01', desde: JUEVES, hasta: JUEVES, tramo: null, nota: '' }],
    };
    expect(motivo(aus, 'per-01')).toBe('ausente');
    const libra = {
      ...e0,
      personas: e0.personas.map((p) => (p.id === 'per-01' ? { ...p, patron: [{ indiceCiclo: 0, equipo: null, diasLibres: [3 as const] }] } : p)),
    };
    expect(motivo(libra, 'per-01')).toBe('libra ese día (rotación)');
    expect(motivoNoDisponible(libra, '2026-11-30', libra.personas.find((p) => p.id === 'per-01')!, puesto, '2026-12-03', franjas)).toBeNull();
    const ocupada = asignar(e0, LUNES, { ...hueco, puestoId: lego, franjaId: 'franja-lego-1' }, 'per-01', { todoElBloque: false });
    expect(motivo(ocupada, 'per-01')).toBe('ya ocupada a esa hora');
    const pausa = anadirPausa(e0, LUNES, { fecha: JUEVES, personaId: 'per-01', inicio: 600, fin: 660 });
    expect(motivo(pausa, 'per-01')).toBe('ya ocupada a esa hora');
  });
});

describe('motivoFueraDeHorario', () => {
  const asignacion = (campos: Partial<AsignacionPuesto> = {}): AsignacionPuesto => ({
    id: 'a', tipo: 'puesto', fecha: JUEVES, puestoId: caja1, franjaId: 'franja-caja-1', plaza: 0, personaId: 'per-07',
    bloqueada: false, origen: 'manual', ...campos,
  });
  it('devuelve null si encaja y un motivo si no', () => {
    const e = crearEstadoEjemplo();
    expect(motivoFueraDeHorario(e, asignacion())).toBeNull();
    expect(motivoFueraDeHorario(e, asignacion({ franjaId: 'nada' }))).toBe('la franja ya no existe');
    expect(motivoFueraDeHorario(e, asignacion({ plaza: 9 }))).toBe('la plaza ya no existe');
    expect(motivoFueraDeHorario(e, asignacion({ puestoId: 'nada' }))).toBe('el puesto ya no existe');
    const inactivo = { ...e, puestos: e.puestos.map((p) => (p.id === caja1 ? { ...p, activo: false } : p)) };
    expect(motivoFueraDeHorario(inactivo, asignacion())).toBe('el puesto está inactivo');
    const temporada = (desde: string | null, hasta: string | null) => ({
      ...e,
      puestos: e.puestos.map((p) => (p.id === caja1 ? { ...p, vigenteDesde: desde, vigenteHasta: hasta } : p)),
    });
    expect(motivoFueraDeHorario(temporada('2026-11-27', null), asignacion())).toBe('el puesto aún no existe ese día');
    expect(motivoFueraDeHorario(temporada(null, '2026-11-25'), asignacion())).toBe('el puesto ya no existe ese día');
    expect(motivoFueraDeHorario(temporada(JUEVES, JUEVES), asignacion())).toBeNull();
    const cerrado: EstadoApp = {
      ...e,
      incidencias: [...e.incidencias, { id: 'i', tipo: 'puestoCerrado', puestoId: caja1, desde: JUEVES, hasta: JUEVES, nota: '' }],
    };
    expect(motivoFueraDeHorario(cerrado, asignacion())).toBe('el puesto está cerrado ese día');
  });
});
