import { describe, expect, it } from 'vitest';
import { IDS_EJEMPLO, crearEstadoEjemplo } from '../datos-ejemplo/ejemplo';
import { crearGeneradorIds } from '../modelo/ids';
import type { EstadoApp, HorarioSemana, Intervalo } from '../modelo/tipos';
import { leerHorario, letrasPorDefecto } from '../importar/horario';
import {
  cambiarTurno, crearPersonasDesdeCodigos, describirTurno, enTurno, figuraEnHorario, guardarHorario, horarioDesdeLectura,
  guardarHorarios, impactoGuardarHorario, impactoGuardarHorarios, minutosDeTurno, ponerAliasDesdeNombres, quitarHorario, semanaConHorario, turnoDe,
} from './horarios';

const LUNES = '2026-11-30';
const MARTES = '2026-12-01';
const M: Intervalo = { inicio: 600, fin: 945 };

function conHorario(): EstadoApp {
  const e = crearEstadoEjemplo();
  e.horarios = {
    [LUNES]: {
      lunes: LUNES,
      actualizado: null,
      turnos: [
        { personaId: 'per-01', fecha: LUNES, tramos: [M] },
        { personaId: 'per-01', fecha: MARTES, tramos: [] },
        { personaId: 'per-02', fecha: LUNES, tramos: [{ inicio: 600, fin: 840 }, { inicio: 1020, fin: 1260 }] },
      ],
    },
  };
  return e;
}

describe('turnoDe y enTurno', () => {
  const e = conHorario();
  it('null si la semana no tiene horario', () => {
    expect(turnoDe(e, 'per-01', '2026-11-23')).toBeNull();
    expect(turnoDe(crearEstadoEjemplo(), 'per-01', LUNES)).toBeNull();
    expect(semanaConHorario(e, LUNES)).toBe(true);
    expect(semanaConHorario(e, '2026-12-06')).toBe(true);
    expect(semanaConHorario(e, '2026-12-07')).toBe(false);
  });
  it('tramos, libra y no figura', () => {
    expect(turnoDe(e, 'per-01', LUNES)).toEqual([M]);
    expect(turnoDe(e, 'per-01', MARTES)).toEqual([]);
    expect(turnoDe(e, 'per-03', LUNES)).toEqual([]);
    expect(figuraEnHorario(e, 'per-01', LUNES)).toBe(true);
    expect(figuraEnHorario(e, 'per-03', LUNES)).toBe(false);
  });
  it('enTurno: true sin horario; con horario, el intervalo debe caber entero en un tramo', () => {
    expect(enTurno(crearEstadoEjemplo(), 'per-03', LUNES, { inicio: 0, fin: 1440 })).toBe(true);
    expect(enTurno(e, 'per-01', LUNES, { inicio: 600, fin: 690 })).toBe(true);
    expect(enTurno(e, 'per-01', LUNES, M)).toBe(true);
    expect(enTurno(e, 'per-01', LUNES, { inicio: 900, fin: 960 })).toBe(false);
    expect(enTurno(e, 'per-01', MARTES, { inicio: 600, fin: 690 })).toBe(false);
    expect(enTurno(e, 'per-03', LUNES, { inicio: 600, fin: 690 })).toBe(false);
    expect(enTurno(e, 'per-02', LUNES, { inicio: 700, fin: 780 })).toBe(true);
    expect(enTurno(e, 'per-02', LUNES, { inicio: 800, fin: 900 })).toBe(false);
  });
  it('la caché no se queda obsoleta al sustituir datos.horarios', () => {
    expect(turnoDe(e, 'per-01', LUNES)).toEqual([M]);
    const n = cambiarTurno(e, LUNES, 'per-01', LUNES, [{ inicio: 900, fin: 1320 }]);
    expect(turnoDe(n, 'per-01', LUNES)).toEqual([{ inicio: 900, fin: 1320 }]);
    expect(turnoDe(e, 'per-01', LUNES)).toEqual([M]);
  });
  it('es rápido: 200 000 consultas en menos de 500 ms', () => {
    const inicio = performance.now();
    let n = 0;
    for (let i = 0; i < 200_000; i++) if (enTurno(e, 'per-01', LUNES, { inicio: 600, fin: 690 })) n += 1;
    expect(n).toBe(200_000);
    expect(performance.now() - inicio).toBeLessThan(500);
  });
});

