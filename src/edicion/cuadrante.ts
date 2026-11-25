/** Edición pura del cuadrante de una semana: asignar, quitar, candados, pausas y vaciar. Nunca muta la entrada. */
import { diaSemana, enRango } from '../modelo/fechas';
import { seSolapan } from '../modelo/horas';
import { semanaDelCiclo } from '../rotacion/ciclo';
import { nuevoId } from '../modelo/ids';
import type {
  Asignacion,
  AsignacionPausa,
  AsignacionPuesto,
  ClaveHueco,
  CuadranteSemana,
  EstadoApp,
  FechaISO,
  Franja,
  Id,
  Minutos,
  Persona,
  Puesto,
  Rotacion,
} from '../modelo/tipos';
import { horarioDe } from './horario';
import { enTurno, semanaConHorario, turnoDe } from './horarios';

export interface HuecoEditable {
  fecha: FechaISO;
  puestoId: Id;
  franjaId: Id;
  plaza: number;
}

export interface OpcionesAsignar {
  /** Si la franja pertenece a un bloque, asigna todas las franjas del bloque. */
  todoElBloque: boolean;
}

const NUEVO_ID_POR_DEFECTO = (): Id => nuevoId('asg');

// ───────────────────────── Claves ─────────────────────────

export function claveHueco(h: HuecoEditable): ClaveHueco {
  return `${h.fecha}|${h.puestoId}|${h.franjaId}|${h.plaza}`;
}

export function claveDeAsignacion(a: AsignacionPuesto): ClaveHueco {
  return claveHueco(a);
}

/** Inversa de `claveHueco`; null si el texto no tiene la forma esperada. */
export function leerClaveHueco(clave: ClaveHueco): HuecoEditable | null {
  const partes = clave.split('|');
  if (partes.length !== 4) return null;
  const [fecha, puestoId, franjaId, plaza] = partes;
  const n = Number(plaza);
  if (!fecha || !puestoId || !franjaId || !Number.isInteger(n)) return null;
  return { fecha, puestoId, franjaId, plaza: n };
}

// ───────────────────────── Franjas objetivo ─────────────────────────

/** Franjas a las que afecta una acción sobre `franjaId`: la suya o todas las de su bloque. */
export function franjasAfectadas(puesto: Puesto, fecha: FechaISO, franjaId: Id, todoElBloque: boolean): Franja[] {
  const horario = horarioDe(puesto, diaSemana(fecha));
  const propia = horario.franjas.find((f) => f.id === franjaId);
  if (!propia) return [];
  if (!todoElBloque) return [propia];
  const bloque = horario.bloques.find((b) => b.franjaIds.includes(franjaId));
  if (!bloque) return [propia];
  return horario.franjas.filter((f) => bloque.franjaIds.includes(f.id));
}

// ───────────────────────── Utilidades internas ─────────────────────────

const VACIO: CuadranteSemana['meta'] = { modo: null, semilla: null, generado: null };

function cuadranteDe(estado: EstadoApp, lunes: FechaISO): CuadranteSemana {
  return estado.cuadrantes[lunes] ?? { lunes, asignaciones: [], meta: { ...VACIO } };
}

function conAsignaciones(estado: EstadoApp, lunes: FechaISO, asignaciones: Asignacion[]): EstadoApp {
  const c = cuadranteDe(estado, lunes);
  return { ...estado, cuadrantes: { ...estado.cuadrantes, [lunes]: { ...c, asignaciones } } };
}

// ───────────────────────── Operaciones ─────────────────────────

/**
 * Asigna `personaId` al hueco (y a todo su bloque si se pide), con origen 'manual'.
 * Lo que hubiera en esos huecos se reemplaza, salvo las asignaciones con candado, que no se tocan
 * (ese hueco queda como estaba). Si no cambia nada, devuelve el mismo estado.
 */
