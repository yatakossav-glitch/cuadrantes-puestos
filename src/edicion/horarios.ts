/**
 * Horario semanal de la plantilla (§13.2). Funciones puras.
 * `turnoDe` y `enTurno` los llama el motor miles de veces: usan una caché por objeto `datos.horarios`
 * (que se sustituye entero en cada edición, así que la caché nunca queda obsoleta).
 */
import { NOMBRES_DIA, diaSemana, sumarDias } from '../modelo/fechas';
import { aHora, contiene, duracion, intervaloValido } from '../modelo/horas';
import { nuevoId } from '../modelo/ids';
import type {
  DatosPlanificacion,
  Equipo,
  EstadoApp,
  FechaISO,
  HorarioSemana,
  Id,
  Intervalo,
  Minutos,
  Persona,
  Puesto,
  TurnoDia,
} from '../modelo/tipos';
import { normalizarCodigo } from '../persistencia/coherencia';
import { codigoCanonico } from '../importar/horario';
import type { LecturaHorario } from '../importar/horario';
import { cuenta } from './comun';
import { anadirPersona, crearPersona } from './personas';
import type { Impacto } from './tipos';

// ───────────────────────── Caché de consulta ─────────────────────────

interface IndiceHorarios {
  /** `${personaId}|${fecha}` → tramos. */
  turnos: Map<string, Intervalo[]>;
  /** fecha → lunes, solo de las semanas que tienen horario. */
  semanaDe: Map<FechaISO, FechaISO>;
  /** `${lunes}|${personaId}` de quienes figuran en el horario de esa semana. */
  figuran: Set<string>;
  lunes: Set<FechaISO>;
}

const cache = new WeakMap<object, IndiceHorarios>();
const SIN_TRAMOS: Intervalo[] = [];

function indiceDe(horarios: Record<FechaISO, HorarioSemana>): IndiceHorarios {
  let indice = cache.get(horarios);
  if (indice) return indice;
  indice = { turnos: new Map(), semanaDe: new Map(), figuran: new Set(), lunes: new Set() };
  for (const [lunes, h] of Object.entries(horarios)) {
    indice.lunes.add(lunes);
    for (let i = 0; i < 7; i++) {
      try {
        indice.semanaDe.set(sumarDias(lunes, i), lunes);
      } catch {
        break; // clave que no es una fecha: se ignora (la coherencia ya lo avisa)
      }
    }
    for (const t of h.turnos) {
      indice.turnos.set(`${t.personaId}|${t.fecha}`, t.tramos);
      indice.figuran.add(`${lunes}|${t.personaId}`);
    }
  }
  cache.set(horarios, indice);
  return indice;
}

/** ¿La semana de `fecha` tiene horario? */
export function semanaConHorario(datos: DatosPlanificacion, fecha: FechaISO): boolean {
  return indiceDe(datos.horarios).semanaDe.has(fecha);
}

/** ¿Figura la persona en el horario de la semana de `lunes`? (false si la semana no tiene horario) */
export function figuraEnHorario(datos: DatosPlanificacion, personaId: Id, lunes: FechaISO): boolean {
  return indiceDe(datos.horarios).figuran.has(`${lunes}|${personaId}`);
}

/** Tramos de trabajo de la persona ese día. null = la semana no tiene horario; [] = libra (o no figura). */
export function turnoDe(datos: DatosPlanificacion, personaId: Id, fecha: FechaISO): Intervalo[] | null {
  const indice = indiceDe(datos.horarios);
  if (!indice.semanaDe.has(fecha)) return null;
  return indice.turnos.get(`${personaId}|${fecha}`) ?? SIN_TRAMOS;
}

/** true si no hay horario esa semana o `iv` cabe entero en un tramo del turno. */
export function enTurno(datos: DatosPlanificacion, personaId: Id, fecha: FechaISO, iv: Intervalo): boolean {
  const tramos = turnoDe(datos, personaId, fecha);
  if (tramos === null) return true;
  for (const t of tramos) if (contiene(t, iv)) return true;
  return false;
}

