import { aHora, formatearDuracion } from '../../modelo/horas';
import type { Asignacion, Intervalo, ReglaGeneral } from '../../modelo/tipos';
import type { ContextoEvaluacion, DefinicionReglaGeneral, IndiceSemana, Incumplimiento } from '../contrato';
import { cuando, etiquetaPersona, incumplimientoGeneral, penalizacion, unidades15 } from '../util';
import type { MetadatosReglaGeneral } from '../metadatos';

const DIA_MIN = 24 * 60;

export const metadatos: MetadatosReglaGeneral<'descansoEntreJornadas'> = {
  tipo: 'descansoEntreJornadas',
  nombre: 'Descanso entre jornadas',
  ayuda: 'Tiempo mínimo entre el final de un día de trabajo y el inicio del siguiente.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({ minMin: 720 }),
  describir: (params) => `Descanso mínimo de ${formatearDuracion(params.minMin)} entre una jornada y la siguiente`,
  validarParams(params) {
    if (!Number.isFinite(params.minMin) || params.minMin <= 0 || params.minMin > DIA_MIN) {
      return ['El descanso debe ser mayor que 0 y no superar 24h.'];
    }
    return [];
  },
  campos: [
    { clave: 'minMin', etiqueta: 'Descanso mínimo', tipo: 'duracion', ayuda: 'Horas libres entre el fin de una jornada y el inicio de la siguiente.', min: 1, max: DIA_MIN },
  ],
};

/** Asignaciones que fijan el fin (o el inicio) de la jornada del día: las que acaban (empiezan) en ese minuto. */
function extremo(indice: IndiceSemana, personaId: string, fecha: string, lado: 'inicio' | 'fin', minuto: number): Asignacion[] {
  return indice.dePersonaDia(personaId, fecha).filter((a) => {
    if (a.tipo !== 'puesto' || indice.horario(a.puestoId, a.fecha) === null) return false;
    const iv = indice.intervalo(a);
    return iv !== undefined && iv[lado] === minuto;
  });
}

/** Unidades de incumplimiento entre dos jornadas consecutivas (0 si descansa lo suficiente o falta una). */
function unidadesPar(minMin: number, j1: Intervalo | null, j2: Intervalo | null): number {
  if (!j1 || !j2) return 0;
  const descanso = 24 * 60 - j1.fin + j2.inicio;
  return descanso >= minMin ? 0 : unidades15(minMin - descanso);
}

function mensajeDescanso(indice: IndiceSemana, id: string, hoy: string, j1: Intervalo, manana: string, j2: Intervalo, minMin: number): string {
  const descanso = 24 * 60 - j1.fin + j2.inicio;
  return `${etiquetaPersona(indice.persona(id))} descansa solo ${formatearDuracion(descanso)} entre ${cuando(hoy)} (termina a las ${aHora(j1.fin)}) y ${cuando(manana)} (empieza a las ${aHora(j2.inicio)}); mínimo ${formatearDuracion(minMin)}`;
}

function evaluar(regla: ReglaGeneral<'descansoEntreJornadas'>, ctx: ContextoEvaluacion): Incumplimiento[] {
  const { indice } = ctx;
  const personas = new Set(indice.asignaciones().map((a) => a.personaId));
  const resultado: Incumplimiento[] = [];
  for (const id of personas) {
    for (let i = 0; i + 1 < indice.fechas.length; i += 1) {
      const hoy = indice.fechas[i];
      const manana = indice.fechas[i + 1];
      if (!hoy || !manana) continue;
      const j1 = indice.jornada(id, hoy);
      const j2 = indice.jornada(id, manana);
      if (!j1 || !j2) continue;
      const descanso = 24 * 60 - j1.fin + j2.inicio;
      if (descanso >= regla.params.minMin) continue;
      resultado.push(
        incumplimientoGeneral(regla, {
          mensaje: mensajeDescanso(indice, id, hoy, j1, manana, j2, regla.params.minMin),
          fecha: manana,
          personaId: id,
          asignacionIds: [...extremo(indice, id, hoy, 'fin', j1.fin), ...extremo(indice, id, manana, 'inicio', j2.inicio)].map((a) => a.id),
          unidades: unidades15(regla.params.minMin - descanso),
        }),
      );
    }
  }
  return resultado;
}

export const definicion: DefinicionReglaGeneral<'descansoEntreJornadas'> = {
  ...metadatos,
  evaluar,
  comprobar(regla, ctx, candidata) {
    const { indice } = ctx;
    const libre = { permitido: true, coste: 0, motivos: [] };
    const iv = candidata.tipo === 'puesto' ? indice.intervalo(candidata) : undefined;
    const dia = indice.fechas.indexOf(candidata.fecha);
    if (candidata.tipo !== 'puesto' || !iv || dia < 0 || indice.horario(candidata.puestoId, candidata.fecha) === null) return libre;
    const id = candidata.personaId;
    const antes = indice.jornada(id, candidata.fecha);
    const despues: Intervalo = antes
      ? { inicio: Math.min(antes.inicio, iv.inicio), fin: Math.max(antes.fin, iv.fin) }
      : { inicio: iv.inicio, fin: iv.fin };
    const minMin = regla.params.minMin;
    const ayer = dia > 0 ? indice.jornada(id, indice.fechas[dia - 1] ?? '') : null;
    const manana = dia + 1 < indice.fechas.length ? indice.jornada(id, indice.fechas[dia + 1] ?? '') : null;
    const motivos: string[] = [];
    let bloquea = false;
    let unidadesAntes = 0;
    let unidadesDespues = 0;
    // Par con el día anterior: la candidata cuenta si fija el inicio de la jornada de hoy.
    const uAyer = unidadesPar(minMin, ayer, despues);
    unidadesAntes += unidadesPar(minMin, ayer, antes);
    unidadesDespues += uAyer;
    if (uAyer > 0 && ayer) {
      if (iv.inicio === despues.inicio) bloquea = true;
      motivos.push(mensajeDescanso(indice, id, indice.fechas[dia - 1] ?? '', ayer, candidata.fecha, despues, minMin));
    }
    // Par con el día siguiente: la candidata cuenta si fija el fin de la jornada de hoy.
    const uManana = unidadesPar(minMin, despues, manana);
    unidadesAntes += unidadesPar(minMin, antes, manana);
    unidadesDespues += uManana;
    if (uManana > 0 && manana) {
      if (iv.fin === despues.fin) bloquea = true;
      motivos.push(mensajeDescanso(indice, id, candidata.fecha, despues, indice.fechas[dia + 1] ?? '', manana, minMin));
    }
    return {
      permitido: !(regla.dura && bloquea),
      coste: Math.max(0, penalizacion(regla.dura, regla.peso, unidadesDespues - unidadesAntes)),
      motivos,
    };
  },
};
