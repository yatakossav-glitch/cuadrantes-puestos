/** Explicaciones de inviabilidad (§4): por qué un hueco se queda sin cubrir. Funciones puras. */
import type { IndiceSemana } from '../reglas/contrato';
import { cuando } from '../reglas/util';
import type { DatosPlanificacion, Persona, Puesto } from '../modelo/tipos';
import type { ExplicacionHueco } from './contrato';
import type { Comprobador, Unidad } from './unidades';

/** Nombre corto para los mensajes: el del área si es su único puesto («Pedidos Web»); si no, el del puesto («Caja 1»). */
export function nombreParaMensaje(datos: DatosPlanificacion, puesto: Puesto | undefined): string {
  if (!puesto) return 'un puesto desconocido';
  const area = datos.areas.find((a) => a.id === puesto.areaId);
  const hermanos = datos.puestos.filter((p) => p.areaId === puesto.areaId && p.activo);
  if (area && hermanos.length === 1) return area.nombre;
  return puesto.nombre;
}

/** «Nadie disponible para Pedidos Web el jueves 26/11 15:45–22:00». */
export function resumenSinCubrir(datos: DatosPlanificacion, unidad: Unidad): string {
  const puesto = datos.puestos.find((p) => p.id === unidad.puestoId);
  return `Nadie disponible para ${nombreParaMensaje(datos, puesto)} ${cuando(unidad.fecha, { inicio: unidad.inicio, fin: unidad.fin })}`;
}

/**
 * Una explicación por hueco de la unidad (todas con el mismo resumen y los mismos descartes).
 * Los descartes son el primer motivo duro de cada persona activa, comprobado contra `indice`.
 */
export function explicarUnidad(
  datos: DatosPlanificacion,
  comprobador: Comprobador,
  indice: IndiceSemana,
  unidad: Unidad,
  personas: readonly Persona[],
): ExplicacionHueco[] {
  const descartes: ExplicacionHueco['descartes'] = [];
  let hayPermitida = false;
  for (const persona of personas) {
    const r = comprobador.unidad(indice, unidad, persona.id);
    if (r.permitido) hayPermitida = true;
    else descartes.push({ personaId: persona.id, motivo: r.primerMotivoDuro ?? 'Incumple una regla obligatoria' });
  }
  const resumen =
    hayPermitida
      ? `No se ha podido cubrir ${nombreParaMensaje(datos, datos.puestos.find((p) => p.id === unidad.puestoId))} ${cuando(unidad.fecha, { inicio: unidad.inicio, fin: unidad.fin })}, aunque alguien podría hacerlo`
      : personas.length === 0
      ? `No hay personas activas para ${nombreParaMensaje(datos, datos.puestos.find((p) => p.id === unidad.puestoId))} ${cuando(unidad.fecha, { inicio: unidad.inicio, fin: unidad.fin })}`
      : resumenSinCubrir(datos, unidad);
  return unidad.huecos.map((hueco) => ({ hueco, resumen, descartes }));
}
