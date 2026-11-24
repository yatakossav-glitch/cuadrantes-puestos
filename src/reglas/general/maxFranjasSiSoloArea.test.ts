import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, crearEstadoVacio, IDS_EJEMPLO } from '../../datos-ejemplo/ejemplo';
import { aMinutos } from '../../modelo/horas';
import type { Asignacion, DatosPlanificacion, ReglaGeneral, TipoReglaGeneral } from '../../modelo/tipos';
import { crearIndice } from '../../validacion/indice';
import type { ContextoEvaluacion, Incumplimiento } from '../contrato';
import { definicion, metadatos } from './maxFranjasSiSoloArea';

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

describe('regla maxFranjasSiSoloArea', () => {
  const datos = crearEstadoEjemplo();
  const params = datos.reglas.find((r) => r.tipo === 'maxFranjasSiSoloArea')?.params as Parameters<typeof metadatos.describir>[0];

  it('describe los parámetros del ejemplo', () => {
    expect(metadatos.describir(params, datos)).toBe('Si un día solo trabaja en Exposición LEGO, máximo 1 franja');
    expect(metadatos.describir({ areaId: 'x', maxFranjas: 2 }, datos)).toBe('Si un día solo trabaja en área desconocida, máximo 2 franjas');
  });
  it('acepta ejemplo y valores por defecto', () => {
    expect(metadatos.validarParams(params, datos)).toEqual([]);
    const defecto = metadatos.paramsPorDefecto(datos);
    expect(defecto.areaId).toBe(IDS_EJEMPLO.areas.pedidos);
    expect(metadatos.validarParams(defecto, datos)).toEqual([]);
    expect(metadatos.validarParams(metadatos.paramsPorDefecto(crearEstadoVacio()), crearEstadoVacio())).toHaveLength(1);
  });
  it('rechaza casos inválidos', () => {
    expect(metadatos.validarParams({ areaId: 'nada', maxFranjas: 1 }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ areaId: IDS_EJEMPLO.areas.lego, maxFranjas: 0 }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ areaId: IDS_EJEMPLO.areas.lego, maxFranjas: 1.5 }, datos)).toHaveLength(1);
  });
});

