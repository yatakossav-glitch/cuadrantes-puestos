/**
 * Unidades de asignación (ARQUITECTURA §5.1) y comprobación de candidatas.
 * Una unidad es lo que se asigna de una vez a una persona: un bloque entero
 * (si `mismaPersonaBloque` está activa para ese puesto) o una franja suelta.
 */
import type { ContextoEvaluacion, IndiceSemana } from '../reglas/contrato';
import { enAmbito, unidades15 } from '../reglas/util';
import { conAsignacion } from '../validacion/indice';
import type { Catalogos } from '../validacion/validador';
import type {
  Asignacion,
  AsignacionPuesto,
  ClaveHueco,
  DatosPlanificacion,
  DiaSemana,
  FechaISO,
  Hueco,
  Id,
  Minutos,
  OrigenAsignacion,
  Persona,
  Puesto,
  ReglaGeneral,
  RestriccionPersona,
} from '../modelo/tipos';

/** Una unidad dura «turno entero» a partir de esta duración (minutos). */
export const DURACION_UNIDAD_LARGA: Minutos = 300;
/** Coste blando añadido a quien, al recibir la unidad, pasaría a necesitar comida. */
export const COSTE_NECESITAR_COMIDA = 8;

export interface Unidad {
  /** `${fecha}|${puestoId}|${plaza}|${bloqueId ?? franjaId}` */
  id: string;
  fecha: FechaISO;
  dia: DiaSemana;
  puestoId: Id;
  areaId: Id;
  plaza: number;
  bloqueId: Id | null;
  /** Huecos libres de la unidad, ordenados por hora. */
  huecos: Hueco[];
  inicio: Minutos;
  fin: Minutos;
  requiereHabilitacion: boolean;
  /** Turno entero (≥ DURACION_UNIDAD_LARGA). */
  larga: boolean;
  /** 0 = habilitación + turno entero, 1 = bloque, 2 = franja suelta. */
  categoria: 0 | 1 | 2;
  ordenPuesto: number;
}

export function claveDeHueco(h: Hueco): ClaveHueco {
  return `${h.fecha}|${h.puestoId}|${h.franjaId}|${h.plaza}`;
}

/** ¿Debe asignarse el puesto por bloques enteros? */
export function usaBloques(datos: DatosPlanificacion, puesto: Puesto): boolean {
  return datos.reglas.some(
    (r) => r.tipo === 'mismaPersonaBloque' && r.activa && r.estado !== 'descartada' && enAmbito(r.params.ambito, puesto),
  );
}

