import type { Persona, RestriccionPersona } from '../../modelo/tipos';
import type { ContextoEvaluacion, DefinicionRestriccion, Incumplimiento } from '../contrato';
import { cuando, etiquetaPersona, incumplimientoRestriccion } from '../util';
import { comprobarRapido, resultado, trabajaraEseDia, puestosDelDia } from './comun';
import type { MetadatosRestriccion } from '../metadatos';

export const metadatos: MetadatosRestriccion<'soloFinesDeSemana'> = {
  tipo: 'soloFinesDeSemana',
  nombre: 'Solo fines de semana',
  ayuda: 'La persona solo trabaja sábado y domingo.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({}),
  describir: () => 'Solo sábado y domingo',
  validarParams: () => [],
  campos: [],
};

function evaluar(
  restriccion: RestriccionPersona<'soloFinesDeSemana'>,
  persona: Persona,
  ctx: ContextoEvaluacion,
): Incumplimiento[] {
  const res: Incumplimiento[] = [];
  for (const fecha of ctx.indice.diasTrabajados(persona.id)) {
    if (ctx.indice.diaDe(fecha) >= 5) continue;
    res.push(
      incumplimientoRestriccion(restriccion, persona, {
        mensaje: `${etiquetaPersona(persona)} trabaja ${cuando(fecha)} y solo puede trabajar sábado y domingo`,
        marca: 'noDisponible',
        fecha,
        asignacionIds: puestosDelDia(ctx, persona, fecha).map((a) => a.id),
      }),
    );
  }
  return res;
}


const comprobar = comprobarRapido<'soloFinesDeSemana'>((restriccion, persona, ctx, info) => {
  const fecha = info.candidata.fecha;
  const antes = ctx.indice.diasTrabajados(persona.id).includes(fecha) && ctx.indice.diaDe(fecha) < 5;
  const despues = trabajaraEseDia(ctx, persona, info) && ctx.indice.diaDe(fecha) < 5;
  return resultado(restriccion, despues, antes ? restriccion.peso : 0, despues ? restriccion.peso : 0, `${etiquetaPersona(persona)} trabaja ${cuando(fecha)} y solo puede trabajar sábado y domingo`);
});

export const definicion: DefinicionRestriccion<'soloFinesDeSemana'> = { ...metadatos, evaluar, comprobar };
