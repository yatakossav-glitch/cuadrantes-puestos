import type { Persona, RestriccionPersona } from '../../modelo/tipos';
import type { ContextoEvaluacion, DefinicionRestriccion, Incumplimiento } from '../contrato';
import { cuando, etiquetaPersona, incumplimientoRestriccion } from '../util';
import { comprobarRapido, resultado, trabajaraEseDia, puestosDelDia } from './comun';
import type { MetadatosRestriccion } from '../metadatos';
import { describirDias, erroresDias } from '../texto';

export const metadatos: MetadatosRestriccion<'diasNoDisponibles'> = {
  tipo: 'diasNoDisponibles',
  nombre: 'No trabaja ciertos días',
  ayuda: 'La persona no puede trabajar los días que elijas.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({ dias: [6] }),
  describir: (params) => {
    const dias = [...new Set(params.dias)];
    return `No trabaja ${dias.length === 1 ? 'el ' : ''}${describirDias(dias)}`;
  },
  validarParams: (params) => erroresDias(params.dias, true, 'Días en los que no trabaja'),
  campos: [{ clave: 'dias', etiqueta: 'Días en los que no trabaja', tipo: 'dias', ayuda: 'Marca los días en que no se le puede asignar.' }],
};

function evaluar(
  restriccion: RestriccionPersona<'diasNoDisponibles'>,
  persona: Persona,
  ctx: ContextoEvaluacion,
): Incumplimiento[] {
  const res: Incumplimiento[] = [];
  for (const fecha of ctx.indice.diasTrabajados(persona.id)) {
    if (!restriccion.params.dias.includes(ctx.indice.diaDe(fecha))) continue;
    res.push(
      incumplimientoRestriccion(restriccion, persona, {
        mensaje: `${etiquetaPersona(persona)} trabaja ${cuando(fecha)} y no puede trabajar ese día`,
        marca: 'noDisponible',
        fecha,
        asignacionIds: puestosDelDia(ctx, persona, fecha).map((a) => a.id),
      }),
    );
  }
  return res;
}


const comprobar = comprobarRapido<'diasNoDisponibles'>((restriccion, persona, ctx, info) => {
  const fecha = info.candidata.fecha;
  const antes = ctx.indice.diasTrabajados(persona.id).includes(fecha) && restriccion.params.dias.includes(ctx.indice.diaDe(fecha));
  const despues = trabajaraEseDia(ctx, persona, info) && restriccion.params.dias.includes(ctx.indice.diaDe(fecha));
  return resultado(restriccion, despues, antes ? restriccion.peso : 0, despues ? restriccion.peso : 0, `${etiquetaPersona(persona)} trabaja ${cuando(fecha)} y no puede trabajar ese día`);
});

export const definicion: DefinicionRestriccion<'diasNoDisponibles'> = { ...metadatos, evaluar, comprobar };