/** `base` si no está en `usados`; si lo está, `base-2`, `base-3`… (determinista). No modifica `usados`. */
export function idUnico(base: Id, usados: Set<Id>): Id {
  let id = base;
  for (let n = 2; usados.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

/** Asignación del motor para un hueco (id determinista). */
export function asignacionDeHueco(h: Hueco, personaId: Id, origen: OrigenAsignacion = 'motor'): AsignacionPuesto {
  return {
    id: `m|${claveDeHueco(h)}`,
    tipo: 'puesto',
    fecha: h.fecha,
    puestoId: h.puestoId,
    franjaId: h.franjaId,
    plaza: h.plaza,
    personaId,
    bloqueada: false,
    origen,
  };
}

export function asignacionesDeUnidad(u: Unidad, personaId: Id): AsignacionPuesto[] {
  return u.huecos.map((h) => asignacionDeHueco(h, personaId));
}

function construirUnidad(huecos: Hueco[], puesto: Puesto, bloqueId: Id | null, clave: string): Unidad {
  const ordenados = [...huecos].sort((a, b) => a.inicio - b.inicio);
  const primero = ordenados[0]!;
  const inicio = primero.inicio;
  const fin = ordenados.reduce((m, h) => Math.max(m, h.fin), 0);
  const larga = fin - inicio >= DURACION_UNIDAD_LARGA;
  const categoria: 0 | 1 | 2 = puesto.requiereHabilitacion && larga ? 0 : ordenados.length > 1 ? 1 : 2;
  return {
    id: clave,
    fecha: primero.fecha,
    dia: primero.dia,
    puestoId: primero.puestoId,
    areaId: primero.areaId,
    plaza: primero.plaza,
    bloqueId,
    huecos: ordenados,
    inicio,
    fin,
    requiereHabilitacion: puesto.requiereHabilitacion,
    larga,
    categoria,
    ordenPuesto: puesto.orden,
  };
}

/** Orden de las unidades: categoría, fecha, hora de inicio, orden del puesto, plaza. */
export function compararUnidades(a: Unidad, b: Unidad): number {
  if (a.categoria !== b.categoria) return a.categoria - b.categoria;
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  if (a.inicio !== b.inicio) return a.inicio - b.inicio;
  if (a.ordenPuesto !== b.ordenPuesto) return a.ordenPuesto - b.ordenPuesto;
  if (a.plaza !== b.plaza) return a.plaza - b.plaza;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Unidades libres de la semana: los huecos cuya clave no está en `ocupadas`,
 * agrupados por bloque donde corresponde. Un bloque parcialmente ocupado da una
 * unidad con solo sus franjas libres (la regla del bloque ya obliga a la misma persona).
 */
export function crearUnidades(
  datos: DatosPlanificacion,
  indice: IndiceSemana,
  ocupadas: ReadonlySet<ClaveHueco>,
): Unidad[] {
  const unidades: Unidad[] = [];
  const grupos = new Map<string, { huecos: Hueco[]; puesto: Puesto; bloqueId: Id | null }>();
  const orden: string[] = [];
  for (const h of indice.huecos()) {
    if (ocupadas.has(claveDeHueco(h))) continue;
    const puesto = indice.puesto(h.puestoId);
    if (!puesto) continue;
    const porBloque = h.bloqueId !== null && usaBloques(datos, puesto);
    const id = `${h.fecha}|${h.puestoId}|${h.plaza}|${porBloque ? h.bloqueId : h.franjaId}`;
    let g = grupos.get(id);
    if (!g) {
      g = { huecos: [], puesto, bloqueId: porBloque ? h.bloqueId : null };
      grupos.set(id, g);
      orden.push(id);
    }
    g.huecos.push(h);
  }
  for (const id of orden) {
    const g = grupos.get(id)!;
    unidades.push(construirUnidad(g.huecos, g.puesto, g.bloqueId, id));
  }
  return unidades.sort(compararUnidades);
}

/**
 * Unidad que contiene un hueco (para sugerencias): el bloque entero si el hueco tiene bloque y
 * `mismaPersonaBloque` está activa para el puesto. Incluye siempre el hueco pedido y las franjas
 * del bloque que no estén ocupadas por una asignación con candado.
 */
export function unidadDeHueco(datos: DatosPlanificacion, indice: IndiceSemana, hueco: Hueco): Unidad | null {
  const puesto = indice.puesto(hueco.puestoId);
  if (!puesto) return null;
  const porBloque = hueco.bloqueId !== null && usaBloques(datos, puesto);
  const clave = claveDeHueco(hueco);
  const huecos = indice
    .huecos()
    .filter((h) => {
      if (claveDeHueco(h) === clave) return true;
      if (!porBloque) return false;
      if (h.fecha !== hueco.fecha || h.puestoId !== hueco.puestoId || h.plaza !== hueco.plaza) return false;
      if (h.bloqueId !== hueco.bloqueId) return false;
      return !(indice.enHueco(claveDeHueco(h))?.bloqueada ?? false);
    });
  if (huecos.length === 0) return null;
  return construirUnidad(huecos, puesto, porBloque ? hueco.bloqueId : null, `${hueco.fecha}|${hueco.puestoId}|${hueco.plaza}|${porBloque ? hueco.bloqueId : hueco.franjaId}`);
}

// ───────────────────────── Comprobación ─────────────────────────

export interface ResultadoComprobacion {
  permitido: boolean;
  /** Penalización blanda que añadiría. */
  coste: number;
  /** Motivos: duros si no es permitido, blandos si es permitido. */
  motivos: string[];
  /** Primer motivo duro (null si es permitido). */
  primerMotivoDuro: string | null;
}

export interface OpcionesComprobacion {
  /** Si es true no se corta en el primer incumplimiento duro (reúne todos los motivos). */
  completo?: boolean;
}

export interface Comprobador {
  /** Comprueba una persona para todas las franjas de una unidad, en secuencia (la segunda ve la primera). */
  unidad(indice: IndiceSemana, unidad: Unidad, personaId: Id, opciones?: OpcionesComprobacion): ResultadoComprobacion;
  /** Comprueba una única asignación candidata (puesto o pausa). */
  asignacion(indice: IndiceSemana, candidata: Asignacion, opciones?: OpcionesComprobacion): ResultadoComprobacion;
}

interface ComprobadorGeneral {
  comprobar(regla: ReglaGeneral, ctx: ContextoEvaluacion, candidata: Asignacion): { permitido: boolean; coste: number; motivos: string[] };
}
interface ComprobadorRestriccion {
  comprobar(
    r: RestriccionPersona,
    persona: Persona,
    ctx: ContextoEvaluacion,
    candidata: Asignacion,
  ): { permitido: boolean; coste: number; motivos: string[] };
}

/** Las reglas baratas y que más descartan van primero (permite cortar antes). */
const PRIORIDAD_GENERAL: Record<string, number> = {
  personaDisponible: 0,
  habilitacionRequerida: 1,
  sinSolapes: 2,
  respetarEquipo: 3,
  exclusividadDiaria: 4,
  maxMinutosDia: 5,
  maxDiasSemana: 6,
  noRepetirConsecutivas: 7,
  mismaPersonaBloque: 8,
  descansoEntreJornadas: 9,
  maxFranjasSiSoloArea: 10,
};

/** Reglas que no se comprueban para un puesto candidato: la cobertura es del motor y las comidas van en su pasada. */
const OMITIDAS_PARA_PUESTO = new Set<string>(['coberturaCompleta', 'comidasEscalonadas']);

export function crearComprobador(datos: DatosPlanificacion, catalogos: Catalogos): Comprobador {
  const generales = datos.reglas
    .filter((r) => r.activa && r.estado !== 'descartada')
    .map((regla, pos) => ({ regla, pos }))
    .sort((a, b) => (PRIORIDAD_GENERAL[a.regla.tipo] ?? 50) - (PRIORIDAD_GENERAL[b.regla.tipo] ?? 50) || a.pos - b.pos)
    .map((x) => x.regla);
  const reglasComida = generales.filter((r) => r.tipo === 'comidasEscalonadas');
  const personas = new Map<Id, Persona>(datos.personas.map((p) => [p.id, p]));

  function ejecutar(indice: IndiceSemana, candidata: Asignacion, opciones: OpcionesComprobacion | undefined): ResultadoComprobacion {
    const completo = opciones?.completo === true;
    const ctx: ContextoEvaluacion = { datos, indice };
    let coste = 0;
    const motivos: string[] = [];
    let primerMotivoDuro: string | null = null;
    let permitido = true;

    const acumular = (r: { permitido: boolean; coste: number; motivos: string[] }): boolean => {
      coste += r.coste;
      motivos.push(...r.motivos);
      if (!r.permitido) {
        permitido = false;
        primerMotivoDuro ??= r.motivos[0] ?? 'Incumple una regla obligatoria';
        return !completo;
      }
      return false;
    };

    const persona = personas.get(candidata.personaId);
    if (persona) {
      for (const restr of persona.restricciones) {
        if (!restr.activa) continue;
        try {
          const def = catalogos.restricciones[restr.tipo] as unknown as ComprobadorRestriccion;
          if (acumular(def.comprobar(restr, persona, ctx, candidata))) {
            return { permitido, coste, motivos, primerMotivoDuro };
          }
        } catch {
          // Una restricción que falla no bloquea al motor; el validador lo avisa.
        }
      }
    }
    for (const regla of generales) {
      if (candidata.tipo === 'puesto' && OMITIDAS_PARA_PUESTO.has(regla.tipo)) continue;
      try {
        const def = catalogos.general[regla.tipo] as unknown as ComprobadorGeneral;
        if (acumular(def.comprobar(regla, ctx, candidata))) {
          return { permitido, coste, motivos, primerMotivoDuro };
        }
      } catch {
        // Ídem.
      }
    }
    return { permitido, coste, motivos, primerMotivoDuro: permitido ? null : primerMotivoDuro };
  }

  /** Coste extra si la persona pasaría a tener una jornada que exige comida. */
  function costeComida(indice: IndiceSemana, u: Unidad, personaId: Id): { coste: number; motivo: string | null } {
    for (const regla of reglasComida) {
      if (regla.tipo !== 'comidasEscalonadas' || !regla.params.dias.includes(u.dia)) continue;
      const umbral = regla.params.umbralJornadaMin;
      const antes = indice.jornada(personaId, u.fecha);
      const ini = antes ? Math.min(antes.inicio, u.inicio) : u.inicio;
      const fin = antes ? Math.max(antes.fin, u.fin) : u.fin;
      const eraLarga = antes !== null && antes.fin - antes.inicio > umbral;
      if (!eraLarga && fin - ini > umbral) {
        return { coste: COSTE_NECESITAR_COMIDA, motivo: 'Su jornada pasaría a necesitar comida' };
      }
    }
    return { coste: 0, motivo: null };
  }

  return {
    asignacion: (indice, candidata, opciones) => ejecutar(indice, candidata, opciones),
    unidad(indice, u, personaId, opciones) {
      let actual = indice;
      let coste = 0;
      const motivos: string[] = [];
      for (let i = 0; i < u.huecos.length; i += 1) {
        const hueco = u.huecos[i]!;
        const candidata = asignacionDeHueco(hueco, personaId);
        const r = ejecutar(actual, candidata, opciones);
        coste += r.coste;
        for (const m of r.motivos) if (!motivos.includes(m)) motivos.push(m);
        if (!r.permitido) {
          return { permitido: false, coste, motivos, primerMotivoDuro: r.primerMotivoDuro };
        }
        if (i < u.huecos.length - 1) actual = conAsignacion(actual, datos, candidata);
      }
      const extra = costeComida(indice, u, personaId);
      if (extra.motivo) motivos.push(extra.motivo);
      return { permitido: true, coste: coste + extra.coste, motivos, primerMotivoDuro: null };
    },
  };
}

/** Carga acumulada de una persona, en tramos de 15 min (para repartir la carga al desempatar). */
export function cargaDe(indice: IndiceSemana, personaId: Id): number {
  return unidades15(indice.minutosSemana(personaId));
}
