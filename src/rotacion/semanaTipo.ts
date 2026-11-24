/** Semanas tipo del ciclo de rotación (ARQUITECTURA §12.1). Puro. */
import { motivoFueraDeHorario } from '../edicion/cuadrante';
import { diaSemana, esFechaISO, fechasSemana, sumarDias } from '../modelo/fechas';
import { nuevoId } from '../modelo/ids';
import type { Asignacion, AsignacionTipo, DatosPlanificacion, EstadoApp, FechaISO, Id, Rotacion, SemanaTipo } from '../modelo/tipos';
import { semanaDelCiclo } from './ciclo';

/** Semana tipo guardada para la semana `indiceCiclo` del ciclo, si existe. */
export function semanaTipoDeCiclo(datos: DatosPlanificacion, indiceCiclo: number): SemanaTipo | undefined {
  return datos.semanasTipo.find((s) => s.indiceCiclo === indiceCiclo);
}

/** Semana tipo del ciclo llevada a fechas (origen 'semanaTipo', sin candado). */
export function asignacionesDeSemanaTipo(datos: DatosPlanificacion, lunes: FechaISO): Asignacion[] {
  const { indice } = semanaDelCiclo(datos.rotacion, lunes);
  const semana = semanaTipoDeCiclo(datos, indice);
  if (!semana) return [];
  return semana.asignaciones.map((a): Asignacion => {
    const fecha = sumarDias(lunes, a.dia);
    const id = `${a.id}@${fecha}`;
    if (a.tipo === 'pausa') {
      return { id, tipo: 'pausa', fecha, inicio: a.inicio, fin: a.fin, personaId: a.personaId, bloqueada: false, origen: 'semanaTipo' };
    }
    return {
      id,
      tipo: 'puesto',
      fecha,
      puestoId: a.puestoId,
      franjaId: a.franjaId,
      plaza: a.plaza,
      personaId: a.personaId,
      bloqueada: false,
      origen: 'semanaTipo',
    };
  });
}

/**
 * Convierte las asignaciones de una semana en asignaciones de semana tipo: solo las fechas de esa semana,
 * fecha → día, sin origen, sin candado; omite las de puestos fuera de horario.
 */
export function aSemanaTipo(
  datos: DatosPlanificacion,
  lunes: FechaISO,
  asignaciones: readonly Asignacion[],
  ids: () => Id = () => nuevoId('asg'),
): AsignacionTipo[] {
  const fechas = new Set(fechasSemana(lunes));
  const estado: EstadoApp = { ...datos, cuadrantes: {} };
  const resultado: AsignacionTipo[] = [];
  for (const a of asignaciones) {
    if (!fechas.has(a.fecha)) continue;
    const dia = diaSemana(a.fecha);
    if (a.tipo === 'pausa') {
      resultado.push({ id: ids(), tipo: 'pausa', dia, inicio: a.inicio, fin: a.fin, personaId: a.personaId, bloqueada: false });
      continue;
    }
    if (motivoFueraDeHorario(estado, a) !== null) continue;
    resultado.push({
      id: ids(),
      tipo: 'puesto',
      dia,
      puestoId: a.puestoId,
      franjaId: a.franjaId,
      plaza: a.plaza,
      personaId: a.personaId,
      bloqueada: false,
    });
  }
  return resultado;
}

/** Próximas `semanas` semanas desde `desdeLunes` con su posición y etiqueta en el ciclo. */
export function calendarioCiclo(
  rotacion: Rotacion,
  desdeLunes: FechaISO,
  semanas: number,
): { lunes: FechaISO; indice: number; etiqueta: string }[] {
  if (!esFechaISO(desdeLunes)) return [];
  return Array.from({ length: Math.max(0, semanas) }, (_, i) => {
    const lunes = sumarDias(desdeLunes, 7 * i);
    return { lunes, ...semanaDelCiclo(rotacion, lunes) };
  });
}
