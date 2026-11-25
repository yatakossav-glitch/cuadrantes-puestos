import { describe, expect, it } from 'vitest';
import { IDS_EJEMPLO, crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import type { Asignacion, AsignacionPausa, AsignacionPuesto, DatosPlanificacion, ReglaGeneral } from '../../modelo/tipos';
import { crearIndice } from '../../validacion/indice';
import type { ContextoEvaluacion } from '../contrato';
import { definicion, metadatos } from './personaDisponible';

const LUNES = '2026-11-23';
const MIERCOLES = '2026-11-25';
const JUEVES = '2026-11-26';
const { caja1, caja2, pedidos, lego } = IDS_EJEMPLO.puestos;

let contador = 0;
function puesto(fecha: string, puestoId: string, franjaId: string, personaId: string, plaza = 0): AsignacionPuesto {
  contador += 1;
  return { id: `a${contador}`, tipo: 'puesto', fecha, puestoId, franjaId, plaza, personaId, bloqueada: false, origen: 'manual' };
}
function pausa(fecha: string, personaId: string, inicio: number, fin: number): AsignacionPausa {
  contador += 1;
  return { id: `p${contador}`, tipo: 'pausa', fecha, personaId, inicio, fin, bloqueada: false, origen: 'manual' };
}
function contexto(datos: DatosPlanificacion, asignaciones: Asignacion[]): ContextoEvaluacion {
  return { datos, indice: crearIndice(datos, LUNES, asignaciones) };
}
function reglaDe<T extends ReglaGeneral['tipo']>(datos: DatosPlanificacion, tipo: T): ReglaGeneral<T> {
  const r = datos.reglas.find((x) => x.tipo === tipo);
  if (!r) throw new Error('falta la regla ' + tipo);
  return { ...r } as ReglaGeneral<T>;
}

describe('regla personaDisponible', () => {
  const datos = crearEstadoEjemplo();
  const regla = datos.reglas.find((r) => r.tipo === 'personaDisponible');

  it('describe la regla del ejemplo', () => {
    expect(regla).toBeDefined();
    expect(metadatos.describir({}, datos)).toBe('No asignar a quien está de baja, ausente o fuera de plantilla');
  });

  it('no tiene parámetros y siempre es válida', () => {
    expect(metadatos.validarParams({}, datos)).toEqual([]);
    expect(metadatos.validarParams(metadatos.paramsPorDefecto(datos), datos)).toEqual([]);
    expect(metadatos.campos).toEqual([]);
  });
});

describe('personaDisponible · evaluar y comprobar', () => {
  const evaluar = (datos: DatosPlanificacion, a: Asignacion[], blanda = false) => {
    const r = reglaDe(datos, 'personaDisponible');
    if (blanda) Object.assign(r, { dura: false, peso: 5 });
    return definicion.evaluar(r, contexto(datos, a));
  };
  const persona = (datos: DatosPlanificacion, id: string) => {
    const p = datos.personas.find((x) => x.id === id);
    if (!p) throw new Error('falta ' + id);
    return p;
  };

  it('no marca a quien está disponible', () => {
    expect(evaluar(crearEstadoEjemplo(), [puesto(JUEVES, caja1, 'franja-caja-1', 'per-07')])).toEqual([]);
  });

  it('persona inactiva', () => {
    const datos = crearEstadoEjemplo();
    persona(datos, 'per-07').activa = false;
    const a = puesto(JUEVES, caja1, 'franja-caja-1', 'per-07');
    const r = evaluar(datos, [a]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ marca: 'noDisponible', fecha: JUEVES, personaId: 'per-07', asignacionIds: [a.id], dura: true });
    expect(r[0]?.mensaje).toBe('EMP-07 está marcada como inactiva y tiene asignación el jueves 26/11 10:00–11:30');
  });

  it('fuera de alta y de baja', () => {
    const datos = crearEstadoEjemplo();
    persona(datos, 'per-07').alta = '2026-11-26';
    persona(datos, 'per-08').baja = '2026-11-26';
    const r = evaluar(datos, [
      puesto(MIERCOLES, caja1, 'franja-caja-1', 'per-07'),
      puesto(JUEVES, caja1, 'franja-caja-1', 'per-07'),
      puesto(MIERCOLES, caja1, 'franja-caja-2', 'per-08'),
      puesto(JUEVES, caja1, 'franja-caja-2', 'per-08'),
    ]);
    expect(r.map((i) => i.mensaje)).toEqual([
      'EMP-07 aún no se ha incorporado y tiene asignación el miércoles 25/11 10:00–11:30',
      'EMP-08 ya no está en plantilla y tiene asignación el jueves 26/11 11:30–13:00',
    ]);
  });

  it('ausencia de todo el día o de un tramo', () => {
    const datos = crearEstadoEjemplo();
    datos.incidencias.push(
      { id: 'i1', tipo: 'ausencia', personaId: 'per-07', desde: JUEVES, hasta: JUEVES, tramo: { inicio: 600, fin: 690 }, nota: '' },
      { id: 'i2', tipo: 'ausencia', personaId: 'per-08', desde: JUEVES, hasta: '2026-11-27', tramo: null, nota: '' },
    );
    const r = evaluar(datos, [
      puesto(JUEVES, caja1, 'franja-caja-1', 'per-07'),
      puesto(JUEVES, caja1, 'franja-caja-3', 'per-07'),
      pausa(JUEVES, 'per-08', 14 * 60, 15 * 60),
    ]);
    expect(r).toHaveLength(2);
    expect(r[0]?.mensaje).toBe('EMP-07 está ausente y tiene asignación el jueves 26/11 10:00–11:30');
    expect(r[1]?.mensaje).toContain('EMP-08 está ausente');
  });

  it('persona inexistente y penalización blanda', () => {
    const datos = crearEstadoEjemplo();
    const r = evaluar(datos, [puesto(JUEVES, caja1, 'franja-caja-1', 'per-99')], true);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ dura: false, penalizacion: 5 });
    expect(r[0]?.mensaje).toContain('no existe');
  });

  it('trata los días libres del patrón como no disponibilidad según la semana del ciclo', () => {
    const datos = crearEstadoEjemplo();
    persona(datos, 'per-07').patron = [{ indiceCiclo: 1, equipo: null, diasLibres: [5] }];
    const sabadoA = puesto('2026-11-28', caja1, 'franja-caja-1', 'per-07');
    expect(evaluar(datos, [sabadoA])).toEqual([]);
    const lunesB = '2026-11-30';
    const sabadoB = puesto('2026-12-05', caja1, 'franja-caja-1', 'per-07');
    const ctx = { datos, indice: crearIndice(datos, lunesB, [sabadoB]) };
    const r = definicion.evaluar(reglaDe(datos, 'personaDisponible'), ctx);
    expect(r).toHaveLength(1);
    expect(r[0]?.mensaje).toBe('EMP-07 libra el sábado en la semana B y tiene asignación el sábado 05/12 10:00–11:30');
    const c = definicion.comprobar(reglaDe(datos, 'personaDisponible'), ctx, sabadoB);
    expect(c.permitido).toBe(false);
    expect(c.motivos[0]).toContain('libra el sábado en la semana B');
  });

  it('comprobar rechaza a la persona no disponible y admite a otra', () => {
    const datos = crearEstadoEjemplo();
    persona(datos, 'per-07').baja = '2026-11-26';
    const regla = reglaDe(datos, 'personaDisponible');
    const ctx = contexto(datos, []);
    const mala = definicion.comprobar(regla, ctx, puesto(JUEVES, caja1, 'franja-caja-1', 'per-07'));
    expect(mala.permitido).toBe(false);
    expect(mala.motivos[0]).toContain('EMP-07');
    expect(definicion.comprobar(regla, ctx, puesto(MIERCOLES, caja1, 'franja-caja-1', 'per-07')).permitido).toBe(true);
    expect(definicion.comprobar(regla, ctx, puesto(JUEVES, caja1, 'franja-caja-1', 'per-08')).permitido).toBe(true);
  });
});

