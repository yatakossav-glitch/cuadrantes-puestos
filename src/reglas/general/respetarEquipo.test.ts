import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../../datos-ejemplo/ejemplo';
import { aMinutos } from '../../modelo/horas';
import type { Asignacion, DatosPlanificacion, ReglaGeneral, TipoReglaGeneral } from '../../modelo/tipos';
import { crearIndice } from '../../validacion/indice';
import type { ContextoEvaluacion, Incumplimiento } from '../contrato';
import type { DiaSemana } from '../../modelo/tipos';
import { definicion, metadatos } from './respetarEquipo';

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

describe('regla respetarEquipo', () => {
  const datos = crearEstadoEjemplo();
  const params = datos.reglas.find((r) => r.tipo === 'respetarEquipo')?.params as Parameters<typeof metadatos.describir>[0];

  it('describe los parámetros del ejemplo', () => {
    expect(metadatos.describir(params, datos)).toBe(
      'Cada persona trabaja en su equipo (mañana o tarde, corte a las 15:45); hasta 1 día a la semana al contrario, solo el domingo',
    );
  });
  it('describe sin días al contrario y sin restricción de días', () => {
    expect(metadatos.describir({ maxDiasContrarioSemana: 0, diasPermitidos: [] }, datos)).toContain('sin días al contrario');
    expect(metadatos.describir({ maxDiasContrarioSemana: 2, diasPermitidos: [] }, datos)).toContain('hasta 2 días');
  });
  it('redacta bien cualquier lista de días', () => {
    const f = (diasPermitidos: DiaSemana[]) => metadatos.describir({ maxDiasContrarioSemana: 1, diasPermitidos }, datos);
    expect(f([6])).toMatch(/, solo el domingo$/);
    expect(f([5, 6])).toMatch(/, solo en sábado y domingo$/);
    expect(f([0, 1, 2, 3, 4])).toMatch(/, solo de lunes a viernes$/);
    expect(f([0, 1, 2, 3, 4])).not.toContain('en de');
  });
  it('acepta ejemplo y valores por defecto', () => {
    expect(metadatos.validarParams(params, datos)).toEqual([]);
    expect(metadatos.validarParams(metadatos.paramsPorDefecto(datos), datos)).toEqual([]);
    expect(metadatos.paramsPorDefecto(datos)).toEqual({ maxDiasContrarioSemana: 1, diasPermitidos: [] });
  });
  it('rechaza casos inválidos', () => {
    expect(metadatos.validarParams({ maxDiasContrarioSemana: 8, diasPermitidos: [] }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ maxDiasContrarioSemana: -1, diasPermitidos: [] }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ maxDiasContrarioSemana: 1.5, diasPermitidos: [] }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ maxDiasContrarioSemana: 1, diasPermitidos: [9 as 0] }, datos)).toHaveLength(1);
  });
});

describe('respetarEquipo · evaluar y comprobar', () => {
  const regla = reglaDe('respetarEquipo');
  // per-01 es equipo M, per-02 equipo T, per-16 equipo A.
  const tarde = (fecha: string, persona: string) => puesto(fecha, lego, 'franja-lego-8', persona);
  const manana = (fecha: string, persona: string) => puesto(fecha, lego, 'franja-lego-1', persona);

  it('no avisa si trabaja en su turno', () => {
    const ctx = contexto([manana(JUEVES, 'per-01'), tarde(JUEVES, 'per-02')]);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
  });
  it('trata como mañana lo que empieza antes del corte de las 15:45', () => {
    const ctx = contexto([puesto(JUEVES, caja1, 'franja-caja-4', 'per-01'), puesto(VIERNES, caja1, 'franja-caja-5', 'per-02')]);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
  });
  it('avisa del día contrario que no está entre los permitidos', () => {
    const r = definicion.evaluar(regla, contexto([tarde(JUEVES, 'per-01')]));
    expect(r.map((x) => x.mensaje)).toEqual(['EMP-01 (equipo M) trabaja de tarde el jueves 26/11, un día en que no se permite']);
    const t = definicion.evaluar(regla, contexto([manana(JUEVES, 'per-02')]));
    expect(t.map((x) => x.mensaje)).toEqual(['EMP-02 (equipo T) trabaja de mañana el jueves 26/11, un día en que no se permite']);
  });
  it('permite un día contrario en domingo', () => {
    expect(definicion.evaluar(regla, contexto([tarde(DOMINGO, 'per-01'), manana(DOMINGO, 'per-02')]))).toEqual([]);
  });
  it('la persona de equipo A nunca es contraria', () => {
    const ctx = contexto([manana(JUEVES, 'per-16'), tarde(JUEVES, 'per-16'), tarde(VIERNES, 'per-16')]);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
  });
  it('con diasPermitidos vacío cuenta contra el máximo semanal, por orden de fecha', () => {
    const libre: ReglaGeneral<'respetarEquipo'> = { ...regla, params: { maxDiasContrarioSemana: 1, diasPermitidos: [] } };
    const ctx = contexto([tarde(VIERNES, 'per-01'), tarde(JUEVES, 'per-01')]);
    const r = definicion.evaluar(libre, ctx);
    expect(r.map((x) => x.mensaje)).toEqual(['EMP-01 (equipo M) trabaja de tarde el viernes 27/11, por encima del máximo de 1 día a la semana']);
  });
  it('con máximo 0 el día permitido también incumple', () => {
    const cero: ReglaGeneral<'respetarEquipo'> = { ...regla, params: { maxDiasContrarioSemana: 0, diasPermitidos: [6] } };
    const r = definicion.evaluar(cero, contexto([tarde(DOMINGO, 'per-01')]));
    expect(r.map((x) => x.mensaje)).toEqual(['EMP-01 (equipo M) trabaja de tarde el domingo 29/11, por encima del máximo de 0 días a la semana']);
  });
  it('varias franjas contrarias el mismo día son un solo día', () => {
    const libre: ReglaGeneral<'respetarEquipo'> = { ...regla, params: { maxDiasContrarioSemana: 1, diasPermitidos: [] } };
    const ctx = contexto([tarde(JUEVES, 'per-01'), puesto(JUEVES, lego, 'franja-lego-9', 'per-01')]);
    expect(definicion.evaluar(libre, ctx)).toEqual([]);
  });
  it('comprobar impide el día contrario no permitido y permite el del domingo', () => {
    const ctx = contexto([]);
    const jueves = definicion.comprobar(regla, ctx, tarde(JUEVES, 'per-01'));
    expect(jueves.permitido).toBe(false);
    expect(jueves.motivos).toHaveLength(1);
    expect(definicion.comprobar(regla, ctx, tarde(DOMINGO, 'per-01'))).toEqual({ permitido: true, coste: 0, motivos: [] });
    expect(definicion.comprobar(regla, ctx, manana(JUEVES, 'per-01')).permitido).toBe(true);
  });
});

