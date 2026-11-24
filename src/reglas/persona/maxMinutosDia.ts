import type { Persona, RestriccionPersona } from '../../modelo/tipos';
import type { ContextoEvaluacion, DefinicionRestriccion, Incumplimiento } from '../contrato';
import { cuando, etiquetaPersona, incumplimientoRestriccion, unidades15 } from '../util';
import { comprobarRapido, puestosDelDia, resultado } from './comun';
import type { MetadatosRestriccion } from '../metadatos';
import { formatearDuracion } from '../../modelo/horas';

export const metadatos: MetadatosRestriccion<'maxMinutosDia'> = {
  tipo: 'maxMinutosDia',
  nombre: 'Máximo de horas al día',
  ayuda: 'Límite de tiempo cubriendo puestos en un mismo día.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({ maxMin: 270 }),
  describir: (params) => `Máximo ${formatearDuracion(params.maxMin)} al día`,
  validarParams: (params) =>
    Number.isInteger(params.maxMin) && params.maxMin > 0 && params.maxMin <= 24 * 60
      ? []
      : ['El máximo al día debe ser mayor que 0 y no pasar de 24h.'],
  campos: [{ clave: 'maxMin', etiqueta: 'Máximo al día', tipo: 'duracion', ayuda: 'Por ejemplo, 4h30.', min: 1, max: 24 * 60 }],
};

function evaluar(
  restriccion: RestriccionPersona<'maxMinutosDia'>,
  persona: Persona,
  ctx: ContextoEvaluacion,
): Incumplimiento[] {
  const res: Incumplimiento[] = [];
  const { maxMin } = restriccion.params;
  for (const fecha of ctx.indice.fechas) {
    const total = ctx.indice.minutosDia(persona.id, fecha);
    if (total <= maxMin) continue;
    res.push(
      incumplimientoRestriccion(restriccion, persona, {
        mensaje: `${etiquetaPersona(persona)} supera ${formatearDuracion(maxMin)} ${cuando(fecha)} (${formatearDuracion(total)})`,
        fecha,
        unidades: unidades15(total - maxMin),
        asignacionIds: puestosDelDia(ctx, persona, fecha).map((a) => a.id),
      }),
    );
  }
  return res;
}


const comprobar = comprobarRapido<'maxMinutosDia'>((restriccion, persona, ctx, info) => {
  const { maxMin } = restriccion.params;
  const fecha = info.candidata.fecha;
  const antes = ctx.indice.minutosDia(persona.id, fecha);
  const despues = antes + info.minutos;
  const penal = (total: number): number => restriccion.peso * unidades15(total - maxMin);
  return resultado(restriccion, despues > maxMin, penal(antes), penal(despues),
    `${etiquetaPersona(persona)} supera ${formatearDuracion(maxMin)} ${cuando(fecha)} (${formatearDuracion(despues)})`);
});

export const definicion: DefinicionRestriccion<'maxMinutosDia'> = { ...metadatos, evaluar, comprobar };