// ───────────────────────── Coherencia de comprobar con evaluar (K1) ─────────────────────────

describe('personaDisponible · comprobar coincide con evaluar', () => {
  // Generador determinista (mulberry32) con semilla fija.
  function azar(semilla: number): () => number {
    let s = semilla >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const FECHAS = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
  let serie = 0;

  function generar(datos: DatosPlanificacion, rnd: () => number, personas: number): Asignacion {
    serie += 1;
    const elegir = <U,>(l: readonly U[]): U => l[Math.floor(rnd() * l.length)] as U;
    const personaId = rnd() < 0.03 ? 'per-99' : `per-${String(1 + Math.floor(rnd() * personas)).padStart(2, '0')}`;
    const fecha = rnd() < 0.02 ? '2026-12-07' : elegir(FECHAS);
    if (rnd() < 0.15) {
      const inicio = 600 + 15 * Math.floor(rnd() * 40);
      return { id: `g${serie}`, tipo: 'pausa', fecha, personaId, inicio, fin: inicio + 30 + 15 * Math.floor(rnd() * 4), bloqueada: false, origen: 'manual' };
    }
    const p = elegir(datos.puestos);
    const franjas = p.horario.general.franjas;
    const franjaId = rnd() < 0.05 ? 'franja-inexistente' : elegir(franjas).id;
    return { id: `g${serie}`, tipo: 'puesto', fecha, puestoId: p.id, franjaId, plaza: rnd() < 0.05 ? 1 : 0, personaId, bloqueada: false, origen: 'manual' };
  }

  /** Variante k del ejemplo: ausencias, bajas, habilitaciones y puestos cerrados para forzar casos. */
  function datosVariante(k: number): DatosPlanificacion {
    const datos = crearEstadoEjemplo();
    if (k % 3 === 0) return datos;
    const persona = (id: string) => datos.personas.find((x) => x.id === id);
    const p3 = persona('per-03');
    const p5 = persona('per-05');
    const p6 = persona('per-06');
    if (p3) p3.habilitaciones = [];
    if (p5) p5.baja = '2026-11-25';
    if (p6) p6.activa = false;
    datos.incidencias.push(
      { id: 'inc-1', tipo: 'ausencia', personaId: 'per-02', desde: '2026-11-24', hasta: '2026-11-26', tramo: { inicio: 600, fin: 780 }, nota: '' },
      { id: 'inc-2', tipo: 'ausencia', personaId: 'per-04', desde: '2026-11-27', hasta: '2026-11-27', tramo: null, nota: '' },
      { id: 'inc-3', tipo: 'puestoCerrado', puestoId: lego, desde: '2026-11-26', hasta: '2026-11-27', nota: '' },
    );
    if (k % 3 === 2) {
      const l = datos.puestos.find((x) => x.id === pedidos);
      if (l) l.activo = false;
    }
    return datos;
  }

  const PARAMS_VARIANTES: ReglaGeneral<'personaDisponible'>['params'][] = [{}];
  const suma = (l: { penalizacion: number }[]) => l.reduce((s, i) => s + i.penalizacion, 0);

  for (const [dura, peso] of [[true, 0], [false, 3]] as const) {
    it(`coincide con el oráculo de evaluar (${dura ? 'dura' : 'blanda, peso 3'})`, () => {
      let bloqueadas = 0;
      let permitidas = 0;
      let conCoste = 0;
      for (let k = 0; k < 9; k += 1) {
        const datos = datosVariante(k);
        const params = PARAMS_VARIANTES[k % PARAMS_VARIANTES.length] as ReglaGeneral<'personaDisponible'>['params'];
        const regla = { ...reglaDe(datos, 'personaDisponible'), dura, peso, params } as ReglaGeneral<'personaDisponible'>;
        const rnd = azar(1000 + k);
        const base: Asignacion[] = [];
        for (let i = 0; i < 50; i += 1) base.push(generar(datos, rnd, 6));
        const antesCtx = contexto(datos, base);
        const antes = definicion.evaluar(regla, antesCtx);
        for (let i = 0; i < 40; i += 1) {
          const candidata = generar(datos, rnd, i % 4 === 0 ? 12 : 6);
          const despues = definicion.evaluar(regla, contexto(datos, [...base, candidata]));
          const esperadoPermitido = !despues.some((x) => x.dura && x.asignacionIds.includes(candidata.id));
          const esperadoCoste = Math.max(0, suma(despues) - suma(antes));
          const r = definicion.comprobar(regla, antesCtx, candidata);
          expect(r.permitido, `k=${k} i=${i} ${JSON.stringify(candidata)}`).toBe(esperadoPermitido);
          expect(r.coste, `k=${k} i=${i} ${JSON.stringify(candidata)}`).toBe(esperadoCoste);
          if (!r.permitido) expect(r.motivos.length).toBeGreaterThan(0);
          if (r.permitido) permitidas += 1;
          else bloqueadas += 1;
          if (r.coste > 0) conCoste += 1;
        }
      }
      expect(permitidas).toBeGreaterThan(0);
      if (dura) expect(true ? bloqueadas : permitidas).toBeGreaterThan(0);
      else expect(true ? conCoste : permitidas).toBeGreaterThan(0);
    });
  }

  it('2000 comprobaciones sobre ~150 asignaciones tardan menos de 1 s', () => {
    const datos = crearEstadoEjemplo();
    const regla = reglaDe(datos, 'personaDisponible');
    const rnd = azar(7);
    const base: Asignacion[] = [];
    for (let i = 0; i < 150; i += 1) base.push(generar(datos, rnd, 12));
    const ctx = contexto(datos, base);
    const candidatas: Asignacion[] = [];
    for (let i = 0; i < 2000; i += 1) candidatas.push(generar(datos, rnd, 12));
    const t0 = performance.now();
    for (const c of candidatas) definicion.comprobar(regla, ctx, c);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe('personaDisponible · horario de la plantilla', () => {
  const T = (inicio: number, fin: number) => ({ inicio, fin });
  const conHorario = (turnos: Record<string, ReturnType<typeof T>[]>, dia = JUEVES): DatosPlanificacion => {
    const datos = crearEstadoEjemplo();
    datos.horarios = {
      [LUNES]: {
        lunes: LUNES,
        actualizado: null,
        turnos: Object.entries(turnos).map(([personaId, tramos]) => ({ personaId, fecha: dia, tramos })),
      },
    };
    return datos;
  };
  const evaluar = (datos: DatosPlanificacion, a: Asignacion[]) => definicion.evaluar(reglaDe(datos, 'personaDisponible'), contexto(datos, a));
  const comprobar = (datos: DatosPlanificacion, a: Asignacion, dura = true) =>
    definicion.comprobar({ ...reglaDe(datos, 'personaDisponible'), dura, peso: 5 }, contexto(datos, []), a);

  it('con horario en la semana, el horario manda sobre los días libres del patrón', () => {
    const datos = conHorario({ 'per-07': [T(600, 945)] });
    datos.personas.find((x) => x.id === 'per-07')!.patron = [{ indiceCiclo: 0, equipo: null, diasLibres: [3] }];
    expect(evaluar(datos, [puesto(JUEVES, caja1, 'franja-caja-1', 'per-07')])).toEqual([]);
    const sinHorario = crearEstadoEjemplo();
    sinHorario.personas.find((x) => x.id === 'per-07')!.patron = [{ indiceCiclo: 0, equipo: null, diasLibres: [3] }];
    expect(evaluar(sinHorario, [puesto(JUEVES, caja1, 'franja-caja-1', 'per-07')])).toHaveLength(1);
  });

  it('sin horario en la semana no limita', () => {
    const a = puesto(JUEVES, caja1, 'franja-caja-1', 'per-07');
    expect(evaluar(crearEstadoEjemplo(), [a])).toEqual([]);
  });

  it('asignación dentro de su turno: bien; fuera: incumple con su turno en el mensaje', () => {
    const datos = conHorario({ 'per-07': [T(600, 945)] });
    expect(evaluar(datos, [puesto(JUEVES, caja1, 'franja-caja-1', 'per-07')])).toEqual([]);
    const r = evaluar(datos, [puesto(JUEVES, caja1, 'franja-caja-5', 'per-07')]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ marca: 'noDisponible', dura: true, personaId: 'per-07' });
    expect(r[0]?.mensaje).toBe('EMP-07 no está de turno a esa hora (su turno: 10:00–15:45) y tiene asignación el jueves 26/11 15:45–17:20');
  });

  it('una franja que cruza el borde del tramo cuenta como fuera de turno', () => {
    const datos = conHorario({ 'per-07': [T(600, 650)] });
    expect(evaluar(datos, [puesto(JUEVES, caja1, 'franja-caja-1', 'per-07')])).toHaveLength(1); // 10:00–11:30 no cabe en 10:00–10:50
    const justo = conHorario({ 'per-07': [T(600, 690)] });
    expect(evaluar(justo, [puesto(JUEVES, caja1, 'franja-caja-1', 'per-07')])).toEqual([]);
  });

  it('turno partido: cada franja debe caber entera en un tramo', () => {
    const datos = conHorario({ 'per-07': [T(600, 780), T(1020, 1260)] });
    expect(evaluar(datos, [puesto(JUEVES, caja1, 'franja-caja-2', 'per-07'), puesto(JUEVES, caja1, 'franja-caja-7', 'per-07')])).toEqual([]);
    expect(evaluar(datos, [puesto(JUEVES, caja1, 'franja-caja-4', 'per-07')])).toHaveLength(1);
  });

  it('libra y no figura', () => {
    const datos = conHorario({ 'per-07': [] });
    const libra = evaluar(datos, [puesto(JUEVES, caja1, 'franja-caja-1', 'per-07')]);
    expect(libra[0]?.mensaje).toBe('EMP-07 libra según el horario de la semana y tiene asignación el jueves 26/11 10:00–11:30');
    const nofigura = evaluar(datos, [puesto(JUEVES, caja1, 'franja-caja-1', 'per-08')]);
    expect(nofigura[0]?.mensaje).toBe('EMP-08 no figura en el horario de la semana y tiene asignación el jueves 26/11 10:00–11:30');
  });

  it('otro día de la semana de una persona que figura sin turno ese día: libra', () => {
    const datos = conHorario({ 'per-07': [T(600, 945)] });
    const r = evaluar(datos, [puesto(MIERCOLES, caja1, 'franja-caja-1', 'per-07')]);
    expect(r[0]?.mensaje).toContain('EMP-07 libra según el horario de la semana');
  });

  it('las pausas no se marcan por horario, ni entre dos tramos de un partido', () => {
    const datos = conHorario({ 'per-07': [T(600, 780), T(1020, 1260)] });
    expect(evaluar(datos, [pausa(JUEVES, 'per-07', 14 * 60, 15 * 60), pausa(JUEVES, 'per-08', 14 * 60, 15 * 60)])).toEqual([]);
    expect(comprobar(datos, pausa(JUEVES, 'per-07', 14 * 60, 15 * 60)).permitido).toBe(true);
  });

  it('comprobar es coherente con evaluar (dura y blanda)', () => {
    const datos = conHorario({ 'per-07': [T(600, 945)] });
    const dentro = puesto(JUEVES, caja1, 'franja-caja-1', 'per-07');
    const fuera = puesto(JUEVES, caja1, 'franja-caja-5', 'per-07');
    expect(comprobar(datos, dentro)).toEqual({ permitido: true, coste: 0, motivos: [] });
    const dura = comprobar(datos, fuera);
    expect(dura).toMatchObject({ permitido: false, coste: 0 });
    expect(dura.motivos[0]).toContain('EMP-07 no está de turno a esa hora (su turno: 10:00–15:45)');
    expect(comprobar(datos, fuera, false)).toMatchObject({ permitido: true, coste: 5 });
    expect(comprobar(datos, puesto(JUEVES, caja1, 'franja-caja-1', 'per-08')).motivos[0]).toContain('no figura en el horario');
  });
});
