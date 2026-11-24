/**
 * Preparación según el modo (ARQUITECTURA §5.2): decide qué asignaciones quedan fijas
 * y qué unidades hay que cubrir. Función pura.
 */
import { crearIndice } from '../validacion/indice';
import { validarSemana, type Catalogos } from '../validacion/validador';
import { fechasSemana } from '../modelo/fechas';
import { asignacionesDeSemanaTipo } from '../rotacion/semanaTipo';
import type { IndiceSemana } from '../reglas/contrato';
import type { Asignacion, ClaveHueco, DatosPlanificacion, FechaISO, Id } from '../modelo/tipos';
import type { PeticionMotor } from './contrato';
import { claveDeHueco, crearUnidades, type Unidad } from './unidades';

export interface Preparacion {
  /** Índice de la semana solo con las asignaciones fijas. */
  indice: IndiceSemana;
  /** Asignaciones que el motor no mueve (candados, existentes o semana tipo válida). */
  fijas: Asignacion[];
  /** Unidades a cubrir, ya ordenadas (más restrictivo primero). */
  unidades: Unidad[];
  /** Asignaciones de partida descartadas por incumplir alguna regla dura (modo semanaTipo). */
  descartadas: Asignacion[];
}

export { asignacionesDeSemanaTipo };

/**
 * Quita lo mínimo necesario para que no quede ningún incumplimiento duro que afecte a `validas`:
 * de una en una, la última (por fecha e inicio) de las asignaciones no bloqueadas implicadas en el
 * primer incumplimiento, y vuelve a validar. Con `soloPausas` solo se pueden quitar pausas.
 */
function quitarLoMinimo(
  datosPrueba: DatosPlanificacion,
  lunes: FechaISO,
  bloqueadas: Asignacion[],
  entrada: Asignacion[],
  catalogos: Catalogos,
  indice: IndiceSemana,
  soloPausas: boolean,
): { validas: Asignacion[]; quitadas: Asignacion[] } {
  let validas = [...entrada];
  const quitadas: Asignacion[] = [];
  const inicioDe = (a: Asignacion): number => indice.intervalo(a)?.inicio ?? 0;
  const posterior = (x: Asignacion, y: Asignacion): boolean =>
    x.fecha !== y.fecha ? x.fecha > y.fecha : inicioDe(x) !== inicioDe(y) ? inicioDe(x) > inicioDe(y) : x.id > y.id;
  for (let vuelta = 0; vuelta <= entrada.length; vuelta += 1) {
    const r = validarSemana(datosPrueba, lunes, [...bloqueadas, ...validas], catalogos);
    let elegida: Asignacion | null = null;
    for (const i of r.incumplimientos) {
      if (!i.dura || i.marca === 'hueco') continue;
      const ids = new Set(i.asignacionIds);
      for (const a of validas) {
        if (!ids.has(a.id) || (soloPausas && a.tipo !== 'pausa')) continue;
        if (elegida === null || posterior(a, elegida)) elegida = a;
      }
      if (elegida) break;
    }
    if (!elegida) break;
    quitadas.push(elegida);
    validas = validas.filter((a) => a !== elegida);
  }
  return { validas, quitadas };
}

/** Descarta las asignaciones que no encajan o que incumplen reglas duras (salvo cobertura y comidas, que se tratan aparte). */
function descartarIncumplidoras(
  datos: DatosPlanificacion,
  lunes: FechaISO,
  bloqueadas: Asignacion[],
  candidatas: Asignacion[],
  catalogos: Catalogos,
): { validas: Asignacion[]; descartadas: Asignacion[] } {
  const datosPrueba: DatosPlanificacion = {
    ...datos,
    reglas: datos.reglas.filter((r) => r.tipo !== 'comidasEscalonadas' && r.tipo !== 'coberturaCompleta'),
  };
  const indiceHuecos = crearIndice(datos, lunes, []);
  const descartadas: Asignacion[] = [];
  const encajan: Asignacion[] = [];
  for (const a of candidatas) {
    // Una asignación a un puesto que ya no existe ese día (cerrado, inactivo, franja borrada) no encaja.
    if (a.tipo === 'puesto' && !indiceHuecos.hueco(indiceHuecos.claveDe(a))) descartadas.push(a);
    else encajan.push(a);
  }
  const r = quitarLoMinimo(datosPrueba, lunes, bloqueadas, encajan, catalogos, indiceHuecos, false);
  descartadas.push(...r.quitadas);
  let validas = r.validas;
  // Una pausa solo tiene sentido si la persona sigue trabajando ese día.
  const trabajan = new Set<string>();
  for (const a of [...bloqueadas, ...validas]) if (a.tipo === 'puesto') trabajan.add(`${a.personaId}|${a.fecha}`);
  const huerfanas = validas.filter((a) => a.tipo === 'pausa' && !trabajan.has(`${a.personaId}|${a.fecha}`));
  if (huerfanas.length > 0) {
    descartadas.push(...huerfanas);
    validas = validas.filter((a) => !huerfanas.includes(a));
  }
  const podadas = podarPausas(datos, lunes, bloqueadas, validas, catalogos);
  descartadas.push(...podadas.quitadas);
  return { validas: podadas.validas, descartadas };
}

