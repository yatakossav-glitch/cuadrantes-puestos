import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../datos-ejemplo/ejemplo';
import type { Puesto } from '../modelo/tipos';
import {
  actualizarFranja, anadirFranja, borrarFranja, crearBloque, deshacerBloque, erroresHorario, horarioDe,
  nuevoIdFranja, personalizarDia, puedenFormarBloque, quitarPersonalizacion,
} from './horario';

const caja = (): Puesto => crearEstadoEjemplo().puestos.find((p) => p.id === IDS_EJEMPLO.puestos.caja1)!;
const pedidos = (): Puesto => crearEstadoEjemplo().puestos.find((p) => p.id === IDS_EJEMPLO.puestos.pedidos)!;

describe('horario', () => {
  it('horarioDe usa el general salvo personalización', () => {
    const p = personalizarDia(caja(), 6);
    expect(horarioDe(p, 6)).toBe(p.horario.porDia[6]);
    expect(horarioDe(p, 0)).toBe(p.horario.general);
  });
  it('nuevoIdFranja es único en todos los días', () => {
    let p = pedidos();
    expect(nuevoIdFranja(p)).toBe('f-1');
    p = personalizarDia(p, 6);
    const ids = [...p.horario.general.franjas, ...p.horario.porDia[6]!.franjas].map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(nuevoIdFranja(p));
  });
  it('añade ordenando por inicio y sin mutar', () => {
    const p = pedidos();
    const copia = structuredClone(p);
    const n = anadirFranja(p, 'general', { inicio: 300, fin: 600 });
    expect(n.horario.general.franjas.map((f) => f.inicio)).toEqual([300, 600, 945]);
    expect(p).toEqual(copia);
  });
  it('actualiza una franja y reordena', () => {
    const n = actualizarFranja(pedidos(), 'general', 'franja-pedidos-t', { inicio: 100, fin: 200 });
    expect(n.horario.general.franjas.map((f) => f.id)).toEqual(['franja-pedidos-t', 'franja-pedidos-m']);
  });
  it('borrar una franja de un bloque de 2 deshace el bloque', () => {
    const p = caja();
    const n = borrarFranja(p, 'general', 'franja-caja-1');
    expect(n.horario.general.franjas).toHaveLength(7);
    expect(n.horario.general.bloques).toHaveLength(3);
    expect(p.horario.general.bloques).toHaveLength(4);
  });
  it('crea y deshace bloques', () => {
    const n = crearBloque(pedidos(), 'general', ['franja-pedidos-t', 'franja-pedidos-m']);
    expect(n.horario.general.bloques[0]).toMatchObject({ nombre: '10:00–22:00', franjaIds: ['franja-pedidos-m', 'franja-pedidos-t'] });
    const m = deshacerBloque(n, 'general', n.horario.general.bloques[0]!.id);
    expect(m.horario.general.bloques).toEqual([]);
  });
  it('crearBloque con nombre propio y error si no son consecutivas', () => {
    const p = caja();
    const lego = crearEstadoEjemplo().puestos.find((x) => x.id === IDS_EJEMPLO.puestos.lego)!;
    expect(() => crearBloque(lego, 'general', ['franja-lego-1', 'franja-lego-3'])).toThrow(/consecutivas/);
    const q = borrarFranja(p, 'general', 'franja-caja-8');
    expect(crearBloque(deshacerBloque(q, 'general', 'bloque-caja-m1'), 'general', ['franja-caja-2', 'franja-caja-1'], 'Mañana')
      .horario.general.bloques.at(-1)!.nombre).toBe('Mañana');
  });
  it('puedenFormarBloque explica el motivo', () => {
    const h = caja().horario.general;
    expect(puedenFormarBloque(h, ['franja-caja-1'])).toMatch(/al menos 2/);
    expect(puedenFormarBloque(h, ['franja-caja-1', 'franja-caja-2'])).toMatch(/ya está en el bloque «10:00–13:00»/);
    expect(puedenFormarBloque(h, ['franja-caja-1', 'zzz'])).toMatch(/ya no existe/);
    expect(puedenFormarBloque(pedidos().horario.general, ['franja-pedidos-m', 'franja-pedidos-t'])).toBeNull();
  });
  it('personalizarDia copia con ids nuevos y bloques coherentes; quitarPersonalizacion la revierte', () => {
    const p = caja();
    const copia = structuredClone(p);
    const n = personalizarDia(p, 6);
    const h = n.horario.porDia[6]!;
    expect(h.franjas).toHaveLength(8);
    expect(h.franjas.map((f) => f.id)).not.toContain('franja-caja-1');
    expect(h.franjas.map(({ inicio, fin }) => [inicio, fin])).toEqual(p.horario.general.franjas.map(({ inicio, fin }) => [inicio, fin]));
    expect(erroresHorario(h, 'x')).toEqual([]);
    expect(p).toEqual(copia);
    expect(quitarPersonalizacion(n, 6).horario.porDia).toEqual({});
  });
  it('con un día sin personalizar lanza error', () => {
    const msg = 'Ese día usa el horario de todos los días: personalízalo antes.';
    expect(() => anadirFranja(caja(), 3, { inicio: 0, fin: 60 })).toThrow(msg);
    expect(() => actualizarFranja(caja(), 3, 'x', { inicio: 0, fin: 60 })).toThrow(msg);
    expect(() => borrarFranja(caja(), 3, 'x')).toThrow(msg);
    expect(() => crearBloque(caja(), 3, ['a', 'b'])).toThrow(msg);
    expect(() => deshacerBloque(caja(), 3, 'x')).toThrow(msg);
    expect(anadirFranja(personalizarDia(caja(), 3), 3, { inicio: 0, fin: 60 }).horario.porDia[3]!.franjas).toHaveLength(9);
  });
  it('erroresHorario detecta los problemas', () => {
    const f = (id: string, inicio: number, fin: number) => ({ id, inicio, fin });
    expect(erroresHorario({ franjas: [], bloques: [] }, 'Caja 1')).toEqual(['Caja 1: no tiene ninguna franja']);
    expect(erroresHorario({ franjas: [f('a', 600, 600)], bloques: [] }, 'X')[0]).toMatch(/10:00–10:00/);
    expect(erroresHorario({ franjas: [f('a', 600, 700), f('b', 650, 800)], bloques: [] }, 'X')[0]).toMatch(/se solapan/);
    const fs = [f('a', 600, 700), f('b', 700, 800), f('c', 900, 1000)];
    expect(erroresHorario({ franjas: fs, bloques: [{ id: 'b1', nombre: 'N', franjaIds: ['a', 'c'] }] }, 'X')[0]).toMatch(/no son consecutivas/);
    expect(erroresHorario({ franjas: fs, bloques: [{ id: 'b1', nombre: 'N', franjaIds: ['a'] }] }, 'X')[0]).toMatch(/al menos 2/);
    expect(erroresHorario({ franjas: fs, bloques: [
      { id: 'b1', nombre: 'N', franjaIds: ['a', 'b'] }, { id: 'b2', nombre: 'M', franjaIds: ['b', 'c'] },
    ] }, 'X').join('|')).toMatch(/dos bloques/);
    expect(erroresHorario({ franjas: [f('a', 600, 1500)], bloques: [] }, 'X')).toHaveLength(1);
    expect(erroresHorario(caja().horario.general, 'Caja 1')).toEqual([]);
  });
});