export function asignar(
  estado: EstadoApp,
  lunes: FechaISO,
  hueco: HuecoEditable,
  personaId: Id,
  opciones: OpcionesAsignar,
  ids: () => Id = NUEVO_ID_POR_DEFECTO,
): EstadoApp {
  const puesto = estado.puestos.find((p) => p.id === hueco.puestoId);
  if (!puesto) return estado;
  const franjas = franjasAfectadas(puesto, hueco.fecha, hueco.franjaId, opciones.todoElBloque);
  if (franjas.length === 0) return estado;
  const previas = cuadranteDe(estado, lunes).asignaciones;
  const bloqueadas = new Set<Id>();
  for (const f of franjas) {
    const clave = claveHueco({ ...hueco, franjaId: f.id });
    for (const a of previas) if (a.tipo === 'puesto' && a.bloqueada && claveDeAsignacion(a) === clave) bloqueadas.add(f.id);
  }
  const libres = franjas.filter((f) => !bloqueadas.has(f.id));
  if (libres.length === 0) return estado;
  const claves = new Set(libres.map((f) => claveHueco({ ...hueco, franjaId: f.id })));
  const resto = previas.filter((a) => !(a.tipo === 'puesto' && claves.has(claveDeAsignacion(a))));
  const nuevas: AsignacionPuesto[] = libres.map((f) => ({
    id: ids(),
    tipo: 'puesto',
    fecha: hueco.fecha,
    puestoId: hueco.puestoId,
    franjaId: f.id,
    plaza: hueco.plaza,
    personaId,
    bloqueada: false,
    origen: 'manual',
  }));
  return conAsignaciones(estado, lunes, [...resto, ...nuevas]);
}

/** Quita las asignaciones indicadas (puestos o pausas). */
export function quitar(estado: EstadoApp, lunes: FechaISO, asignacionIds: readonly Id[]): EstadoApp {
  const c = estado.cuadrantes[lunes];
  if (!c) return estado;
  const quitar = new Set(asignacionIds);
  const resto = c.asignaciones.filter((a) => !quitar.has(a.id));
  return resto.length === c.asignaciones.length ? estado : conAsignaciones(estado, lunes, resto);
}

/** Pone o quita el candado de las asignaciones indicadas. */
export function bloquear(estado: EstadoApp, lunes: FechaISO, asignacionIds: readonly Id[], bloqueada: boolean): EstadoApp {
  const c = estado.cuadrantes[lunes];
  if (!c) return estado;
  const objetivo = new Set(asignacionIds);
  let cambio = false;
  const asignaciones = c.asignaciones.map((a) => {
    if (!objetivo.has(a.id) || a.bloqueada === bloqueada) return a;
    cambio = true;
    return { ...a, bloqueada };
  });
  return cambio ? conAsignaciones(estado, lunes, asignaciones) : estado;
}

/** Añade una pausa (comida) manual. Si el tramo no es válido, devuelve el mismo estado. */
export function anadirPausa(
  estado: EstadoApp,
  lunes: FechaISO,
  pausa: { fecha: FechaISO; personaId: Id; inicio: Minutos; fin: Minutos },
  ids: () => Id = NUEVO_ID_POR_DEFECTO,
): EstadoApp {
  if (!(pausa.fin > pausa.inicio) || pausa.inicio < 0 || pausa.fin > 24 * 60) return estado;
  const nueva: AsignacionPausa = {
    id: ids(),
    tipo: 'pausa',
    fecha: pausa.fecha,
    personaId: pausa.personaId,
    inicio: pausa.inicio,
    fin: pausa.fin,
    bloqueada: false,
    origen: 'manual',
  };
  return conAsignaciones(estado, lunes, [...cuadranteDe(estado, lunes).asignaciones, nueva]);
}

/** Quita una pausa; ignora los ids que no sean de pausa y respeta el candado (devuelve el mismo estado). */
export function quitarPausa(estado: EstadoApp, lunes: FechaISO, pausaId: Id): EstadoApp {
  const c = estado.cuadrantes[lunes];
  const pausa = c?.asignaciones.find((a) => a.id === pausaId && a.tipo === 'pausa');
  return pausa && !pausa.bloqueada ? quitar(estado, lunes, [pausaId]) : estado;
}

/** Vacía la semana; con `respetarCandados` conserva las asignaciones bloqueadas. */
export function vaciarSemana(estado: EstadoApp, lunes: FechaISO, opciones: { respetarCandados: boolean }): EstadoApp {
  const c = estado.cuadrantes[lunes];
  if (!c || c.asignaciones.length === 0) return estado;
  const resto = opciones.respetarCandados ? c.asignaciones.filter((a) => a.bloqueada) : [];
  return resto.length === c.asignaciones.length ? estado : conAsignaciones(estado, lunes, resto);
}