describe('texto y horas', () => {
  it('describirTurno', () => {
    expect(describirTurno(null)).toBe('Sin horario');
    expect(describirTurno([])).toBe('Libra');
    expect(describirTurno([M])).toBe('10:00–15:45');
    expect(describirTurno([{ inicio: 600, fin: 840 }, { inicio: 1020, fin: 1260 }])).toBe('10:00–14:00 y 17:00–21:00');
  });
  it('minutosDeTurno suma todos los tramos de la persona', () => {
    const h = conHorario().horarios[LUNES]!;
    expect(minutosDeTurno(h, 'per-01')).toBe(345);
    expect(minutosDeTurno(h, 'per-02')).toBe(240 + 240);
    expect(minutosDeTurno(h, 'per-09')).toBe(0);
  });
});

describe('horarioDesdeLectura', () => {
  const e = crearEstadoEjemplo();
  const lectura = leerHorario(
    ['Código\tLun\tMar\tMié', 'EMP-01\tM\tL\tT', 'EMP-90\tM\tM\tM', 'EMP-02\tT\tT\tT', 'EMP-01\tT\tT\tT'].join('\n'),
    LUNES, e, letrasPorDefecto(e),
  );
  it('solo filas con persona, días que no venían libran y gana la última fila repetida', () => {
    const h = horarioDesdeLectura(lectura, '2026-11-29T10:00:00.000Z');
    expect(h.lunes).toBe(LUNES);
    expect(h.actualizado).toBe('2026-11-29T10:00:00.000Z');
    expect(new Set(h.turnos.map((t) => t.personaId))).toEqual(new Set(['per-01', 'per-02']));
    expect(h.turnos).toHaveLength(14);
    expect(h.turnos.find((t) => t.personaId === 'per-01' && t.fecha === LUNES)?.tramos).toEqual([{ inicio: 945, fin: 1320 }]);
    expect(h.turnos.find((t) => t.personaId === 'per-01' && t.fecha === '2026-12-04')?.tramos).toEqual([]);
    expect(horarioDesdeLectura(lectura).actualizado).toBeNull();
  });
  it('no comparte los tramos con la lectura', () => {
    const h = horarioDesdeLectura(lectura);
    h.turnos[0]!.tramos.push({ inicio: 1, fin: 2 });
    expect(lectura.filas[1]!.dias[0]!.tramos).toHaveLength(1);
  });
});

