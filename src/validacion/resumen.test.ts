import { describe, expect, it } from 'vitest';
import { IDS_EJEMPLO, crearEstadoEjemplo } from '../datos-ejemplo/ejemplo';
import type { Incumplimiento, ResultadoValidacion } from '../reglas/contrato';
import { puesto } from './indice.test';
import { crearIndice } from './indice';
import { resumirSemana } from './resumen';

const LUNES = '2026-11-23';
const DOMINGO = '2026-11-29';
const { caja1, pedidos } = IDS_EJEMPLO.puestos;

describe('resumirSemana', () => {
  const datos = crearEstadoEjemplo();
  datos.personas[6]!.objetivoCoberturaMinSemana = 600;
  const asigs = [
    puesto('a1', LUNES, caja1, 'franja-caja-1', 'per-07'),
    puesto('a2', LUNES, caja1, 'franja-caja-2', 'per-07'),
    puesto('a3', DOMINGO, pedidos, 'franja-pedidos-t', 'per-07'),
    puesto('a4', LUNES, pedidos, 'franja-pedidos-m', 'per-01'),
  ];
  const indice = crearIndice(datos, LUNES, asigs);
  const base: Omit<Incumplimiento, 'personaId'> = { reglaId: 'r', origen: 'general', tipo: 'sinSolapes', dura: false, penalizacion: 1, mensaje: '', marca: 'aviso', fecha: null, asignacionIds: [], huecos: [] };
  const r: ResultadoValidacion = {
    semaforo: 'ambar',
    penalizacionBlanda: 3,
    incumplimientos: [
      { ...base, personaId: 'per-07' },
      { ...base, personaId: 'per-07' },
      { ...base, personaId: null },
    ],
  };
  const res = resumirSemana(indice, datos, r);

  it('resume a cada persona', () => {
    const p = res.personas.find((x) => x.personaId === 'per-07')!;
    expect(p.minutosDia).toHaveLength(7);
    expect(p.minutosDia[0]).toBe(180);
    expect(p.minutosDia[6]).toBe(375);
    expect(p.minutosSemana).toBe(180 + 375);
    expect(p.dias).toBe(2);
    expect(p.porArea).toEqual({ [IDS_EJEMPLO.areas.caja]: 180, [IDS_EJEMPLO.areas.pedidos]: 375 });
    expect(p.jornadaDomingo).toEqual({ inicio: 945, fin: 1320 });
    expect(p.objetivo).toBe(600);
    expect(p.desviacion).toBe(555 - 600);
    expect(p.avisos).toBe(2);
  });

  it('personas sin objetivo ni domingo', () => {
    const p = res.personas.find((x) => x.personaId === 'per-01')!;
    expect(p).toMatchObject({ objetivo: null, desviacion: null, jornadaDomingo: null, avisos: 0, dias: 1 });
    expect(res.personas).toHaveLength(datos.personas.length);
  });

  it('cobertura por puesto con porcentaje entero', () => {
    const ped = res.puestos.find((x) => x.puestoId === pedidos)!;
    expect(ped).toEqual({ puestoId: pedidos, huecos: 14, cubiertos: 2, porcentaje: 14 });
    const c = res.puestos.find((x) => x.puestoId === caja1)!;
    expect(c.cubiertos).toBe(2);
    expect(Number.isInteger(c.porcentaje)).toBe(true);
  });
});
