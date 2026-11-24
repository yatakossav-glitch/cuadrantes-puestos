import { describe, expect, it } from 'vitest';
import { validarSemana } from '../validacion/validador';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../datos-ejemplo/ejemplo';
import { CATALOGO } from '../reglas/catalogo';
import type { Asignacion, AsignacionPuesto, AsignacionTipo, EstadoApp } from '../modelo/tipos';
import type { PeticionMotor } from './contrato';
import { asignacionesDeSemanaTipo, preparar } from './preparacion';

const LUNES = '2026-11-23';
const JUEVES = '2026-11-26';
const P = IDS_EJEMPLO.puestos;

function puesto(id: string, fecha: string, puestoId: string, franjaId: string, personaId: string, bloqueada = false): AsignacionPuesto {
  return { id, tipo: 'puesto', fecha, puestoId, franjaId, plaza: 0, personaId, bloqueada, origen: 'manual' };
}

function peticion(datos: EstadoApp, modo: PeticionMotor['modo'], actuales: Asignacion[], lunes = LUNES): PeticionMotor {
  return { datos, lunes, actuales, modo, semilla: 1, maxIteraciones: 0, limiteMs: 3000 };
}

function tipo(id: string, dia: 0 | 1 | 2 | 3 | 4 | 5 | 6, puestoId: string, franjaId: string, personaId: string): AsignacionTipo {
  return { id, tipo: 'puesto', dia, puestoId, franjaId, plaza: 0, personaId, bloqueada: false };
}

describe('preparar · desdeCero', () => {
  it('solo conserva lo bloqueado y deja el resto como unidades libres', () => {
    const datos = crearEstadoEjemplo();
    const bloqueada = puesto('a1', JUEVES, P.pedidos, 'franja-pedidos-m', 'per-01', true);
    const suelta = puesto('a2', JUEVES, P.pedidos, 'franja-pedidos-t', 'per-02');
    const prep = preparar(peticion(datos, 'desdeCero', [bloqueada, suelta]), CATALOGO);
    expect(prep.fijas).toEqual([bloqueada]);
    const ids = prep.unidades.map((u) => u.id);
    expect(ids).not.toContain(`${JUEVES}|${P.pedidos}|0|franja-pedidos-m`);
    expect(ids).toContain(`${JUEVES}|${P.pedidos}|0|franja-pedidos-t`);
    expect(prep.unidades).toHaveLength(21 * 7 - 1);
  });

  it('ignora asignaciones de otras semanas', () => {
    const datos = crearEstadoEjemplo();
    const fuera = puesto('x', '2026-12-07', P.pedidos, 'franja-pedidos-m', 'per-01', true);
    expect(preparar(peticion(datos, 'desdeCero', [fuera]), CATALOGO).fijas).toEqual([]);
  });
});

describe('preparar · completarHuecos', () => {
  it('conserva todo lo existente y solo deja libres los huecos vacíos', () => {
    const datos = crearEstadoEjemplo();
    const a = puesto('a1', JUEVES, P.pedidos, 'franja-pedidos-m', 'per-01');
    const b = puesto('a2', JUEVES, P.pedidos, 'franja-pedidos-t', 'per-02', true);
    const prep = preparar(peticion(datos, 'completarHuecos', [a, b]), CATALOGO);
    expect(prep.fijas).toEqual([a, b]);
    expect(prep.unidades).toHaveLength(21 * 7 - 2);
  });
});

