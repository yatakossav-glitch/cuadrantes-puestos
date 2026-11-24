/** Textos comunes para `describir` y `validarParams` de los tipos de regla. Funciones puras. */
import type { Ambito, DatosPlanificacion, DiaSemana, Id } from '../modelo/tipos';
import { NOMBRES_DIA } from '../modelo/fechas';

/** «a», «a y b», «a, b y c». */
export function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

/** [] → 'todos los días' (o `siVacio`); [5,6] → 'sábado y domingo'; [0..4] → 'de lunes a viernes'. */
export function describirDias(dias: readonly DiaSemana[], siVacio = 'todos los días'): string {
  const unicos = [...new Set(dias)].sort((a, b) => a - b);
  if (unicos.length === 0) return siVacio;
  if (unicos.length === 7) return 'todos los días';
  const consecutivos = unicos.every((d, i) => i === 0 || d === (unicos[i - 1] ?? -2) + 1);
  if (consecutivos && unicos.length >= 3) {
    return `de ${NOMBRES_DIA[unicos[0] ?? 0]} a ${NOMBRES_DIA[unicos[unicos.length - 1] ?? 0]}`;
  }
  return enumerar(unicos.map((d) => NOMBRES_DIA[d]));
}

export function nombreArea(id: Id, datos: DatosPlanificacion): string {
  return datos.areas.find((a) => a.id === id)?.nombre ?? 'área desconocida';
}

/** «Caja 1 (Caja)»; si el nombre del puesto ya identifica el área, igual se añade para evitar ambigüedad. */
export function nombrePuesto(id: Id, datos: DatosPlanificacion): string {
  const p = datos.puestos.find((x) => x.id === id);
  if (!p) return 'puesto desconocido';
  const area = datos.areas.find((a) => a.id === p.areaId);
  return area && area.nombre !== p.nombre ? `${p.nombre} (${area.nombre})` : p.nombre;
}

/** Ámbito vacío → `siVacio`; si no, «Caja, Exposición LEGO y Pedidos Web · Caja 1 (Caja)». */
export function describirAmbito(ambito: Ambito, datos: DatosPlanificacion, siVacio = 'todos los puestos'): string {
  const partes = [
    ...ambito.areaIds.map((id) => nombreArea(id, datos)),
    ...ambito.puestoIds.map((id) => nombrePuesto(id, datos)),
  ];
  return partes.length === 0 ? siVacio : enumerar(partes);
}

/** Errores por ids del ámbito que ya no existen. */
export function erroresAmbito(ambito: Ambito, datos: DatosPlanificacion): string[] {
  const errores: string[] = [];
  for (const id of ambito.areaIds) {
    if (!datos.areas.some((a) => a.id === id)) errores.push('Una de las áreas elegidas ya no existe.');
  }
  for (const id of ambito.puestoIds) {
    if (!datos.puestos.some((p) => p.id === id)) errores.push('Uno de los puestos elegidos ya no existe.');
  }
  return [...new Set(errores)];
}

/** Errores de una lista de días: fuera de 0–6, repetidos o (si `obligatorio`) vacía. */
export function erroresDias(dias: readonly number[], obligatorio: boolean, etiqueta = 'Días'): string[] {
  const errores: string[] = [];
  if (obligatorio && dias.length === 0) errores.push(`${etiqueta}: elige al menos un día.`);
  if (dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) errores.push(`${etiqueta}: hay un día no válido.`);
  if (new Set(dias).size !== dias.length) errores.push(`${etiqueta}: hay días repetidos.`);
  return errores;
}
