import { describe, expect, it } from 'vitest';
import { aHora, aMinutos, contiene, formatearDuracion, seSolapan } from './horas';
import { diaSemana, diferenciaDias, enRango, esFechaISO, fechasSemana, lunesDe, sumarDias } from './fechas';

describe('horas', () => {
  it('convierte en ambos sentidos', () => {
    expect(aMinutos('10:00')).toBe(600);
    expect(aMinutos('15:45')).toBe(945);
    expect(aHora(945)).toBe('15:45');
    expect(() => aMinutos('25:00')).toThrow();
    expect(() => aMinutos('10h')).toThrow();
  });
  it('formatea duraciones', () => {
    expect(formatearDuracion(270)).toBe('4h30');
    expect(formatearDuracion(60)).toBe('1h');
    expect(formatearDuracion(45)).toBe('45 min');
  });
  it('franjas que se tocan no se solapan', () => {
    expect(seSolapan({ inicio: 780, fin: 870 }, { inicio: 870, fin: 945 })).toBe(false);
    expect(seSolapan({ inicio: 780, fin: 871 }, { inicio: 870, fin: 945 })).toBe(true);
    expect(contiene({ inicio: 840, fin: 900 }, { inicio: 840, fin: 900 })).toBe(true);
  });
});

describe('fechas', () => {
  it('lunes = 0, domingo = 6', () => {
    expect(diaSemana('2026-11-23')).toBe(0);
    expect(diaSemana('2026-11-29')).toBe(6);
    expect(lunesDe('2026-11-29')).toBe('2026-11-23');
  });
  it('cruza cambios de hora y de año', () => {
    expect(sumarDias('2026-03-28', 2)).toBe('2026-03-30');
    expect(sumarDias('2026-10-24', 2)).toBe('2026-10-26');
    expect(diferenciaDias('2026-12-28', '2027-01-04')).toBe(7);
    expect(fechasSemana('2026-12-28')[6]).toBe('2027-01-03');
  });
  it('valida y compara', () => {
    expect(esFechaISO('2026-02-30')).toBe(false);
    expect(esFechaISO('2026-02-28')).toBe(true);
    expect(enRango('2026-11-24', '2026-11-24', null)).toBe(true);
    expect(enRango('2026-11-24', null, '2026-11-23')).toBe(false);
  });
});
