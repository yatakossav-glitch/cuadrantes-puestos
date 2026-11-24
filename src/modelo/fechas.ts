/**
 * Utilidades puras de fechas 'AAAA-MM-DD'. La aritmética se hace en UTC para que
 * los cambios de hora no muevan días. 0 = lunes … 6 = domingo.
 */
import type { DiaSemana, FechaISO } from './tipos';

const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DIA = 86_400_000;

export const NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;
export const NOMBRES_DIA_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

export function esFechaISO(texto: string): boolean {
  const m = PATRON_FECHA.exec(texto);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function aMs(fecha: FechaISO): number {
  const m = PATRON_FECHA.exec(fecha);
  if (!m || !esFechaISO(fecha)) throw new Error(`Fecha no válida: «${fecha}»`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function deMs(ms: number): FechaISO {
  return new Date(ms).toISOString().slice(0, 10);
}

export function sumarDias(fecha: FechaISO, dias: number): FechaISO {
  return deMs(aMs(fecha) + dias * MS_DIA);
}

/** Días de `desde` a `hasta` (positivo si `hasta` es posterior). */
export function diferenciaDias(desde: FechaISO, hasta: FechaISO): number {
  return Math.round((aMs(hasta) - aMs(desde)) / MS_DIA);
}

export function diaSemana(fecha: FechaISO): DiaSemana {
  return ((new Date(aMs(fecha)).getUTCDay() + 6) % 7) as DiaSemana;
}

export function lunesDe(fecha: FechaISO): FechaISO {
  return sumarDias(fecha, -diaSemana(fecha));
}

export function esLunes(fecha: FechaISO): boolean {
  return esFechaISO(fecha) && diaSemana(fecha) === 0;
}

/** Las 7 fechas de la semana que empieza en `lunes`. */
export function fechasSemana(lunes: FechaISO): FechaISO[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => sumarDias(lunes, i));
}

/** ¿`fecha` está en [desde, hasta]? Un extremo null no limita. */
export function enRango(fecha: FechaISO, desde: FechaISO | null, hasta: FechaISO | null): boolean {
  return (desde === null || fecha >= desde) && (hasta === null || fecha <= hasta);
}

/** '2026-11-24' → '24/11/2026'. */
export function formatearFecha(fecha: FechaISO): string {
  const [a, m, d] = fecha.split('-');
  return `${d}/${m}/${a}`;
}

/** '2026-11-24' → 'martes 24/11'. */
export function formatearDiaFecha(fecha: FechaISO): string {
  const [, m, d] = fecha.split('-');
  return `${NOMBRES_DIA[diaSemana(fecha)]} ${d}/${m}`;
}

/** Fecha local de hoy. */
export function hoyISO(ahora: Date = new Date()): FechaISO {
  const a = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const d = String(ahora.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}
