/**
 * Mejora por búsqueda local (ARQUITECTURA §5.5): recocido simulado con temperatura lineal.
 * Cada movimiento se filtra con `comprobar` (sin incumplimientos duros) y se valora con el
 * validador completo. Devuelve la mejor solución vista. Determinista: el azar viene con semilla
 * y el tiempo solo es una salvaguarda.
 */
import { crearIndice, conAsignacion } from '../validacion/indice';
import { validarSemana, type Catalogos } from '../validacion/validador';
import type { IndiceSemana } from '../reglas/contrato';
import type { Asignacion, DatosPlanificacion, DiaSemana, FechaISO, Id, Minutos, Persona } from '../modelo/tipos';
import { enteroHasta } from './azar';
import { personasActivas } from './construccion';
import {
  asignacionesDeUnidad,
  COSTE_NECESITAR_COMIDA,
  type Comprobador,
  type Unidad,
} from './unidades';

/** Peso de un hueco sin cubrir en el objetivo: ninguna mejora blanda compensa dejar un hueco. */
export const PESO_HUECO = 1_000_000;
/** Temperatura inicial del recocido (en unidades de penalización blanda). */
export const TEMPERATURA_INICIAL = 3;
/** Intentos de encontrar una persona permitida por movimiento. */
const INTENTOS_PERSONA = 12;
/** Unidades que compiten en el torneo que elige qué mover. */
const PARTICIPANTES_TORNEO = 4;
export const CADA_ITERACIONES_PROGRESO = 200;

export interface EntradaMejora {
  datos: DatosPlanificacion;
  catalogos: Catalogos;
  comprobador: Comprobador;
  lunes: FechaISO;
  /** Asignaciones que no se mueven. */
  fijas: readonly Asignacion[];
  unidades: readonly Unidad[];
  /** Persona de cada unidad (null = vacía), mismo orden que `unidades`. */
  personas: readonly (Id | null)[];
  azar: () => number;
  maxIteraciones: number;
  limiteMs: number;
  /** Reloj en ms (inyectable en los tests). */
  reloj: () => number;
  /** Instante del reloj en que empezó todo el trabajo (el límite cuenta desde ahí). */
  inicio: number;
  alProgresar?: (iteracion: number, huecosSinCubrir: number, penalizacionBlanda: number) => void;
}

export interface ResultadoMejora {
  personas: (Id | null)[];
  iteraciones: number;
  cortadoPorTiempo: boolean;
  /** Objetivo de la mejor solución (huecos, comidas y penalización blanda). */
  objetivo: number;
}

interface Evaluacion {
  /** Incumplimientos duros que no son huecos. */
  duras: number;
  huecos: number;
  blanda: number;
  objetivo: number;
}

