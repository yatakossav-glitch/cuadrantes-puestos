import type { Comprobacion, ContextoEvaluacion, DefinicionReglaGeneral, Incumplimiento } from '../contrato';
import { cuando, etiquetaPersona, incumplimientoGeneral, penalizacion } from '../util';
import { formatearIntervalo, seSolapan } from '../../modelo/horas';
import type { Asignacion, AsignacionPausa, Id, ReglaGeneral } from '../../modelo/tipos';
import { aHora, formatearDuracion } from '../../modelo/horas';
import type { MetadatosReglaGeneral } from '../metadatos';
import { describirDias, enumerar, erroresDias } from '../texto';

const DIA_MIN = 24 * 60;

export const metadatos: MetadatosReglaGeneral<'comidasEscalonadas'> = {
  tipo: 'comidasEscalonadas',
  nombre: 'Comidas escalonadas',
  ayuda: 'Pausa para comer en jornadas largas, repartida en franjas con un máximo de personas a la vez.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({
    dias: [6],
    umbralJornadaMin: 480,
    duracionMin: 60,
    franjas: [
      { inicio: 14 * 60, fin: 15 * 60, maxPersonas: 4 },
      { inicio: 15 * 60, fin: 16 * 60, maxPersonas: 4 },
      { inicio: 16 * 60, fin: 17 * 60, maxPersonas: 3 },
    ],
  }),
  describir(params) {
    const dia = describirDias(params.dias, 'ningún día');
    const dia1 = dia.charAt(0).toUpperCase() + dia.slice(1);
    const franjas = enumerar(
      params.franjas.map((f) => `${aHora(f.inicio)}–${aHora(f.fin)} (máx. ${f.maxPersonas})`),
    );
    return `${dia1}: comida de ${formatearDuracion(params.duracionMin)} para jornadas de más de ${formatearDuracion(params.umbralJornadaMin)}, entre ${franjas}`;
  },
  validarParams(params) {
    const errores: string[] = [];
    errores.push(...erroresDias(params.dias, true, 'Días'));
    if (!Number.isFinite(params.umbralJornadaMin) || params.umbralJornadaMin <= 0 || params.umbralJornadaMin > DIA_MIN) {
      errores.push('La jornada mínima para tener comida debe ser mayor que 0 y no superar 24h.');
    }
    if (!Number.isFinite(params.duracionMin) || params.duracionMin <= 0 || params.duracionMin > DIA_MIN) {
      errores.push('La duración de la comida debe ser mayor que 0 y no superar 24h.');
    }
    if (params.franjas.length === 0) errores.push('Añade al menos una franja de comida.');
    for (const f of params.franjas) {
      if (!(f.inicio >= 0 && f.fin <= DIA_MIN && f.inicio < f.fin)) {
        errores.push('Cada franja de comida debe tener un inicio anterior al fin, entre 00:00 y 24:00.');
      }
      if (!Number.isInteger(f.maxPersonas) || f.maxPersonas < 1) {
        errores.push('Cada franja de comida debe permitir al menos 1 persona.');
      }
    }
    const ordenadas = [...params.franjas].sort((a, b) => a.inicio - b.inicio);
    if (ordenadas.some((f, i) => i > 0 && f.inicio < (ordenadas[i - 1]?.fin ?? 0))) {
      errores.push('Las franjas de comida no pueden solaparse.');
    }
    const mayor = params.franjas.reduce((m, f) => Math.max(m, f.fin - f.inicio), 0);
    if (params.franjas.length > 0 && params.duracionMin > mayor) {
      errores.push('La comida dura más que la franja más larga; no cabría en ninguna.');
    }
    return [...new Set(errores)];
  },
  campos: [
    { clave: 'dias', etiqueta: 'Días', tipo: 'dias', ayuda: 'Días en que se aplica la comida.' },
    { clave: 'umbralJornadaMin', etiqueta: 'Jornada a partir de', tipo: 'duracion', ayuda: 'Quien trabaje más que esto ese día tiene comida.', min: 1, max: DIA_MIN },
    { clave: 'duracionMin', etiqueta: 'Duración de la comida', tipo: 'duracion', ayuda: 'Tiempo de la pausa.', min: 1, max: DIA_MIN },
    { clave: 'franjas', etiqueta: 'Franjas de comida', tipo: 'franjasComida', ayuda: 'Horas en que se puede comer y cuántas personas a la vez.' },
  ],
};

