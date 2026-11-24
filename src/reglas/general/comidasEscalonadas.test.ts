import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../../datos-ejemplo/ejemplo';
import { aMinutos } from '../../modelo/horas';
import type { Asignacion, DatosPlanificacion, ReglaGeneral, TipoReglaGeneral } from '../../modelo/tipos';
import { crearIndice } from '../../validacion/indice';
import type { ContextoEvaluacion, Incumplimiento } from '../contrato';
import { definicion, metadatos } from './comidasEscalonadas';

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

describe('regla comidasEscalonadas', () => {
  const datos = crearEstadoEjemplo();
  const params = datos.reglas.find((r) => r.tipo === 'comidasEscalonadas')?.params as Parameters<typeof metadatos.describir>[0];
  const valida = () => structuredClone(params);

  it('describe los parámetros del ejemplo', () => {
    expect(metadatos.describir(params, datos)).toBe(
      'Domingo: comida de 1h para jornadas de más de 8h, entre 14:00–15:00 (máx. 4), 15:00–16:00 (máx. 4) y 16:00–17:00 (máx. 3)',
    );
  });
  it('acepta ejemplo y valores por defecto, que coinciden con el ejemplo', () => {
    expect(metadatos.validarParams(params, datos)).toEqual([]);
    const defecto = metadatos.paramsPorDefecto(datos);
    expect(defecto).toEqual(params);
    expect(metadatos.validarParams(defecto, datos)).toEqual([]);
  });
  it('rechaza casos inválidos', () => {
    expect(metadatos.validarParams({ ...valida(), dias: [] }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ ...valida(), dias: [8 as 0] }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ ...valida(), umbralJornadaMin: 0 }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ ...valida(), duracionMin: 0 }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ ...valida(), franjas: [] }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ ...valida(), franjas: [{ inicio: 900, fin: 840, maxPersonas: 2 }] }, datos).length).toBeGreaterThan(0);
    expect(metadatos.validarParams({ ...valida(), franjas: [{ inicio: 840, fin: 900, maxPersonas: 0 }] }, datos)).toHaveLength(1);
    const solapadas = [{ inicio: 840, fin: 930, maxPersonas: 2 }, { inicio: 900, fin: 990, maxPersonas: 2 }];
    expect(metadatos.validarParams({ ...valida(), franjas: solapadas }, datos)).toHaveLength(1);
    expect(metadatos.validarParams({ ...valida(), duracionMin: 90 }, datos)).toHaveLength(1);
  });
});

