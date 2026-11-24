import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../../datos-ejemplo/ejemplo';
import { aMinutos } from '../../modelo/horas';
import type { Asignacion, DatosPlanificacion, ReglaGeneral, TipoReglaGeneral } from '../../modelo/tipos';
import { crearIndice } from '../../validacion/indice';
import type { ContextoEvaluacion, Incumplimiento } from '../contrato';
import { definicion, metadatos } from './repartoEquitativo';

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

describe('regla repartoEquitativo', () => {
  const datos = crearEstadoEjemplo();
  const regla = datos.reglas.find((r) => r.tipo === 'repartoEquitativo');

  it('describe la regla del ejemplo', () => {
    expect(regla).toBeDefined();
    expect(metadatos.describir({}, datos)).toBe('Repartir la cobertura de forma equitativa según el objetivo de cada persona');
  });

  it('no tiene parámetros y siempre es válida', () => {
    expect(metadatos.validarParams({}, datos)).toEqual([]);
    expect(metadatos.validarParams(metadatos.paramsPorDefecto(datos), datos)).toEqual([]);
    expect(metadatos.campos).toEqual([]);
  });
});

describe('repartoEquitativo · evaluar y comprobar', () => {
  const regla = reglaDe('repartoEquitativo');
  /** Ejemplo con objetivo semanal para EMP-07. */
  function conObjetivo(minutos: number): DatosPlanificacion {
    const datos = structuredClone(datosEjemplo);
    const persona = datos.personas.find((p) => p.id === 'per-07');
    if (persona) persona.objetivoCoberturaMinSemana = minutos;
    return datos;
  }
  // Dos franjas de Caja 1 = 3 h.
  const tresHoras = [puesto(JUEVES, caja1, 'franja-caja-1', 'per-07'), puesto(JUEVES, caja1, 'franja-caja-2', 'per-07')];

  it('no avisa a nadie sin objetivo', () => {
    expect(definicion.evaluar(regla, contexto(tresHoras))).toEqual([]);
  });
  it('no avisa si cumple exactamente el objetivo', () => {
    expect(definicion.evaluar(regla, contexto(tresHoras, conObjetivo(180)))).toEqual([]);
  });
  it('avisa por defecto con una penalización por cada 15 min', () => {
    const r = definicion.evaluar(regla, contexto(tresHoras, conObjetivo(240)));
    expect(r).toHaveLength(1);
    expect(r[0]?.mensaje).toBe('EMP-07 cubre 3h esta semana y su objetivo es 4h (1h menos)');
    expect(r[0]?.penalizacion).toBe(4);
    expect(r[0]?.personaId).toBe('per-07');
  });
  it('avisa también por exceso y redondea hacia arriba', () => {
    const exceso = definicion.evaluar(regla, contexto(tresHoras, conObjetivo(120)));
    expect(exceso[0]?.mensaje).toBe('EMP-07 cubre 3h esta semana y su objetivo es 2h (1h más)');
    expect(exceso[0]?.penalizacion).toBe(4);
    const poco = definicion.evaluar(regla, contexto(tresHoras, conObjetivo(170)));
    expect(poco[0]?.mensaje).toContain('(10 min más)');
    expect(poco[0]?.penalizacion).toBe(1);
  });
  it('avisa a quien tiene objetivo y no tiene asignaciones', () => {
    const r = definicion.evaluar(regla, contexto([], conObjetivo(60)));
    expect(r.map((x) => x.mensaje)).toEqual(['EMP-07 cubre 0 min esta semana y su objetivo es 1h (1h menos)']);
    expect(r[0]?.penalizacion).toBe(4);
  });
  it('comprobar nunca bloquea y cobra solo si se aleja del objetivo', () => {
    const datos = conObjetivo(90);
    const ctxVacio = contexto([], datos);
    // Acercarse al objetivo no cuesta.
    const acerca = definicion.comprobar(regla, ctxVacio, puesto(JUEVES, caja1, 'franja-caja-1', 'per-07'));
    expect(acerca).toEqual({ permitido: true, coste: 0, motivos: [] });
    // Pasarse de 90 min a 180 min cuesta 6 unidades de 15 min.
    const ctx = contexto([puesto(JUEVES, caja1, 'franja-caja-1', 'per-07')], datos);
    const pasa = definicion.comprobar(regla, ctx, puesto(JUEVES, caja1, 'franja-caja-2', 'per-07'));
    expect(pasa.permitido).toBe(true);
    expect(pasa.coste).toBe(6);
    expect(pasa.motivos).toHaveLength(1);
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
function comprobarCoherencia(regla: ReglaGeneral<'repartoEquitativo'>, config: Config, semilla: number) {
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

function pruebaVelocidad(regla: ReglaGeneral<'repartoEquitativo'>, config: Config) {
  const rnd = generadorAzar(99);
  const { asignaciones, libres } = estadoAleatorio(rnd, config.datos, 150, config.personas, config.fecha, config.puestoId);
  const ctx = contexto(asignaciones, config.datos);
  const candidatas = libres.map((h) => config.extra?.(rnd, libres.length) ?? puesto(h.fecha, h.puestoId, h.franjaId, elegir(rnd, config.personas), h.plaza));
  const inicio = performance.now();
  for (let i = 0; i < 2000; i += 1) definicion.comprobar(regla, ctx, candidatas[i % candidatas.length] as Asignacion);
  return performance.now() - inicio;
}

describe('repartoEquitativo · comprobar coherente con evaluar', () => {
  const datos = crearEstadoEjemplo();
  const personas = ['per-01', 'per-02', 'per-03', 'per-04'];
  // Objetivos ficticios, algunos no múltiplos de 15 min; EMP-04 sin objetivo.
  const objetivos = [300, 305, 130, null];
  personas.forEach((id, i) => {
    const p = datos.personas.find((x) => x.id === id);
    if (p) p.objetivoCoberturaMinSemana = objetivos[i] ?? null;
  });
  const config: Config = { datos, personas, cuantas: 40 };
  const base = reglaDe('repartoEquitativo');
  it('coste exacto frente al oráculo (blanda, peso 3)', () => {
    const r = comprobarCoherencia({ ...base, dura: false, peso: 3 }, config, 18);
    expect(r.probadas).toBeGreaterThanOrEqual(30);
    expect(r.conCoste).toBeGreaterThan(0);
  });
  it('nunca bloquea ni cuesta si es dura', () => {
    const r = comprobarCoherencia({ ...base, dura: true, peso: 0 }, config, 19);
    expect(r.probadas).toBeGreaterThanOrEqual(30);
    expect(r.bloqueadas).toBe(0);
  });
  it('hace 2000 comprobaciones con ~150 asignaciones en menos de 1 s', () => {
    expect(pruebaVelocidad({ ...base, dura: false, peso: 3 }, { ...config, cuantas: 150 })).toBeLessThan(1000);
  });
});
