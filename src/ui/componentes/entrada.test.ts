import { describe, expect, it } from 'vitest';
import { EJEMPLO_DURACION, leerDuracion, leerHora, textoDuracion } from './entrada';

describe('leerHora', () => {
  it('acepta formatos habituales', () => {
    expect(leerHora('9:30')).toBe(570);
    expect(leerHora('09:30')).toBe(570);
    expect(leerHora('930')).toBe(570);
    expect(leerHora('0930')).toBe(570);
    expect(leerHora('9')).toBe(540);
    expect(leerHora(' 15:45 ')).toBe(945);
    expect(leerHora('24:00')).toBe(1440);
  });
  it('rechaza lo no válido', () => {
    for (const t of ['25:00', '9:75', '', 'abc', '24:30', '-9:00']) expect(leerHora(t)).toBeNull();
  });
});

describe('leerDuracion', () => {
  it('acepta formatos habituales', () => {
    expect(leerDuracion('4h30')).toBe(270);
    expect(leerDuracion('4h')).toBe(240);
    expect(leerDuracion('4:30')).toBe(270);
    expect(leerDuracion('4,5')).toBe(270);
    expect(leerDuracion('4.5')).toBe(270);
    expect(leerDuracion('270 min')).toBe(270);
    expect(leerDuracion('45 min')).toBe(45);
    expect(leerDuracion('45m')).toBe(45);
  });
  it('rechaza negativos, texto y vacío', () => {
    for (const t of ['-1', '-4h', 'mucho', '', '4h75']) expect(leerDuracion(t)).toBeNull();
  });
  it('un número suelto solo son horas si es 12 o menos', () => {
    expect(leerDuracion('4')).toBe(240);
    expect(leerDuracion('12')).toBe(720);
    expect(leerDuracion('30')).toBeNull();
    expect(leerDuracion('90')).toBeNull();
    expect(leerDuracion('30 min')).toBe(30);
    expect(EJEMPLO_DURACION).toBe('Escribe, por ejemplo, 4h30, 1h o 45 min.');
  });
  it('textoDuracion formatea', () => {
    expect(textoDuracion(270)).toBe('4h30');
  });
});
