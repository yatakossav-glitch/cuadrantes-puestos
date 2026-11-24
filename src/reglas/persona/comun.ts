/** Utilidades compartidas por las restricciones personales. Funciones puras. */
import type { Asignacion, AsignacionPuesto, FechaISO, Intervalo, Persona, RestriccionPersona, TipoRestriccion } from '../../modelo/tipos';
import type { Comprobacion, ContextoEvaluacion, Incumplimiento } from '../contrato';

export type EvaluarPersona<T extends TipoRestriccion> = (
  restriccion: RestriccionPersona<T>,
  persona: Persona,
  ctx: ContextoEvaluacion,
) => Incumplimiento[];

/** Asignaciones de puesto de la persona ese día, en orden. */
export function puestosDelDia(ctx: ContextoEvaluacion, persona: Persona, fecha: FechaISO): AsignacionPuesto[] {
  return ctx.indice
    .dePersonaDia(persona.id, fecha)
    .filter((a): a is AsignacionPuesto => a.tipo === 'puesto');
}

// ───────────────────────── comprobar especializado (fase 4) ─────────────────────────

export const LIBRE: Comprobacion = { permitido: true, coste: 0, motivos: [] };

/** Lo que una candidata aporta a su persona y día, sin reconstruir el índice. */
export interface InfoCandidata {
  candidata: Asignacion;
  /** La candidata, si es de puesto (null si es pausa). */
  puesto: AsignacionPuesto | null;
  intervalo: Intervalo | undefined;
  /** Duración que sumaría a las horas (0 si no cuenta: franja inexistente, puesto cerrado o inactivo). */
  minutos: number;
  /** ¿Entra en `minutosDia`, `jornada` y `diasTrabajados`? */
  cuenta: boolean;
}

export function infoCandidata(ctx: ContextoEvaluacion, candidata: Asignacion): InfoCandidata {
  const intervalo = ctx.indice.intervalo(candidata);
  if (candidata.tipo !== 'puesto') return { candidata, puesto: null, intervalo, minutos: 0, cuenta: false };
  const cuenta = intervalo !== undefined && ctx.indice.horario(candidata.puestoId, candidata.fecha) !== null;
  return { candidata, puesto: candidata, intervalo, minutos: cuenta && intervalo ? intervalo.fin - intervalo.inicio : 0, cuenta };
}

/** ¿Trabajaría la persona ese día tras añadir la candidata? */
export function trabajaraEseDia(ctx: ContextoEvaluacion, persona: Persona, info: InfoCandidata): boolean {
  return info.cuenta || ctx.indice.diasTrabajados(persona.id).includes(info.candidata.fecha);
}

/**
 * `comprobar` especializado: ignora otra persona y fechas fuera de la semana, y (salvo `conPausas`)
 * las pausas, que no afectan a estas reglas.
 */
export function comprobarRapido<T extends TipoRestriccion>(
  rapido: (restriccion: RestriccionPersona<T>, persona: Persona, ctx: ContextoEvaluacion, info: InfoCandidata) => Comprobacion,
  conPausas = false,
) {
  return (restriccion: RestriccionPersona<T>, persona: Persona, ctx: ContextoEvaluacion, candidata: Asignacion): Comprobacion => {
    if (candidata.personaId !== persona.id) return LIBRE;
    if (candidata.tipo !== 'puesto' && !conPausas) return LIBRE;
    if (!ctx.indice.fechas.includes(candidata.fecha)) return LIBRE;
    return rapido(restriccion, persona, ctx, infoCandidata(ctx, candidata));
  };
}

/** Resultado estándar: bloquea si es dura y se incumple; coste = max(0, después − antes). */
export function resultado(
  restriccion: RestriccionPersona,
  incumpleDespues: boolean,
  penalAntes: number,
  penalDespues: number,
  motivo: string,
): Comprobacion {
  return {
    permitido: !(restriccion.dura && incumpleDespues),
    coste: restriccion.dura ? 0 : Math.max(0, penalDespues - penalAntes),
    motivos: incumpleDespues ? [motivo] : [],
  };
}