function evaluar(regla: ReglaGeneral<'comidasEscalonadas'>, ctx: ContextoEvaluacion, conJornadaLarga = true): Incumplimiento[] {
  const { indice } = ctx;
  const { dias, umbralJornadaMin, duracionMin, franjas } = regla.params;
  const resultado: Incumplimiento[] = [];
  const dentro = (p: AsignacionPausa) => franjas.some((f) => f.inicio <= p.inicio && p.fin <= f.fin);
  const valida = (p: AsignacionPausa) => p.fin - p.inicio >= duracionMin && dentro(p);

  for (const fecha of indice.fechas) {
    if (!dias.includes(indice.diaDe(fecha))) continue;
    const delDia = indice.asignaciones().filter((a) => a.fecha === fecha);
    const personas: Id[] = [...new Set(delDia.map((a) => a.personaId))];

    // (a) jornada larga sin pausa válida.
    for (const personaId of conJornadaLarga ? personas : []) {
      const jornada = indice.jornada(personaId, fecha);
      if (!jornada || jornada.fin - jornada.inicio <= umbralJornadaMin) continue;
      if (indice.pausasDe(personaId, fecha).some(valida)) continue;
      resultado.push(
        incumplimientoGeneral(regla, {
          mensaje: `${etiquetaPersona(indice.persona(personaId))} trabaja ${formatearIntervalo(jornada)} ${cuando(fecha)} y no tiene una pausa de ${duracionMin} min para comer en las franjas de comida`,
          fecha,
          personaId,
          asignacionIds: indice.dePersonaDia(personaId, fecha).map((a) => a.id),
        }),
      );
    }

    const pausas = delDia.filter((a): a is AsignacionPausa => a.tipo === 'pausa');
    for (const p of pausas) {
      const codigo = etiquetaPersona(indice.persona(p.personaId));
      // (b) pausa de quien no trabaja ese día.
      if (indice.jornada(p.personaId, fecha) === null) {
        resultado.push(
          incumplimientoGeneral(regla, {
            mensaje: `${codigo} tiene una pausa de comida ${cuando(fecha, p)} pero no trabaja ese día`,
            marca: 'comidaSinTurno',
            fecha,
            personaId: p.personaId,
            asignacionIds: [p.id],
          }),
        );
      }
      // (c) pausa fuera de las franjas de comida o demasiado corta.
      if (!valida(p)) {
        resultado.push(
          incumplimientoGeneral(regla, {
            mensaje: `La pausa de ${codigo} ${cuando(fecha, p)} no cumple: debe durar al menos ${duracionMin} min y estar dentro de una franja de comida`,
            fecha,
            personaId: p.personaId,
            asignacionIds: [p.id],
          }),
        );
      }
    }

    // (d) franja de comida con demasiadas pausas a la vez.
    for (const franja of franjas) {
      const enFranja = pausas.filter((p) => seSolapan(p, franja));
      if (enFranja.length <= franja.maxPersonas) continue;
      resultado.push(
        incumplimientoGeneral(regla, {
          mensaje: `Hay ${enFranja.length} personas comiendo ${cuando(fecha, franja)} y el máximo es ${franja.maxPersonas}`,
          fecha,
          asignacionIds: enFranja.map((p) => p.id),
        }),
      );
    }
  }
  return resultado;
}

/** ¿Tiene la persona esa jornada larga sin una pausa válida (criterio (a))? `extra` es una asignación de puesto añadida. */
function largaSinPausa(
  regla: ReglaGeneral<'comidasEscalonadas'>,
  ctx: ContextoEvaluacion,
  personaId: Id,
  fecha: string,
  extra?: { inicio: number; fin: number },
): boolean {
  const { indice } = ctx;
  const { umbralJornadaMin, duracionMin, franjas } = regla.params;
  const j = indice.jornada(personaId, fecha);
  const inicio = Math.min(j?.inicio ?? Infinity, extra?.inicio ?? Infinity);
  const fin = Math.max(j?.fin ?? -Infinity, extra?.fin ?? -Infinity);
  if (!Number.isFinite(inicio) || fin - inicio <= umbralJornadaMin) return false;
  return !indice
    .pausasDe(personaId, fecha)
    .some((p) => p.fin - p.inicio >= duracionMin && franjas.some((f) => f.inicio <= p.inicio && p.fin <= f.fin));
}