/** Quita las pausas sin candado que incumplen (b), (c) o (d) de `comidasEscalonadas`. El criterio (a) no se toca. */
function podarPausas(
  datos: DatosPlanificacion,
  lunes: FechaISO,
  fijasSeguras: Asignacion[],
  entrada: Asignacion[],
  catalogos: Catalogos,
): { validas: Asignacion[]; quitadas: Asignacion[] } {
  const pausas = entrada.filter((a) => a.tipo === 'pausa' && !a.bloqueada);
  if (pausas.length === 0 || !datos.reglas.some((r) => r.tipo === 'comidasEscalonadas' && r.activa && r.estado !== 'descartada')) {
    return { validas: entrada, quitadas: [] };
  }
  const datosComidas: DatosPlanificacion = { ...datos, reglas: datos.reglas.filter((r) => r.tipo === 'comidasEscalonadas') };
  const resto = [...fijasSeguras, ...entrada.filter((a) => !pausas.includes(a))];
  const r = quitarLoMinimo(datosComidas, lunes, resto, pausas, catalogos, crearIndice(datos, lunes, []), true);
  return { validas: [...entrada.filter((a) => !pausas.includes(a)), ...r.validas], quitadas: r.quitadas };
}

export function preparar(peticion: PeticionMotor, catalogos: Catalogos): Preparacion {
  const { datos, lunes, modo } = peticion;
  const fechas = new Set<FechaISO>(fechasSemana(lunes));
  const actuales = peticion.actuales.filter((a) => fechas.has(a.fecha));
  let fijas: Asignacion[];
  let descartadas: Asignacion[] = [];

  if (modo === 'desdeCero') {
    fijas = actuales.filter((a) => a.bloqueada);
  } else if (modo === 'completarHuecos') {
    // Se conserva todo lo existente salvo las pausas sin candado que incumplen las reglas de comidas.
    const podadas = podarPausas(datos, lunes, [], actuales, catalogos);
    fijas = podadas.validas.length === actuales.length ? [...actuales] : actuales.filter((a) => !podadas.quitadas.includes(a));
    descartadas = podadas.quitadas;
  } else {
    const bloqueadas = actuales.filter((a) => a.bloqueada);
    const libres = actuales.filter((a) => !a.bloqueada);
    const base = libres.length > 0 ? libres : asignacionesDeSemanaTipo(datos, lunes);
    const clavesBloqueadas = new Set<ClaveHueco>();
    const indiceBase = crearIndice(datos, lunes, []);
    for (const a of bloqueadas) if (a.tipo === 'puesto') clavesBloqueadas.add(indiceBase.claveDe(a));
    const candidatas = base.filter((a) => a.tipo !== 'puesto' || !clavesBloqueadas.has(indiceBase.claveDe(a)));
    const r = descartarIncumplidoras(datos, lunes, bloqueadas, candidatas, catalogos);
    fijas = [...bloqueadas, ...r.validas];
    descartadas = r.descartadas;
  }

  const indice = crearIndice(datos, lunes, fijas);
  const ocupadas = new Set<ClaveHueco>();
  for (const h of indice.huecos()) {
    if (indice.enHueco(claveDeHueco(h))) ocupadas.add(claveDeHueco(h));
  }
  return { indice, fijas, unidades: crearUnidades(datos, indice, ocupadas), descartadas };
}