describe('maxFranjasSiSoloArea · evaluar y comprobar', () => {
  const regla = reglaDe('maxFranjasSiSoloArea');

  it('no avisa con una sola franja', () => {
    expect(definicion.evaluar(regla, contexto([puesto(JUEVES, lego, 'franja-lego-1', 'per-25')]))).toEqual([]);
  });
  it('avisa si solo trabaja en el área y hace más franjas que el máximo', () => {
    const ctx = contexto([puesto(JUEVES, lego, 'franja-lego-1', 'per-25'), puesto(JUEVES, lego, 'franja-lego-3', 'per-25')]);
    const r = definicion.evaluar(regla, ctx);
    expect(r).toHaveLength(1);
    expect(r[0]?.mensaje).toBe('EMP-25 hace 2 franjas solo en Exposición LEGO el jueves 26/11 (máximo 1)');
    expect(r[0]?.dura).toBe(false);
    expect(r[0]?.penalizacion).toBe(10);
  });
  it('no avisa si ese día también trabaja en otra área', () => {
    const ctx = contexto([
      puesto(JUEVES, lego, 'franja-lego-1', 'per-07'),
      puesto(JUEVES, lego, 'franja-lego-3', 'per-07'),
      puesto(JUEVES, caja1, 'franja-caja-8', 'per-07'),
    ]);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
  });
  it('no avisa si el día es de otra área', () => {
    const ctx = contexto([puesto(JUEVES, caja1, 'franja-caja-1', 'per-07'), puesto(JUEVES, caja1, 'franja-caja-2', 'per-07')]);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
  });
  it('cuenta cada día por separado', () => {
    const ctx = contexto([puesto(JUEVES, lego, 'franja-lego-1', 'per-25'), puesto(VIERNES, lego, 'franja-lego-1', 'per-25')]);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
  });
  it('comprobar cuesta el peso al pasar del máximo y permite siendo blanda', () => {
    const ctx = contexto([puesto(JUEVES, lego, 'franja-lego-1', 'per-25')]);
    const c = definicion.comprobar(regla, ctx, puesto(JUEVES, lego, 'franja-lego-3', 'per-25'));
    expect(c.permitido).toBe(true);
    expect(c.coste).toBe(10);
    expect(c.motivos).toHaveLength(1);
    expect(definicion.comprobar(regla, ctx, puesto(JUEVES, caja1, 'franja-caja-8', 'per-25')).coste).toBe(0);
  });
  it('comprobar prohíbe si la regla es dura', () => {
    const dura = { ...regla, dura: true, peso: 0 };
    const ctx = contexto([puesto(JUEVES, lego, 'franja-lego-1', 'per-25')]);
    expect(definicion.comprobar(dura, ctx, puesto(JUEVES, lego, 'franja-lego-3', 'per-25')).permitido).toBe(false);
  });
  it('ignora asignaciones de un puesto cerrado por incidencia', () => {
    const d = crearEstadoEjemplo();
    d.incidencias.push({ id: 'inc', tipo: 'puestoCerrado', puestoId: lego, desde: JUEVES, hasta: JUEVES, nota: '' });
    const ctx = contexto([puesto(JUEVES, lego, 'franja-lego-1', 'per-25'), puesto(JUEVES, lego, 'franja-lego-3', 'per-25')], d);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
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
function comprobarCoherencia(regla: ReglaGeneral<'maxFranjasSiSoloArea'>, config: Config, semilla: number) {
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

function pruebaVelocidad(regla: ReglaGeneral<'maxFranjasSiSoloArea'>, config: Config) {
  const rnd = generadorAzar(99);
  const { asignaciones, libres } = estadoAleatorio(rnd, config.datos, 150, config.personas, config.fecha, config.puestoId);
  const ctx = contexto(asignaciones, config.datos);
  const candidatas = libres.map((h) => config.extra?.(rnd, libres.length) ?? puesto(h.fecha, h.puestoId, h.franjaId, elegir(rnd, config.personas), h.plaza));
  const inicio = performance.now();
  for (let i = 0; i < 2000; i += 1) definicion.comprobar(regla, ctx, candidatas[i % candidatas.length] as Asignacion);
  return performance.now() - inicio;
}

describe('maxFranjasSiSoloArea · comprobar coherente con evaluar', () => {
  const datos = crearEstadoEjemplo();
  const config: Config = { datos, personas: ['per-01', 'per-02', 'per-03', 'per-04'], cuantas: 90 };
  const base = reglaDe('maxFranjasSiSoloArea');
  const casos = [
    ['dura, LEGO máximo 1', { ...base, dura: true, peso: 0 }],
    ['dura, Caja máximo 2', { ...base, dura: true, peso: 0, params: { areaId: IDS_EJEMPLO.areas.caja, maxFranjas: 2 } }],
    ['blanda (peso 3), LEGO máximo 1', { ...base, dura: false, peso: 3 }],
    ['blanda (peso 3), Caja máximo 2', { ...base, dura: false, peso: 3, params: { areaId: IDS_EJEMPLO.areas.caja, maxFranjas: 2 } }],
  ] as const;
  for (const [nombre, regla] of casos) {
    it(`coincide con el oráculo: ${nombre}`, () => {
      const r = comprobarCoherencia(regla, regla.params.areaId === IDS_EJEMPLO.areas.lego ? { ...config, puestoId: lego, cuantas: 18 } : config, 16);
      expect(r.probadas).toBeGreaterThanOrEqual(30);
      if (regla.dura) expect(r.bloqueadas).toBeGreaterThan(0);
      else expect(r.conCoste).toBeGreaterThan(0);
    });
  }
  it('hace 2000 comprobaciones con ~150 asignaciones en menos de 1 s', () => {
    expect(pruebaVelocidad(base, { ...config, cuantas: 150 })).toBeLessThan(1000);
  });
});
