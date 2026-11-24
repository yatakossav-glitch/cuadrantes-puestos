/** Caja negra: edición de horarios de un puesto. ARQUITECTURA.md §9.2. */
import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../src/datos-ejemplo/ejemplo';
import type { DiaSemana, Puesto } from '../../src/modelo/tipos';
import {
  actualizarFranja, anadirFranja, borrarFranja, crearBloque, deshacerBloque, erroresHorario, horarioDe,
  nuevoIdFranja, personalizarDia, puedenFormarBloque, quitarPersonalizacion,
} from '../../src/edicion/horario';
import { congelar, IDS_EJEMPLO, puestoDe } from './ayudas';

const ej = crearEstadoEjemplo();
const caja = () => congelar(structuredClone(puestoDe(ej, IDS_EJEMPLO.puestos.caja1)));
const pedidos = () => congelar(structuredClone(puestoDe(ej, IDS_EJEMPLO.puestos.pedidos)));
const lego = () => congelar(structuredClone(puestoDe(ej, IDS_EJEMPLO.puestos.lego)));

function todosLosIds(p: Puesto): { franjas: string[]; bloques: string[] } {
  const horarios = [p.horario.general, ...Object.values(p.horario.porDia)];
  return {
    franjas: horarios.flatMap((h) => h.franjas.map((f) => f.id)),
    bloques: horarios.flatMap((h) => h.bloques.map((b) => b.id)),
  };
}

describe('horarioDe y nuevoIdFranja', () => {
  it('sin personalización devuelve el general; con ella, el del día', () => {
    const p = personalizarDia(caja(), 6);
    expect(horarioDe(caja(), 6)).toEqual(caja().horario.general);
    expect(horarioDe(p, 6)).toBe(p.horario.porDia[6]);
    expect(horarioDe(p, 0)).toBe(p.horario.general);
  });
  it('nuevoIdFranja no coincide con ninguna franja de ningún horario del puesto', () => {
    const p = personalizarDia(caja(), 6);
    expect(todosLosIds(p).franjas).not.toContain(nuevoIdFranja(p));
  });
});

describe('anadirFranja', () => {
  it('mantiene el orden por inicio y no muta', () => {
    const p0 = lego();
    const p1 = anadirFranja(p0, 'general', { inicio: 300, fin: 600 });
    const p2 = anadirFranja(p1, 'general', { inicio: 1320, fin: 1380 });
    const inicios = p2.horario.general.franjas.map((f) => f.inicio);
    expect(inicios).toEqual([...inicios].sort((a, b) => a - b));
    expect(inicios[0]).toBe(300);
    expect(inicios.at(-1)).toBe(1320);
    expect(p2.horario.general.franjas).toHaveLength(p0.horario.general.franjas.length + 2);
    expect(new Set(todosLosIds(p2).franjas).size).toBe(p2.horario.general.franjas.length);
  });
  it('en medio de otras franjas queda en su sitio', () => {
    const p = anadirFranja(pedidos(), 'general', { inicio: 1320, fin: 1380 });
    const q = anadirFranja({ ...p, horario: { ...p.horario, general: { ...p.horario.general, franjas: p.horario.general.franjas.filter((f) => f.id !== 'franja-pedidos-t') } } }, 'general', { inicio: 945, fin: 1000 });
    expect(q.horario.general.franjas.map((f) => f.inicio)).toEqual([600, 945, 1320]);
  });
  it('en un día personalizado solo toca ese día', () => {
    const p = anadirFranja(personalizarDia(pedidos(), 6), 6, { inicio: 1320, fin: 1380 });
    expect(p.horario.porDia[6]!.franjas).toHaveLength(3);
    expect(p.horario.general.franjas).toHaveLength(2);
  });
});

