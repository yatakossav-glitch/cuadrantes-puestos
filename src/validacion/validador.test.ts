import { describe, expect, it } from 'vitest';
import { IDS_EJEMPLO, crearEstadoEjemplo } from '../datos-ejemplo/ejemplo';
import type { CatalogoGeneral, CatalogoRestricciones, ContextoEvaluacion, Incumplimiento, ResultadoValidacion } from '../reglas/contrato';
import type { Asignacion, DatosPlanificacion, Persona, ReglaGeneral, RestriccionPersona } from '../modelo/tipos';
import { incumplimientoGeneral, incumplimientoRestriccion } from '../reglas/util';
import { puesto } from './indice.test';
import { marcasPorAsignacion, marcasPorHueco, validarSemana, type Catalogos } from './validador';

const LUNES = '2026-11-23';
const JUEVES = '2026-11-26';
const caja1 = IDS_EJEMPLO.puestos.caja1;

/**
 * Catálogos falsos: cada tipo devuelve un incumplimiento por cada asignación de la persona
 * indicada en `params`-less lógica sencilla; los tipos sin entrada en `generales` lanzan.
 */
function catalogosFalsos(
  general: Record<string, (regla: ReglaGeneral, ctx: ContextoEvaluacion) => Incumplimiento[]>,
  restricciones: Record<string, (r: RestriccionPersona, persona: Persona, ctx: ContextoEvaluacion) => Incumplimiento[]> = {},
): Catalogos {
  const envolver = (tabla: Record<string, unknown>) =>
    new Proxy({}, {
      get: (_o, tipo: string) => {
        const f = tabla[tipo];
        if (!f) return { evaluar: () => [] };
        return { evaluar: f };
      },
    });
  return {
    general: envolver(general) as unknown as CatalogoGeneral,
    restricciones: envolver(restricciones) as unknown as CatalogoRestricciones,
  };
}

function datosSolo(tipos: string[]): DatosPlanificacion {
  const d = crearEstadoEjemplo();
  d.reglas = d.reglas.filter((r) => tipos.includes(r.id));
  for (const p of d.personas) p.restricciones = [];
  return d;
}

