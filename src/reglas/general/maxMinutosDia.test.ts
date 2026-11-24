import { describe, expect, it } from 'vitest';
import { IDS_EJEMPLO, crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import type { Asignacion, AsignacionPausa, AsignacionPuesto, DatosPlanificacion, ReglaGeneral } from '../../modelo/tipos';
import { crearIndice } from '../../validacion/indice';
import type { ContextoEvaluacion } from '../contrato';
import { definicion, metadatos } from './maxMinutosDia';

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

describe('regla maxMinutosDia', () => {
  const datos = crearEstadoEjemplo();
  const regla = datos.reglas.find((r) => r.tipo === 'maxMinutosDia');
  const params = regla?.params as Parameters<typeof metadatos.describir>[0];

  it('describe los parámetros del ejemplo', () => {
    expect(metadatos.describir(params, datos)).toBe('Máximo 4h30 al día (Pedidos Web: sin límite)');
  });
  it('describe sin excepciones y con límite propio', () => {
    expect(metadatos.describir({ maxMin: 270, excepciones: [] }, datos)).toBe('Máximo 4h30 al día');
    expect(metadatos.describir({ maxMin: 270, excepciones: [{ areaId: IDS_EJEMPLO.areas.caja, maxMin: 300 }] }, datos)).toContain('Caja: 5h');
    expect(metadatos.describir({ maxMin: 270, excepciones: [{ areaId: 'x', maxMin: null }] }, datos)).toContain('área desconocida');
  });
  it('acepta ejemplo y valores por defecto', () => {
    expect(metadatos.validarParams(params, datos)).toEqual([]);
    expect(metadatos.validarParams(metadatos.paramsPorDefecto(datos), datos)).toEqual([]);
    expect(metadatos.paramsPorDefecto(datos)).toEqual({ maxMin: 270, excepciones: [] });
  });
  it('rechaza casos inválidos', () => {
    expect(metadatos.validarParams({ maxMin: 0, excepciones: [] }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ maxMin: 1500, excepciones: [] }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ maxMin: 270, excepciones: [{ areaId: 'nada', maxMin: null }] }, datos)).toHaveLength(1);
    const a = IDS_EJEMPLO.areas.caja;
    expect(metadatos.validarParams({ maxMin: 270, excepciones: [{ areaId: a, maxMin: null }, { areaId: a, maxMin: null }] }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ maxMin: 270, excepciones: [{ areaId: a, maxMin: -5 }] }, datos)).toHaveLength(1);
  });
});