describe('actualizarFranja y borrarFranja', () => {
  it('actualizarFranja cambia el intervalo conservando el id', () => {
    const p = actualizarFranja(pedidos(), 'general', 'franja-pedidos-m', { inicio: 540, fin: 945 });
    const f = p.horario.general.franjas.find((x) => x.id === 'franja-pedidos-m')!;
    expect(f).toMatchObject({ inicio: 540, fin: 945 });
  });
  it('borrar una franja de un bloque de dos hace desaparecer el bloque', () => {
    const p = borrarFranja(caja(), 'general', 'franja-caja-1');
    const h = p.horario.general;
    expect(h.franjas.map((f) => f.id)).not.toContain('franja-caja-1');
    expect(h.bloques.map((b) => b.id)).not.toContain('bloque-caja-m1');
    expect(h.bloques).toHaveLength(3);
    for (const b of h.bloques) expect(b.franjaIds).toHaveLength(2);
    expect(h.franjas.map((f) => f.id)).toContain('franja-caja-2');
  });
  it('borrar una franja sin bloque solo la quita', () => {
    const p = borrarFranja(lego(), 'general', 'franja-lego-1');
    expect(p.horario.general.franjas).toHaveLength(10);
  });
  it('un bloque de tres franjas sobrevive a quitar una', () => {
    let p = pedidos();
    p = anadirFranja(p, 'general', { inicio: 1320, fin: 1380 });
    const ids = p.horario.general.franjas.map((f) => f.id);
    p = crearBloque(p, 'general', ids);
    expect(p.horario.general.bloques[0]!.franjaIds).toHaveLength(3);
    p = borrarFranja(p, 'general', ids[2]!);
    expect(p.horario.general.bloques).toHaveLength(1);
    expect(p.horario.general.bloques[0]!.franjaIds).toEqual(ids.slice(0, 2));
  });
});

describe('bloques', () => {
  it('crearBloque con franjas consecutivas pone el nombre HH:MM–HH:MM', () => {
    const p = crearBloque(pedidos(), 'general', ['franja-pedidos-m', 'franja-pedidos-t']);
    expect(p.horario.general.bloques).toHaveLength(1);
    expect(p.horario.general.bloques[0]!.nombre).toBe('10:00–22:00');
  });
  it('crearBloque con nombre explícito lo respeta', () => {
    const p = crearBloque(pedidos(), 'general', ['franja-pedidos-m', 'franja-pedidos-t'], 'Todo el día');
    expect(p.horario.general.bloques[0]!.nombre).toBe('Todo el día');
  });
  it('crearBloque con franjas no consecutivas lanza un error en español', () => {
    expect(() => crearBloque(lego(), 'general', ['franja-lego-1', 'franja-lego-3'])).toThrow(/\S+/);
  });
  it('deshacerBloque quita el bloque y deja las franjas', () => {
    const p = deshacerBloque(caja(), 'general', 'bloque-caja-m1');
    expect(p.horario.general.bloques).toHaveLength(3);
    expect(p.horario.general.franjas).toHaveLength(8);
  });
  it('puedenFormarBloque: null si es posible', () => {
    expect(puedenFormarBloque(pedidos().horario.general, ['franja-pedidos-m', 'franja-pedidos-t'])).toBeNull();
    expect(puedenFormarBloque(lego().horario.general, ['franja-lego-2', 'franja-lego-3', 'franja-lego-4'])).toBeNull();
  });
  it('puedenFormarBloque explica por qué no', () => {
    const h = lego().horario.general;
    const motivos = [
      puedenFormarBloque(h, ['franja-lego-1', 'franja-lego-3']), // salto
      puedenFormarBloque(h, ['franja-lego-1']), // una sola
      puedenFormarBloque(h, []), // ninguna
      puedenFormarBloque(h, ['franja-lego-1', 'franja-inexistente']),
      puedenFormarBloque(caja().horario.general, ['franja-caja-1', 'franja-caja-2']), // ya en un bloque
    ];
    for (const m of motivos) {
      expect(typeof m).toBe('string');
      expect((m as string).length).toBeGreaterThan(5);
    }
  });
});

