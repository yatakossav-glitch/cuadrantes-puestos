/** Utilidades comunes a las reglas (§10.1). Funciones puras. */
import { formatearIntervalo } from '../modelo/horas';
import { NOMBRES_DIA, diaSemana } from '../modelo/fechas';
import { conAsignacion } from '../validacion/indice';
import type {
  Ambito,
  Asignacion,
  ClaveHueco,
  FechaISO,
  Id,
  Intervalo,
  Minutos,
  Persona,
  Puesto,
  ReglaGeneral,
  RestriccionPersona,
} from '../modelo/tipos';
import type { Comprobacion, ContextoEvaluacion, Incumplimiento, MarcaCelda } from './contrato';

/** ceil(min / 15); 0 si min ≤ 0. */
export function unidades15(min: Minutos): number {
  return min <= 0 ? 0 : Math.ceil(min / 15);
}

/** 0 si es dura; si no, peso × unidades. */
export function penalizacion(dura: boolean, peso: number, unidades: number): number {
  return dura ? 0 : peso * unidades;
}

/** Ámbito vacío = todo; si no, el puesto listado o de un área listada. */
export function enAmbito(ambito: Ambito, puesto: Puesto): boolean {
  if (ambito.areaIds.length === 0 && ambito.puestoIds.length === 0) return true;
  return ambito.puestoIds.includes(puesto.id) || ambito.areaIds.includes(puesto.areaId);
}

/** Código de la persona (nunca el alias: los mensajes pueden acabar exportados). */
export function etiquetaPersona(p: Persona | undefined): string {
  return p ? p.codigo : 'Persona desconocida';
}

/** «el jueves 26/11» o «el jueves 26/11 19:00–22:00». */
export function cuando(fecha: FechaISO, intervalo?: Intervalo): string {
  const [, mes, dia] = fecha.split('-');
  const base = `el ${NOMBRES_DIA[diaSemana(fecha)]} ${dia}/${mes}`;
  return intervalo ? `${base} ${formatearIntervalo(intervalo)}` : base;
}

export interface CamposIncumplimiento {
  mensaje: string;
  /** Por defecto 'aviso'. */
  marca?: MarcaCelda;
  fecha?: FechaISO | null;
  personaId?: Id | null;
  asignacionIds?: Id[];
  huecos?: ClaveHueco[];
  /** Por defecto 1. */
  unidades?: number;
}

function rellenar(
  base: Pick<Incumplimiento, 'reglaId' | 'origen' | 'tipo' | 'dura'>,
  peso: number,
  c: CamposIncumplimiento,
): Incumplimiento {
  return {
    ...base,
    penalizacion: penalizacion(base.dura, peso, c.unidades ?? 1),
    mensaje: c.mensaje,
    marca: c.marca ?? 'aviso',
    fecha: c.fecha ?? null,
    personaId: c.personaId ?? null,
    asignacionIds: c.asignacionIds ?? [],
    huecos: c.huecos ?? [],
  };
}

export function incumplimientoGeneral(regla: ReglaGeneral, campos: CamposIncumplimiento): Incumplimiento {
  return rellenar({ reglaId: regla.id, origen: 'general', tipo: regla.tipo, dura: regla.dura }, regla.peso, campos);
}

export function incumplimientoRestriccion(
  r: RestriccionPersona,
  persona: Persona,
  campos: CamposIncumplimiento,
): Incumplimiento {
  return rellenar(
    { reglaId: r.id, origen: 'persona', tipo: r.tipo, dura: r.dura },
    r.peso,
    { personaId: persona.id, ...campos },
  );
}

/**
 * `comprobar` genérico, coherente con `evaluar` por construcción: evalúa sin y con la candidata.
 * permitido = ningún incumplimiento duro nuevo (clave = mensaje); coste = max(0, penalización
 * después − antes); motivos = mensajes nuevos.
 */
export function comprobarPorDiferencia(
  evaluar: (ctx: ContextoEvaluacion) => Incumplimiento[],
  ctx: ContextoEvaluacion,
  candidata: Asignacion,
): Comprobacion {
  const antes = evaluar(ctx);
  const despues = evaluar({ datos: ctx.datos, indice: conAsignacion(ctx.indice, ctx.datos, candidata) });
  const previos = new Set(antes.map((i) => i.mensaje));
  const nuevos = despues.filter((i) => !previos.has(i.mensaje));
  const suma = (l: Incumplimiento[]) => l.reduce((s, i) => s + i.penalizacion, 0);
  return {
    permitido: !nuevos.some((i) => i.dura),
    coste: Math.max(0, suma(despues) - suma(antes)),
    motivos: [...new Set(nuevos.map((i) => i.mensaje))],
  };
}
