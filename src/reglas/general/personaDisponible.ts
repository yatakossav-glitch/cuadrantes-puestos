import type { DatosPlanificacion, ReglaGeneral } from '../../modelo/tipos';
import type { Asignacion } from '../../modelo/tipos';
import { describirTurno, enTurno, figuraEnHorario, semanaConHorario, turnoDe } from '../../edicion/horarios';
import { NOMBRES_DIA, diaSemana } from '../../modelo/fechas';
import { semanaDelCiclo } from '../../rotacion/ciclo';
import type { ContextoEvaluacion, DefinicionReglaGeneral, IndiceSemana, Incumplimiento } from '../contrato';
import { cuando, etiquetaPersona, incumplimientoGeneral, penalizacion } from '../util';
import type { MetadatosReglaGeneral } from '../metadatos';

export const metadatos: MetadatosReglaGeneral<'personaDisponible'> = {
  tipo: 'personaDisponible',
  nombre: 'Persona disponible',
  ayuda: 'No se asigna a quien está de baja, ausente, fuera de plantilla o fuera de su turno del horario semanal.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({}),
  describir: () => 'No asignar a quien está de baja, ausente o fuera de plantilla',
  validarParams: () => [],
  campos: [],
};

function motivoNoDisponible(a: Asignacion, indice: IndiceSemana, datos: DatosPlanificacion): string | null {
  const rotacion = datos.rotacion;
  const persona = indice.persona(a.personaId);
  const iv = indice.intervalo(a);
  if (!persona) return 'no existe';
  if (!persona.activa) return 'está marcada como inactiva';
  if (!indice.enPlantilla(persona.id, a.fecha)) {
    return persona.alta !== null && a.fecha < persona.alta ? 'aún no se ha incorporado' : 'ya no está en plantilla';
  }
  if (iv && indice.ausente(persona.id, a.fecha, iv)) return 'está ausente';
  const dia = diaSemana(a.fecha);
  // Si la semana tiene horario de la plantilla, ese es el real: no se aplican los días libres del patrón.
  const semana = semanaDelCiclo(rotacion, indice.lunes);
  const paso = persona.patron.find((p) => p.indiceCiclo === semana.indice);
  if (!semanaConHorario(datos, a.fecha) && paso?.diasLibres.includes(dia)) return `libra el ${NOMBRES_DIA[dia]} en la semana ${semana.etiqueta}`;
  // Horario semanal de la plantilla (si la semana lo tiene). Las pausas no se marcan por horario.
  if (iv && a.tipo === 'puesto') {
    const tramos = turnoDe(datos, persona.id, a.fecha);
    if (tramos !== null && !enTurno(datos, persona.id, a.fecha, iv)) {
      if (!figuraEnHorario(datos, persona.id, indice.lunes)) return 'no figura en el horario de la semana';
      if (tramos.length === 0) return 'libra según el horario de la semana';
      return `no está de turno a esa hora (su turno: ${describirTurno(tramos)})`;
    }
  }
  return null;
}

function evaluar(regla: ReglaGeneral<'personaDisponible'>, ctx: ContextoEvaluacion): Incumplimiento[] {
  const { indice } = ctx;
  const resultado: Incumplimiento[] = [];
  for (const a of indice.asignaciones()) {
    const persona = indice.persona(a.personaId);
    const iv = indice.intervalo(a);
    const motivo = motivoNoDisponible(a, indice, ctx.datos);
    if (!motivo) continue;
    const quien = persona ? etiquetaPersona(persona) : 'Una persona asignada';
    resultado.push(
      incumplimientoGeneral(regla, {
        mensaje: `${quien} ${motivo} y tiene asignación ${cuando(a.fecha, iv)}`,
        marca: 'noDisponible',
        fecha: a.fecha,
        personaId: a.personaId,
        asignacionIds: [a.id],
      }),
    );
  }
  return resultado;
}

export const definicion: DefinicionReglaGeneral<'personaDisponible'> = {
  ...metadatos,
  evaluar,
  comprobar(regla, ctx, candidata) {
    const { indice } = ctx;
    if (!indice.fechas.includes(candidata.fecha)) return { permitido: true, coste: 0, motivos: [] };
    const motivo = motivoNoDisponible(candidata, indice, ctx.datos);
    if (!motivo) return { permitido: true, coste: 0, motivos: [] };
    const persona = indice.persona(candidata.personaId);
    const quien = persona ? etiquetaPersona(persona) : 'Una persona asignada';
    return {
      permitido: !regla.dura,
      coste: penalizacion(regla.dura, regla.peso, 1),
      motivos: [`${quien} ${motivo} ${cuando(candidata.fecha, indice.intervalo(candidata))}`],
    };
  },
};
