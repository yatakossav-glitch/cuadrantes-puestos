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
  EstadoApp,
  FechaISO,
  HorarioSemana,
  Id,
  Intervalo,
  Minutos,
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

/** Crea una persona por cada código que no exista ya (comparando con `normalizarCodigo`), sin habilitaciones. */
export function crearPersonasDesdeCodigos(
  estado: EstadoApp,
  codigos: readonly string[],
  ids: () => Id = () => nuevoId('per'),
): EstadoApp {
  let resultado = estado;
  const vistos = new Set(estado.personas.map((p) => normalizarCodigo(p.codigo)));
  for (const texto of codigos) {
    const codigo = codigoCanonico(texto);
    const clave = normalizarCodigo(codigo);
    if (!clave || vistos.has(clave)) continue;
    vistos.add(clave);
    resultado = anadirPersona(resultado, { ...crearPersona(resultado, ids), codigo });
  }
  return resultado;
}