describe('maxMinutosDia · evaluar y comprobar', () => {
  const franjas = (puestoId: string, prefijo: string, ns: number[], id: string, fecha = JUEVES) =>
    ns.map((n) => puesto(fecha, puestoId, `${prefijo}-${n}`, id));
  const evaluar = (datos: DatosPlanificacion, a: Asignacion[], cambios: Partial<ReglaGeneral<'maxMinutosDia'>> = {}) =>
    definicion.evaluar({ ...reglaDe(datos, 'maxMinutosDia'), ...cambios }, contexto(datos, a));

  it('cumple con 4h30 exactas', () => {
    expect(evaluar(crearEstadoEjemplo(), franjas(caja1, 'franja-caja', [1, 2, 3], 'per-11'))).toEqual([]);
  });

  it('supera el límite general: mensaje, marca y asignaciones', () => {
    const datos = crearEstadoEjemplo();
    const a = franjas(caja1, 'franja-caja', [1, 2, 3, 4], 'per-11');
    const r = evaluar(datos, a);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ marca: 'aviso', fecha: JUEVES, personaId: 'per-11', dura: true, penalizacion: 0 });
    expect(r[0]?.mensaje).toBe('EMP-11 supera 4h30 el jueves 26/11 (5h45)');
    expect(r[0]?.asignacionIds).toEqual(a.map((x) => x.id));
  });

  it('suma varios puestos del mismo día y no mezcla días', () => {
    const datos = crearEstadoEjemplo();
    const r = evaluar(datos, [
      ...franjas(caja1, 'franja-caja', [1, 2], 'per-11'),
      ...franjas(caja2, 'franja-caja', [3, 4], 'per-11'),
      ...franjas(caja1, 'franja-caja', [1, 2, 3], 'per-11', MIERCOLES),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]?.mensaje).toBe('EMP-11 supera 4h30 el jueves 26/11 (5h45)');
  });

  it('penalización blanda por cada 15 min: 20 min de exceso y peso 5 dan 10', () => {
    const datos = crearEstadoEjemplo();
    const r = evaluar(datos, franjas(caja1, 'franja-caja', [1, 2, 3], 'per-11'), {
      dura: false,
      peso: 5,
      params: { maxMin: 250, excepciones: [] },
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ dura: false, penalizacion: 10 });
    expect(r[0]?.mensaje).toBe('EMP-11 supera 4h10 el jueves 26/11 (4h30)');
  });

  it('la excepción sin límite de Pedidos no incumple y no suma al resto', () => {
    const datos = crearEstadoEjemplo();
    const pedidosDia = [puesto(JUEVES, pedidos, 'franja-pedidos-m', 'per-01'), puesto(JUEVES, pedidos, 'franja-pedidos-t', 'per-01')];
    expect(evaluar(datos, pedidosDia)).toEqual([]);
    const conCaja = [...pedidosDia, ...franjas(caja1, 'franja-caja', [1, 2, 3], 'per-01')];
    expect(evaluar(datos, conCaja)).toEqual([]);
  });

  it('una excepción con límite propio se mide aparte y se nombra', () => {
    const datos = crearEstadoEjemplo();
    const r = evaluar(datos, franjas(caja1, 'franja-caja', [1, 2, 3, 4], 'per-11'), {
      params: { maxMin: 270, excepciones: [{ areaId: IDS_EJEMPLO.areas.caja, maxMin: 300 }] },
    });
    expect(r).toHaveLength(1);
    expect(r[0]?.mensaje).toBe('EMP-11 supera 5h en Caja el jueves 26/11 (5h45)');
  });

  it('comprobar rechaza la candidata que pasa del límite (dura) y admite la que no', () => {
    const datos = crearEstadoEjemplo();
    const regla = reglaDe(datos, 'maxMinutosDia');
    const ctx = contexto(datos, franjas(caja1, 'franja-caja', [1, 2, 3], 'per-11'));
    const mala = definicion.comprobar(regla, ctx, puesto(JUEVES, caja2, 'franja-caja-4', 'per-11'));
    expect(mala.permitido).toBe(false);
    expect(mala.motivos[0]).toContain('EMP-11 supera 4h30');
    expect(definicion.comprobar(regla, ctx, puesto(JUEVES, caja2, 'franja-caja-4', 'per-12')).permitido).toBe(true);
    expect(definicion.comprobar(regla, ctx, puesto(MIERCOLES, caja2, 'franja-caja-4', 'per-11')).permitido).toBe(true);
  });

  it('comprobar blanda devuelve el coste del exceso nuevo', () => {
    const datos = crearEstadoEjemplo();
    const regla = { ...reglaDe(datos, 'maxMinutosDia'), dura: false, peso: 5, params: { maxMin: 250, excepciones: [] } };
    const ctx = contexto(datos, franjas(caja1, 'franja-caja', [1, 2], 'per-11'));
    // 180 + 90 = 270 → 20 min de exceso → 2 unidades × 5
    expect(definicion.comprobar(regla, ctx, puesto(JUEVES, caja2, 'franja-caja-3', 'per-11'))).toMatchObject({ permitido: true, coste: 10 });
  });

  it('ignora asignaciones de un puesto cerrado por incidencia', () => {
    const d = crearEstadoEjemplo();
    d.incidencias.push({ id: 'inc', tipo: 'puestoCerrado', puestoId: caja1, desde: JUEVES, hasta: JUEVES, nota: '' });
    const regla = reglaDe(d, 'maxMinutosDia');
    const franjas = [1, 2, 3, 4].map((n) => puesto(JUEVES, caja1, `franja-caja-${n}`, 'per-07'));
    expect(definicion.evaluar(regla, contexto(d, franjas))).toEqual([]);
    expect(definicion.evaluar(regla, contexto(crearEstadoEjemplo(), franjas))).toHaveLength(1);
  });
});

// ───────────────────────── Coherencia de comprobar con evaluar (K1) ─────────────────────────

describe('maxMinutosDia · comprobar coincide con evaluar', () => {
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

  const PARAMS_VARIANTES: ReglaGeneral<'maxMinutosDia'>['params'][] = [{ maxMin: 270, excepciones: [{ areaId: 'area-pedidos', maxMin: null }] }, { maxMin: 180, excepciones: [] }, { maxMin: 200, excepciones: [{ areaId: 'area-caja', maxMin: 120 }, { areaId: 'area-lego', maxMin: null }] }];
  const suma = (l: { penalizacion: number }[]) => l.reduce((s, i) => s + i.penalizacion, 0);

  for (const [dura, peso] of [[true, 0], [false, 3]] as const) {
    it(`coincide con el oráculo de evaluar (${dura ? 'dura' : 'blanda, peso 3'})`, () => {
      let bloqueadas = 0;
      let permitidas = 0;
      let conCoste = 0;
      for (let k = 0; k < 9; k += 1) {
        const datos = datosVariante(k);
        const params = PARAMS_VARIANTES[k % PARAMS_VARIANTES.length] as ReglaGeneral<'maxMinutosDia'>['params'];
        const regla = { ...reglaDe(datos, 'maxMinutosDia'), dura, peso, params } as ReglaGeneral<'maxMinutosDia'>;
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
    const regla = reglaDe(datos, 'maxMinutosDia');
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
