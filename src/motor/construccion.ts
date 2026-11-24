/**
 * Construcción voraz (ARQUITECTURA §5.3): más restrictivo primero, con «menos candidatas primero»
 * dentro de la categoría más prioritaria. Función pura y determinista (el azar viene con semilla).
 */
import { conAsignacion, crearIndice } from '../validacion/indice';
import type { IndiceSemana } from '../reglas/contrato';
import type { Asignacion, DatosPlanificacion, Id, Persona } from '../modelo/tipos';
import type { Preparacion } from './preparacion';
import { asignacionesDeUnidad, cargaDe, type Comprobador, type Unidad } from './unidades';

/** Cada cuántas extracciones se recalcula el número de candidatas (MRV dinámico). */
export const K_RECALCULO = 8;
/** Unidades que se miran en cada recálculo (las primeras de la categoría actual). */
export const VENTANA_MRV = 32;
/** Peso de la carga ya asignada al elegir entre candidatas (reparte horas sin forzar nada). */
export const PESO_CARGA_POR_15MIN = 0.02;
/** Amplitud del desempate aleatorio. Menor que cualquier coste de regla blanda. */
export const EPSILON = 0.1;

export interface ResultadoConstruccion {
  /** Persona asignada a cada unidad de `preparacion.unidades` (mismo orden); null = sin cubrir. */
  personas: (Id | null)[];
  /** Índice con las fijas y todo lo asignado. */
  indice: IndiceSemana;
  /** true si se agotó el tiempo y parte de las unidades se cubrió con la primera candidata permitida. */
  cortadoPorTiempo: boolean;
}

/** Salvaguarda de tiempo de la construcción (el reloj es inyectable). */
export interface TiempoConstruccion {
  reloj: () => number;
  inicio: number;
  limiteMs: number;
}

export function personasActivas(datos: DatosPlanificacion): Persona[] {
  return datos.personas.filter((p) => p.activa).sort((a, b) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0));
}

/**
 * Personas permitidas para una unidad, con su coste, en el orden de `personas` (determinista).
 */
export function candidatasDe(
  comprobador: Comprobador,
  indice: IndiceSemana,
  unidad: Unidad,
  personas: readonly Persona[],
): { persona: Persona; coste: number }[] {
  const permitidas: { persona: Persona; coste: number }[] = [];
  for (const persona of personas) {
    const r = comprobador.unidad(indice, unidad, persona.id);
    if (r.permitido) permitidas.push({ persona, coste: r.coste });
  }
  return permitidas;
}

export function construir(
  datos: DatosPlanificacion,
  comprobador: Comprobador,
  preparacion: Preparacion,
  azar: () => number,
  alProgresar?: (fraccion: number, sinCubrir: number) => void,
  tiempo?: TiempoConstruccion,
): ResultadoConstruccion {
  const { unidades } = preparacion;
  const personas = personasActivas(datos);
  const resultado: (Id | null)[] = unidades.map(() => null);
  let indice = preparacion.indice;
  let sinCubrir = 0;
  let hechas = 0;
  let cortadoPorTiempo = false;
  const sinTiempo = (): boolean => {
    if (!cortadoPorTiempo && tiempo && tiempo.reloj() - tiempo.inicio >= tiempo.limiteMs) cortadoPorTiempo = true;
    return cortadoPorTiempo;
  };

  for (const categoria of [0, 1, 2] as const) {
    const pendientes: number[] = [];
    unidades.forEach((u, i) => {
      if (u.categoria === categoria) pendientes.push(i);
    });
    const cache = new Map<number, Persona[]>();
    let extracciones = 0;

    while (pendientes.length > 0) {
      if (sinTiempo()) {
        // Modo rápido: en orden de cola, la primera candidata permitida (sin MRV ni costes).
        const i = pendientes.shift()!;
        const unidad = unidades[i]!;
        const elegida = personas.find((p) => comprobador.unidad(indice, unidad, p.id).permitido);
        hechas += 1;
        if (!elegida) {
          sinCubrir += 1;
          continue;
        }
        resultado[i] = elegida.id;
        for (const a of asignacionesDeUnidad(unidad, elegida.id)) indice = conAsignacion(indice, datos, a);
        continue;
      }
      if (extracciones % K_RECALCULO === 0) {
        for (const i of pendientes.slice(0, VENTANA_MRV)) {
          const previas = cache.get(i) ?? personas;
          const u = unidades[i]!;
          cache.set(i, previas.filter((p) => comprobador.unidad(indice, u, p.id).permitido));
        }
      }
      // Menos candidatas primero; a igualdad, el orden de la cola.
      let mejorPos = 0;
      let mejorN = Infinity;
      const tope = Math.min(pendientes.length, VENTANA_MRV);
      for (let pos = 0; pos < tope; pos += 1) {
        const n = cache.get(pendientes[pos]!)?.length ?? Infinity;
        if (n < mejorN) {
          mejorN = n;
          mejorPos = pos;
        }
      }
      const i = pendientes.splice(mejorPos, 1)[0]!;
      extracciones += 1;
      cache.delete(i);
      const unidad = unidades[i]!;

      const candidatas = candidatasDe(comprobador, indice, unidad, personas);
      hechas += 1;
      if (candidatas.length === 0) {
        sinCubrir += 1;
      } else {
        let elegida = candidatas[0]!;
        let mejor = Infinity;
        for (const c of candidatas) {
          const puntos = c.coste + PESO_CARGA_POR_15MIN * cargaDe(indice, c.persona.id) + EPSILON * azar();
          if (puntos < mejor) {
            mejor = puntos;
            elegida = c;
          }
        }
        resultado[i] = elegida.persona.id;
        for (const a of asignacionesDeUnidad(unidad, elegida.persona.id)) {
          indice = conAsignacion(indice, datos, a);
        }
      }
      if (alProgresar && hechas % 20 === 0) alProgresar(hechas / Math.max(1, unidades.length), sinCubrir);
    }
  }
  alProgresar?.(1, sinCubrir);
  return { personas: resultado, indice, cortadoPorTiempo };
}

