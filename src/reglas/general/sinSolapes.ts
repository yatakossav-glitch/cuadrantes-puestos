import type { ReglaGeneral } from '../../modelo/tipos';
import type { ContextoEvaluacion, DefinicionReglaGeneral, Incumplimiento } from '../contrato';
import { seSolapan } from '../../modelo/horas';
import { formatearIntervalo } from '../../modelo/horas';
import type { Asignacion } from '../../modelo/tipos';
import { nombrePuesto } from '../texto';
import { cuando, etiquetaPersona, incumplimientoGeneral, penalizacion } from '../util';
import type { MetadatosReglaGeneral } from '../metadatos';

export const metadatos: MetadatosReglaGeneral<'sinSolapes'> = {
  tipo: 'sinSolapes',
  nombre: 'Sin solapes',
  ayuda: 'Nadie puede estar en dos sitios a la vez.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({}),
  describir: () => 'Nadie puede estar en dos puestos a la vez, ni en un puesto y en una pausa',
  validarParams: () => [],
  campos: [],
};

function describir(a: Asignacion, ctx: ContextoEvaluacion): string {
  const iv = ctx.indice.intervalo(a);
  const hora = iv ? ` ${formatearIntervalo(iv)}` : '';
  return a.tipo === 'pausa' ? `pausa${hora}` : `${nombrePuesto(a.puestoId, ctx.datos)}${hora}`;
}

function evaluar(regla: ReglaGeneral<'sinSolapes'>, ctx: ContextoEvaluacion): Incumplimiento[] {
  const { indice } = ctx;
  const grupos = new Map<string, Asignacion[]>();
  for (const a of indice.asignaciones()) {
    const k = `${a.personaId}|${a.fecha}`;
    const g = grupos.get(k);
    if (g) g.push(a);
    else grupos.set(k, [a]);
  }
  const resultado: Incumplimiento[] = [];
  for (const grupo of grupos.values()) {
    for (let i = 0; i < grupo.length; i += 1) {
      for (let j = i + 1; j < grupo.length; j += 1) {
        const a = grupo[i];
        const b = grupo[j];
        if (!a || !b) continue;
        const ia = indice.intervalo(a);
        const ib = indice.intervalo(b);
        if (!ia || !ib || !seSolapan(ia, ib)) continue;
        resultado.push(
          incumplimientoGeneral(regla, {
            mensaje: `${etiquetaPersona(indice.persona(a.personaId))} está en dos sitios a la vez ${cuando(a.fecha)}: ${describir(a, ctx)} y ${describir(b, ctx)}`,
            marca: 'solape',
            fecha: a.fecha,
            personaId: a.personaId,
            asignacionIds: [a.id, b.id],
          }),
        );
      }
    }
  }
  return resultado;
}

export const definicion: DefinicionReglaGeneral<'sinSolapes'> = {
  ...metadatos,
  evaluar,
  comprobar(regla, ctx, candidata) {
    const { indice } = ctx;
    if (!indice.fechas.includes(candidata.fecha)) return { permitido: true, coste: 0, motivos: [] };
    const ic = indice.intervalo(candidata);
    if (!ic) return { permitido: true, coste: 0, motivos: [] };
    const motivos: string[] = [];
    for (const a of indice.dePersonaDia(candidata.personaId, candidata.fecha)) {
      const ia = indice.intervalo(a);
      if (!ia || !seSolapan(ia, ic)) continue;
      motivos.push(
        `${etiquetaPersona(indice.persona(candidata.personaId))} estaría en dos sitios a la vez ${cuando(candidata.fecha)}: ${describir(a, ctx)} y ${describir(candidata, ctx)}`,
      );
    }
    return {
      permitido: !(regla.dura && motivos.length > 0),
      coste: penalizacion(regla.dura, regla.peso, motivos.length),
      motivos,
    };
  },
};
