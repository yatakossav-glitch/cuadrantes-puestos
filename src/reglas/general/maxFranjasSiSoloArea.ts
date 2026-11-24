import type { Comprobacion, ContextoEvaluacion, DefinicionReglaGeneral, Incumplimiento } from '../contrato';
import { cuando, etiquetaPersona, incumplimientoGeneral } from '../util';
import type { Asignacion, AsignacionPuesto, ReglaGeneral } from '../../modelo/tipos';
import type { MetadatosReglaGeneral } from '../metadatos';
import { nombreArea } from '../texto';

export const metadatos: MetadatosReglaGeneral<'maxFranjasSiSoloArea'> = {
  tipo: 'maxFranjasSiSoloArea',
  nombre: 'Límite de franjas si solo trabaja en un área',
  ayuda: 'Quien ese día solo trabaja en el área elegida hace como máximo este número de franjas.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto(datos) {
    const area = datos.areas.find((a) => a.activa);
    return { areaId: area ? area.id : '', maxFranjas: 1 };
  },
  describir: (params, datos) =>
    `Si un día solo trabaja en ${nombreArea(params.areaId, datos)}, máximo ${params.maxFranjas} ${params.maxFranjas === 1 ? 'franja' : 'franjas'}`,
  validarParams(params, datos) {
    const errores: string[] = [];
    if (!datos.areas.some((a) => a.id === params.areaId)) errores.push('Elige un área que exista.');
    if (!Number.isInteger(params.maxFranjas) || params.maxFranjas < 1) {
      errores.push('El máximo de franjas debe ser un número entero mayor que 0.');
    }
    return errores;
  },
  campos: [
    { clave: 'areaId', etiqueta: 'Área', tipo: 'area', ayuda: 'Área a la que se aplica el límite.' },
    { clave: 'maxFranjas', etiqueta: 'Máximo de franjas', tipo: 'entero', ayuda: 'Franjas que puede hacer ese día.', min: 1 },
  ],
};

function evaluar(regla: ReglaGeneral<'maxFranjasSiSoloArea'>, ctx: ContextoEvaluacion): Incumplimiento[] {
  const { indice } = ctx;
  const { areaId, maxFranjas } = regla.params;
  const porPersonaDia = new Map<string, AsignacionPuesto[]>();
  for (const a of indice.asignaciones()) {
    if (a.tipo !== 'puesto') continue;
    if (!indice.intervalo(a) || indice.horario(a.puestoId, a.fecha) === null) continue;
    const clave = `${a.personaId}|${a.fecha}`;
    const lista = porPersonaDia.get(clave) ?? [];
    lista.push(a);
    porPersonaDia.set(clave, lista);
  }
  const area = indice.area(areaId)?.nombre ?? 'el área indicada';
  const resultado: Incumplimiento[] = [];
  for (const lista of porPersonaDia.values()) {
    const primera = lista[0];
    if (!primera || lista.length <= maxFranjas) continue;
    if (!lista.every((a) => indice.puesto(a.puestoId)?.areaId === areaId)) continue;
    resultado.push(
      incumplimientoGeneral(regla, {
        mensaje: `${etiquetaPersona(indice.persona(primera.personaId))} hace ${lista.length} franjas solo en ${area} ${cuando(primera.fecha)} (máximo ${maxFranjas})`,
        fecha: primera.fecha,
        personaId: primera.personaId,
        asignacionIds: lista.map((a) => a.id),
      }),
    );
  }
  return resultado;
}

function comprobar(regla: ReglaGeneral<'maxFranjasSiSoloArea'>, ctx: ContextoEvaluacion, candidata: Asignacion): Comprobacion {
  const { indice } = ctx;
  const { areaId, maxFranjas } = regla.params;
  const sinEfecto: Comprobacion = { permitido: true, coste: 0, motivos: [] };
  if (candidata.tipo !== 'puesto' || !indice.fechas.includes(candidata.fecha)) return sinEfecto;
  if (!indice.intervalo(candidata) || indice.horario(candidata.puestoId, candidata.fecha) === null) return sinEfecto;
  const previas = indice
    .dePersonaDia(candidata.personaId, candidata.fecha)
    .filter((a): a is AsignacionPuesto => a.tipo === 'puesto' && indice.intervalo(a) !== undefined && indice.horario(a.puestoId, a.fecha) !== null);
  const incumple = (l: AsignacionPuesto[]) =>
    l.length > maxFranjas && l.every((a) => indice.puesto(a.puestoId)?.areaId === areaId);
  const incumpleAntes = incumple(previas);
  const lista = [...previas, candidata];
  const incumpleDespues = incumple(lista);
  const area = indice.area(areaId)?.nombre ?? 'el área indicada';
  return {
    permitido: !(regla.dura && incumpleDespues),
    coste: !regla.dura && incumpleDespues && !incumpleAntes ? regla.peso : 0,
    motivos: incumpleDespues
      ? [`${etiquetaPersona(indice.persona(candidata.personaId))} hace ${lista.length} franjas solo en ${area} ${cuando(candidata.fecha)} (máximo ${maxFranjas})`]
      : [],
  };
}

export const definicion: DefinicionReglaGeneral<'maxFranjasSiSoloArea'> = {
  ...metadatos,
  evaluar,
  comprobar,
};