/**
 * Pasada final de cobertura: intenta cubrir cada unidad vacía con la mejor candidata permitida y, si no hay,
 * con la expulsión de §5.5 c (una persona deja una unidad de ese día, que pasa a otra, para cubrir la vacía).
 * Devuelve la persona de cada unidad tras la pasada.
 */
export function cubrirVacias(
  datos: DatosPlanificacion,
  comprobador: Comprobador,
  lunes: string,
  fijas: readonly Asignacion[],
  unidades: readonly Unidad[],
  personasIniciales: readonly (Id | null)[],
): (Id | null)[] {
  const personas = personasActivas(datos);
  const actual: (Id | null)[] = [...personasIniciales];
  const lista = (saltar: readonly number[] = []): Asignacion[] => {
    const l: Asignacion[] = [...fijas];
    unidades.forEach((u, i) => {
      const p = actual[i];
      if (p != null && !saltar.includes(i)) l.push(...asignacionesDeUnidad(u, p));
    });
    return l;
  };

  for (let pasada = 0; pasada < 3; pasada += 1) {
    let cambio = false;
    for (let i = 0; i < unidades.length; i += 1) {
      if (actual[i] != null) continue;
      const u = unidades[i]!;
      const indice = crearIndice(datos, lunes, lista());
      const candidatas = candidatasDe(comprobador, indice, u, personas);
      if (candidatas.length > 0) {
        let mejor = candidatas[0]!;
        for (const c of candidatas) if (c.coste < mejor.coste) mejor = c;
        actual[i] = mejor.persona.id;
        cambio = true;
        continue;
      }
      // Expulsión: p deja sus unidades de ese día para cubrir u; cada una se reubica en otra persona.
      for (const p of personas) {
        const suyas: number[] = [];
        unidades.forEach((x, j) => {
          if (actual[j] === p.id && x.fecha === u.fecha) suyas.push(j);
        });
        if (suyas.length === 0) continue;
        const sin = crearIndice(datos, lunes, lista(suyas));
        if (!comprobador.unidad(sin, u, p.id).permitido) continue;
        let siguiente = sin;
        for (const a of asignacionesDeUnidad(u, p.id)) siguiente = conAsignacion(siguiente, datos, a);
        const reubicadas: { j: number; q: Id }[] = [];
        let todas = true;
        for (const j of suyas) {
          const q = candidatasDe(comprobador, siguiente, unidades[j]!, personas.filter((x) => x.id !== p.id));
          if (q.length === 0) {
            todas = false;
            break;
          }
          let m = q[0]!;
          for (const c of q) if (c.coste < m.coste) m = c;
          reubicadas.push({ j, q: m.persona.id });
          for (const a of asignacionesDeUnidad(unidades[j]!, m.persona.id)) siguiente = conAsignacion(siguiente, datos, a);
        }
        if (!todas) continue;
        actual[i] = p.id;
        for (const r of reubicadas) actual[r.j] = r.q;
        cambio = true;
        break;
      }
    }
    if (!cambio) break;
  }
  return actual;
}
