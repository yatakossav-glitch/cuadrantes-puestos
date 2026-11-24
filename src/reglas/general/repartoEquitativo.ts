import type { Comprobacion, ContextoEvaluacion, DefinicionReglaGeneral, Incumplimiento } from '../contrato';
import { etiquetaPersona, incumplimientoGeneral, penalizacion, unidades15 } from '../util';
import { formatearDuracion as duracionLegible } from '../../modelo/horas';
import type { Asignacion, ReglaGeneral } from '../../modelo/tipos';
import type { MetadatosReglaGeneral } from '../metadatos';

export const metadatos: MetadatosReglaGeneral<'repartoEquitativo'> = {
  tipo: 'repartoEquitativo',
  nombre: 'Reparto equitativo',
  ayuda: 'Intenta que cada persona se acerque a su objetivo de cobertura semanal.',
  dureza: 'soloBlanda',
  pesoPorDefecto: 1,
  paramsPorDefecto: () => ({}),
  describir: () => 'Repartir la cobertura de forma equitativa según el objetivo de cada persona',
  validarParams: () => [],
  campos: [],
};

function evaluar(regla: ReglaGeneral<'repartoEquitativo'>, ctx: ContextoEvaluacion): Incumplimiento[] {
  const { indice, datos } = ctx;
  const resultado: Incumplimiento[] = [];
  for (const persona of datos.personas) {
    const objetivo = persona.objetivoCoberturaMinSemana;
    if (objetivo === null) continue;
    const minutos = indice.minutosSemana(persona.id);
    const diferencia = Math.abs(minutos - objetivo);
    if (diferencia === 0) continue;
    resultado.push(
      incumplimientoGeneral(regla, {
        mensaje: `${etiquetaPersona(persona)} cubre ${duracionLegible(minutos)} esta semana y su objetivo es ${duracionLegible(objetivo)} (${duracionLegible(diferencia)} ${minutos < objetivo ? 'menos' : 'más'})`,
        personaId: persona.id,
        unidades: unidades15(diferencia),
      }),
    );
  }
  return resultado;
}

function comprobar(regla: ReglaGeneral<'repartoEquitativo'>, ctx: ContextoEvaluacion, candidata: Asignacion): Comprobacion {
  const { indice } = ctx;
  const sinEfecto: Comprobacion = { permitido: true, coste: 0, motivos: [] };
  // Nunca bloquea; solo cuenta lo que cuenta `minutosSemana` (puestos que abren ese día).
  if (candidata.tipo !== 'puesto' || !indice.fechas.includes(candidata.fecha)) return sinEfecto;
  const persona = indice.persona(candidata.personaId);
  const iv = indice.intervalo(candidata);
  if (!persona || persona.objetivoCoberturaMinSemana === null || !iv) return sinEfecto;
  if (indice.horario(candidata.puestoId, candidata.fecha) === null) return sinEfecto;
  const objetivo = persona.objetivoCoberturaMinSemana;
  const antes = indice.minutosSemana(persona.id);
  const despues = antes + (iv.fin - iv.inicio);
  const unidades = (min: number) => unidades15(Math.abs(min - objetivo));
  const coste = Math.max(0, penalizacion(regla.dura, regla.peso, unidades(despues)) - penalizacion(regla.dura, regla.peso, unidades(antes)));
  const diferencia = Math.abs(despues - objetivo);
  return {
    permitido: true,
    coste,
    motivos:
      coste > 0
        ? [`${etiquetaPersona(persona)} pasaría a cubrir ${duracionLegible(despues)} esta semana y su objetivo es ${duracionLegible(objetivo)} (${duracionLegible(diferencia)} ${despues < objetivo ? 'menos' : 'más'})`]
        : [],
  };
}

export const definicion: DefinicionReglaGeneral<'repartoEquitativo'> = {
  ...metadatos,
  evaluar,
  comprobar,
};
