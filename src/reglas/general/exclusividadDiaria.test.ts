import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, crearEstadoVacio, IDS_EJEMPLO } from '../../datos-ejemplo/ejemplo';
import { aMinutos } from '../../modelo/horas';
import type { Asignacion, DatosPlanificacion, ReglaGeneral, TipoReglaGeneral } from '../../modelo/tipos';
import { crearIndice } from '../../validacion/indice';
import type { ContextoEvaluacion, Incumplimiento } from '../contrato';
import { definicion, metadatos } from './exclusividadDiaria';

const LUNES = '2026-11-23';
const JUEVES = '2026-11-26';
const VIERNES = '2026-11-27';
const DOMINGO = '2026-11-29';
const datosEjemplo = crearEstadoEjemplo();
const { caja1, caja2, lego, pedidos } = IDS_EJEMPLO.puestos;
let contador = 0;

function puesto(fecha: string, puestoId: string, franjaId: string, personaId: string, plaza = 0): Asignacion {
  contador += 1;
  return { id: `a${contador}`, tipo: 'puesto', fecha, puestoId, franjaId, plaza, personaId, bloqueada: false, origen: 'manual' };
}
function pausa(fecha: string, personaId: string, inicio: string, fin: string): Asignacion {
  contador += 1;
  return { id: `p${contador}`, tipo: 'pausa', fecha, personaId, inicio: aMinutos(inicio), fin: aMinutos(fin), bloqueada: false, origen: 'manual' };
}
function contexto(asignaciones: Asignacion[], datos: DatosPlanificacion = datosEjemplo): ContextoEvaluacion {
  return { datos, indice: crearIndice(datos, LUNES, asignaciones) };
}
function reglaDe<T extends TipoReglaGeneral>(tipo: T): ReglaGeneral<T> {
  const r = datosEjemplo.reglas.find((x) => x.tipo === tipo);
  if (!r) throw new Error(`Falta la regla ${tipo} en el ejemplo`);
  return r as unknown as ReglaGeneral<T>;
}

describe('regla exclusividadDiaria', () => {
  const datos = crearEstadoEjemplo();
  const params = datos.reglas.find((r) => r.tipo === 'exclusividadDiaria')?.params as Parameters<typeof metadatos.describir>[0];

  it('describe los parámetros del ejemplo', () => {
    expect(metadatos.describir(params, datos)).toBe('Quien hace Puesto único (Pedidos Web) no hace nada más ese día (salvo domingo)');
  });
  it('describe sin excepciones y con puesto desconocido', () => {
    expect(metadatos.describir({ puestoIds: [IDS_EJEMPLO.puestos.caja1], diasExcepcion: [] }, datos)).toBe(
      'Quien hace Caja 1 (Caja) no hace nada más ese día',
    );
    expect(metadatos.describir({ puestoIds: ['x'], diasExcepcion: [] }, datos)).toContain('puesto desconocido');
  });
  it('acepta ejemplo y valores por defecto', () => {
    expect(metadatos.validarParams(params, datos)).toEqual([]);
    const defecto = metadatos.paramsPorDefecto(datos);
    expect(defecto.puestoIds).toHaveLength(1);
    expect(metadatos.validarParams(defecto, datos)).toEqual([]);
    expect(metadatos.paramsPorDefecto(crearEstadoVacio()).puestoIds).toEqual([]);
  });
  it('rechaza casos inválidos', () => {
    expect(metadatos.validarParams({ puestoIds: [], diasExcepcion: [] }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ puestoIds: ['nada'], diasExcepcion: [] }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ puestoIds: [IDS_EJEMPLO.puestos.lego], diasExcepcion: [7 as 0] }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ puestoIds: [IDS_EJEMPLO.puestos.lego], diasExcepcion: [6, 6] }, datos)).toHaveLength(1);
  });
});

