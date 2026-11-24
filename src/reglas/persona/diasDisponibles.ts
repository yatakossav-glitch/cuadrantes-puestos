import type { MetadatosRestriccion } from '../metadatos';
import type { Persona, RestriccionPersona } from '../../modelo/tipos';
import type { ContextoEvaluacion, DefinicionRestriccion, Incumplimiento } from '../contrato';
import { cuando, etiquetaPersona, incumplimientoRestriccion } from '../util';
import { comprobarRapido, resultado, trabajaraEseDia, puestosDelDia } from './comun';
import { describirDias, erroresDias } from '../texto';

export const metadatos: MetadatosRestriccion<'diasDisponibles'> = {
  tipo: 'diasDisponibles',
  nombre: 'Solo trabaja ciertos días',
  ayuda: 'La persona solo puede trabajar los días que elijas.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({ dias: [0, 1, 2, 3, 4] }),
  describir: (params) => `Solo trabaja ${describirDias(params.dias)}`,
  validarParams: (params) => erroresDias(params.dias, true, 'Días en los que trabaja'),
  campos: [{ clave: 'dias', etiqueta: 'Días en los que trabaja', tipo: 'dias', ayuda: 'Marca los únicos días en los que puede trabajar.' }],
};

function evaluar(
  restriccion: RestriccionPersona<'diasDisponibles'>,
  persona: Persona,
  ctx: ContextoEvaluacion,
): Incumplimiento[] {
  const res: Incumplimiento[] = [];
  for (const fecha of ctx.indice.diasTrabajados(persona.id)) {
    if (restriccion.params.dias.includes(ctx.indice.diaDe(fecha))) continue;
    res.push(
      incumplimientoRestriccion(restriccion, persona, {
        mensaje: `${etiquetaPersona(persona)} trabaja ${cuando(fecha)} y no está disponible ese día`,
        marca: 'noDisponible',
        fecha,
        asignacionIds: puestosDelDia(ctx, persona, fecha).map((a) => a.id),
      }),
    );
  }
  return res;
}


const comprobar = comprobarRapido<'diasDisponibles'>((restriccion, persona, ctx, info) => {
  const fecha = info.candidata.fecha;
  const antes = ctx.indice.diasTrabajados(persona.id).includes(fecha) && !restriccion.params.dias.includes(ctx.indice.diaDe(fecha));
  const despues = trabajaraEseDia(ctx, persona, info) && !restriccion.params.dias.includes(ctx.indice.diaDe(fecha));
  return resultado(restriccion, despues, antes ? restriccion.peso : 0, despues ? restriccion.peso : 0, `${etiquetaPersona(persona)} trabaja ${cuando(fecha)} y no está disponible ese día`);
});

export const definicion: DefinicionRestriccion<'diasDisponibles'> = { ...metadatos, evaluar, comprobar };
