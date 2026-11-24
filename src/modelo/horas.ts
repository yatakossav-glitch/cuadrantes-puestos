/** Utilidades puras de horas e intervalos. Horas = minutos desde las 00:00; intervalos [inicio, fin). */
import type { Intervalo, Minutos } from './tipos';

const PATRON_HORA = /^([01]?\d|2[0-4]):([0-5]\d)$/;

/** '10:00' → 600. Lanza Error si el texto no es una hora válida (00:00–24:00). */
export function aMinutos(hhmm: string): Minutos {
  const m = PATRON_HORA.exec(hhmm.trim());
  if (!m) throw new Error(`Hora no válida: «${hhmm}»`);
  const total = Number(m[1]) * 60 + Number(m[2]);
  if (total > 24 * 60) throw new Error(`Hora no válida: «${hhmm}»`);
  return total;
}

/** 600 → '10:00'. */
export function aHora(min: Minutos): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** { inicio: 600, fin: 690 } → '10:00–11:30'. */
export function formatearIntervalo(i: Intervalo): string {
  return `${aHora(i.inicio)}–${aHora(i.fin)}`;
}

/** 270 → '4h30'; 60 → '1h'; 45 → '45 min'; 0 → '0 min'. */
export function formatearDuracion(min: Minutos): string {
  const signo = min < 0 ? '-' : '';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${signo}${m} min`;
  return m === 0 ? `${signo}${h}h` : `${signo}${h}h${String(m).padStart(2, '0')}`;
}

export function duracion(i: Intervalo): Minutos {
  return i.fin - i.inicio;
}

/** Intervalos semiabiertos: 13:00–14:30 y 14:30–15:45 NO se solapan. */
export function seSolapan(a: Intervalo, b: Intervalo): boolean {
  return a.inicio < b.fin && b.inicio < a.fin;
}

/** ¿`interior` está entero dentro de `exterior`? */
export function contiene(exterior: Intervalo, interior: Intervalo): boolean {
  return exterior.inicio <= interior.inicio && interior.fin <= exterior.fin;
}

/** ¿Es un intervalo bien formado dentro del día? */
export function intervaloValido(i: Intervalo): boolean {
  return Number.isInteger(i.inicio) && Number.isInteger(i.fin) && i.inicio >= 0 && i.fin <= 24 * 60 && i.inicio < i.fin;
}
