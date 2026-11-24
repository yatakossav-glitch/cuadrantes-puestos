import { describe, expect, it } from 'vitest';
import { IDS_EJEMPLO, crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import type { Asignacion, AsignacionPausa, AsignacionPuesto, DatosPlanificacion, ReglaGeneral } from '../../modelo/tipos';
import { crearIndice } from '../../validacion/indice';
import type { ContextoEvaluacion } from '../contrato';
import { definicion, metadatos } from './sinSolapes';

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

describe('regla sinSolapes', () => {
  const datos = crearEstadoEjemplo();
  const regla = datos.reglas.find((r) => r.tipo === 'sinSolapes');

  it('describe la regla del ejemplo', () => {
    expect(regla).toBeDefined();
    expect(metadatos.describir({}, datos)).toBe('Nadie puede estar en dos puestos a la vez, ni en un puesto y en una pausa');
  });

  it('no tiene parámetros y siempre es válida', () => {
    expect(metadatos.validarParams({}, datos)).toEqual([]);
    expect(metadatos.validarParams(metadatos.paramsPorDefecto(datos), datos)).toEqual([]);
    expect(metadatos.campos).toEqual([]);
  });
});

describe('sinSolapes · evaluar y comprobar', () => {
  const evaluar = (datos: DatosPlanificacion, a: Asignacion[], blanda = false) => {
    const r = reglaDe(datos, 'sinSolapes');
    if (blanda) Object.assign(r, { dura: false, peso: 5 });
    return definicion.evaluar(r, contexto(datos, a));
  };

  it('no marca nada sin asignaciones ni con franjas que solo se tocan', () => {
    const datos = crearEstadoEjemplo();
    expect(evaluar(datos, [])).toEqual([]);
    expect(evaluar(datos, [puesto(JUEVES, caja1, 'franja-caja-1', 'per-07'), puesto(JUEVES, caja1, 'franja-caja-2', 'per-07')])).toEqual([]);
  });

  it('marca Caja 1 y Caja 2 a la vez, con mensaje legible', () => {
    const datos = crearEstadoEjemplo();
    const a = puesto(JUEVES, caja1, 'franja-caja-1', 'per-07');
    const b = puesto(JUEVES, caja2, 'franja-caja-1', 'per-07');
    const r = evaluar(datos, [a, b]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ dura: true, penalizacion: 0, marca: 'solape', fecha: JUEVES, personaId: 'per-07', asignacionIds: [a.id, b.id] });
    expect(r[0]?.mensaje).toBe('EMP-07 está en dos sitios a la vez el jueves 26/11: Caja 1 (Caja) 10:00–11:30 y Caja 2 (Caja) 10:00–11:30');
  });

  it('un incumplimiento por par: tres solapadas son 3 pares', () => {
    const datos = crearEstadoEjemplo();
    const r = evaluar(datos, [
      puesto(JUEVES, caja1, 'franja-caja-1', 'per-07'),
      puesto(JUEVES, caja2, 'franja-caja-1', 'per-07'),
      puesto(JUEVES, lego, 'franja-lego-1', 'per-07'),
    ]);
    expect(r).toHaveLength(3);
  });

  it('cuenta también la pausa y distingue personas y días', () => {
    const datos = crearEstadoEjemplo();
    const r = evaluar(datos, [
      puesto(JUEVES, caja1, 'franja-caja-1', 'per-07'),
      pausa(JUEVES, 'per-07', 11 * 60, 12 * 60),
      puesto(JUEVES, caja2, 'franja-caja-1', 'per-08'),
      puesto(MIERCOLES, caja2, 'franja-caja-1', 'per-07'),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]?.mensaje).toContain('pausa 11:00–12:00');
  });

  it('si es blanda penaliza 5 por par', () => {
    const datos = crearEstadoEjemplo();
    const r = evaluar(datos, [puesto(JUEVES, caja1, 'franja-caja-1', 'per-07'), puesto(JUEVES, caja2, 'franja-caja-1', 'per-07')], true);
    expect(r[0]).toMatchObject({ dura: false, penalizacion: 5 });
  });

  it('comprobar rechaza la candidata que solapa (dura) y admite la que no', () => {
    const datos = crearEstadoEjemplo();
    const regla = reglaDe(datos, 'sinSolapes');
    const ctx = contexto(datos, [puesto(JUEVES, caja1, 'franja-caja-1', 'per-07')]);
    const mala = definicion.comprobar(regla, ctx, puesto(JUEVES, caja2, 'franja-caja-1', 'per-07'));
    expect(mala.permitido).toBe(false);
    expect(mala.motivos[0]).toContain('EMP-07');
    expect(definicion.comprobar(regla, ctx, puesto(JUEVES, caja2, 'franja-caja-2', 'per-07'))).toEqual({ permitido: true, coste: 0, motivos: [] });
    expect(definicion.comprobar(regla, ctx, puesto(JUEVES, caja2, 'franja-caja-1', 'per-08')).permitido).toBe(true);
  });

  it('comprobar con regla blanda permite y da coste', () => {
    const datos = crearEstadoEjemplo();
    const regla = { ...reglaDe(datos, 'sinSolapes'), dura: false, peso: 5 };
    const ctx = contexto(datos, [puesto(JUEVES, caja1, 'franja-caja-1', 'per-07')]);
    expect(definicion.comprobar(regla, ctx, puesto(JUEVES, caja2, 'franja-caja-1', 'per-07'))).toMatchObject({ permitido: true, coste: 5 });
  });
});

// ───────────────────────── Coherencia de comprobar con evaluar (K1) ─────────────────────────

describe('sinSolapes · comprobar coincide con evaluar', () => {
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

  const PARAMS_VARIANTES: ReglaGeneral<'sinSolapes'>['params'][] = [{}];
  const suma = (l: { penalizacion: number }[]) => l.reduce((s, i) => s + i.penalizacion, 0);

  for (const [dura, peso] of [[true, 0], [false, 3]] as const) {
    it(`coincide con el oráculo de evaluar (${dura ? 'dura' : 'blanda, peso 3'})`, () => {
      let bloqueadas = 0;
      let permitidas = 0;
      let conCoste = 0;
      for (let k = 0; k < 9; k += 1) {
        const datos = datosVariante(k);
        const params = PARAMS_VARIANTES[k % PARAMS_VARIANTES.length] as ReglaGeneral<'sinSolapes'>['params'];
        const regla = { ...reglaDe(datos, 'sinSolapes'), dura, peso, params } as ReglaGeneral<'sinSolapes'>;
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
    const regla = reglaDe(datos, 'sinSolapes');
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