export function mejorar(entrada: EntradaMejora): ResultadoMejora {
  const { datos, catalogos, comprobador, lunes, fijas, unidades, azar, maxIteraciones, limiteMs, reloj, inicio } = entrada;
  const personasLista = personasActivas(datos);
  // La mejora no ve las comidas (aún no están colocadas): las penaliza el coste por jornada larga.
  const datosMejora: DatosPlanificacion = {
    ...datos,
    reglas: datos.reglas.filter((r) => r.tipo !== 'comidasEscalonadas'),
  };
  const reglasComida = datos.reglas.filter((r) => r.tipo === 'comidasEscalonadas' && r.activa && r.estado !== 'descartada');
  const indiceFijas = crearIndice(datos, lunes, fijas);
  const objetivos = new Map<Id, Minutos | null>(datos.personas.map((p) => [p.id, p.objetivoCoberturaMinSemana]));

  const construirLista = (personas: readonly (Id | null)[], saltar: readonly number[] = []): Asignacion[] => {
    const lista: Asignacion[] = [...fijas];
    unidades.forEach((u, i) => {
      const p = personas[i];
      if (p == null || saltar.includes(i)) return;
      lista.push(...asignacionesDeUnidad(u, p));
    });
    return lista;
  };

  /** Jornadas largas (que exigirán comida) según las unidades y las fijas. */
  const jornadasLargas = (personas: readonly (Id | null)[]): number => {
    if (reglasComida.length === 0) return 0;
    const jornadas = new Map<string, { inicio: Minutos; fin: Minutos; dia: number }>();
    const sumar = (personaId: Id, fecha: FechaISO, dia: number, ini: Minutos, fin: Minutos): void => {
      const k = `${personaId}|${fecha}`;
      const j = jornadas.get(k);
      if (j) {
        j.inicio = Math.min(j.inicio, ini);
        j.fin = Math.max(j.fin, fin);
      } else jornadas.set(k, { inicio: ini, fin, dia });
    };
    for (const a of fijas) {
      if (a.tipo !== 'puesto') continue;
      const iv = indiceFijas.intervalo(a);
      if (iv) sumar(a.personaId, a.fecha, indiceFijas.diaDe(a.fecha), iv.inicio, iv.fin);
    }
    unidades.forEach((u, i) => {
      const p = personas[i];
      if (p != null) sumar(p, u.fecha, u.dia, u.inicio, u.fin);
    });
    let n = 0;
    for (const j of jornadas.values()) {
      for (const r of reglasComida) {
        if (r.tipo === 'comidasEscalonadas' && r.params.dias.includes(j.dia as DiaSemana) && j.fin - j.inicio > r.params.umbralJornadaMin) {
          n += 1;
          break;
        }
      }
    }
    return n;
  };

  const evaluar = (personas: readonly (Id | null)[]): Evaluacion => {
    const r = validarSemana(datosMejora, lunes, construirLista(personas), catalogos);
    // La pausa mínima y los límites duros de horas semanales los repara la búsqueda: pesan como un hueco.
    const esReparable = (i: { origen: string; tipo: string }): boolean =>
      i.origen === 'persona' && (i.tipo === 'pausaMinima' || i.tipo === 'minutosSemana');
    let duras = 0;
    let reparables = 0;
    for (const i of r.incumplimientos) {
      if (!i.dura || i.marca === 'hueco') continue;
      if (esReparable(i)) reparables += 1;
      else duras += 1;
    }
    let huecos = 0;
    unidades.forEach((u, i) => {
      if (personas[i] == null) huecos += u.huecos.length;
    });
    const objetivo = PESO_HUECO * (huecos + reparables) + r.penalizacionBlanda + COSTE_NECESITAR_COMIDA * jornadasLargas(personas);
    return { duras, huecos, blanda: r.penalizacionBlanda, objetivo };
  };

  /**
   * De hasta INTENTOS_PERSONA personas al azar, la permitida para `unidad` en `indice` que menos
   * penalización blanda añade (distinta de las de `excluir`). Así los movimientos apuntan hacia la mejora.
   */
  const buscarPersona = (
    indice: IndiceSemana,
    unidad: Unidad,
    excluir: readonly (Id | null)[],
    cargas?: Map<Id, Minutos>,
  ): Persona | null => {
    let mejorPersona: Persona | null = null;
    let mejorCoste = Infinity;
    const vistas = new Set<Id>();
    for (let t = 0; t < INTENTOS_PERSONA; t += 1) {
      const q = personasLista[enteroHasta(azar, personasLista.length)];
      if (!q || excluir.includes(q.id) || vistas.has(q.id)) continue;
      vistas.add(q.id);
      const r = comprobador.unidad(indice, unidad, q.id);
      // A igual coste, la que va más corta de horas respecto a su objetivo.
      const puntos = r.coste * 100_000 + (cargas ? exceso(cargas, q.id) : 0);
      if (r.permitido && puntos < mejorCoste) {
        mejorCoste = puntos;
        mejorPersona = q;
      }
    }
    return mejorPersona;
  };

  let actual: (Id | null)[] = [...entrada.personas];
  let evActual = evaluar(actual);
  let mejor = [...actual];
  let objetivoMejor = evActual.objetivo;
  let iteraciones = 0;
  let cortadoPorTiempo = false;

  if (unidades.length > 0 && personasLista.length > 0) {
    for (let it = 1; it <= maxIteraciones; it += 1) {
      // Con objetivo 0 (todo cubierto y ninguna penalización) no hay nada que mejorar.
      if (objetivoMejor <= 0) break;
      if (reloj() - inicio >= limiteMs) {
        cortadoPorTiempo = true;
        break;
      }
      iteraciones = it;
      const candidato = proponerMovimiento(actual);
            if (candidato) {
        const ev = evaluar(candidato);
        if (ev.duras <= evActual.duras) {
          const delta = ev.objetivo - evActual.objetivo;
          const temperatura = TEMPERATURA_INICIAL * (1 - it / maxIteraciones);
          if (delta < 0 || (delta === 0 ? true : temperatura > 1e-9 && azar() < Math.exp(-delta / temperatura))) {
            actual = candidato;
            evActual = ev;
            if (ev.objetivo < objetivoMejor) {
              objetivoMejor = ev.objetivo;
              mejor = [...candidato];
            }
          }
        }
      }
      if (entrada.alProgresar && it % CADA_ITERACIONES_PROGRESO === 0) {
        entrada.alProgresar(it, evActual.huecos, evActual.blanda);
      }
    }
  }
  return { personas: mejor, iteraciones, cortadoPorTiempo, objetivo: objetivoMejor };

  /** Propone un movimiento válido (sin incumplimientos duros según `comprobar`) o null. */
  function proponerMovimiento(personas: (Id | null)[]): (Id | null)[] | null {
    const vacias: number[] = [];
    personas.forEach((p, i) => {
      if (p == null) vacias.push(i);
    });
    const dado = azar();
    if (vacias.length > 0 && dado < 0.4) return expulsar(personas, vacias);
    if (dado < (vacias.length > 0 ? 0.8 : 0.65)) return reasignar(personas);
    return intercambiar(personas);
  }

  /** Minutos de cobertura de cada persona según las fijas y las unidades asignadas. */
  function cargasDe(personas: readonly (Id | null)[]): Map<Id, Minutos> {
    const minutos = new Map<Id, Minutos>();
    for (const a of fijas) {
      const iv = a.tipo === 'puesto' ? indiceFijas.intervalo(a) : undefined;
      if (iv) minutos.set(a.personaId, (minutos.get(a.personaId) ?? 0) + iv.fin - iv.inicio);
    }
    unidades.forEach((u, i) => {
      const p = personas[i];
      if (p != null) minutos.set(p, (minutos.get(p) ?? 0) + u.huecos.reduce((n, h) => n + h.fin - h.inicio, 0));
    });
    return minutos;
  }

  /** Minutos por encima (+) o por debajo (−) de su objetivo; 0 si no tiene objetivo. */
  function exceso(cargas: Map<Id, Minutos>, id: Id): Minutos {
    const objetivo = objetivos.get(id) ?? null;
    return objetivo === null ? 0 : (cargas.get(id) ?? 0) - objetivo;
  }

  /** Torneo entre unidades al azar: gana la de quien más se pasa de su objetivo (sin objetivos, es uniforme). */
  function elegirUnidad(personas: (Id | null)[], cargas: Map<Id, Minutos>): number {
    let mejorI = enteroHasta(azar, unidades.length);
    for (let t = 1; t < PARTICIPANTES_TORNEO; t += 1) {
      const i = enteroHasta(azar, unidades.length);
      const p = personas[i];
      const pm = personas[mejorI];
      if (p != null && (pm == null || exceso(cargas, p) > exceso(cargas, pm))) mejorI = i;
    }
    return mejorI;
  }

  /** a) Una unidad (cubierta o vacía) pasa a otra persona permitida. */
  function reasignar(personas: (Id | null)[]): (Id | null)[] | null {
    const cargas = cargasDe(personas);
    const i = elegirUnidad(personas, cargas);
    const u = unidades[i]!;
    const base = crearIndice(datos, lunes, construirLista(personas, [i]));
    const q = buscarPersona(base, u, [personas[i] ?? null], cargas);
    if (!q) return null;
    const nuevo = [...personas];
    nuevo[i] = q.id;
    return nuevo;
  }

  /** b) Dos unidades del mismo día intercambian de persona. */
  function intercambiar(personas: (Id | null)[]): (Id | null)[] | null {
    const i = enteroHasta(azar, unidades.length);
    const u1 = unidades[i]!;
    const p1 = personas[i];
    if (p1 == null) return null;
    const mismoDia: number[] = [];
    unidades.forEach((u, j) => {
      const pj = personas[j];
      if (j !== i && u.fecha === u1.fecha && pj != null && pj !== p1) mismoDia.push(j);
    });
    if (mismoDia.length === 0) return null;
    const j = mismoDia[enteroHasta(azar, mismoDia.length)]!;
    const u2 = unidades[j]!;
    const p2 = personas[j]!;
    const base = crearIndice(datos, lunes, construirLista(personas, [i, j]));
    if (!comprobador.unidad(base, u1, p2).permitido) return null;
    let siguiente = base;
    for (const a of asignacionesDeUnidad(u1, p2)) siguiente = conAsignacion(siguiente, datos, a);
    if (!comprobador.unidad(siguiente, u2, p1).permitido) return null;
    const nuevo = [...personas];
    nuevo[i] = p2;
    nuevo[j] = p1;
    return nuevo;
  }

  /** c) Cubre una unidad vacía con p y reubica la unidad que p deja libre ese día. */
  function expulsar(personas: (Id | null)[], vacias: number[]): (Id | null)[] | null {
    const i0 = vacias[enteroHasta(azar, vacias.length)]!;
    const u0 = unidades[i0]!;
    const p = personasLista[enteroHasta(azar, personasLista.length)];
    if (!p) return null;
    const suyas: number[] = [];
    unidades.forEach((u, j) => {
      if (personas[j] === p.id && u.fecha === u0.fecha) suyas.push(j);
    });
    const j = suyas.length > 0 ? suyas[enteroHasta(azar, suyas.length)]! : -1;
    const base = crearIndice(datos, lunes, construirLista(personas, j >= 0 ? [j] : []));
    if (!comprobador.unidad(base, u0, p.id).permitido) return null;
    const nuevo = [...personas];
    nuevo[i0] = p.id;
    if (j >= 0) {
      let siguiente = base;
      for (const a of asignacionesDeUnidad(u0, p.id)) siguiente = conAsignacion(siguiente, datos, a);
      const q = buscarPersona(siguiente, unidades[j]!, [p.id]);
      nuevo[j] = q ? q.id : null;
    }
    return nuevo;
  }
}