describe('preparar · semanaTipo', () => {
  function conSemanaTipo(): EstadoApp {
    const datos = crearEstadoEjemplo();
    datos.semanasTipo = [
      {
        id: 'st-a',
        indiceCiclo: 0,
        nombre: 'Semana A',
        asignaciones: [
          tipo('t1', 3, P.pedidos, 'franja-pedidos-m', 'per-01'),
          tipo('t2', 3, P.pedidos, 'franja-pedidos-t', 'per-02'),
          tipo('t3', 4, P.pedidos, 'franja-pedidos-m', 'per-03'),
        ],
      },
    ];
    return datos;
  }

  it('lleva la semana tipo del ciclo a las fechas y la conserva si es válida', () => {
    const datos = conSemanaTipo();
    const prep = preparar(peticion(datos, 'semanaTipo', []), CATALOGO);
    expect(prep.fijas).toHaveLength(3);
    expect(prep.fijas.every((a) => a.origen === 'semanaTipo' && !a.bloqueada)).toBe(true);
    expect(prep.fijas.map((a) => a.fecha).sort()).toEqual([JUEVES, JUEVES, '2026-11-27']);
    expect(prep.descartadas).toEqual([]);
    expect(prep.unidades).toHaveLength(21 * 7 - 3);
  });

  it('descarta lo que incumple alguna regla dura (ausencia) y lo deja como hueco', () => {
    const datos = conSemanaTipo();
    datos.incidencias.push({ id: 'i1', tipo: 'ausencia', personaId: 'per-02', desde: JUEVES, hasta: JUEVES, tramo: null, nota: '' });
    const prep = preparar(peticion(datos, 'semanaTipo', []), CATALOGO);
    expect(prep.fijas.map((a) => a.personaId).sort()).toEqual(['per-01', 'per-03']);
    expect(prep.descartadas.map((a) => a.personaId)).toEqual(['per-02']);
    expect(prep.unidades.map((u) => u.id)).toContain(`${JUEVES}|${P.pedidos}|0|franja-pedidos-t`);
  });

  it('descarta lo asignado a un puesto cerrado ese día', () => {
    const datos = conSemanaTipo();
    datos.incidencias.push({ id: 'i2', tipo: 'puestoCerrado', puestoId: P.pedidos, desde: '2026-11-27', hasta: '2026-11-27', nota: '' });
    const prep = preparar(peticion(datos, 'semanaTipo', []), CATALOGO);
    expect(prep.fijas.map((a) => a.personaId).sort()).toEqual(['per-01', 'per-02']);
    expect(prep.descartadas.map((a) => a.personaId)).toEqual(['per-03']);
  });

  it('una semana del ciclo sin semana tipo parte de cero', () => {
    const datos = conSemanaTipo();
    const prep = preparar(peticion(datos, 'semanaTipo', [], '2026-11-30'), CATALOGO);
    expect(prep.fijas).toEqual([]);
    expect(asignacionesDeSemanaTipo(datos, '2026-11-30')).toEqual([]);
  });

  it('si ya hay asignaciones sin candado, parte de ellas y no de la semana tipo', () => {
    const datos = conSemanaTipo();
    const actual = puesto('m1', '2026-11-25', P.pedidos, 'franja-pedidos-m', 'per-01');
    const prep = preparar(peticion(datos, 'semanaTipo', [actual]), CATALOGO);
    expect(prep.fijas).toEqual([actual]);
  });

  it('respeta el candado y no duplica un hueco ya bloqueado', () => {
    const datos = conSemanaTipo();
    const candado = puesto('b1', JUEVES, P.pedidos, 'franja-pedidos-m', 'per-05', true);
    const prep = preparar(peticion(datos, 'semanaTipo', [candado]), CATALOGO);
    expect(prep.fijas).toContainEqual(candado);
    expect(prep.fijas.filter((a) => a.tipo === 'puesto' && a.fecha === JUEVES && a.franjaId === 'franja-pedidos-m')).toHaveLength(1);
  });

  it('quita la pausa de quien deja de trabajar ese día', () => {
    const datos = conSemanaTipo();
    datos.semanasTipo[0]!.asignaciones.push({ id: 'p1', tipo: 'pausa', dia: 3, inicio: 840, fin: 900, personaId: 'per-09', bloqueada: false });
    const prep = preparar(peticion(datos, 'semanaTipo', []), CATALOGO);
    expect(prep.fijas.some((a) => a.tipo === 'pausa')).toBe(false);
    expect(prep.descartadas.some((a) => a.tipo === 'pausa')).toBe(true);
  });
});

describe('preparar · pausas y descarte mínimo', () => {
  const DOMINGO = '2026-11-29';
  const pausa = (id: string, personaId: string, inicio: number, fin: number): Asignacion => ({
    id, tipo: 'pausa', fecha: DOMINGO, inicio, fin, personaId, bloqueada: false, origen: 'manual',
  });
  const trabajo = (id: string, personaId: string): AsignacionPuesto => puesto(id, DOMINGO, P.lego, 'franja-lego-1', personaId);

  function conComidasEstrechas(): EstadoApp {
    const datos = crearEstadoEjemplo();
    datos.reglas = datos.reglas.map((r) =>
      r.tipo === 'comidasEscalonadas' ? { ...r, params: { ...r.params, franjas: r.params.franjas.map((f) => ({ ...f, maxPersonas: 1 })) } } : r,
    );
    return datos;
  }
  const actuales = (): Asignacion[] => [
    trabajo('w1', 'per-01'), trabajo('w2', 'per-02'), trabajo('w3', 'per-03'),
    pausa('p1', 'per-01', 840, 900), pausa('p2', 'per-02', 840, 900), pausa('p3', 'per-03', 960, 980),
  ];

  for (const modo of ['completarHuecos', 'semanaTipo'] as const) {
    it(`${modo}: descarta las pausas que incumplen (máximo por franja y duración) y deja lo demás`, () => {
      const datos = conComidasEstrechas();
      const prep = preparar(peticion(datos, modo, actuales()), CATALOGO);
      const v = validarSemana(datos, LUNES, prep.fijas, CATALOGO);
      expect(v.incumplimientos.filter((i) => i.dura && i.tipo === 'comidasEscalonadas')).toEqual([]);
      expect(prep.fijas.filter((a) => a.tipo === 'pausa')).toHaveLength(1);
      expect(prep.fijas.filter((a) => a.tipo === 'puesto')).toHaveLength(3);
      expect(prep.descartadas.filter((a) => a.tipo === 'pausa')).toHaveLength(2);
    });
  }

  it('semanaTipo quita lo mínimo: con máximo personal de 5 días y 6 puestos solo se quita un día', () => {
    const datos = crearEstadoEjemplo();
    const per = datos.personas.find((p) => p.codigo === 'EMP-11')!;
    per.restricciones.push({ id: 'r-max5', tipo: 'maxDiasSemana', params: { max: 5 }, dura: true, peso: 0, activa: true, nota: '' });
    datos.semanasTipo = [
      { id: 'st', indiceCiclo: 0, nombre: 'A', asignaciones: [0, 1, 2, 3, 4, 5].map((d) => tipo(`t${d}`, d as 0, P.lego, 'franja-lego-1', per.id)) },
    ];
    const prep = preparar(peticion(datos, 'semanaTipo', []), CATALOGO);
    expect(prep.fijas).toHaveLength(5);
    expect(prep.descartadas).toHaveLength(1);
    expect(prep.descartadas[0]?.fecha).toBe('2026-11-28');
  });
});
