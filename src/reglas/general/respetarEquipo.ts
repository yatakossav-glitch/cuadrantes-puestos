import type { Comprobacion, ContextoEvaluacion, DefinicionReglaGeneral, Incumplimiento } from '../contrato';
import { cuando, etiquetaPersona, incumplimientoGeneral } from '../util';
import type { Asignacion, AsignacionPuesto, FechaISO, Id, ReglaGeneral } from '../../modelo/tipos';
import { figuraEnHorario, semanaConHorario } from '../../edicion/horarios';
import { lunesDe } from '../../modelo/fechas';
import { aHora } from '../../modelo/horas';
import type { DiaSemana } from '../../modelo/tipos';
import type { MetadatosReglaGeneral } from '../metadatos';
import { describirDias, erroresDias } from '../texto';

/** [6] → 'el domingo'; [5,6] → 'en sábado y domingo'; [0..4] → 'de lunes a viernes'. */
function frasePermitidos(dias: readonly DiaSemana[]): string {
  const texto = describirDias(dias);
  if (texto.startsWith('de ') || texto.startsWith('todos')) return texto;
  return new Set(dias).size === 1 ? `el ${texto}` : `en ${texto}`;
}

export const metadatos: MetadatosReglaGeneral<'respetarEquipo'> = {
  tipo: 'respetarEquipo',
  nombre: 'Respetar equipo de mañana o tarde',
  ayuda: 'Cada persona trabaja en las franjas de su equipo, con un número limitado de días al contrario.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({ maxDiasContrarioSemana: 1, diasPermitidos: [] }),
  describir(params, datos) {
    const n = params.maxDiasContrarioSemana;
    const base = `Cada persona trabaja en su equipo (mañana o tarde, corte a las ${aHora(datos.config.corteMananaTarde)})`;
    if (n === 0) return `${base}, sin días al contrario`;
    const cuando = params.diasPermitidos.length === 0 ? '' : `, solo ${frasePermitidos(params.diasPermitidos)}`;
    return `${base}; hasta ${n} ${n === 1 ? 'día' : 'días'} a la semana al contrario${cuando}`;
  },
  validarParams(params) {
    const errores: string[] = [];
    const n = params.maxDiasContrarioSemana;
    if (!Number.isInteger(n) || n < 0 || n > 7) errores.push('Los días al contrario por semana deben ser un número entero de 0 a 7.');
    errores.push(...erroresDias(params.diasPermitidos, false, 'Días permitidos'));
    return errores;
  },
  campos: [
    { clave: 'maxDiasContrarioSemana', etiqueta: 'Días al contrario por semana', tipo: 'entero', ayuda: 'Cuántos días puede alguien trabajar en el turno que no es el suyo.', min: 0, max: 7 },
    { clave: 'diasPermitidos', etiqueta: 'Días permitidos', tipo: 'dias', ayuda: 'Solo esos días se puede cambiar de turno. Vacío = cualquier día.' },
  ],
};

/** ¿Es una franja contraria al equipo efectivo de la persona ese día? */
function esContraria(a: AsignacionPuesto, ctx: ContextoEvaluacion): boolean {
  // Con horario de la plantilla en la semana, su turno ya dice cuándo trabaja quien figura en él.
  if (semanaConHorario(ctx.datos, a.fecha) && figuraEnHorario(ctx.datos, a.personaId, lunesDe(a.fecha))) return false;
  const equipo = ctx.indice.equipoEfectivo(a.personaId, a.fecha);
  const iv = ctx.indice.intervalo(a);
  if (equipo === 'A' || !iv) return false;
  const esTarde = iv.inicio >= ctx.datos.config.corteMananaTarde;
  return (equipo === 'M') === esTarde;
}

/**
 * Incumplimientos de una persona a partir de sus días con franjas contrarias.
 * El exceso de días contrarios depende de todos los días admitidos hasta él: todos contribuyen.
 */
