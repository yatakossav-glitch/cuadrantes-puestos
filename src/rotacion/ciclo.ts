/** Semana del ciclo de rotación. Puro. */
import type { FechaISO, Rotacion } from '../modelo/tipos';
import { diferenciaDias, lunesDe } from '../modelo/fechas';

/**
 * Semana del ciclo de la semana que contiene `fecha`: índice (0 = A) y su etiqueta («A»).
 * Se calcula entre lunes, aunque `lunesReferencia` no caiga en lunes.
 */
export function semanaDelCiclo(rotacion: Rotacion, fecha: FechaISO): { indice: number; etiqueta: string } {
  const largo = Math.max(1, Math.trunc(rotacion.longitudCiclo) || 1);
  const semanas = Math.round(diferenciaDias(lunesDe(rotacion.lunesReferencia), lunesDe(fecha)) / 7);
  const indice = ((semanas % largo) + largo) % largo;
  return { indice, etiqueta: rotacion.etiquetas[indice] ?? String(indice + 1) };
}
