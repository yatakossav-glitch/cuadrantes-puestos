/** Edición pura de incidencias: ausencias de personas y cierres de puestos (ARQUITECTURA §12.2). */
import { diaSemana, enRango, esFechaISO, lunesDe, NOMBRES_DIA } from '../modelo/fechas';
import { aHora, intervaloValido, seSolapan } from '../modelo/horas';
import { nuevoId } from '../modelo/ids';
import type { Asignacion, DatosPlanificacion, EstadoApp, FechaISO, Id, Incidencia, Intervalo } from '../modelo/tipos';
import { nombrePuesto } from '../reglas/texto';
import { cuenta } from './comun';
import { horarioDe } from './horario';
import type { Impacto } from './tipos';

export type Ausencia = Extract<Incidencia, { tipo: 'ausencia' }>;
export type Cierre = Extract<Incidencia, { tipo: 'puestoCerrado' }>;
export type Momento = 'pasada' | 'enCurso' | 'futura';

const MAX_NOTA = 200;
const MAX_DIAS_AVISO = 92;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

export function crearAusencia(personaId: Id, desde: FechaISO, ids: () => Id = () => nuevoId('inc')): Ausencia {
  return { id: ids(), tipo: 'ausencia', personaId, desde, hasta: desde, tramo: null, nota: '' };
}

export function crearCierre(puestoId: Id, desde: FechaISO, ids: () => Id = () => nuevoId('inc')): Cierre {
  return { id: ids(), tipo: 'puestoCerrado', puestoId, desde, hasta: desde, nota: '' };
}

export function anadirIncidencia(estado: EstadoApp, inc: Incidencia): EstadoApp {
  return { ...estado, incidencias: [...estado.incidencias, inc] };
}

export function reemplazarIncidencia(estado: EstadoApp, inc: Incidencia): EstadoApp {
  return { ...estado, incidencias: estado.incidencias.map((x) => (x.id === inc.id ? inc : x)) };
}

export function borrarIncidencia(estado: EstadoApp, id: Id): EstadoApp {
  return { ...estado, incidencias: estado.incidencias.filter((x) => x.id !== id) };
}

const codigoPersona = (id: Id, datos: DatosPlanificacion): string =>
  datos.personas.find((p) => p.id === id)?.codigo ?? 'persona desconocida';