describe('respetarEquipo · semana con horario de la plantilla', () => {
  const regla = reglaDe('respetarEquipo');
  const conHorario: DatosPlanificacion = {
    ...crearEstadoEjemplo(),
    horarios: { [LUNES]: { lunes: LUNES, actualizado: null, turnos: [{ personaId: 'per-01', fecha: JUEVES, tramos: [{ inicio: 16 * 60, fin: 21 * 60 }] }] } },
  };
  const tardeDe = (persona: string) => puesto(JUEVES, lego, 'franja-lego-8', persona);

  it('no se aplica a quien figura en el horario de la semana (evaluar y comprobar)', () => {
    const ctx = contexto([tardeDe('per-01')], conHorario);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
    expect(definicion.comprobar(regla, ctx, tardeDe('per-01'))).toEqual({ permitido: true, coste: 0, motivos: [] });
  });
  it('sigue aplicándose a quien no figura en el horario y en semanas sin horario', () => {
    const otra = contexto([tardeDe('per-03')], conHorario);
    expect(definicion.evaluar(regla, otra)).toHaveLength(1);
    expect(definicion.comprobar(regla, otra, tardeDe('per-03')).permitido).toBe(false);
    expect(definicion.evaluar(regla, contexto([tardeDe('per-01')]))).toHaveLength(1);
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
function comprobarCoherencia(regla: ReglaGeneral<'respetarEquipo'>, config: Config, semilla: number) {
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

function pruebaVelocidad(regla: ReglaGeneral<'respetarEquipo'>, config: Config) {
  const rnd = generadorAzar(99);
  const { asignaciones, libres } = estadoAleatorio(rnd, config.datos, 150, config.personas, config.fecha, config.puestoId);
  const ctx = contexto(asignaciones, config.datos);
  const candidatas = libres.map((h) => config.extra?.(rnd, libres.length) ?? puesto(h.fecha, h.puestoId, h.franjaId, elegir(rnd, config.personas), h.plaza));
  const inicio = performance.now();
  for (let i = 0; i < 2000; i += 1) definicion.comprobar(regla, ctx, candidatas[i % candidatas.length] as Asignacion);
  return performance.now() - inicio;
}

describe('respetarEquipo · comprobar coherente con evaluar', () => {
  const datos = crearEstadoEjemplo();
  // Mezcla de equipo M y T.
  const config: Config = { datos, personas: ['per-01', 'per-02', 'per-03', 'per-04', 'per-05', 'per-06'], cuantas: 80 };
  const base = reglaDe('respetarEquipo');
  const parametros = [
    { maxDiasContrarioSemana: 1, diasPermitidos: [6] as DiaSemana[] },
    { maxDiasContrarioSemana: 0, diasPermitidos: [] as DiaSemana[] },
    { maxDiasContrarioSemana: 2, diasPermitidos: [0, 1, 2, 3, 4, 5, 6] as DiaSemana[] },
  ];
  for (const [i, params] of parametros.entries()) {
    for (const dura of [true, false]) {
      it(`coincide con el oráculo: ${dura ? 'dura' : 'blanda (peso 3)'}, parámetros ${i + 1}`, () => {
        const regla = { ...base, params, dura, peso: dura ? 0 : 3 };
        const r = comprobarCoherencia(regla, config, 15 + i);
        expect(r.probadas).toBeGreaterThanOrEqual(30);
        if (dura) expect(r.bloqueadas).toBeGreaterThan(0);
        else expect(r.conCoste).toBeGreaterThan(0);
      });
    }
  }
  it('bloquea un segundo día contrario cuando el máximo es 1 y no permite ninguno más', () => {
    const regla = { ...base, params: { maxDiasContrarioSemana: 1, diasPermitidos: [] as DiaSemana[] } };
    // EMP-01 es del equipo M: una franja de tarde es contraria.
    const ctx = contexto([puesto(JUEVES, caja1, 'franja-caja-5', 'per-01')], datos);
    expect(definicion.comprobar(regla, ctx, puesto(VIERNES, caja1, 'franja-caja-5', 'per-01')).permitido).toBe(false);
    expect(definicion.comprobar(regla, ctx, puesto(VIERNES, caja1, 'franja-caja-1', 'per-01')).permitido).toBe(true);
    expect(definicion.comprobar(regla, ctx, puesto(JUEVES, caja2, 'franja-caja-4', 'per-01')).permitido).toBe(true);
  });
  it('hace 2000 comprobaciones con ~150 asignaciones en menos de 1 s', () => {
    expect(pruebaVelocidad(base, { ...config, cuantas: 150 })).toBeLessThan(1000);
  });
});
