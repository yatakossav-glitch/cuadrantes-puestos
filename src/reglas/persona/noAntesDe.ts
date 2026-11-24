import type { Persona, RestriccionPersona } from '../../modelo/tipos';
import type { ContextoEvaluacion, DefinicionRestriccion, Incumplimiento } from '../contrato';
import { cuando, etiquetaPersona, incumplimientoRestriccion } from '../util';
import { LIBRE, comprobarRapido, puestosDelDia, resultado } from './comun';
import type { Asignacion } from '../../modelo/tipos';
import type { MetadatosRestriccion } from '../metadatos';
import { aHora } from '../../modelo/horas';
import { describirDias, erroresDias } from '../texto';

export const metadatos: MetadatosRestriccion<'noAntesDe'> = {
  tipo: 'noAntesDe',
  nombre: 'No empezar antes de una hora',
  ayuda: 'No se le asignan puestos que empiecen antes de esta hora.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({ hora: 600, dias: [] }),
  describir: (params) => {
    const base = `No empezar antes de las ${aHora(params.hora)}`;
    return params.dias.length === 0 ? base : `${base} (${describirDias(params.dias)})`;
  },
  validarParams: (params) => {
    const errores: string[] = [];
    if (!Number.isInteger(params.hora) || params.hora < 0 || params.hora > 24 * 60) {
      errores.push('La hora debe estar entre las 00:00 y las 24:00.');
    }
    errores.push(...erroresDias(params.dias, false, 'Días'));
    return errores;
  },
  campos: [
    { clave: 'hora', etiqueta: 'No empezar antes de', tipo: 'hora', ayuda: 'Hora límite.' },
    { clave: 'dias', etiqueta: 'Días', tipo: 'dias', ayuda: 'Sin marcar ninguno, vale para todos los días.' },
  ],
};

function evaluar(
  restriccion: RestriccionPersona<'noAntesDe'>,
  persona: Persona,
  ctx: ContextoEvaluacion,
): Incumplimiento[] {
  const { hora, dias } = restriccion.params;
  const res: Incumplimiento[] = [];
  for (const fecha of ctx.indice.fechas) {
    if (dias.length > 0 && !dias.includes(ctx.indice.diaDe(fecha))) continue;
    const afectadas = puestosDelDia(ctx, persona, fecha).filter((a) => (ctx.indice.intervalo(a)?.inicio ?? hora) < hora);
    if (afectadas.length === 0) continue;
    const primera = Math.min(...afectadas.map((a) => ctx.indice.intervalo(a)?.inicio ?? hora));
    res.push(
      incumplimientoRestriccion(restriccion, persona, {
        mensaje: `${etiquetaPersona(persona)} empieza antes de las ${aHora(hora)} ${cuando(fecha)} (${aHora(primera)})`,
        marca: 'noDisponible',
        fecha,
        asignacionIds: afectadas.map((a) => a.id),
      }),
    );
  }
  return res;
}


const comprobar = comprobarRapido<'noAntesDe'>((restriccion, persona, ctx, info) => {
  const { hora, dias } = restriccion.params;
  const fecha = info.candidata.fecha;
  if (dias.length > 0 && !dias.includes(ctx.indice.diaDe(fecha))) return LIBRE;
  const incumple = (a: Asignacion): boolean => {
    const iv = ctx.indice.intervalo(a);
    return iv !== undefined && iv.inicio < hora;
  };
  const extremos = [...puestosDelDia(ctx, persona, fecha), info.candidata].filter(incumple).map((a) => ctx.indice.intervalo(a)?.inicio ?? hora);
  const extremo = Math.min(hora, ...extremos);
  const nueva = info.intervalo !== undefined && incumple(info.candidata);
  const antes = puestosDelDia(ctx, persona, fecha).some(incumple);
  return resultado(restriccion, nueva, antes ? restriccion.peso : 0, antes || nueva ? restriccion.peso : 0, `${etiquetaPersona(persona)} empieza antes de las ${aHora(hora)} ${cuando(fecha)} (${aHora(extremo)})`);
});

export const definicion: DefinicionRestriccion<'noAntesDe'> = { ...metadatos, evaluar, comprobar };