// ───────────────────────── Texto ─────────────────────────

/** 'Libra' · '10:00–15:45' · '10:00–14:00 y 17:00–21:00' · 'Sin horario'. */
export function describirTurno(tramos: Intervalo[] | null): string {
  if (tramos === null) return 'Sin horario';
  if (tramos.length === 0) return 'Libra';
  return tramos.map((t) => `${aHora(t.inicio)}–${aHora(t.fin)}`).join(' y ');
}

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-11-30' → '30 nov'. */
function diaMes(fecha: FechaISO): string {
  const [, m, d] = fecha.split('-');
  return `${Number(d)} ${MESES_CORTO[Number(m) - 1] ?? m}`;
}

/** Minutos de trabajo de la persona en todo el horario de la semana. */
export function minutosDeTurno(horario: HorarioSemana, personaId: Id): Minutos {
  let total = 0;
  for (const t of horario.turnos) {
    if (t.personaId === personaId) for (const tr of t.tramos) total += duracion(tr);
  }
  return total;
}

// ───────────────────────── Construcción ─────────────────────────

/** Horario a guardar a partir de lo leído: solo filas con persona; días que no venían → libra; si hay códigos repetidos gana la última fila. */
export function horarioDesdeLectura(lectura: LecturaHorario, ahora: string | null = null): HorarioSemana {
  const porPersona = new Map<Id, TurnoDia[]>();
  for (const fila of lectura.filas) {
    if (fila.personaId === null) continue;
    const turnos: TurnoDia[] = fila.dias.map((celda, i) => ({
      personaId: fila.personaId as Id,
      fecha: sumarDias(lectura.lunes, i),
      tramos: celda ? celda.tramos.map((t) => ({ inicio: t.inicio, fin: t.fin })) : [],
    }));
    porPersona.set(fila.personaId, turnos);
  }
  return { lunes: lectura.lunes, turnos: [...porPersona.values()].flat(), actualizado: ahora };
}

function ordenar(tramos: readonly Intervalo[]): Intervalo[] {
  return tramos.map((t) => ({ inicio: t.inicio, fin: t.fin })).sort((a, b) => a.inicio - b.inicio);
}

// ───────────────────────── Edición ─────────────────────────

function intervaloAsignacion(estado: EstadoApp, puestoId: Id, fecha: FechaISO, franjaId: Id): Intervalo | undefined {
  const puesto: Puesto | undefined = estado.puestos.find((p) => p.id === puestoId);
  if (!puesto) return undefined;
  const h = puesto.horario.porDia[diaSemana(fecha)] ?? puesto.horario.general;
  return h.franjas.find((f) => f.id === franjaId);
}

export function impactoGuardarHorario(estado: EstadoApp, horario: HorarioSemana): Impacto {
  const efectos: string[] = [];
  const existe = estado.horarios[horario.lunes] !== undefined;
  efectos.push(
    existe
      ? `Reemplazará el horario de la semana del ${diaMes(horario.lunes)}`
      : `Guardará el horario de la semana del ${diaMes(horario.lunes)}`,
  );

  // Asignaciones de puestos ya hechas que quedarían fuera de turno.
  const datos: DatosPlanificacion = { ...estado, horarios: { ...estado.horarios, [horario.lunes]: horario } };
  const fuera: string[] = [];
  let nFuera = 0;
  for (const a of estado.cuadrantes[horario.lunes]?.asignaciones ?? []) {
    if (a.tipo !== 'puesto') continue;
    const iv = intervaloAsignacion(estado, a.puestoId, a.fecha, a.franjaId);
    if (!iv || enTurno(datos, a.personaId, a.fecha, iv)) continue;
    nFuera += 1;
    const codigo = estado.personas.find((p) => p.id === a.personaId)?.codigo ?? 'Una persona';
    const ejemplo = `${codigo} ${NOMBRES_DIA[diaSemana(a.fecha)]}`;
    if (fuera.length < 3 && !fuera.includes(ejemplo)) fuera.push(ejemplo);
  }
  if (nFuera > 0) {
    efectos.push(
      `${cuenta(nFuera, 'asignación ya hecha queda', 'asignaciones ya hechas quedan')} fuera de turno (${fuera.join(', ')}${
        nFuera > fuera.length ? '…' : ''
      }): puedes recubrirlas desde el Cuadrante`,
    );
  }

  const figuran = new Set(horario.turnos.map((t) => t.personaId));
  const sinHorario = estado.personas.filter((p) => p.activa && !figuran.has(p.id)).length;
  if (sinHorario > 0) {
    efectos.push(
      `${cuenta(sinHorario, 'persona activa no figura y no trabajará', 'personas activas no figuran y no trabajarán')} esa semana`,
    );
  }
  return { bloqueos: [], efectos };
}