describe('guardar, quitar, cambiar turno', () => {
  const horario: HorarioSemana = { lunes: LUNES, actualizado: null, turnos: [{ personaId: 'per-01', fecha: LUNES, tramos: [M] }] };
  it('guardarHorario y quitarHorario no mutan', () => {
    const e = crearEstadoEjemplo();
    const g = guardarHorario(e, horario);
    expect(g.horarios[LUNES]).toBe(horario);
    expect(e.horarios).toEqual({});
    const q = quitarHorario(g, LUNES);
    expect(q.horarios).toEqual({});
    expect(quitarHorario(q, LUNES)).toBe(q);
  });
  it('cambiarTurno reemplaza, añade y crea la semana; ordena y descarta tramos inválidos', () => {
    const e = guardarHorario(crearEstadoEjemplo(), horario);
    const a = cambiarTurno(e, LUNES, 'per-01', LUNES, [{ inicio: 1020, fin: 1260 }, { inicio: 600, fin: 840 }, { inicio: 900, fin: 800 }]);
    expect(a.horarios[LUNES]!.turnos).toHaveLength(1);
    expect(a.horarios[LUNES]!.turnos[0]!.tramos).toEqual([{ inicio: 600, fin: 840 }, { inicio: 1020, fin: 1260 }]);
    const b = cambiarTurno(a, LUNES, 'per-02', MARTES, []);
    expect(b.horarios[LUNES]!.turnos).toHaveLength(2);
    const c = cambiarTurno(crearEstadoEjemplo(), '2026-12-07', 'per-01', '2026-12-08', [M]);
    expect(c.horarios['2026-12-07']).toEqual({ lunes: '2026-12-07', actualizado: null, turnos: [{ personaId: 'per-01', fecha: '2026-12-08', tramos: [M] }] });
  });
  it('cambiarTurno actualiza «actualizado» si se le pasa la fecha y la conserva si no', () => {
    const e = guardarHorario(crearEstadoEjemplo(), { ...horario, actualizado: '2026-11-01T10:00:00.000Z' });
    const a = cambiarTurno(e, LUNES, 'per-01', LUNES, [M], '2026-11-02T09:00:00.000Z');
    expect(a.horarios[LUNES]!.actualizado).toBe('2026-11-02T09:00:00.000Z');
    expect(cambiarTurno(e, LUNES, 'per-01', LUNES, [M]).horarios[LUNES]!.actualizado).toBe('2026-11-01T10:00:00.000Z');
    expect(cambiarTurno(e, LUNES, 'per-01', LUNES, [M], null).horarios[LUNES]!.actualizado).toBeNull();
  });
});

describe('impactoGuardarHorario', () => {
  it('semana nueva: guarda; sin asignaciones ni personas fuera', () => {
    const e = crearEstadoEjemplo();
    const h: HorarioSemana = { lunes: LUNES, actualizado: null, turnos: e.personas.map((p) => ({ personaId: p.id, fecha: LUNES, tramos: [M] })) };
    expect(impactoGuardarHorario(e, h)).toEqual({ bloqueos: [], efectos: ['Guardará el horario de la semana del 30 nov'] });
  });
  it('reemplaza, cuenta asignaciones fuera de turno y personas activas que no figuran', () => {
    const e = crearEstadoEjemplo();
    e.horarios = { [LUNES]: { lunes: LUNES, actualizado: null, turnos: [] } };
    e.cuadrantes = {
      [LUNES]: {
        lunes: LUNES,
        meta: { modo: null, semilla: null, generado: null },
        asignaciones: [
          { id: 'a1', tipo: 'puesto', fecha: MARTES, puestoId: IDS_EJEMPLO.puestos.caja1, franjaId: 'franja-caja-5', plaza: 0, personaId: 'per-07', bloqueada: false, origen: 'manual' },
          { id: 'a2', tipo: 'puesto', fecha: MARTES, puestoId: IDS_EJEMPLO.puestos.caja1, franjaId: 'franja-caja-1', plaza: 0, personaId: 'per-07', bloqueada: false, origen: 'manual' },
          { id: 'a3', tipo: 'pausa', fecha: MARTES, personaId: 'per-07', inicio: 840, fin: 900, bloqueada: false, origen: 'manual' },
        ],
      },
    };
    const h: HorarioSemana = {
      lunes: LUNES,
      actualizado: null,
      turnos: [{ personaId: 'per-07', fecha: MARTES, tramos: [M] }, ...e.personas.slice(0, 8).filter((p) => p.id !== 'per-07').map((p) => ({ personaId: p.id, fecha: MARTES, tramos: [] }))],
    };
    const imp = impactoGuardarHorario(e, h);
    expect(imp.bloqueos).toEqual([]);
    expect(imp.efectos[0]).toBe('Reemplazará el horario de la semana del 30 nov');
    expect(imp.efectos[1]).toContain('1 asignación ya hecha queda fuera de turno (EMP-07 martes)');
    expect(imp.efectos[2]).toBe('21 personas activas no figuran y no trabajarán esa semana');
  });
});