describe('comidasEscalonadas · evaluar y comprobar', () => {
  const regla = reglaDe('comidasEscalonadas');
  // EMP-25 de 10:00 a 22:00 (12 h) el día indicado.
  const jornadaLarga = (fecha: string) => [
    puesto(fecha, lego, 'franja-lego-1', 'per-25'),
    puesto(fecha, lego, 'franja-lego-11', 'per-25'),
  ];

  it('(a) avisa de la jornada larga sin pausa', () => {
    const r = definicion.evaluar(regla, contexto(jornadaLarga(DOMINGO)));
    expect(r).toHaveLength(1);
    expect(r[0]?.mensaje).toBe('EMP-25 trabaja 10:00–22:00 el domingo 29/11 y no tiene una pausa de 60 min para comer en las franjas de comida');
    expect(r[0]?.marca).toBe('aviso');
    expect(r[0]?.personaId).toBe('per-25');
  });
  it('(a) no avisa con pausa válida ni con jornada hasta el umbral', () => {
    expect(definicion.evaluar(regla, contexto([...jornadaLarga(DOMINGO), pausa(DOMINGO, 'per-25', '14:00', '15:00')]))).toEqual([]);
    // Caja 1 de 10:00 a 17:20 son 7h20, por debajo de 8 h.
    const corta = [puesto(DOMINGO, caja1, 'franja-caja-1', 'per-07'), puesto(DOMINGO, caja1, 'franja-caja-5', 'per-07')];
    expect(definicion.evaluar(regla, contexto(corta))).toEqual([]);
  });
  it('(a) acepta una pausa más larga que la mínima si cabe en una franja', () => {
    expect(definicion.evaluar(regla, contexto([...jornadaLarga(DOMINGO), pausa(DOMINGO, 'per-25', '16:00', '17:00')]))).toEqual([]);
  });
  it('(b) marca como comida sin turno la pausa de quien no trabaja', () => {
    const r = definicion.evaluar(regla, contexto([pausa(DOMINGO, 'per-26', '14:00', '15:00')]));
    expect(r).toHaveLength(1);
    expect(r[0]?.mensaje).toBe('EMP-26 tiene una pausa de comida el domingo 29/11 14:00–15:00 pero no trabaja ese día');
    expect(r[0]?.marca).toBe('comidaSinTurno');
    expect(r[0]?.personaId).toBe('per-26');
  });
  it('(c) avisa de la pausa fuera de toda franja de comida', () => {
    const r = definicion.evaluar(regla, contexto([...jornadaLarga(DOMINGO), pausa(DOMINGO, 'per-25', '12:00', '13:00')]));
    const mensajes = r.map((x) => x.mensaje);
    expect(mensajes).toContain('La pausa de EMP-25 el domingo 29/11 12:00–13:00 no cumple: debe durar al menos 60 min y estar dentro de una franja de comida');
    expect(r).toHaveLength(2); // también (a): sin pausa válida
  });
  it('(c) avisa de la pausa más corta que la duración mínima', () => {
    const r = definicion.evaluar(regla, contexto([...jornadaLarga(DOMINGO), pausa(DOMINGO, 'per-25', '14:00', '14:30')]));
    expect(r.map((x) => x.mensaje).some((m) => m.startsWith('La pausa de EMP-25 el domingo 29/11 14:00–14:30 no cumple'))).toBe(true);
  });
  it('(d) avisa si la franja de comida supera su máximo de personas', () => {
    const personas = ['per-25', 'per-26', 'per-27', 'per-28', 'per-29'];
    const trabajo = personas.map((p, i) => puesto(DOMINGO, lego, `franja-lego-${i + 1}`, p));
    const pausas = personas.map((p) => pausa(DOMINGO, p, '14:00', '15:00'));
    const cinco = definicion.evaluar(regla, contexto([...trabajo, ...pausas]));
    expect(cinco.map((x) => x.mensaje)).toEqual(['Hay 5 personas comiendo el domingo 29/11 14:00–15:00 y el máximo es 4']);
    expect(cinco[0]?.asignacionIds).toHaveLength(5);
    const cuatro = definicion.evaluar(regla, contexto([...trabajo.slice(0, 4), ...pausas.slice(0, 4)]));
    expect(cuatro).toEqual([]);
  });
  it('solo se aplica en sus días', () => {
    const ctx = contexto([...jornadaLarga(JUEVES), pausa(JUEVES, 'per-26', '12:00', '12:10')]);
    expect(definicion.evaluar(regla, ctx)).toEqual([]);
  });
  it('comprobar no bloquea la jornada larga sin comida (criterio a) pero sí la pausa sin turno', () => {
    const ctx = contexto([puesto(DOMINGO, lego, 'franja-lego-1', 'per-25')]);
    const larga = definicion.comprobar(regla, ctx, puesto(DOMINGO, lego, 'franja-lego-11', 'per-25'));
    expect(larga).toEqual({ permitido: true, coste: 0, motivos: [] });
    // evaluar sigue avisando de esa jornada larga.
    expect(definicion.evaluar(regla, contexto([...ctx.indice.asignaciones(), puesto(DOMINGO, lego, 'franja-lego-11', 'per-25')]))).toHaveLength(1);
    const sinTurno = definicion.comprobar(regla, contexto([]), pausa(DOMINGO, 'per-26', '14:00', '15:00'));
    expect(sinTurno.permitido).toBe(false);
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
function comprobarCoherencia(regla: ReglaGeneral<'comidasEscalonadas'>, config: Config, semilla: number) {
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

function pruebaVelocidad(regla: ReglaGeneral<'comidasEscalonadas'>, config: Config) {
  const rnd = generadorAzar(99);
  const { asignaciones, libres } = estadoAleatorio(rnd, config.datos, 150, config.personas, config.fecha, config.puestoId);
  const ctx = contexto(asignaciones, config.datos);
  const candidatas = libres.map((h) => config.extra?.(rnd, libres.length) ?? puesto(h.fecha, h.puestoId, h.franjaId, elegir(rnd, config.personas), h.plaza));
  const inicio = performance.now();
  for (let i = 0; i < 2000; i += 1) definicion.comprobar(regla, ctx, candidatas[i % candidatas.length] as Asignacion);
  return performance.now() - inicio;
}

describe('comidasEscalonadas · comprobar coherente con evaluar (sin el criterio (a))', () => {
  const datos = crearEstadoEjemplo();
  const base = reglaDe('comidasEscalonadas');
  const estrecha = { ...base, params: { ...base.params, franjas: base.params.franjas.map((f) => ({ ...f, maxPersonas: 1 })) } };
  // Hay trabajadoras en el domingo (EMP-01…06) y otras que no (EMP-07…09) para provocar «pausa sin turno».
  const trabajan = ['per-01', 'per-02', 'per-03', 'per-04', 'per-05', 'per-06'];
  const todas = [...trabajan, 'per-07', 'per-08', 'per-09'];
  const criterioA = (i: Incumplimiento) => !i.mensaje.includes('no tiene una pausa de');
  const config: Config = {
    datos,
    personas: trabajan,
    cuantas: 20,
    fecha: DOMINGO,
    filtro: criterioA,
    // Pausas ya colocadas (algunas incumplen) para probar franjas y días que ya incumplen.
    inicial: (rnd) =>
      Array.from({ length: 8 }, () => {
        const inicio = aMinutos('13:30') + 15 * Math.floor(rnd() * 14);
        return pausaMin(DOMINGO, elegir(rnd, todas), inicio, inicio + 15 * (2 + Math.floor(rnd() * 4)));
      }),
    extra: (rnd) => {
      if (rnd() < 0.3) return null;
      const inicio = aMinutos('13:00') + 15 * Math.floor(rnd() * 20);
      return pausaMin(DOMINGO, elegir(rnd, todas), inicio, inicio + 15 * (2 + Math.floor(rnd() * 4)));
    },
  };
  const casos = [
    ['dura, ejemplo', base],
    ['dura, un solo comensal por franja', estrecha],
    ['blanda (peso 3), ejemplo', { ...base, dura: false, peso: 3 }],
    ['blanda (peso 3), un solo comensal por franja', { ...estrecha, dura: false, peso: 3 }],
  ] as const;
  for (const [nombre, regla] of casos) {
    it(`coincide con el oráculo: ${nombre}`, () => {
      const r = comprobarCoherencia(regla, config, 17);
      expect(r.probadas).toBeGreaterThanOrEqual(30);
      if (regla.dura) expect(r.bloqueadas).toBeGreaterThan(0);
      else expect(r.conCoste).toBeGreaterThan(0);
    });
  }
  it('blanda: el coste del criterio (a) es exacto (después − antes) y nunca bloquea', () => {
    const blanda = { ...base, dura: false, peso: 3 };
    const sinFiltro: Config = { ...config, filtro: undefined, cuantas: 12 };
    const r = comprobarCoherencia(blanda, sinFiltro, 5);
    expect(r.probadas).toBeGreaterThanOrEqual(30);
    expect(r.conCoste).toBeGreaterThan(0);
    // Caso directo: la segunda franja convierte en larga la jornada de EMP-01 y cuesta el peso.
    const ctx = contexto([puesto(DOMINGO, lego, 'franja-lego-1', 'per-01')], datos);
    const r2 = definicion.comprobar(blanda, ctx, puesto(DOMINGO, lego, 'franja-lego-11', 'per-01'));
    expect(r2.permitido).toBe(true);
    expect(r2.coste).toBe(3);
  });
  it('dura: el criterio (a) no cuesta ni bloquea (las pausas se colocan después)', () => {
    const sinFiltro: Config = { ...config, filtro: criterioA };
    expect(comprobarCoherencia(base, sinFiltro, 5).probadas).toBeGreaterThan(0);
  });
  it('nunca bloquea ni cuesta por el criterio (a): una jornada larga sin pausa no cuenta', () => {
    const jornadaLarga = ['franja-caja-1', 'franja-caja-2', 'franja-caja-3', 'franja-caja-4', 'franja-caja-5'].map((f) => puesto(DOMINGO, caja1, f, 'per-01'));
    const ctx = contexto(jornadaLarga, datos);
    expect(definicion.comprobar(base, ctx, puesto(DOMINGO, caja2, 'franja-caja-5', 'per-01'))).toEqual({ permitido: true, coste: 0, motivos: [] });
  });
  it('hace 2000 comprobaciones con ~150 asignaciones en menos de 1 s', () => {
    expect(pruebaVelocidad(base, { ...config, cuantas: 150, fecha: undefined })).toBeLessThan(1000);
  });
});
