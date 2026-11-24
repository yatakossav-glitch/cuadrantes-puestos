import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../../datos-ejemplo/ejemplo';
import { aMinutos } from '../../modelo/horas';
import type { Asignacion, DatosPlanificacion, ReglaGeneral, TipoReglaGeneral } from '../../modelo/tipos';
import { crearIndice } from '../../validacion/indice';
import type { ContextoEvaluacion, Incumplimiento } from '../contrato';
import type { Ambito } from '../../modelo/tipos';
import { definicion, metadatos } from './rotarEntreBloques';

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

describe('regla rotarEntreBloques', () => {
  const datos = crearEstadoEjemplo();
  const params = datos.reglas.find((r) => r.tipo === 'rotarEntreBloques')?.params as { ambito: Ambito };

  it('describe los parámetros del ejemplo', () => {
    expect(metadatos.describir(params, datos)).toBe('Cambiar de persona entre bloques seguidos: Caja');
  });
  it('describe el ámbito vacío como todos los puestos', () => {
    expect(metadatos.describir(metadatos.paramsPorDefecto(datos), datos)).toBe('Cambiar de persona entre bloques seguidos: todos los puestos');
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

describe('rotarEntreBloques · evaluar y comprobar', () => {
  const regla = reglaDe('rotarEntreBloques');
  const bloque = (puestoId: string, f1: number, f2: number, persona: string) => [
    puesto(JUEVES, puestoId, `franja-caja-${f1}`, persona),
    puesto(JUEVES, puestoId, `franja-caja-${f2}`, persona),
  ];

  it('avisa cuando la misma pareja repite en el bloque siguiente', () => {
    const ctx = contexto([
      ...bloque(caja1, 1, 2, 'per-03'), ...bloque(caja2, 1, 2, 'per-07'),
      ...bloque(caja1, 3, 4, 'per-07'), ...bloque(caja2, 3, 4, 'per-03'),
    ]);
    const r = definicion.evaluar(regla, ctx);
    expect(r).toHaveLength(1);
    expect(r[0]?.mensaje).toBe('La pareja EMP-03 y EMP-07 repite en Caja el jueves 26/11 13:00–15:45');
    expect(r[0]?.dura).toBe(false);
    expect(r[0]?.penalizacion).toBe(5);
  });
  it('no avisa si la pareja cambia', () => {
    const ctx = contexto([
      ...bloque(caja1, 1, 2, 'per-03'), ...bloque(caja2, 1, 2, 'per-07'),
      ...bloque(caja1, 3, 4, 'per-07'), ...bloque(caja2, 3, 4, 'per-09'),
    ]);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
  });
  it('avisa también si una sola persona repite', () => {
    const ctx = contexto([
      ...bloque(caja1, 1, 2, 'per-03'), ...bloque(caja2, 1, 2, 'per-03'),
      ...bloque(caja1, 3, 4, 'per-03'), ...bloque(caja2, 3, 4, 'per-03'),
    ]);
    const r = definicion.evaluar(regla, ctx);
    expect(r.map((x) => x.mensaje)).toEqual(['EMP-03 repite en Caja el jueves 26/11 13:00–15:45']);
  });
  it('no compara bloques de días distintos', () => {
    const ctx = contexto([
      ...bloque(caja1, 1, 2, 'per-03'),
      puesto(VIERNES, caja1, 'franja-caja-3', 'per-03'),
      puesto(VIERNES, caja1, 'franja-caja-4', 'per-03'),
    ]);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
  });
  it('ignora puestos fuera del ámbito', () => {
    const ctx = contexto([puesto(JUEVES, lego, 'franja-lego-1', 'per-03'), puesto(JUEVES, lego, 'franja-lego-7', 'per-03')]);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
  });
  it('comprobar permite pero cuesta cuando la candidata hace repetir la pareja', () => {
    const base = [
      ...bloque(caja1, 1, 2, 'per-03'), ...bloque(caja2, 1, 2, 'per-07'),
      ...bloque(caja1, 3, 4, 'per-07'), puesto(JUEVES, caja2, 'franja-caja-4', 'per-03'),
    ];
    const ctx = contexto(base);
    const repite = definicion.comprobar(regla, ctx, puesto(JUEVES, caja2, 'franja-caja-3', 'per-03'));
    expect(repite.permitido).toBe(true);
    expect(repite.coste).toBe(5);
    expect(repite.motivos).toHaveLength(1);
    const cambia = definicion.comprobar(regla, ctx, puesto(JUEVES, caja2, 'franja-caja-3', 'per-09'));
    expect(cambia).toEqual({ permitido: true, coste: 0, motivos: [] });
  });
  it('con grupos a medio llenar no avisa', () => {
    // Falta la mitad del segundo grupo: aún no se sabe quién repetirá.
    const ctx = contexto([...bloque(caja1, 1, 2, 'per-03'), ...bloque(caja2, 1, 2, 'per-07'), ...bloque(caja1, 3, 4, 'per-07')]);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
    const primeroIncompleto = contexto([...bloque(caja1, 1, 2, 'per-03'), ...bloque(caja1, 3, 4, 'per-03'), ...bloque(caja2, 3, 4, 'per-03')]);
    expect(definicion.evaluar(regla, primeroIncompleto)).toEqual([]);
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
function comprobarCoherencia(regla: ReglaGeneral<'rotarEntreBloques'>, config: Config, semilla: number) {
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

function pruebaVelocidad(regla: ReglaGeneral<'rotarEntreBloques'>, config: Config) {
  const rnd = generadorAzar(99);
  const { asignaciones, libres } = estadoAleatorio(rnd, config.datos, 150, config.personas, config.fecha, config.puestoId);
  const ctx = contexto(asignaciones, config.datos);
  const candidatas = libres.map((h) => config.extra?.(rnd, libres.length) ?? puesto(h.fecha, h.puestoId, h.franjaId, elegir(rnd, config.personas), h.plaza));
  const inicio = performance.now();
  for (let i = 0; i < 2000; i += 1) definicion.comprobar(regla, ctx, candidatas[i % candidatas.length] as Asignacion);
  return performance.now() - inicio;
}

describe('rotarEntreBloques · comprobar coherente con evaluar', () => {
  const datos = crearEstadoEjemplo();
  const base = reglaDe('rotarEntreBloques');
  const todos = { ...base, params: { ambito: { areaIds: [], puestoIds: [] } } };
  // Casi todo cubierto y con pocas personas: así hay grupos completos que se repiten.
  const configs: Config[] = [
    { datos, personas: ['per-01', 'per-02'], cuantas: 190 },
    { datos, personas: ['per-01', 'per-02', 'per-03'], cuantas: 195 },
  ];
  const casos = [
    ['dura, ámbito del ejemplo', { ...base, dura: true, peso: 0 }],
    ['dura, todos los puestos', { ...todos, dura: true, peso: 0 }],
    ['blanda (peso 3), ámbito del ejemplo', { ...base, dura: false, peso: 3 }],
    ['blanda (peso 3), todos los puestos', { ...todos, dura: false, peso: 3 }],
  ] as const;
  for (const [nombre, regla] of casos) {
    it(`coincide con el oráculo: ${nombre}`, () => {
      let probadas = 0;
      let efecto = 0;
      for (const [i, config] of configs.entries()) {
        const r = comprobarCoherencia(regla, config, 13 + i);
        probadas += r.probadas;
        efecto += r.bloqueadas + r.conCoste;
      }
      expect(probadas).toBeGreaterThanOrEqual(30);
      expect(efecto).toBeGreaterThan(0);
    });
  }
  it('hace 2000 comprobaciones con ~150 asignaciones en menos de 1 s', () => {
    expect(pruebaVelocidad(todos, { datos, personas: ['per-01', 'per-02', 'per-03'], cuantas: 150 })).toBeLessThan(1000);
  });
});