describe('crearPersonasDesdeCodigos', () => {
  it('crea las que faltan con código normalizado, sin habilitaciones, sin duplicar', () => {
    const e = crearEstadoEjemplo();
    const n = crearPersonasDesdeCodigos(e, ['emp 40', 'EMP-01', 'EMP-41', 'emp_41', 'EMP-040'], crearGeneradorIds('nueva'));
    expect(n.personas).toHaveLength(e.personas.length + 2);
    const nuevas = n.personas.slice(-2);
    expect(nuevas.map((p) => p.codigo)).toEqual(['EMP-40', 'EMP-41']);
    expect(nuevas.map((p) => p.id)).toEqual(['nueva-1', 'nueva-2']);
    expect(nuevas[0]).toMatchObject({ habilitaciones: [], activa: true, alias: null });
    expect(e.personas).toHaveLength(29);
  });
});

describe('crearPersonasDesdeCodigos · alias y habilitaciones', () => {
  it('guarda el nombre como alias y las habilitaciones elegidas; respeta códigos numéricos y alfanuméricos', () => {
    const e = crearEstadoEjemplo();
    const n = crearPersonasDesdeCodigos(e, ['10000001', 'A1234B', 'EMP 50'], crearGeneradorIds('nueva'), {
      alias: new Map([['10000001', 'PERSONA UNO'], ['a1234b', 'PERSONA DOS']]),
      habilitaciones: ['area-x'],
    });
    const nuevas = n.personas.slice(-3);
    expect(nuevas.map((p) => [p.codigo, p.alias, p.habilitaciones])).toEqual([
      ['10000001', 'PERSONA UNO', ['area-x']],
      ['A1234B', 'PERSONA DOS', ['area-x']],
      ['EMP-50', null, ['area-x']],
    ]);
  });
  it('acepta el alias como objeto', () => {
    const n = crearPersonasDesdeCodigos(crearEstadoEjemplo(), ['10000001'], undefined, { alias: { '10000001': 'PERSONA UNO' } });
    expect(n.personas.at(-1)?.alias).toBe('PERSONA UNO');
  });
});

describe('ponerAliasDesdeNombres', () => {
  it('solo rellena a quien no tiene alias', () => {
    const e = crearEstadoEjemplo();
    const [a, b] = e.personas;
    e.personas = e.personas.map((p) => (p.id === b?.id ? { ...p, alias: 'YA TIENE' } : { ...p, alias: null }));
    const n = ponerAliasDesdeNombres(e, { [a!.codigo]: 'PERSONA UNO', [b!.codigo]: 'PERSONA DOS' });
    expect(n.personas.find((p) => p.id === a?.id)?.alias).toBe('PERSONA UNO');
    expect(n.personas.find((p) => p.id === b?.id)?.alias).toBe('YA TIENE');
    expect(ponerAliasDesdeNombres(n, { [a!.codigo]: 'OTRO' })).toBe(n);
  });
});

describe('guardarHorarios e impactoGuardarHorarios', () => {
  const sem = (lunes: string): HorarioSemana => ({ lunes, turnos: [], actualizado: null });
  it('guarda varias semanas y reemplaza las existentes', () => {
    const e = conHorario();
    const n = guardarHorarios(e, [sem(LUNES), sem('2026-12-07')]);
    expect(Object.keys(n.horarios).sort()).toEqual([LUNES, '2026-12-07']);
    expect(n.horarios[LUNES]?.turnos).toEqual([]);
    expect(guardarHorarios(e, [])).toBe(e);
  });
  it('cuenta semanas nuevas, reemplazadas y personas que no figuran', () => {
    const imp = impactoGuardarHorarios(conHorario(), [sem(LUNES), sem('2026-12-07')]);
    expect(imp.bloqueos).toEqual([]);
    expect(imp.efectos[0]).toBe('Guardará 1 semana nueva de horario');
    expect(imp.efectos[1]).toBe('Reemplazará el horario de 1 semana que ya lo tenía');
    expect(imp.efectos.at(-1)).toContain('personas activas no figuran y no trabajarán en esas semanas');
  });
});