describe('personalizarDia y quitarPersonalizacion', () => {
  it('copia el horario con ids de franja y bloque nuevos y únicos en todo el puesto', () => {
    const orig = caja();
    const p = personalizarDia(orig, 6);
    const dia = p.horario.porDia[6]!;
    const general = p.horario.general;
    expect(dia.franjas.map((f) => [f.inicio, f.fin])).toEqual(general.franjas.map((f) => [f.inicio, f.fin]));
    expect(dia.bloques).toHaveLength(4);
    const ids = todosLosIds(p);
    expect(new Set(ids.franjas).size).toBe(ids.franjas.length);
    expect(new Set(ids.bloques).size).toBe(ids.bloques.length);
    // los bloques del día apuntan a franjas del día
    const idsDia = new Set(dia.franjas.map((f) => f.id));
    for (const b of dia.bloques) for (const f of b.franjaIds) expect(idsDia.has(f)).toBe(true);
    expect(dia.bloques.map((b) => b.nombre)).toEqual(general.bloques.map((b) => b.nombre));
    expect(p.horario.general).toEqual(orig.horario.general);
  });
  it('varias personalizaciones siguen sin repetir ids', () => {
    let p: Puesto = caja();
    for (const d of [5, 6, 3] as DiaSemana[]) p = personalizarDia(p, d);
    const ids = todosLosIds(p);
    expect(ids.franjas).toHaveLength(32);
    expect(new Set(ids.franjas).size).toBe(32);
    expect(new Set(ids.bloques).size).toBe(16);
  });
  it('quitarPersonalizacion vuelve al general', () => {
    const p = quitarPersonalizacion(personalizarDia(caja(), 6), 6);
    expect(p.horario.porDia[6]).toBeUndefined();
    expect(horarioDe(p, 6)).toEqual(p.horario.general);
  });
});

describe('erroresHorario', () => {
  const f = (id: string, inicio: number, fin: number) => ({ id, inicio, fin });
  it('horarios del ejemplo (franjas que se tocan) sin errores', () => {
    for (const p of ej.puestos) expect(erroresHorario(p.horario.general, 'Todos los días')).toEqual([]);
  });
  it('sin franjas da error', () => {
    expect(erroresHorario({ franjas: [], bloques: [] }, 'Domingo').length).toBeGreaterThan(0);
  });
  it('fin ≤ inicio o fuera de 00:00–24:00', () => {
    for (const fr of [f('a', 600, 600), f('a', 700, 600), f('a', 600, 1441), f('a', -5, 100)]) {
      expect(erroresHorario({ franjas: [fr], bloques: [] }, 'x').length).toBeGreaterThan(0);
    }
    expect(erroresHorario({ franjas: [f('a', 0, 1440)], bloques: [] }, 'x')).toEqual([]);
  });
  it('solapes sí, tocarse no', () => {
    expect(erroresHorario({ franjas: [f('a', 600, 700), f('b', 699, 800)], bloques: [] }, 'x').length).toBeGreaterThan(0);
    expect(erroresHorario({ franjas: [f('a', 600, 700), f('b', 700, 800)], bloques: [] }, 'x')).toEqual([]);
  });
  it('la etiqueta aparece en el mensaje', () => {
    const e = erroresHorario({ franjas: [], bloques: [] }, 'Domingo');
    expect(e.join(' ')).toContain('Domingo');
  });
  it('bloques no consecutivos, con una franja o con franja en dos bloques', () => {
    const franjas = [f('a', 600, 700), f('b', 700, 800), f('c', 800, 900)];
    const mal = (franjaIds: string[][]) =>
      erroresHorario({ franjas, bloques: franjaIds.map((ids, i) => ({ id: `b${i}`, nombre: 'b', franjaIds: ids })) }, 'x');
    expect(mal([['a', 'c']]).length).toBeGreaterThan(0);
    expect(mal([['a']]).length).toBeGreaterThan(0);
    expect(mal([['a', 'b'], ['b', 'c']]).length).toBeGreaterThan(0);
    expect(mal([['a', 'b']])).toEqual([]);
  });
});
