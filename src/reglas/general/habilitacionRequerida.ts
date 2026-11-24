import type { ReglaGeneral } from '../../modelo/tipos';
import type { ContextoEvaluacion, DefinicionReglaGeneral, Incumplimiento } from '../contrato';
import { nombrePuesto } from '../texto';
import { cuando, etiquetaPersona, incumplimientoGeneral, penalizacion } from '../util';
import type { MetadatosReglaGeneral } from '../metadatos';

export const metadatos: MetadatosReglaGeneral<'habilitacionRequerida'> = {
  tipo: 'habilitacionRequerida',
  nombre: 'Habilitación requerida',
  ayuda: 'Solo se asigna a personas habilitadas para el puesto.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({}),
  describir: () => 'Solo asignar a personas habilitadas para el puesto',
  validarParams: () => [],
  campos: [],
};

function evaluar(regla: ReglaGeneral<'habilitacionRequerida'>, ctx: ContextoEvaluacion): Incumplimiento[] {
  const { indice, datos } = ctx;
  const resultado: Incumplimiento[] = [];
  for (const a of indice.asignaciones()) {
    if (a.tipo !== 'puesto') continue;
    const puesto = indice.puesto(a.puestoId);
    const persona = indice.persona(a.personaId);
    if (!puesto || !persona || !puesto.requiereHabilitacion) continue;
    if (persona.habilitaciones.includes(puesto.id) || persona.habilitaciones.includes(puesto.areaId)) continue;
    resultado.push(
      incumplimientoGeneral(regla, {
        mensaje: `${etiquetaPersona(persona)} no está habilitada para ${nombrePuesto(puesto.id, datos)} ${cuando(a.fecha, indice.intervalo(a))}`,
        marca: 'noDisponible',
        fecha: a.fecha,
        personaId: persona.id,
        asignacionIds: [a.id],
      }),
    );
  }
  return resultado;
}

export const definicion: DefinicionReglaGeneral<'habilitacionRequerida'> = {
  ...metadatos,
  evaluar,
  comprobar(regla, ctx, candidata) {
    const { indice, datos } = ctx;
    if (candidata.tipo !== 'puesto' || !indice.fechas.includes(candidata.fecha)) return { permitido: true, coste: 0, motivos: [] };
    const puesto = indice.puesto(candidata.puestoId);
    const persona = indice.persona(candidata.personaId);
    if (!puesto || !persona || !puesto.requiereHabilitacion) return { permitido: true, coste: 0, motivos: [] };
    if (persona.habilitaciones.includes(puesto.id) || persona.habilitaciones.includes(puesto.areaId)) {
      return { permitido: true, coste: 0, motivos: [] };
    }
    return {
      permitido: !regla.dura,
      coste: penalizacion(regla.dura, regla.peso, 1),
      motivos: [`${etiquetaPersona(persona)} no está habilitada para ${nombrePuesto(puesto.id, datos)} ${cuando(candidata.fecha, indice.intervalo(candidata))}`],
    };
  },
};