export function guardarHorario(estado: EstadoApp, horario: HorarioSemana): EstadoApp {
  return { ...estado, horarios: { ...estado.horarios, [horario.lunes]: horario } };
}

export function quitarHorario(estado: EstadoApp, lunes: FechaISO): EstadoApp {
  if (estado.horarios[lunes] === undefined) return estado;
  const { [lunes]: _quitado, ...resto } = estado.horarios;
  return { ...estado, horarios: resto };
}

/** Cambia el turno de una persona un día (la semana debe tener horario o se crea vacío). Tramos inválidos se descartan. Si se pasa `ahora`, actualiza `actualizado`. */
export function cambiarTurno(
  estado: EstadoApp,
  lunes: FechaISO,
  personaId: Id,
  fecha: FechaISO,
  tramos: Intervalo[],
  ahora?: string | null,
): EstadoApp {
  const actual: HorarioSemana = estado.horarios[lunes] ?? { lunes, turnos: [], actualizado: null };
  const nuevo: TurnoDia = { personaId, fecha, tramos: ordenar(tramos.filter(intervaloValido)) };
  const hay = actual.turnos.some((t) => t.personaId === personaId && t.fecha === fecha);
  const turnos = hay
    ? actual.turnos.map((t) => (t.personaId === personaId && t.fecha === fecha ? nuevo : t))
    : [...actual.turnos, nuevo];
  return guardarHorario(estado, { ...actual, turnos, actualizado: ahora === undefined ? actual.actualizado : ahora });
}

export interface OpcionesCrearPersonas {
  /** Nombre por código: se guarda como alias (solo vive en este navegador). */
  alias?: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
  /** Ids de áreas o puestos para los que quedan habilitadas las personas nuevas. */
  habilitaciones?: readonly Id[];
  /** Equipo por código (p. ej. deducido del horario); sin entrada, el de por defecto. */
  equipos?: ReadonlyMap<string, Equipo> | Readonly<Record<string, Equipo>>;
}

function mapaDeAlias(alias: OpcionesCrearPersonas['alias']): Map<string, string> {
  const r = new Map<string, string>();
  if (!alias) return r;
  const pares = alias instanceof Map ? [...alias] : Object.entries(alias);
  for (const [codigo, nombre] of pares) if (nombre.trim() !== '') r.set(normalizarCodigo(codigo), nombre.trim());
  return r;
}

function mapaDeEquipos(equipos: OpcionesCrearPersonas['equipos']): Map<string, Equipo> {
  const r = new Map<string, Equipo>();
  if (!equipos) return r;
  for (const [codigo, equipo] of equipos instanceof Map ? [...equipos] : Object.entries(equipos)) r.set(normalizarCodigo(codigo), equipo);
  return r;
}

/** 'EMP 7' → 'EMP-07'; los códigos alfanuméricos sin separadores (10000001, A1234B) se respetan en mayúsculas. */
function codigoParaCrear(texto: string): string {
  const t = texto.trim();
  return /^emp/i.test(t) || !/^[\p{L}\d]+$/u.test(t) ? codigoCanonico(t) : t.toUpperCase();
}

