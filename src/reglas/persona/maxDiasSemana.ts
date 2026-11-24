import type { Persona, RestriccionPersona } from '../../modelo/tipos';
import type { ContextoEvaluacion, DefinicionRestriccion, Incumplimiento } from '../contrato';
import { etiquetaPersona, incumplimientoRestriccion } from '../util';
import { comprobarRapido, resultado } from './comun';
import type { MetadatosRestriccion } from '../metadatos';

export const metadatos: MetadatosRestriccion<'maxDiasSemana'> = {
  tipo: 'maxDiasSemana',
  nombre: 'Máximo de días a la semana',
  ayuda: 'Número máximo de días distintos en los que puede trabajar.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({ max: 5 }),
  describir: (params) => `Máximo ${params.max} ${params.max === 1 ? 'día' : 'días'} a la semana`,
  validarParams: (params) =>
    Number.isInteger(params.max) && params.max >= 1 && params.max <= 7 ? [] : ['El máximo de días debe estar entre 1 y 7.'],
  campos: [{ clave: 'max', etiqueta: 'Máximo de días', tipo: 'entero', ayuda: 'Entre 1 y 7.', min: 1, max: 7 }],
};

function evaluar(
  restriccion: RestriccionPersona<'maxDiasSemana'>,
  persona: Persona,
  ctx: ContextoEvaluacion,
): Incumplimiento[] {
  const dias = ctx.indice.diasTrabajados(persona.id);
  if (dias.length <= restriccion.params.max) return [];
  const { max } = restriccion.params;
  return [
    incumplimientoRestriccion(restriccion, persona, {
      mensaje: `${etiquetaPersona(persona)} trabaja ${dias.length} días esta semana y el máximo es ${max}`,
      asignacionIds: ctx.indice.dePersona(persona.id).filter((a) => a.tipo === 'puesto').map((a) => a.id),
    }),
  ];
}


const comprobar = comprobarRapido<'maxDiasSemana'>((restriccion, persona, ctx, info) => {
  const { max } = restriccion.params;
  const dias = ctx.indice.diasTrabajados(persona.id);
  const despues = dias.length + (info.cuenta && !dias.includes(info.candidata.fecha) ? 1 : 0);
  return resultado(restriccion, despues > max, dias.length > max ? restriccion.peso : 0, despues > max ? restriccion.peso : 0,
    `${etiquetaPersona(persona)} trabaja ${despues} días esta semana y el máximo es ${max}`);
});

export const definicion: DefinicionRestriccion<'maxDiasSemana'> = { ...metadatos, evaluar, comprobar };
