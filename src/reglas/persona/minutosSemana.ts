import type { Persona, RestriccionPersona } from '../../modelo/tipos';
import type { ContextoEvaluacion, DefinicionRestriccion, Incumplimiento } from '../contrato';
import { etiquetaPersona, incumplimientoRestriccion, unidades15 } from '../util';
import { comprobarRapido } from './comun';
import type { MetadatosRestriccion } from '../metadatos';
import { formatearDuracion } from '../../modelo/horas';

const SEMANA = 7 * 24 * 60;

export const metadatos: MetadatosRestriccion<'minutosSemana'> = {
  tipo: 'minutosSemana',
  nombre: 'Horas a la semana',
  ayuda: 'Mínimo y/o máximo de tiempo cubriendo puestos en la semana.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({ minMin: null, maxMin: 1800 }),
  describir: ({ minMin, maxMin }) => {
    if (minMin !== null && maxMin !== null) return `Entre ${formatearDuracion(minMin)} y ${formatearDuracion(maxMin)} a la semana`;
    if (maxMin !== null) return `Como mucho ${formatearDuracion(maxMin)} a la semana`;
    if (minMin !== null) return `Al menos ${formatearDuracion(minMin)} a la semana`;
    return 'Sin límite de horas a la semana';
  },
  validarParams: ({ minMin, maxMin }) => {
    const errores: string[] = [];
    if (minMin === null && maxMin === null) errores.push('Indica un mínimo, un máximo o ambos.');
    for (const v of [minMin, maxMin]) {
      if (v !== null && (!Number.isInteger(v) || v <= 0 || v > SEMANA)) {
        errores.push('Las horas a la semana deben ser mayores que 0 y caber en una semana.');
        break;
      }
    }
    if (minMin !== null && maxMin !== null && minMin > maxMin) errores.push('El mínimo no puede ser mayor que el máximo.');
    return errores;
  },
  campos: [
    { clave: 'minMin', etiqueta: 'Mínimo a la semana', tipo: 'duracion', anulable: true, ayuda: 'Déjalo sin límite si no hay mínimo.', min: 1, max: SEMANA },
    { clave: 'maxMin', etiqueta: 'Máximo a la semana', tipo: 'duracion', anulable: true, ayuda: 'Déjalo sin límite si no hay máximo.', min: 1, max: SEMANA },
  ],
};

function evaluar(
  restriccion: RestriccionPersona<'minutosSemana'>,
  persona: Persona,
  ctx: ContextoEvaluacion,
): Incumplimiento[] {
  const { minMin, maxMin } = restriccion.params;
  const total = ctx.indice.minutosSemana(persona.id);
  const ids = ctx.indice.dePersona(persona.id).filter((a) => a.tipo === 'puesto').map((a) => a.id);
  const codigo = etiquetaPersona(persona);
  if (minMin !== null && total < minMin) {
    // Sin la cifra actual en el mensaje: así sigue siendo el mismo aviso mientras se va completando.
    return [
      incumplimientoRestriccion(restriccion, persona, {
        mensaje: `${codigo} no llega a ${formatearDuracion(minMin)} esta semana`,
        unidades: unidades15(minMin - total),
        asignacionIds: ids,
      }),
    ];
  }
  if (maxMin !== null && total > maxMin) {
    return [
      incumplimientoRestriccion(restriccion, persona, {
        mensaje: `${codigo} supera ${formatearDuracion(maxMin)} esta semana (${formatearDuracion(total)})`,
        unidades: unidades15(total - maxMin),
        asignacionIds: ids,
      }),
    ];
  }
  return [];
}


const comprobar = comprobarRapido<'minutosSemana'>((restriccion, persona, ctx, info) => {
  const { minMin, maxMin } = restriccion.params;
  const antes = ctx.indice.minutosSemana(persona.id);
  const despues = antes + info.minutos;
  const unidades = (total: number): number => {
    if (minMin !== null && total < minMin) return unidades15(minMin - total);
    if (maxMin !== null && total > maxMin) return unidades15(total - maxMin);
    return 0;
  };
  // Solo el máximo bloquea: el mínimo se va completando y solo cuesta.
  const supera = maxMin !== null && despues > maxMin && !(minMin !== null && despues < minMin);
  const coste = restriccion.dura ? 0 : Math.max(0, restriccion.peso * (unidades(despues) - unidades(antes)));
  return {
    permitido: !(restriccion.dura && supera),
    coste,
    motivos: supera ? [`${etiquetaPersona(persona)} supera ${formatearDuracion(maxMin ?? 0)} esta semana (${formatearDuracion(despues)})`] : [],
  };
});

export const definicion: DefinicionRestriccion<'minutosSemana'> = { ...metadatos, evaluar, comprobar };