/** Crea una persona por cada código que no exista ya (comparando con `normalizarCodigo`); con alias y habilitaciones si se indican. */
export function crearPersonasDesdeCodigos(
  estado: EstadoApp,
  codigos: readonly string[],
  ids: () => Id = () => nuevoId('per'),
  opciones: OpcionesCrearPersonas = {},
): EstadoApp {
  let resultado = estado;
  const alias = mapaDeAlias(opciones.alias);
  const equipos = mapaDeEquipos(opciones.equipos);
  const vistos = new Set(estado.personas.map((p) => normalizarCodigo(p.codigo)));
  for (const texto of codigos) {
    const codigo = codigoParaCrear(texto);
    const clave = normalizarCodigo(codigo);
    if (!clave || vistos.has(clave)) continue;
    vistos.add(clave);
    resultado = anadirPersona(resultado, {
      ...crearPersona(resultado, ids),
      codigo,
      alias: alias.get(clave) ?? null,
      equipo: equipos.get(clave) ?? 'M',
      habilitaciones: [...(opciones.habilitaciones ?? [])],
    });
  }
  return resultado;
}

/** Pone como alias el nombre de las personas existentes que aún no tienen alias. Devuelve el mismo estado si no cambia nada. */
export function ponerAliasDesdeNombres(estado: EstadoApp, nombres: OpcionesCrearPersonas['alias']): EstadoApp {
  const alias = mapaDeAlias(nombres);
  let cambia = false;
  const personas = estado.personas.map((p) => {
    const nombre = alias.get(normalizarCodigo(p.codigo));
    if (nombre === undefined || (p.alias !== null && p.alias.trim() !== '')) return p;
    cambia = true;
    return { ...p, alias: nombre };
  });
  return cambia ? { ...estado, personas } : estado;
}

// ───────────────────────── Varias semanas a la vez (§14) ─────────────────────────

/** Guarda (o reemplaza) varias semanas de horario en un solo paso. */
export function guardarHorarios(estado: EstadoApp, horarios: readonly HorarioSemana[]): EstadoApp {
  if (horarios.length === 0) return estado;
  const nuevos = { ...estado.horarios };
  for (const h of horarios) nuevos[h.lunes] = h;
  return { ...estado, horarios: nuevos };
}

export function impactoGuardarHorarios(estado: EstadoApp, horarios: readonly HorarioSemana[]): Impacto {
  const efectos: string[] = [];
  const reemplazadas = horarios.filter((h) => estado.horarios[h.lunes] !== undefined).length;
  const nuevas = horarios.length - reemplazadas;
  if (nuevas > 0) efectos.push(`Guardará ${cuenta(nuevas, 'semana nueva', 'semanas nuevas')} de horario`);
  if (reemplazadas > 0) efectos.push(`Reemplazará el horario de ${cuenta(reemplazadas, 'semana que ya lo tenía', 'semanas que ya lo tenían')}`);

  const datos: DatosPlanificacion = guardarHorarios(estado, horarios);
  const ejemplos: string[] = [];
  let nFuera = 0;
  for (const h of horarios) {
    for (const a of estado.cuadrantes[h.lunes]?.asignaciones ?? []) {
      if (a.tipo !== 'puesto') continue;
      const iv = intervaloAsignacion(estado, a.puestoId, a.fecha, a.franjaId);
      if (!iv || enTurno(datos, a.personaId, a.fecha, iv)) continue;
      nFuera += 1;
      const codigo = estado.personas.find((p) => p.id === a.personaId)?.codigo ?? 'Una persona';
      const ejemplo = `${codigo} ${NOMBRES_DIA[diaSemana(a.fecha)]} ${diaMes(a.fecha)}`;
      if (ejemplos.length < 3 && !ejemplos.includes(ejemplo)) ejemplos.push(ejemplo);
    }
  }
  if (nFuera > 0) {
    efectos.push(
      `${cuenta(nFuera, 'asignación ya hecha queda', 'asignaciones ya hechas quedan')} fuera de turno (${ejemplos.join(', ')}${
        nFuera > ejemplos.length ? '…' : ''
      }): puedes recubrirlas desde el Cuadrante`,
    );
  }

  const figuran = new Set(horarios.flatMap((h) => h.turnos.map((t) => t.personaId)));
  const sinHorario = estado.personas.filter((p) => p.activa && !figuran.has(p.id)).length;
  if (sinHorario > 0) {
    efectos.push(
      `${cuenta(sinHorario, 'persona activa no figura y no trabajará', 'personas activas no figuran y no trabajarán')} en esas semanas`,
    );
  }
  return { bloqueos: [], efectos };
}