describe('validarSemana', () => {
  const a1 = puesto('a1', JUEVES, caja1, 'franja-caja-5', 'per-07');
  const a2 = puesto('a2', LUNES, caja1, 'franja-caja-1', 'per-02');

  it('sin incumplimientos: verde', () => {
    const d = datosSolo(['regla-habilitacion']);
    const r = validarSemana(d, LUNES, [], catalogosFalsos({}));
    expect(r).toEqual({ semaforo: 'verde', incumplimientos: [], penalizacionBlanda: 0 });
  });

  it('no evalúa reglas inactivas ni descartadas', () => {
    const d = datosSolo(['regla-habilitacion', 'regla-max-dias']);
    d.reglas[0]!.activa = false;
    d.reglas[1]!.estado = 'descartada';
    let llamadas = 0;
    const cat = catalogosFalsos({
      habilitacionRequerida: () => { llamadas += 1; return []; },
      maxDiasSemana: () => { llamadas += 1; return []; },
    });
    validarSemana(d, LUNES, [], cat);
    expect(llamadas).toBe(0);
    d.reglas[0]!.activa = true;
    d.reglas[1]!.estado = 'pendiente';
    validarSemana(d, LUNES, [], cat);
    expect(llamadas).toBe(2);
  });

  it('no evalúa restricciones inactivas', () => {
    const d = datosSolo([]);
    const p = d.personas[0]!;
    p.restricciones = [
      { id: 'r1', tipo: 'maxDiasSemana', params: { max: 1 }, dura: true, peso: 0, activa: true, nota: '' },
      { id: 'r2', tipo: 'maxDiasSemana', params: { max: 2 }, dura: true, peso: 0, activa: false, nota: '' },
    ];
    const vistas: string[] = [];
    const cat = catalogosFalsos({}, {
      maxDiasSemana: ((r: RestriccionPersona) => { vistas.push(r.id); return []; }),
    });
    validarSemana(d, LUNES, [], cat);
    expect(vistas).toEqual(['r1']);
  });

  it('semáforo ámbar con blandos, rojo con duras; penalizacionBlanda suma solo blandos', () => {
    const d = datosSolo(['regla-habilitacion', 'regla-max-dias']);
    d.reglas[0]!.dura = true;
    d.reglas[1]!.dura = false;
    d.reglas[1]!.peso = 5;
    const cat = catalogosFalsos({
      habilitacionRequerida: ((reg: ReglaGeneral) => [incumplimientoGeneral(reg, { mensaje: 'duro', fecha: JUEVES })]),
      maxDiasSemana: ((reg: ReglaGeneral) => [
        incumplimientoGeneral(reg, { mensaje: 'b1', fecha: JUEVES, unidades: 2 }),
        incumplimientoGeneral(reg, { mensaje: 'b2', fecha: LUNES }),
      ]),
    });
    const rojo = validarSemana(d, LUNES, [], cat);
    expect(rojo.semaforo).toBe('rojo');
    expect(rojo.penalizacionBlanda).toBe(15);
    d.reglas[0]!.activa = false;
    const ambar = validarSemana(d, LUNES, [], cat);
    expect(ambar.semaforo).toBe('ambar');
    expect(ambar.penalizacionBlanda).toBe(15);
  });

  it('ordena: duras primero, luego fecha, hora y persona', () => {
    const d = datosSolo(['regla-habilitacion', 'regla-max-dias']);
    d.reglas[0]!.dura = true;
    d.reglas[1]!.dura = false;
    const asigs: Asignacion[] = [
      puesto('t', JUEVES, caja1, 'franja-caja-5', 'per-07'),
      puesto('m', JUEVES, caja1, 'franja-caja-1', 'per-09'),
      puesto('m2', JUEVES, caja1, 'franja-caja-1', 'per-03', 1),
      puesto('l', LUNES, caja1, 'franja-caja-8', 'per-01'),
    ];
    const porAsig = (reg: ReglaGeneral, ctx: ContextoEvaluacion) =>
      ctx.indice.asignaciones().map((a) =>
        incumplimientoGeneral(reg, { mensaje: `${reg === d.reglas[0] ? 'D' : 'B'}-${a.id}`, fecha: a.fecha, personaId: a.personaId, asignacionIds: [a.id] }),
      );
    const cat = catalogosFalsos({ habilitacionRequerida: porAsig, maxDiasSemana: porAsig });
    const r = validarSemana(d, LUNES, asigs, cat);
    expect(r.incumplimientos.map((i) => i.mensaje)).toEqual(['D-l', 'D-m2', 'D-m', 'D-t', 'B-l', 'B-m2', 'B-m', 'B-t']);
  });

  it('una regla que lanza produce un aviso y no rompe la validación', () => {
    const d = datosSolo(['regla-habilitacion', 'regla-max-dias']);
    d.reglas[0]!.nombre = 'Rota';
    d.personas[0]!.restricciones = [{ id: 'r1', tipo: 'maxDiasSemana', params: { max: 1 }, dura: true, peso: 0, activa: true, nota: '' }];
    const cat = catalogosFalsos(
      {
        habilitacionRequerida: () => { throw new Error('boom'); },
        maxDiasSemana: ((reg: ReglaGeneral) => [incumplimientoGeneral(reg, { mensaje: 'ok' })]),
      },
      { maxDiasSemana: (() => { throw new Error('boom'); }) },
    );
    const r = validarSemana(d, LUNES, [], cat);
    const msgs = r.incumplimientos.map((i) => i.mensaje);
    expect(msgs).toContain('ok');
    expect(msgs).toContain('No se pudo comprobar la regla «Rota»');
    expect(msgs).toContain('No se pudo comprobar una restricción de EMP-01');
    const aviso = r.incumplimientos.find((i) => i.mensaje.startsWith('No se pudo comprobar la regla'))!;
    expect(aviso).toMatchObject({ dura: false, marca: 'aviso', penalizacion: 0, origen: 'general' });
    expect(r.semaforo).toBe('rojo'); // 'ok' es duro (regla de ejemplo dura)
  });

  it('evalúa restricciones con la persona', () => {
    const d = datosSolo([]);
    d.personas[0]!.restricciones = [{ id: 'r1', tipo: 'maxDiasSemana', params: { max: 1 }, dura: false, peso: 3, activa: true, nota: '' }];
    const cat = catalogosFalsos({}, {
      maxDiasSemana: ((r: RestriccionPersona, p: Persona) => [incumplimientoRestriccion(r, p, { mensaje: 'x', unidades: 2 })]),
    });
    const r = validarSemana(d, LUNES, [a1, a2], cat);
    expect(r.incumplimientos[0]).toMatchObject({ personaId: 'per-01', penalizacion: 6 });
    expect(r.semaforo).toBe('ambar');
  });
});

describe('marcas', () => {
  const base = { reglaId: 'r', origen: 'general', tipo: 'sinSolapes', dura: true, penalizacion: 0, mensaje: '', fecha: null, personaId: null } as const;
  const r: ResultadoValidacion = {
    semaforo: 'rojo',
    penalizacionBlanda: 0,
    incumplimientos: [
      { ...base, marca: 'solape', asignacionIds: ['a', 'b'], huecos: [] },
      { ...base, marca: 'noDisponible', asignacionIds: ['a'], huecos: [] },
      { ...base, marca: 'solape', asignacionIds: ['a'], huecos: [] },
      { ...base, marca: 'hueco', asignacionIds: [], huecos: ['h1', 'h2'] },
    ],
  };
  it('por asignación, sin repetir marcas', () => {
    const m = marcasPorAsignacion(r);
    expect(m.get('a')).toEqual(['solape', 'noDisponible']);
    expect(m.get('b')).toEqual(['solape']);
    expect(m.has('h1')).toBe(false);
  });
  it('por hueco', () => {
    const m = marcasPorHueco(r);
    expect(m.get('h1')).toEqual(['hueco']);
    expect(m.get('h2')).toEqual(['hueco']);
    expect(m.size).toBe(2);
  });
});
