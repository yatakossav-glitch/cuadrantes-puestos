/** Lectura tolerante de horas y duraciones escritas a mano. Puro. */
import { formatearDuracion } from '../../modelo/horas';
import type { Minutos } from '../../modelo/tipos';

/** '9:30', '09:30', '930', '0930', '9' → minutos desde las 00:00; '24:00' = 1440. Otro texto → null. */
export function leerHora(texto: string): Minutos | null {
  const t = texto.trim();
  let h: number;
  let m: number;
  let r: RegExpExecArray | null;
  if ((r = /^(\d{1,2})[:.h](\d{2})$/.exec(t))) {
    h = Number(r[1]);
    m = Number(r[2]);
  } else if ((r = /^(\d{1,2})$/.exec(t))) {
    h = Number(r[1]);
    m = 0;
  } else if ((r = /^(\d)(\d{2})$/.exec(t)) || (r = /^(\d{2})(\d{2})$/.exec(t))) {
    h = Number(r[1]);
    m = Number(r[2]);
  } else {
    return null;
  }
  if (m > 59 || h > 24 || (h === 24 && m > 0)) return null;
  return h * 60 + m;
}

const MAX_HORAS_SIN_UNIDAD = 12;

/** Mensaje de ayuda para los campos de duración. */
export const EJEMPLO_DURACION = 'Escribe, por ejemplo, 4h30, 1h o 45 min.';

/** '4h30', '4h', '4:30', '4,5', '4.5' (horas, solo si ≤ 12), '270 min', '45m' → minutos. Negativos o texto → null. */
export function leerDuracion(texto: string): Minutos | null {
  const t = texto.trim().toLowerCase();
  let r: RegExpExecArray | null;
  if ((r = /^(\d+)\s*h\s*(?:(\d{1,2})\s*(?:min|m)?)?$/.exec(t))) {
    const m = r[2] === undefined ? 0 : Number(r[2]);
    return m > 59 ? null : Number(r[1]) * 60 + m;
  }
  if ((r = /^(\d+):(\d{2})$/.exec(t))) {
    const m = Number(r[2]);
    return m > 59 ? null : Number(r[1]) * 60 + m;
  }
  if ((r = /^(\d+)\s*(?:min|m)$/.exec(t))) return Number(r[1]);
  if ((r = /^(\d+(?:[.,]\d+)?)$/.exec(t))) {
    const horas = Number((r[1] ?? '0').replace(',', '.'));
    // Un número suelto solo se entiende como horas si es razonable; si no, se pide la unidad.
    return horas <= MAX_HORAS_SIN_UNIDAD ? Math.round(horas * 60) : null;
  }
  return null;
}

/** 270 → '4h30'. */
export function textoDuracion(min: Minutos): string {
  return formatearDuracion(min);
}