describe('exclusividadDiaria · evaluar y comprobar', () => {
  const regla = reglaDe('exclusividadDiaria');

  it('no avisa si solo hace el puesto exclusivo', () => {
    const ctx = contexto([puesto(JUEVES, pedidos, 'franja-pedidos-m', 'per-20')]);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
  });
  it('no avisa si no hace el puesto exclusivo', () => {
    const ctx = contexto([puesto(JUEVES, lego, 'franja-lego-1', 'per-20'), puesto(JUEVES, caja1, 'franja-caja-5', 'per-20')]);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
  });
  it('avisa si además hace otro puesto el mismo día', () => {
    const ctx = contexto([puesto(JUEVES, pedidos, 'franja-pedidos-m', 'per-20'), puesto(JUEVES, lego, 'franja-lego-8', 'per-20')]);
    const r = definicion.evaluar(regla, ctx);
    expect(r).toHaveLength(1);
    expect(r[0]?.mensaje).toBe('EMP-20 hace Puesto único (Pedidos Web), que es en exclusiva, y además Puesto único (Exposición LEGO) el jueves 26/11');
    expect(r[0]?.personaId).toBe('per-20');
  });
  it('un solo aviso por persona y día aunque haga varios puestos', () => {
    const ctx = contexto([
      puesto(JUEVES, pedidos, 'franja-pedidos-m', 'per-20'),
      puesto(JUEVES, lego, 'franja-lego-8', 'per-20'),
      puesto(JUEVES, lego, 'franja-lego-10', 'per-20'),
    ]);
    expect(definicion.evaluar(regla, ctx)).toHaveLength(1);
  });
  it('permite la excepción del domingo', () => {
    const ctx = contexto([puesto(DOMINGO, pedidos, 'franja-pedidos-m', 'per-20'), puesto(DOMINGO, lego, 'franja-lego-8', 'per-20')]);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
  });
  it('comprobar impide otro puesto en día de exclusiva, no en el de excepción', () => {
    const ctx = contexto([puesto(JUEVES, pedidos, 'franja-pedidos-m', 'per-20'), puesto(DOMINGO, pedidos, 'franja-pedidos-m', 'per-20')]);
    const jueves = definicion.comprobar(regla, ctx, puesto(JUEVES, lego, 'franja-lego-8', 'per-20'));
    expect(jueves.permitido).toBe(false);
    expect(jueves.motivos).toHaveLength(1);
    expect(definicion.comprobar(regla, ctx, puesto(DOMINGO, lego, 'franja-lego-8', 'per-20')).permitido).toBe(true);
    expect(definicion.comprobar(regla, ctx, puesto(JUEVES, lego, 'franja-lego-8', 'per-21')).permitido).toBe(true);
  });
});

// ───────────── Coherencia de `comprobar` con `evaluar` (oráculo: evaluar sin y con la candidata) ─────────────