// ───────────────────────── Personas que no figuran y cierres de días sin nadie ─────────────────────────

/** Personas activas que no figuran en ninguna de las semanas dadas. */
export function personasSinHorario(estado: EstadoApp, horarios: readonly HorarioSemana[]): Persona[] {
  const figuran = new Set(horarios.flatMap((h) => h.turnos.map((t) => t.personaId)));
  return estado.personas.filter((p) => p.activa && !figuran.has(p.id));
}

/** Desactiva (no borra) a las personas activas que no figuran en ninguna de las semanas dadas. */
export function desactivarPersonasSinHorario(estado: EstadoApp, horarios: readonly HorarioSemana[]): EstadoApp {
  const ids = new Set(personasSinHorario(estado, horarios).map((p) => p.id));
  if (ids.size === 0) return estado;
  return { ...estado, personas: estado.personas.map((p) => (ids.has(p.id) ? { ...p, activa: false } : p)) };
}

/** Fechas (únicas y ordenadas) que aún no tienen cierre en ese puesto. */
function fechasPorPuesto(estado: EstadoApp, puestoId: Id, fechas: readonly FechaISO[]): FechaISO[] {
  const cierres = estado.incidencias.filter((i) => i.tipo === 'puestoCerrado' && i.puestoId === puestoId);
  return [...new Set(fechas)].sort().filter((f) => !cierres.some((c) => f >= c.desde && f <= c.hasta));
}

/** Cuántos cierres (un puesto, un tramo de días seguidos) crearía `cerrarPuestosEnDias`. */
export function cierresNuevos(estado: EstadoApp, fechas: readonly FechaISO[]): number {
  let n = 0;
  for (const p of estado.puestos) {
    if (!p.activo) continue;
    let anterior: FechaISO | null = null;
    for (const f of fechasPorPuesto(estado, p.id, fechas)) {
      if (anterior === null || sumarDias(anterior, 1) !== f) n += 1;
      anterior = f;
    }
  }
  return n;
}

/** Crea incidencias «puesto cerrado» de todos los puestos activos para esos días (los seguidos van en una sola incidencia; no repite cierres que ya existen). */
export function cerrarPuestosEnDias(estado: EstadoApp, fechas: readonly FechaISO[], ids: () => Id = () => nuevoId('inc')): EstadoApp {
  const nuevas: EstadoApp['incidencias'] = [];
  for (const p of estado.puestos) {
    if (!p.activo) continue;
    let tramo: { desde: FechaISO; hasta: FechaISO } | null = null;
    const cerrar = () => {
      if (tramo) nuevas.push({ id: ids(), tipo: 'puestoCerrado', puestoId: p.id, desde: tramo.desde, hasta: tramo.hasta, nota: '' });
    };
    for (const f of fechasPorPuesto(estado, p.id, fechas)) {
      if (tramo && sumarDias(tramo.hasta, 1) === f) tramo.hasta = f;
      else {
        cerrar();
        tramo = { desde: f, hasta: f };
      }
    }
    cerrar();
  }
  return nuevas.length === 0 ? estado : { ...estado, incidencias: [...estado.incidencias, ...nuevas] };
}