/** Semana del ciclo: se mantiene aquí por compatibilidad; la función vive en src/rotacion/ciclo.ts. */
export { semanaDelCiclo };

// ───────────────────────── Ayudas para el editor de celda ─────────────────────────

function enPlantilla(p: Persona, fecha: FechaISO): boolean {
  return p.activa && (p.alta === null || p.alta <= fecha) && (p.baja === null || fecha < p.baja);
}

/**
 * Motivo por el que no conviene asignar a `persona` en esas franjas, o null si está disponible.
 * `ignorar` son las claves de huecos que se van a reemplazar (no cuentan como ocupación).
 */
export function motivoNoDisponible(
  estado: EstadoApp,
  lunes: FechaISO,
  persona: Persona,
  puesto: Puesto,
  fecha: FechaISO,
  franjas: readonly Franja[],
  ignorar: ReadonlySet<ClaveHueco> = new Set(),
): string | null {
  if (!enPlantilla(persona, fecha)) return 'fuera de plantilla';
  const ausente = estado.incidencias.some((i) => {
    if (i.tipo !== 'ausencia' || i.personaId !== persona.id || !enRango(fecha, i.desde, i.hasta)) return false;
    const tramo = i.tramo;
    return tramo === null || franjas.some((f) => seSolapan(f, tramo));
  });
  if (ausente) return 'ausente';
  const semana = semanaDelCiclo(estado.rotacion, lunes);
  // Con horario de la plantilla en la semana, manda el horario: no se aplican los días libres del patrón.
  if (!semanaConHorario(estado, fecha) && persona.patron.some((p) => p.indiceCiclo === semana.indice && p.diasLibres.includes(diaSemana(fecha)))) {
    return 'libra ese día (rotación)';
  }
  if (puesto.requiereHabilitacion && !persona.habilitaciones.includes(puesto.id) && !persona.habilitaciones.includes(puesto.areaId)) {
    return 'sin habilitación';
  }
  const tramos = turnoDe(estado, persona.id, fecha);
  if (tramos !== null && franjas.some((f) => !enTurno(estado, persona.id, fecha, f))) {
    return tramos.length === 0 ? 'libra según el horario' : 'fuera de su turno';
  }
  const ocupada = (estado.cuadrantes[lunes]?.asignaciones ?? []).some((a) => {
    if (a.personaId !== persona.id || a.fecha !== fecha) return false;
    if (a.tipo === 'puesto') {
      if (ignorar.has(claveDeAsignacion(a))) return false;
      const real = franjaDe(estado, a);
      return real !== undefined && franjas.some((f) => seSolapan(f, real));
    }
    return franjas.some((f) => seSolapan(f, a));
  });
  return ocupada ? 'ya ocupada a esa hora' : null;
}

/**
 * Motivo por el que una asignación de puesto ya no encaja en el horario (puesto inexistente, inactivo,
 * cerrado ese día o que no abre, franja o plaza inexistentes), o null si encaja.
 */
export function motivoFueraDeHorario(estado: EstadoApp, a: AsignacionPuesto): string | null {
  const puesto = estado.puestos.find((p) => p.id === a.puestoId);
  if (!puesto) return 'el puesto ya no existe';
  if (!puesto.activo) return 'el puesto está inactivo';
  if (estado.incidencias.some((i) => i.tipo === 'puestoCerrado' && i.puestoId === puesto.id && enRango(a.fecha, i.desde, i.hasta))) {
    return 'el puesto está cerrado ese día';
  }
  if (puesto.vigenteDesde !== null && a.fecha < puesto.vigenteDesde) return 'el puesto aún no existe ese día';
  if (puesto.vigenteHasta !== null && a.fecha > puesto.vigenteHasta) return 'el puesto ya no existe ese día';
  if (!puesto.dias.includes(diaSemana(a.fecha))) return 'el puesto no abre ese día';
  if (!franjaDe(estado, a)) return 'la franja ya no existe';
  if (!Number.isInteger(a.plaza) || a.plaza < 0 || a.plaza >= puesto.plazas) return 'la plaza ya no existe';
  return null;
}

function franjaDe(estado: EstadoApp, a: AsignacionPuesto): Franja | undefined {
  const puesto = estado.puestos.find((p) => p.id === a.puestoId);
  if (!puesto) return undefined;
  return horarioDe(puesto, diaSemana(a.fecha)).franjas.find((f) => f.id === a.franjaId);
}