function generadorAzar(semilla: number): () => number {
  let t = semilla >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function elegir<T>(rnd: () => number, lista: readonly T[]): T {
  return lista[Math.floor(rnd() * lista.length)] as T;
}

/** Estado aleatorio: `cuantas` asignaciones de puesto en huecos distintos; devuelve también los huecos libres. */
function estadoAleatorio(rnd: () => number, datos: DatosPlanificacion, cuantas: number, personas: readonly string[], fecha?: string, puestoId?: string) {
  const libres = crearIndice(datos, LUNES, []).huecos().filter((h) => (fecha === undefined || h.fecha === fecha) && (puestoId === undefined || h.puestoId === puestoId));
  const asignaciones: Asignacion[] = [];
  for (let i = 0; i < cuantas && libres.length > 0; i += 1) {
    const [h] = libres.splice(Math.floor(rnd() * libres.length), 1);
    if (!h) break;
    asignaciones.push(puesto(h.fecha, h.puestoId, h.franjaId, elegir(rnd, personas), h.plaza));
  }
  return { asignaciones, libres };
}

function pausaMin(fecha: string, personaId: string, inicio: number, fin: number): Asignacion {
  contador += 1;
  return { id: `q${contador}`, tipo: 'pausa', fecha, personaId, inicio, fin, bloqueada: false, origen: 'manual' };
}

const penal = (l: { penalizacion: number }[]) => l.reduce((s, i) => s + i.penalizacion, 0);

interface Config {
  datos: DatosPlanificacion;
  personas: readonly string[];
  /** Asignaciones de puesto del estado y número de estados. */
  cuantas: number;
  fecha?: string;
  /** Si se indica, solo huecos de ese puesto. */
  puestoId?: string;
  /** Asignaciones iniciales añadidas al estado (p. ej. pausas ya colocadas). */
  inicial?: (rnd: () => number) => Asignacion[];
  /** Candidatas extra (pausas) además de las de puesto; recibe el azar. */
  extra?: (rnd: () => number, libres: number) => Asignacion | null;
  /** Filtra los incumplimientos que no forman parte del criterio (p. ej. el (a) de comidas). */
  filtro?: (i: Incumplimiento) => boolean;
}

/** Comprueba `comprobar` contra el oráculo y devuelve cuántas candidatas se probaron, bloqueadas y con coste. */
function comprobarCoherencia(regla: ReglaGeneral<'exclusividadDiaria'>, config: Config, semilla: number) {
  const rnd = generadorAzar(semilla);
  const filtro = config.filtro ?? (() => true);
  let probadas = 0;
  let bloqueadas = 0;
  let conCoste = 0;
  for (let e = 0; e < 4; e += 1) {
    const sorteo = estadoAleatorio(rnd, config.datos, config.cuantas, config.personas, config.fecha, config.puestoId);
    const { libres } = sorteo;
    const asignaciones = [...sorteo.asignaciones, ...(config.inicial?.(rnd) ?? [])];
    const ctx = contexto(asignaciones, config.datos);
    const antes = definicion.evaluar(regla, ctx).filter(filtro);
    for (let k = 0; k < 10; k += 1) {
      const hueco = elegir(rnd, libres);
      const candidata =
        config.extra?.(rnd, libres.length) ?? puesto(hueco.fecha, hueco.puestoId, hueco.franjaId, elegir(rnd, config.personas), hueco.plaza);
      const despues = definicion.evaluar(regla, contexto([...asignaciones, candidata], config.datos)).filter(filtro);
      const r = definicion.comprobar(regla, ctx, candidata);
      probadas += 1;
      if (regla.dura) {
        expect(r.permitido).toBe(!despues.some((i) => i.dura && i.asignacionIds.includes(candidata.id)));
        expect(r.coste).toBe(0);
        if (!r.permitido) {
          bloqueadas += 1;
          expect(r.motivos.length).toBeGreaterThan(0);
        }
      } else {
        expect(r.permitido).toBe(true);
        expect(r.coste).toBe(Math.max(0, penal(despues) - penal(antes)));
        if (r.coste > 0) conCoste += 1;
      }
    }
  }
  return { probadas, bloqueadas, conCoste };
}

function pruebaVelocidad(regla: ReglaGeneral<'exclusividadDiaria'>, config: Config) {
  const rnd = generadorAzar(99);
  const { asignaciones, libres } = estadoAleatorio(rnd, config.datos, 150, config.personas, config.fecha, config.puestoId);
  const ctx = contexto(asignaciones, config.datos);
  const candidatas = libres.map((h) => config.extra?.(rnd, libres.length) ?? puesto(h.fecha, h.puestoId, h.franjaId, elegir(rnd, config.personas), h.plaza));
  const inicio = performance.now();
  for (let i = 0; i < 2000; i += 1) definicion.comprobar(regla, ctx, candidatas[i % candidatas.length] as Asignacion);
  return performance.now() - inicio;
}

describe('exclusividadDiaria · comprobar coherente con evaluar', () => {
  const datos = crearEstadoEjemplo();
  const config: Config = { datos, personas: ['per-01', 'per-02', 'per-03', 'per-04'], cuantas: 90 };
  const base = reglaDe('exclusividadDiaria');
  const sinExcepcion = { ...base, params: { ...base.params, diasExcepcion: [] } };
  const casos = [
    ['dura, con excepción del domingo', base],
    ['dura, sin excepciones', sinExcepcion],
    ['blanda (peso 3), con excepción del domingo', { ...base, dura: false, peso: 3 }],
    ['blanda (peso 3), sin excepciones', { ...sinExcepcion, dura: false, peso: 3 }],
  ] as const;
  for (const [nombre, regla] of casos) {
    it(`coincide con el oráculo: ${nombre}`, () => {
      const r = comprobarCoherencia(regla, config, 14);
      expect(r.probadas).toBeGreaterThanOrEqual(30);
      if (regla.dura) expect(r.bloqueadas).toBeGreaterThan(0);
      else expect(r.conCoste).toBeGreaterThan(0);
    });
  }
  it('bloquea aunque ese día ya incumpla otra combinación (el caso que el genérico dejaba pasar)', () => {
    const ctx = contexto([puesto(JUEVES, pedidos, 'franja-pedidos-1', 'per-01'), puesto(JUEVES, caja1, 'franja-caja-1', 'per-01')], datos);
    expect(definicion.comprobar(base, ctx, puesto(JUEVES, lego, 'franja-lego-1', 'per-01')).permitido).toBe(false);
  });
  it('hace 2000 comprobaciones con ~150 asignaciones en menos de 1 s', () => {
    expect(pruebaVelocidad(base, { ...config, cuantas: 150 })).toBeLessThan(1000);
  });
});
