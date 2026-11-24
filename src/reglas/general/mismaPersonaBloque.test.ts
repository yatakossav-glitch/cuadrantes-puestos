import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../../datos-ejemplo/ejemplo';
import { aMinutos } from '../../modelo/horas';
import type { Asignacion, DatosPlanificacion, ReglaGeneral, TipoReglaGeneral } from '../../modelo/tipos';
import { crearIndice } from '../../validacion/indice';
import type { ContextoEvaluacion, Incumplimiento } from '../contrato';
import type { Ambito } from '../../modelo/tipos';
import { definicion, metadatos } from './mismaPersonaBloque';

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

describe('regla mismaPersonaBloque', () => {
  const datos = crearEstadoEjemplo();
  const params = datos.reglas.find((r) => r.tipo === 'mismaPersonaBloque')?.params as { ambito: Ambito };

  it('describe los parámetros del ejemplo', () => {
    expect(metadatos.describir(params, datos)).toBe('Una misma persona cubre todo el bloque: Caja');
  });
  it('describe el ámbito vacío como todos los puestos', () => {
    expect(metadatos.describir(metadatos.paramsPorDefecto(datos), datos)).toBe('Una misma persona cubre todo el bloque: todos los puestos');
  });
  it('acepta ejemplo y valores por defecto', () => {
    expect(metadatos.validarParams(params, datos)).toEqual([]);
    expect(metadatos.validarParams(metadatos.paramsPorDefecto(datos), datos)).toEqual([]);
  });
  it('rechaza áreas y puestos que ya no existen', () => {
    expect(metadatos.validarParams({ ambito: { areaIds: ['nada'], puestoIds: [] } }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ ambito: { areaIds: [], puestoIds: ['nada'] } }, datos)).toHaveLength(1);
  });
});

describe('mismaPersonaBloque · evaluar y comprobar', () => {
  const regla = reglaDe('mismaPersonaBloque');

  it('no avisa si todo el bloque lo cubre la misma persona', () => {
    const ctx = contexto([puesto(JUEVES, caja1, 'franja-caja-1', 'per-07'), puesto(JUEVES, caja1, 'franja-caja-2', 'per-07')]);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
  });
  it('no avisa si solo hay una franja cubierta del bloque', () => {
    expect(definicion.evaluar(regla, contexto([puesto(JUEVES, caja1, 'franja-caja-1', 'per-07')]))).toEqual([]);
  });
  it('avisa si el bloque lo cubren dos personas', () => {
    const ctx = contexto([puesto(JUEVES, caja1, 'franja-caja-1', 'per-07'), puesto(JUEVES, caja1, 'franja-caja-2', 'per-08')]);
    const r = definicion.evaluar(regla, ctx);
    expect(r).toHaveLength(1);
    expect(r[0]?.mensaje).toBe('Caja 1 (Caja) el jueves 26/11 10:00–13:00 lo cubren EMP-07 y EMP-08 y debería ser una sola persona');
    expect(r[0]?.asignacionIds).toHaveLength(2);
    expect(r[0]?.fecha).toBe(JUEVES);
  });
  it('un aviso por bloque, no por franja', () => {
    const ctx = contexto([
      puesto(JUEVES, caja1, 'franja-caja-1', 'per-07'),
      puesto(JUEVES, caja1, 'franja-caja-2', 'per-08'),
      puesto(JUEVES, caja1, 'franja-caja-3', 'per-09'),
      puesto(JUEVES, caja1, 'franja-caja-4', 'per-10'),
    ]);
    expect(definicion.evaluar(regla, ctx)).toHaveLength(2);
  });
  it('ignora puestos fuera del ámbito', () => {
    const ctx = contexto([puesto(JUEVES, lego, 'franja-lego-1', 'per-07'), puesto(JUEVES, lego, 'franja-lego-2', 'per-08')]);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
  });
  it('comprobar impide cambiar de persona dentro del bloque', () => {
    const ctx = contexto([puesto(JUEVES, caja1, 'franja-caja-1', 'per-07')]);
    const otra = definicion.comprobar(regla, ctx, puesto(JUEVES, caja1, 'franja-caja-2', 'per-08'));
    expect(otra.permitido).toBe(false);
    expect(otra.motivos).toHaveLength(1);
    expect(definicion.comprobar(regla, ctx, puesto(JUEVES, caja1, 'franja-caja-2', 'per-07'))).toEqual({ permitido: true, coste: 0, motivos: [] });
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
function comprobarCoherencia(regla: ReglaGeneral<'mismaPersonaBloque'>, config: Config, semilla: number) {
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

function pruebaVelocidad(regla: ReglaGeneral<'mismaPersonaBloque'>, config: Config) {
  const rnd = generadorAzar(99);
  const { asignaciones, libres } = estadoAleatorio(rnd, config.datos, 150, config.personas, config.fecha, config.puestoId);
  const ctx = contexto(asignaciones, config.datos);
  const candidatas = libres.map((h) => config.extra?.(rnd, libres.length) ?? puesto(h.fecha, h.puestoId, h.franjaId, elegir(rnd, config.personas), h.plaza));
  const inicio = performance.now();
  for (let i = 0; i < 2000; i += 1) definicion.comprobar(regla, ctx, candidatas[i % candidatas.length] as Asignacion);
  return performance.now() - inicio;
}

describe('mismaPersonaBloque · comprobar coherente con evaluar', () => {
  const datos = crearEstadoEjemplo();
  const config: Config = { datos, personas: ['per-01', 'per-02', 'per-03'], cuantas: 100 };
  const base = reglaDe('mismaPersonaBloque');
  const todos = { ...base, params: { ambito: { areaIds: [], puestoIds: [] } } };
  const casos = [
    ['dura, ámbito del ejemplo', base],
    ['dura, todos los puestos', todos],
    ['blanda (peso 3), ámbito del ejemplo', { ...base, dura: false, peso: 3 }],
    ['blanda (peso 3), todos los puestos', { ...todos, dura: false, peso: 3 }],
  ] as const;
  for (const [nombre, regla] of casos) {
    it(`coincide con el oráculo: ${nombre}`, () => {
      const r = comprobarCoherencia(regla, config, 12);
      expect(r.probadas).toBeGreaterThanOrEqual(30);
      if (regla.dura) expect(r.bloqueadas).toBeGreaterThan(0);
      else expect(r.conCoste).toBeGreaterThan(0);
    });
  }
  it('bloquea a otra persona en un bloque que ya tiene a alguien en su plaza', () => {
    const ctx = contexto([puesto(JUEVES, caja1, 'franja-caja-1', 'per-01')], datos);
    expect(definicion.comprobar(base, ctx, puesto(JUEVES, caja1, 'franja-caja-2', 'per-02')).permitido).toBe(false);
    expect(definicion.comprobar(base, ctx, puesto(JUEVES, caja1, 'franja-caja-2', 'per-01')).permitido).toBe(true);
    expect(definicion.comprobar(base, ctx, puesto(JUEVES, caja1, 'franja-caja-2', 'per-02', 1)).permitido).toBe(true);
  });
  it('hace 2000 comprobaciones con ~150 asignaciones en menos de 1 s', () => {
    expect(pruebaVelocidad(todos, config)).toBeLessThan(1000);
  });
});
