import { describe, expect, it } from 'vitest';
import { IDS_EJEMPLO, crearEstadoEjemplo } from '../datos-ejemplo/ejemplo';
import { crearIndice } from '../validacion/indice';
import type { AsignacionPuesto, ReglaGeneral } from '../modelo/tipos';
import type { ContextoEvaluacion, Incumplimiento } from './contrato';
import {
  comprobarPorDiferencia,
  cuando,
  enAmbito,
  etiquetaPersona,
  incumplimientoGeneral,
  incumplimientoRestriccion,
  penalizacion,
  unidades15,
} from './util';

const LUNES = '2026-11-23';

function cand(id: string, franjaId: string, personaId: string): AsignacionPuesto {
  return { id, tipo: 'puesto', fecha: '2026-11-26', puestoId: IDS_EJEMPLO.puestos.caja1, franjaId, plaza: 0, personaId, bloqueada: false, origen: 'manual' };
}

describe('utilidades básicas', () => {
  it('unidades15 y penalizacion', () => {
    expect(unidades15(0)).toBe(0);
    expect(unidades15(-5)).toBe(0);
    expect(unidades15(15)).toBe(1);
    expect(unidades15(16)).toBe(2);
    expect(penalizacion(true, 10, 3)).toBe(0);
    expect(penalizacion(false, 10, 3)).toBe(30);
  });

  it('enAmbito: vacío = todo', () => {
    const d = crearEstadoEjemplo();
    const caja1 = d.puestos.find((p) => p.id === IDS_EJEMPLO.puestos.caja1)!;
    expect(enAmbito({ areaIds: [], puestoIds: [] }, caja1)).toBe(true);
    expect(enAmbito({ areaIds: [IDS_EJEMPLO.areas.caja], puestoIds: [] }, caja1)).toBe(true);
    expect(enAmbito({ areaIds: [], puestoIds: [caja1.id] }, caja1)).toBe(true);
    expect(enAmbito({ areaIds: [IDS_EJEMPLO.areas.lego], puestoIds: [] }, caja1)).toBe(false);
  });

  it('etiquetaPersona usa el código, nunca el alias', () => {
    const p = { ...crearEstadoEjemplo().personas[10]!, alias: 'Alias' };
    expect(etiquetaPersona(p)).toBe('EMP-11');
    expect(etiquetaPersona(undefined)).toBe('Persona desconocida');
  });

  it('cuando formatea día y hora', () => {
    expect(cuando('2026-11-26')).toBe('el jueves 26/11');
    expect(cuando('2026-11-05', { inicio: 1140, fin: 1320 })).toBe('el jueves 05/11 19:00–22:00');
  });
});

describe('incumplimientos', () => {
  const d = crearEstadoEjemplo();
  const regla: ReglaGeneral = { ...d.reglas[0]!, dura: false, peso: 4 };

  it('general: rellena regla y penalización por unidades', () => {
    const i = incumplimientoGeneral(regla, { mensaje: 'm', unidades: 3, marca: 'solape', fecha: LUNES, asignacionIds: ['a'] });
    expect(i).toMatchObject({ reglaId: regla.id, origen: 'general', tipo: regla.tipo, dura: false, penalizacion: 12, marca: 'solape', fecha: LUNES, personaId: null, asignacionIds: ['a'], huecos: [] });
    expect(incumplimientoGeneral(regla, { mensaje: 'm' })).toMatchObject({ penalizacion: 4, marca: 'aviso', fecha: null });
    expect(incumplimientoGeneral({ ...regla, dura: true }, { mensaje: 'm', unidades: 5 }).penalizacion).toBe(0);
  });

  it('restricción: incluye la persona', () => {
    const p = d.personas[2]!;
    const r = p.restricciones[0]!;
    const i = incumplimientoRestriccion(r, p, { mensaje: 'x' });
    expect(i).toMatchObject({ reglaId: r.id, origen: 'persona', tipo: r.tipo, personaId: p.id, dura: r.dura });
    expect(i.penalizacion).toBe(r.dura ? 0 : r.peso);
  });
});

describe('comprobarPorDiferencia', () => {
  const datos = crearEstadoEjemplo();
  const regla = datos.reglas[0]!;
  // Evaluador falso: cada asignación de EMP-07 es un incumplimiento duro; cada de EMP-08, blando de peso 2.
  const evaluar = (ctx: ContextoEvaluacion): Incumplimiento[] =>
    ctx.indice.asignaciones().flatMap((a) => {
      if (a.personaId === 'per-07') return [incumplimientoGeneral({ ...regla, dura: true }, { mensaje: `duro ${a.id}` })];
      if (a.personaId === 'per-08') return [incumplimientoGeneral({ ...regla, dura: false, peso: 2 }, { mensaje: `blando ${a.id}` })];
      return [];
    });
  const ctx: ContextoEvaluacion = { datos, indice: crearIndice(datos, LUNES, []) };

  it('candidata sin incumplimiento: permitida y coste 0', () => {
    expect(comprobarPorDiferencia(evaluar, ctx, cand('c', 'franja-caja-1', 'per-01'))).toEqual({ permitido: true, coste: 0, motivos: [] });
  });
  it('incumplimiento duro nuevo: no permitida', () => {
    const r = comprobarPorDiferencia(evaluar, ctx, cand('c', 'franja-caja-1', 'per-07'));
    expect(r.permitido).toBe(false);
    expect(r.motivos).toEqual(['duro c']);
  });
  it('incumplimiento blando nuevo: permitida con coste', () => {
    const r = comprobarPorDiferencia(evaluar, ctx, cand('c', 'franja-caja-1', 'per-08'));
    expect(r).toEqual({ permitido: true, coste: 2, motivos: ['blando c'] });
  });
  it('no cuenta incumplimientos que ya existían', () => {
    const previa = cand('p', 'franja-caja-2', 'per-07');
    const ctx2: ContextoEvaluacion = { datos, indice: crearIndice(datos, LUNES, [previa]) };
    const r = comprobarPorDiferencia(evaluar, ctx2, cand('c', 'franja-caja-1', 'per-01'));
    expect(r).toEqual({ permitido: true, coste: 0, motivos: [] });
  });
});