/** Día legible; si la fecha no es válida, la devuelve tal cual. */
const diaMes = (f: FechaISO): string => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1] ?? ''}`;
const dia = (f: FechaISO): string => (esFechaISO(f) ? `${NOMBRES_DIA[diaSemana(f)]} ${diaMes(f)}` : f);

// ───────────────────────── Validación ─────────────────────────

export function erroresIncidencia(estado: EstadoApp, inc: Incidencia): string[] {
  const errores: string[] = [];
  const desdeOk = esFechaISO(inc.desde);
  const hastaOk = esFechaISO(inc.hasta);
  if (!desdeOk) errores.push('La fecha «desde» no es válida');
  if (!hastaOk) errores.push('La fecha «hasta» no es válida');
  if (desdeOk && hastaOk && inc.desde > inc.hasta) errores.push('La fecha «desde» no puede ser posterior a «hasta»');
  if (inc.tipo === 'ausencia') {
    if (!estado.personas.some((p) => p.id === inc.personaId)) errores.push('Elige una persona que exista');
    if (inc.tramo !== null && (!intervaloValido(inc.tramo) || inc.tramo.inicio < 0 || inc.tramo.fin > 24 * 60)) {
      errores.push('El tramo horario no es válido: el inicio debe ser anterior al fin, entre 00:00 y 24:00');
    }
  } else if (!estado.puestos.some((p) => p.id === inc.puestoId)) {
    errores.push('Elige un puesto que exista');
  }
  if (inc.nota.length > MAX_NOTA) errores.push(`La nota supera los ${MAX_NOTA} caracteres (tiene ${inc.nota.length})`);
  return errores;
}

const mismoObjetivo = (a: Incidencia, b: Incidencia): boolean =>
  a.tipo === 'ausencia' ? b.tipo === 'ausencia' && a.personaId === b.personaId : b.tipo === 'puestoCerrado' && a.puestoId === b.puestoId;

export function avisosIncidencia(estado: EstadoApp, inc: Incidencia): string[] {
  const avisos: string[] = [];
  if (!esFechaISO(inc.desde) || !esFechaISO(inc.hasta)) return avisos;
  const quien = inc.tipo === 'ausencia' ? codigoPersona(inc.personaId, estado) : nombrePuesto(inc.puestoId, estado);
  const otras = estado.incidencias.filter((x) => x.id !== inc.id && mismoObjetivo(inc, x));
  if (otras.some((x) => x.desde <= inc.hasta && inc.desde <= x.hasta)) {
    avisos.push(`${quien} ya tiene otra incidencia que se solapa con estas fechas`);
  }
  const dias = Math.round((Date.parse(inc.hasta) - Date.parse(inc.desde)) / 86_400_000) + 1;
  if (dias > MAX_DIAS_AVISO) avisos.push(`Dura ${dias} días, más de ${MAX_DIAS_AVISO}: ¿es correcto?`);
  if (inc.tipo === 'ausencia') {
    const p = estado.personas.find((x) => x.id === inc.personaId);
    if (p && !p.activa) avisos.push(`${p.codigo} está marcada como inactiva`);
    if (p && p.baja !== null && p.baja <= inc.hasta) avisos.push(`${p.codigo} causa baja el ${dia(p.baja)}, dentro o antes de estas fechas`);
  }
  return avisos;
}

// ───────────────────────── Impacto ─────────────────────────

/** Asignaciones ya hechas (en `asignacionIds`, incluidas las bloqueadas) de una semana que la incidencia invalida. */
export interface Afectadas {
  lunes: FechaISO;
  asignacionIds: Id[];
  conCandado: number;
}

function afecta(estado: EstadoApp, inc: Incidencia, a: Asignacion): boolean {
  if (!enRango(a.fecha, inc.desde, inc.hasta)) return false;
  if (inc.tipo === 'puestoCerrado') return a.tipo === 'puesto' && a.puestoId === inc.puestoId;
  if (a.personaId !== inc.personaId) return false;
  if (inc.tramo === null) return true;
  let intervalo: Intervalo | null = null;
  if (a.tipo === 'pausa') intervalo = a;
  else {
    const puesto = estado.puestos.find((p) => p.id === a.puestoId);
    intervalo = puesto ? (horarioDe(puesto, diaSemana(a.fecha)).franjas.find((f) => f.id === a.franjaId) ?? null) : null;
  }
  return intervalo !== null && seSolapan(intervalo, inc.tramo);
}

export function afectadasPor(estado: EstadoApp, inc: Incidencia): Afectadas[] {
  if (!esFechaISO(inc.desde) || !esFechaISO(inc.hasta)) return [];
  const resultado: Afectadas[] = [];
  for (const lunes of Object.keys(estado.cuadrantes).sort()) {
    const c = estado.cuadrantes[lunes];
    if (!c) continue;
    const afectadas = c.asignaciones.filter((a) => afecta(estado, inc, a));
    if (afectadas.length > 0) {
      resultado.push({ lunes, asignacionIds: afectadas.map((a) => a.id), conCandado: afectadas.filter((a) => a.bloqueada).length });
    }
  }
  return resultado;
}


function enumerarSemanas(textos: string[]): string {
  if (textos.length <= 1) return textos[0] ?? '';
  return `${textos.slice(0, -1).join(', ')} y ${textos[textos.length - 1]}`;
}

export function impactoIncidencia(estado: EstadoApp, inc: Incidencia): Impacto {
  const afectadas = afectadasPor(estado, inc);
  const total = afectadas.reduce((n, s) => n + s.asignacionIds.length, 0);
  const candados = afectadas.reduce((n, s) => n + s.conCandado, 0);
  const efectos: string[] = [];
  if (total > 0) {
    efectos.push(
      `Afecta a ${cuenta(total, 'asignación ya hecha', 'asignaciones ya hechas')} en ${cuenta(afectadas.length, 'semana', 'semanas')} (${enumerarSemanas(afectadas.map((s) => diaMes(s.lunes)))})`,
    );
  }
  if (candados > 0) {
    efectos.push(`${candados === 1 ? '1 tiene candado y no se quitará sola' : `${candados} tienen candado y no se quitarán solas`}`);
  }
  return { bloqueos: [], efectos };
}

/** Quita las asignaciones afectadas que no tienen candado; con `soloLunes`, solo las de esa semana. */
export function liberarAfectadas(estado: EstadoApp, inc: Incidencia, soloLunes?: FechaISO): EstadoApp {
  const quitar = new Set<Id>();
  const semanas = new Set<FechaISO>();
  for (const s of afectadasPor(estado, inc)) {
    if (soloLunes !== undefined && s.lunes !== soloLunes) continue;
    const c = estado.cuadrantes[s.lunes];
    for (const a of c?.asignaciones ?? []) {
      if (s.asignacionIds.includes(a.id) && !a.bloqueada) {
        quitar.add(a.id);
        semanas.add(s.lunes);
      }
    }
  }
  if (quitar.size === 0) return estado;
  const cuadrantes = { ...estado.cuadrantes };
  for (const lunes of semanas) {
    const c = cuadrantes[lunes];
    if (c) cuadrantes[lunes] = { ...c, asignaciones: c.asignaciones.filter((a) => !quitar.has(a.id)) };
  }
  return { ...estado, cuadrantes };
}

// ───────────────────────── Momento y texto ─────────────────────────

export function momentoIncidencia(inc: Incidencia, hoy: FechaISO): Momento {
  if (inc.hasta < hoy) return 'pasada';
  if (inc.desde > hoy) return 'futura';
  return 'enCurso';
}

export function describirIncidencia(inc: Incidencia, datos: DatosPlanificacion): string {
  const unDia = inc.desde === inc.hasta;
  const cuando = unDia ? `el ${dia(inc.desde)}` : `del ${dia(inc.desde)} al ${dia(inc.hasta)}`;
  if (inc.tipo === 'puestoCerrado') return `${nombrePuesto(inc.puestoId, datos)} cerrada ${cuando}`;
  const tramo = inc.tramo ? ` de ${aHora(inc.tramo.inicio)} a ${aHora(inc.tramo.fin)}` : '';
  return `${codigoPersona(inc.personaId, datos)} ausente ${cuando}${tramo}`;
}
