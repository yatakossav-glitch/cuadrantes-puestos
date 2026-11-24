import type { ReglaGeneral } from '../../modelo/tipos';
import type { Asignacion } from '../../modelo/tipos';
import type { ContextoEvaluacion, DefinicionReglaGeneral, IndiceSemana, Incumplimiento } from '../contrato';
import { etiquetaPersona, incumplimientoGeneral, penalizacion } from '../util';
import type { MetadatosReglaGeneral } from '../metadatos';

export const metadatos: MetadatosReglaGeneral<'maxDiasSemana'> = {
  tipo: 'maxDiasSemana',
  nombre: 'Máximo de días por semana',
  ayuda: 'Número máximo de días que una persona puede trabajar en una semana.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({ max: 6 }),
  describir: (params) => `Máximo ${params.max} ${params.max === 1 ? 'día' : 'días'} de trabajo por semana`,
  validarParams: (params) =>
    Number.isInteger(params.max) && params.max >= 1 && params.max <= 7
      ? []
      : ['El máximo de días debe ser un número entero de 1 a 7.'],
  campos: [{ clave: 'max', etiqueta: 'Días como máximo', tipo: 'entero', ayuda: 'De 1 a 7 días por semana.', min: 1, max: 7 }],
};

/** ¿Cuenta para los días trabajados? (asignación de puesto con franja y puesto abierto ese día). */
function cuentaComoDia(a: Asignacion, indice: IndiceSemana): boolean {
  return a.tipo === 'puesto' && indice.intervalo(a) !== undefined && indice.horario(a.puestoId, a.fecha) !== null;
}

function evaluar(regla: ReglaGeneral<'maxDiasSemana'>, ctx: ContextoEvaluacion): Incumplimiento[] {
  const { indice } = ctx;
  const personas = new Set(indice.asignaciones().map((a) => a.personaId));
  const resultado: Incumplimiento[] = [];
  for (const id of personas) {
    const dias = indice.diasTrabajados(id).length;
    if (dias <= regla.params.max) continue;
    resultado.push(
      incumplimientoGeneral(regla, {
        mensaje: `${etiquetaPersona(indice.persona(id))} trabaja ${dias} días esta semana (máximo ${regla.params.max})`,
        personaId: id,
        asignacionIds: indice.dePersona(id).filter((a) => cuentaComoDia(a, indice)).map((a) => a.id),
      }),
    );
  }
  return resultado;
}

export const definicion: DefinicionReglaGeneral<'maxDiasSemana'> = {
  ...metadatos,
  evaluar,
  comprobar(regla, ctx, candidata) {
    const { indice } = ctx;
    if (!indice.fechas.includes(candidata.fecha) || !cuentaComoDia(candidata, indice)) {
      return { permitido: true, coste: 0, motivos: [] };
    }
    const dias = indice.diasTrabajados(candidata.personaId);
    const despues = dias.includes(candidata.fecha) ? dias.length : dias.length + 1;
    if (despues <= regla.params.max) return { permitido: true, coste: 0, motivos: [] };
    return {
      permitido: !regla.dura,
      // Un único incumplimiento por persona: solo cuesta al cruzar el máximo.
      coste: dias.length > regla.params.max ? 0 : penalizacion(regla.dura, regla.peso, 1),
      motivos: [`${etiquetaPersona(indice.persona(candidata.personaId))} trabajaría ${despues} días esta semana (máximo ${regla.params.max})`],
    };
  },
};