function violacionesPersona(
  regla: ReglaGeneral<'respetarEquipo'>,
  ctx: ContextoEvaluacion,
  personaId: Id,
  dias: Map<FechaISO, AsignacionPuesto[]>,
): { fecha: FechaISO; mensaje: string; ids: Id[] }[] {
  const { indice } = ctx;
  const resultado: { fecha: FechaISO; mensaje: string; ids: Id[] }[] = [];
  const codigo = etiquetaPersona(indice.persona(personaId));
  const acumuladas: Id[] = [];
  let admitidos = 0;
  for (const fecha of [...dias.keys()].sort()) {
    const asignaciones = dias.get(fecha) ?? [];
    const equipo = indice.equipoEfectivo(personaId, fecha);
    const turno = equipo === 'M' ? 'de tarde' : 'de mañana';
    const permitidosVacio = regla.params.diasPermitidos.length === 0;
    if (!permitidosVacio && !regla.params.diasPermitidos.includes(indice.diaDe(fecha))) {
      resultado.push({
        fecha,
        mensaje: `${codigo} (equipo ${equipo}) trabaja ${turno} ${cuando(fecha)}, un día en que no se permite`,
        ids: asignaciones.map((x) => x.id),
      });
      continue;
    }
    admitidos += 1;
    acumuladas.push(...asignaciones.map((x) => x.id));
    if (admitidos > regla.params.maxDiasContrarioSemana) {
      const max = regla.params.maxDiasContrarioSemana;
      resultado.push({
        fecha,
        mensaje: `${codigo} (equipo ${equipo}) trabaja ${turno} ${cuando(fecha)}, por encima del máximo de ${max} día${max === 1 ? '' : 's'} a la semana`,
        ids: [...acumuladas],
      });
    }
  }
  return resultado;
}

function evaluar(regla: ReglaGeneral<'respetarEquipo'>, ctx: ContextoEvaluacion): Incumplimiento[] {
  const { indice } = ctx;
  // Por persona: días con alguna franja contraria a su equipo.
  const contrarios = new Map<Id, Map<FechaISO, AsignacionPuesto[]>>();
  for (const a of indice.asignaciones()) {
    if (a.tipo !== 'puesto' || !esContraria(a, ctx)) continue;
    const dias = contrarios.get(a.personaId) ?? new Map<FechaISO, AsignacionPuesto[]>();
    const lista = dias.get(a.fecha) ?? [];
    lista.push(a);
    dias.set(a.fecha, lista);
    contrarios.set(a.personaId, dias);
  }
  const resultado: Incumplimiento[] = [];
  for (const [personaId, dias] of contrarios) {
    for (const v of violacionesPersona(regla, ctx, personaId, dias)) {
      resultado.push(incumplimientoGeneral(regla, { mensaje: v.mensaje, fecha: v.fecha, personaId, asignacionIds: v.ids }));
    }
  }
  return resultado;
}

function comprobar(regla: ReglaGeneral<'respetarEquipo'>, ctx: ContextoEvaluacion, candidata: Asignacion): Comprobacion {
  const { indice } = ctx;
  const sinEfecto: Comprobacion = { permitido: true, coste: 0, motivos: [] };
  if (candidata.tipo !== 'puesto' || !indice.fechas.includes(candidata.fecha) || !esContraria(candidata, ctx)) return sinEfecto;
  const dias = new Map<FechaISO, AsignacionPuesto[]>();
  for (const a of indice.dePersona(candidata.personaId)) {
    if (a.tipo !== 'puesto' || !esContraria(a, ctx)) continue;
    const lista = dias.get(a.fecha) ?? [];
    lista.push(a);
    dias.set(a.fecha, lista);
  }
  const antes = violacionesPersona(regla, ctx, candidata.personaId, dias);
  const conCandidata = new Map(dias);
  conCandidata.set(candidata.fecha, [...(dias.get(candidata.fecha) ?? []), candidata]);
  const despues = violacionesPersona(regla, ctx, candidata.personaId, conCandidata);
  const suyas = despues.filter((v) => v.ids.includes(candidata.id));
  return {
    permitido: !(regla.dura && suyas.length > 0),
    coste: regla.dura ? 0 : Math.max(0, regla.peso * (despues.length - antes.length)),
    motivos: suyas.map((v) => v.mensaje),
  };
}

export const definicion: DefinicionReglaGeneral<'respetarEquipo'> = {
  ...metadatos,
  evaluar,
  comprobar,
};