/**
 * Coste y bloqueo de una candidata. El criterio (a) nunca bloquea (las pausas se colocan después, §10.4)
 * pero, si la regla es blanda, su coste cuenta de forma exacta (penalización después − antes).
 * Una asignación de puesto solo puede resolver un (b) o crear un (a); solo una pausa puede incumplir (b), (c) o (d).
 */
function comprobar(regla: ReglaGeneral<'comidasEscalonadas'>, ctx: ContextoEvaluacion, candidata: Asignacion): Comprobacion {
  const { indice } = ctx;
  const { dias, duracionMin, franjas } = regla.params;
  const sinEfecto: Comprobacion = { permitido: true, coste: 0, motivos: [] };
  if (!indice.fechas.includes(candidata.fecha)) return sinEfecto;
  if (!dias.includes(indice.diaDe(candidata.fecha))) return sinEfecto;
  const codigo = etiquetaPersona(indice.persona(candidata.personaId));
  if (candidata.tipo === 'puesto') {
    if (regla.dura) return sinEfecto;
    const iv = indice.horario(candidata.puestoId, candidata.fecha) ? indice.intervalo(candidata) : undefined;
    if (!iv) return sinEfecto;
    const antes = largaSinPausa(regla, ctx, candidata.personaId, candidata.fecha);
    const despues = largaSinPausa(regla, ctx, candidata.personaId, candidata.fecha, iv);
    // Sus pausas dejan de ser «de quien no trabaja» al empezar a trabajar ese día.
    const resueltos = indice.jornada(candidata.personaId, candidata.fecha) === null ? indice.pausasDe(candidata.personaId, candidata.fecha).length : 0;
    const neto = (despues ? 1 : 0) - (antes ? 1 : 0) - resueltos;
    return {
      permitido: true,
      coste: neto > 0 ? penalizacion(false, regla.peso, neto) : 0,
      motivos: !antes && despues ? [`${codigo} pasaría a tener una jornada que exige comida ${cuando(candidata.fecha)}`] : [],
    };
  }
  const motivos: string[] = [];
  let nuevos = 0;
  // (b) pausa de quien no trabaja ese día.
  if (indice.jornada(candidata.personaId, candidata.fecha) === null) {
    nuevos += 1;
    motivos.push(`${codigo} tiene una pausa de comida ${cuando(candidata.fecha, candidata)} pero no trabaja ese día`);
  }
  // (c) pausa fuera de las franjas de comida o demasiado corta.
  const valida =
    candidata.fin - candidata.inicio >= duracionMin && franjas.some((f) => f.inicio <= candidata.inicio && candidata.fin <= f.fin);
  if (!valida) {
    nuevos += 1;
    motivos.push(`La pausa de ${codigo} ${cuando(candidata.fecha, candidata)} no cumple: debe durar al menos ${duracionMin} min y estar dentro de una franja de comida`);
  }
  // (d) franja de comida con demasiadas pausas a la vez: bloquea si la candidata la solapa y se pasa.
  let pausas: AsignacionPausa[] | null = null;
  for (const franja of franjas) {
    if (!seSolapan(candidata, franja)) continue;
    pausas ??= indice.asignaciones().filter((a): a is AsignacionPausa => a.tipo === 'pausa' && a.fecha === candidata.fecha);
    const antes = pausas.filter((p) => seSolapan(p, franja)).length;
    if (antes + 1 <= franja.maxPersonas) continue;
    motivos.push(`Hay ${antes + 1} personas comiendo ${cuando(candidata.fecha, franja)} y el máximo es ${franja.maxPersonas}`);
    if (antes <= franja.maxPersonas) nuevos += 1;
  }
  // Una pausa válida resuelve el criterio (a) de quien tenía jornada larga sin comida.
  const resuelveA = valida && largaSinPausa(regla, ctx, candidata.personaId, candidata.fecha) ? 1 : 0;
  const neto = Math.max(0, nuevos - resuelveA);
  return {
    permitido: !(regla.dura && motivos.length > 0),
    coste: penalizacion(regla.dura, regla.peso, neto),
    motivos,
  };
}

export const definicion: DefinicionReglaGeneral<'comidasEscalonadas'> = {
  ...metadatos,
  evaluar: (regla, ctx) => evaluar(regla, ctx),
  comprobar,
};
