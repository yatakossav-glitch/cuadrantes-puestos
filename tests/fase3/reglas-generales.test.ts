/**
 * Caja negra: los 15 tipos de regla general (ARQUITECTURA.md §10.2).
 * En cada caso solo está activa la regla bajo prueba (aislamiento).
 */
import { describe, expect, it } from 'vitest';
import type { Asignacion, ReglaGeneral } from '../../src/modelo/tipos';
import type { Incumplimiento } from '../../src/reglas/contrato';
import {
  DOM, JUE, LUN, MAR, MIE, P, SAB, VIE, asig, bloque, datosMini, fecha, franja, franjasSeguidas, pausa,
  personaMini, puestoMini, puestoP1, reglaDe, aMinutos,
} from './ayudas';
import { deTipo, validar } from './ayudas-validar';
import type { OpcionesDatosMini } from './ayudas';

function ver(regla: ReglaGeneral, asigs: Asignacion[], op: OpcionesDatosMini = {}): Incumplimiento[] {
  const r = validar(datosMini({ ...op, reglas: [regla] }), asigs);
  return deTipo(r, regla.tipo);
}

// ───────────────────────── sinSolapes ─────────────────────────
describe('sinSolapes', () => {
  const regla = reglaDe('sinSolapes', {});
  const dosPuestos = { puestos: [puestoP1(), puestoMini('p2', 'a1', franjasSeguidas('g', ['10:00', '11:00', '12:00']))] };

  it('cumple: franjas que se tocan (fin = inicio) no se solapan', () => {
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p2', 'g2', P(1))], dosPuestos)).toHaveLength(0);
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f2', P(1))])).toHaveLength(0);
  });

  it('cumple: misma hora en días distintos o personas distintas', () => {
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1)), asig(MAR, 'p2', 'g1', P(1))], dosPuestos)).toHaveLength(0);
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p2', 'g1', P(2))], dosPuestos)).toHaveLength(0);
  });

  it('incumple: la misma persona en dos puestos a la vez', () => {
    const a = asig(JUE, 'p1', 'f1', P(1));
    const b = asig(JUE, 'p2', 'g1', P(1));
    const r = ver(regla, [a, b], dosPuestos);
    expect(r).toHaveLength(1);
    expect(r[0]!.marca).toBe('solape');
    expect(r[0]!.dura).toBe(true);
    expect(r[0]!.penalizacion).toBe(0);
    expect(r[0]!.personaId).toBe(P(1));
    expect(r[0]!.fecha).toBe(fecha(JUE));
    expect([...r[0]!.asignacionIds].sort()).toEqual([a.id, b.id].sort());
    expect(r[0]!.mensaje).toContain('EMP-01');
    expect(r[0]!.mensaje).toMatch(/jueves/);
    expect(r[0]!.mensaje).toContain('26/11');
  });

  it('incumple: solape parcial (franjas que se pisan solo en parte)', () => {
    const puestos = [puestoP1(), puestoMini('p2', 'a1', [franja('h1', '10:30', '11:30')])];
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p2', 'h1', P(1))], { puestos })).toHaveLength(1);
  });

  it('incumple: puesto y pausa a la vez', () => {
    const r = ver(regla, [asig(LUN, 'p1', 'f1', P(1)), pausa(LUN, P(1), '10:30', '11:00')]);
    expect(r).toHaveLength(1);
    expect(r[0]!.marca).toBe('solape');
  });

  it('incumple: dos plazas del mismo puesto con la misma persona', () => {
    const puestos = [puestoP1({ plazas: 2 })];
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1), 0), asig(LUN, 'p1', 'f1', P(1), 1)], { puestos })).toHaveLength(1);
  });

  it('incumple: Pedidos (turno largo) con otro hueco de su turno', () => {
    const puestos = [puestoMini('pp', 'a1', [franja('t', '10:00', '15:45')]), puestoP1()];
    expect(ver(regla, [asig(LUN, 'pp', 't', P(1)), asig(LUN, 'p1', 'f4', P(1))], { puestos })).toHaveLength(1);
  });

  it('tres asignaciones que se pisan dan un incumplimiento por cada par (3)', () => {
    const puestos = [puestoP1(), puestoMini('p2', 'a1', [franja('g1', '10:00', '11:00')]), puestoMini('p3', 'a1', [franja('k1', '10:00', '11:00')])];
    const r = ver(regla, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p2', 'g1', P(1)), asig(LUN, 'p3', 'k1', P(1))], { puestos });
    expect(r).toHaveLength(3);
  });

  it('blanda: penaliza por ocurrencia (peso 3 por par)', () => {
    const r = ver(reglaDe('sinSolapes', {}, { dura: false, peso: 3 }), [asig(LUN, 'p1', 'f1', P(1)), pausa(LUN, P(1), '10:00', '10:30')]);
    expect(r).toHaveLength(1);
    expect(r[0]!.dura).toBe(false);
    expect(r[0]!.penalizacion).toBe(3);
  });
});

// ───────────────────────── coberturaCompleta ─────────────────────────
describe('coberturaCompleta', () => {
  const regla = reglaDe('coberturaCompleta', {});
  const soloLunes = { puestos: [puestoP1({ dias: [LUN] })] };
  const cubrirLunes = (excepto: string[] = []) =>
    ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].filter((f) => !excepto.includes(f)).map((f, i) => asig(LUN, 'p1', f, P(1 + (i % 2))));

  it('cumple: todos los huecos cubiertos', () => {
    expect(ver(regla, cubrirLunes(), soloLunes)).toHaveLength(0);
  });

  it('incumple: un hueco vacío, con marca hueco y su clave', () => {
    const r = ver(regla, cubrirLunes(['f3']), soloLunes);
    expect(r).toHaveLength(1);
    expect(r[0]!.marca).toBe('hueco');
    expect(r[0]!.huecos).toEqual([`${fecha(LUN)}|p1|f3|0`]);
    expect(r[0]!.mensaje).toMatch(/sin cubrir/i);
    expect(r[0]!.mensaje).toMatch(/lunes/);
    expect(r[0]!.mensaje).toContain('23/11');
    expect(r[0]!.mensaje).toContain('12:00');
    expect(r[0]!.mensaje).toContain('13:00');
  });

  it('agrupa las franjas vacías consecutivas en un solo incumplimiento', () => {
    const r = ver(regla, cubrirLunes(['f2', 'f3', 'f4']), soloLunes);
    expect(r).toHaveLength(1);
    expect(r[0]!.huecos).toHaveLength(3);
    expect(r[0]!.mensaje).toMatch(/11:00.13:00|11:00.*14:00/);
  });

  it('no agrupa franjas vacías separadas por una cubierta', () => {
    const r = ver(regla, cubrirLunes(['f2', 'f4']), soloLunes);
    expect(r).toHaveLength(2);
    expect(r.every((i) => i.huecos.length === 1)).toBe(true);
  });

  it('no agrupa huecos de días distintos ni de plazas distintas', () => {
    const dosDias = { puestos: [puestoP1({ dias: [LUN, MAR] })] };
    const r = ver(regla, [], dosDias);
    expect(r).toHaveLength(2);
    expect(r.every((i) => i.huecos.length === 6)).toBe(true);

    const dosPlazas = { puestos: [puestoP1({ dias: [LUN], plazas: 2 })] };
    const r2 = ver(regla, cubrirLunes(), dosPlazas);
    expect(r2).toHaveLength(1);
    expect(r2[0]!.huecos.every((h) => h.endsWith('|1'))).toBe(true);
    expect(r2[0]!.huecos).toHaveLength(6);
  });

  it('semana entera vacía: un incumplimiento por día con las 6 franjas', () => {
    const r = ver(regla, []);
    expect(r).toHaveLength(7);
    expect(r.every((i) => i.huecos.length === 6)).toBe(true);
  });

  it('blanda: unidades = número de franjas (3 franjas × peso 2 = 6)', () => {
    const r = ver(reglaDe('coberturaCompleta', {}, { dura: false, peso: 2 }), cubrirLunes(['f1', 'f2', 'f3']), soloLunes);
    expect(r).toHaveLength(1);
    expect(r[0]!.penalizacion).toBe(6);
  });

  it('un puesto inactivo no genera huecos', () => {
    expect(ver(regla, [], { puestos: [puestoP1({ activo: false })] })).toHaveLength(0);
  });

  it('puesto cerrado por incidencia: sin huecos ese día', () => {
    const r = ver(regla, [], {
      puestos: [puestoP1({ dias: [LUN, MAR] })],
      incidencias: [{ id: 'c', tipo: 'puestoCerrado', puestoId: 'p1', desde: fecha(LUN), hasta: fecha(LUN), nota: '' }],
    });
    expect(r).toHaveLength(1);
    expect(r[0]!.fecha).toBe(fecha(MAR));
  });

  it('aviso: asignación a una franja que no existe', () => {
    const r = ver(regla, [...cubrirLunes(), asig(LUN, 'p1', 'fantasma', P(3))], soloLunes);
    expect(r.filter((i) => i.marca === 'aviso').length).toBeGreaterThanOrEqual(1);
    expect(r.filter((i) => i.marca === 'hueco')).toHaveLength(0);
  });

  it('aviso: puesto cerrado, plaza fuera de rango y dos asignaciones en la misma plaza', () => {
    const cerrado = ver(regla, [asig(LUN, 'p1', 'f1', P(1))], {
      puestos: [puestoP1({ dias: [LUN] })],
      incidencias: [{ id: 'c', tipo: 'puestoCerrado', puestoId: 'p1', desde: fecha(LUN), hasta: fecha(LUN), nota: '' }],
    });
    expect(cerrado.some((i) => i.marca === 'aviso')).toBe(true);

    const fueraPlaza = ver(regla, [...cubrirLunes(), asig(LUN, 'p1', 'f1', P(3), 1)], soloLunes);
    expect(fueraPlaza.some((i) => i.marca === 'aviso')).toBe(true);

    const doble = ver(regla, [...cubrirLunes(), asig(LUN, 'p1', 'f1', P(4), 0)], soloLunes);
    expect(doble.some((i) => i.marca === 'aviso')).toBe(true);
  });
});

// ───────────────────────── personaDisponible ─────────────────────────
describe('personaDisponible', () => {
  const regla = reglaDe('personaDisponible', {});

  it('cumple: persona activa, en plantilla y sin ausencias', () => {
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1)), pausa(LUN, P(1), '14:00', '15:00')])).toHaveLength(0);
  });

  it('incumple: persona inactiva (marca noDisponible, un incumplimiento por asignación)', () => {
    const personas = [personaMini(1, { activa: false }), personaMini(2)];
    const r = ver(regla, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f2', P(1))], { personas });
    expect(r).toHaveLength(2);
    expect(r.every((i) => i.marca === 'noDisponible' && i.personaId === P(1))).toBe(true);
    expect(r[0]!.mensaje).toContain('EMP-01');
  });

  it('incumple: persona inexistente', () => {
    expect(ver(regla, [asig(LUN, 'p1', 'f1', 'per-99')])).toHaveLength(1);
  });

  it('límite de baja: el día anterior a la baja cumple, el de la baja incumple', () => {
    const personas = [personaMini(1, { baja: fecha(MIE) })];
    expect(ver(regla, [asig(MAR, 'p1', 'f1', P(1))], { personas })).toHaveLength(0);
    const r = ver(regla, [asig(MIE, 'p1', 'f1', P(1))], { personas });
    expect(r).toHaveLength(1);
    expect(r[0]!.mensaje).toMatch(/miércoles/);
  });

  it('límite de alta: antes del alta incumple, el día del alta cumple', () => {
    const personas = [personaMini(1, { alta: fecha(MIE) })];
    expect(ver(regla, [asig(MAR, 'p1', 'f1', P(1))], { personas })).toHaveLength(1);
    expect(ver(regla, [asig(MIE, 'p1', 'f1', P(1))], { personas })).toHaveLength(0);
  });

  it('ausencia de día entero: incumple dentro del rango (inclusive) y cumple fuera', () => {
    const incidencias = [{ id: 'a', tipo: 'ausencia' as const, personaId: P(1), desde: fecha(MAR), hasta: fecha(JUE), tramo: null, nota: '' }];
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1))], { incidencias })).toHaveLength(0);
    expect(ver(regla, [asig(MAR, 'p1', 'f1', P(1))], { incidencias })).toHaveLength(1);
    expect(ver(regla, [asig(JUE, 'p1', 'f1', P(1))], { incidencias })).toHaveLength(1);
    expect(ver(regla, [asig(VIE, 'p1', 'f1', P(1))], { incidencias })).toHaveLength(0);
  });

  it('ausencia con tramo: solo incumple si la asignación se solapa con el tramo (tocarse no cuenta)', () => {
    const incidencias = [
      { id: 'a', tipo: 'ausencia' as const, personaId: P(1), desde: fecha(LUN), hasta: fecha(LUN), tramo: { inicio: aMinutos('10:00'), fin: aMinutos('11:00') }, nota: '' },
    ];
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1))], { incidencias })).toHaveLength(1);
    expect(ver(regla, [asig(LUN, 'p1', 'f2', P(1))], { incidencias })).toHaveLength(0);
  });

  it('también vale para pausas', () => {
    const personas = [personaMini(1, { activa: false })];
    const r = ver(regla, [pausa(DOM, P(1), '14:00', '15:00')], { personas });
    expect(r).toHaveLength(1);
    expect(r[0]!.marca).toBe('noDisponible');
  });
});

// ───────────────────────── habilitacionRequerida ─────────────────────────
describe('habilitacionRequerida', () => {
  const regla = reglaDe('habilitacionRequerida', {});
  const conHab = (requiere: boolean) => ({ puestos: [puestoP1({ requiereHabilitacion: requiere })] });

  it('cumple: habilitada por el área del puesto', () => {
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1))], conHab(true))).toHaveLength(0);
  });

  it('cumple: habilitada por el id del propio puesto', () => {
    const personas = [personaMini(1, { habilitaciones: ['p1'] })];
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1))], { ...conHab(true), personas })).toHaveLength(0);
  });

  it('incumple: sin habilitación para el puesto (marca noDisponible)', () => {
    const personas = [personaMini(1, { habilitaciones: ['a2'] })];
    const r = ver(regla, [asig(VIE, 'p1', 'f1', P(1))], { ...conHab(true), personas });
    expect(r).toHaveLength(1);
    expect(r[0]!.marca).toBe('noDisponible');
    expect(r[0]!.mensaje).toContain('EMP-01');
    expect(r[0]!.mensaje).toMatch(/viernes/);
  });

  it('cumple: el puesto no exige habilitación', () => {
    const personas = [personaMini(1, { habilitaciones: [] })];
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1))], { ...conHab(false), personas })).toHaveLength(0);
  });
});

// ───────────────────────── maxMinutosDia ─────────────────────────
describe('maxMinutosDia (general)', () => {
  // 120 + 150 = 270; + 20 = 290
  const puestos = [
    puestoMini('pa', 'a1', [franja('g1', '10:00', '12:00'), franja('g2', '12:00', '14:30'), franja('g3', '14:30', '14:50'), franja('g4', '14:50', '16:00')]),
    puestoMini('pb', 'a2', [franja('h1', '10:00', '18:00')]),
  ];
  const regla = reglaDe('maxMinutosDia', { maxMin: 270, excepciones: [{ areaId: 'a2', maxMin: null }] });

  it('cumple: justo en el límite (4h30)', () => {
    expect(ver(regla, [asig(LUN, 'pa', 'g1', P(1)), asig(LUN, 'pa', 'g2', P(1))], { puestos })).toHaveLength(0);
  });

  it('incumple: supera el límite, mensaje con persona, día y duración', () => {
    const r = ver(regla, [asig(JUE, 'pa', 'g1', P(1)), asig(JUE, 'pa', 'g2', P(1)), asig(JUE, 'pa', 'g3', P(1))], { puestos });
    expect(r).toHaveLength(1);
    expect(r[0]!.dura).toBe(true);
    expect(r[0]!.mensaje).toContain('EMP-01');
    expect(r[0]!.mensaje).toMatch(/jueves/);
    expect(r[0]!.mensaje).toContain('26/11');
    expect(r[0]!.mensaje).toContain('4h50');
  });

  it('un incumplimiento por persona y día', () => {
    const exceso = (d: 0 | 1) => [asig(d, 'pa', 'g1', P(1)), asig(d, 'pa', 'g2', P(1)), asig(d, 'pa', 'g3', P(1))];
    expect(ver(regla, [...exceso(LUN), ...exceso(MAR)], { puestos })).toHaveLength(2);
  });

  it('blanda: exceso de 20 min con peso 5 → penalización 10 (por cada 15 min, redondeando hacia arriba)', () => {
    const r = ver(reglaDe('maxMinutosDia', { maxMin: 270, excepciones: [] }, { dura: false, peso: 5 }), [
      asig(LUN, 'pa', 'g1', P(1)), asig(LUN, 'pa', 'g2', P(1)), asig(LUN, 'pa', 'g3', P(1)),
    ], { puestos });
    expect(r).toHaveLength(1);
    expect(r[0]!.dura).toBe(false);
    expect(r[0]!.penalizacion).toBe(10);
  });

  it('blanda: exceso exacto de 30 min con peso 5 → 10 y exceso de 15 min → 5', () => {
    const p2 = [puestoMini('pa', 'a1', [franja('g1', '10:00', '14:30'), franja('g2', '14:30', '15:00'), franja('g3', '15:00', '15:15')])];
    const blanda = reglaDe('maxMinutosDia', { maxMin: 270, excepciones: [] }, { dura: false, peso: 5 });
    expect(ver(blanda, [asig(LUN, 'pa', 'g1', P(1)), asig(LUN, 'pa', 'g2', P(1))], { puestos: p2 })[0]!.penalizacion).toBe(10);
    expect(ver(blanda, [asig(LUN, 'pa', 'g1', P(1)), asig(LUN, 'pa', 'g3', P(1))], { puestos: p2 })[0]!.penalizacion).toBe(5);
  });

  it('excepción por área sin límite (null): 8 h en esa área no incumplen', () => {
    expect(ver(regla, [asig(LUN, 'pb', 'h1', P(1))], { puestos })).toHaveLength(0);
  });

  it('las horas del área con excepción no cuentan para el límite general de las demás', () => {
    expect(ver(regla, [asig(LUN, 'pb', 'h1', P(1)), asig(LUN, 'pa', 'g1', P(1)), asig(LUN, 'pa', 'g2', P(1))], { puestos })).toHaveLength(0);
  });

  it('excepción con límite propio: se mide contra ese límite', () => {
    const r400 = reglaDe('maxMinutosDia', { maxMin: 270, excepciones: [{ areaId: 'a2', maxMin: 400 }] });
    const r = ver(r400, [asig(LUN, 'pb', 'h1', P(1))], { puestos });
    expect(r).toHaveLength(1);
    expect(r[0]!.mensaje).toContain('EMP-01');
  });
});

// ───────────────────────── descansoEntreJornadas ─────────────────────────
describe('descansoEntreJornadas', () => {
  const puestos = [
    puestoMini('pt', 'a1', [franja('t1', '14:00', '22:00')]),
    puestoMini('pm', 'a1', [franja('m1', '10:00', '12:00'), franja('m2', '09:30', '12:00')]),
  ];
  const regla = reglaDe('descansoEntreJornadas', { minMin: 720 });

  it('cumple: justo 12 h entre el fin de un día y el inicio del siguiente', () => {
    expect(ver(regla, [asig(LUN, 'pt', 't1', P(1)), asig(MAR, 'pm', 'm1', P(1))], { puestos })).toHaveLength(0);
  });

  it('incumple: descanso de 11h30', () => {
    const r = ver(regla, [asig(LUN, 'pt', 't1', P(1)), asig(MAR, 'pm', 'm2', P(1))], { puestos });
    expect(r).toHaveLength(1);
    expect(r[0]!.mensaje).toContain('EMP-01');
    expect(r[0]!.personaId).toBe(P(1));
  });

  it('cumple: días no consecutivos', () => {
    expect(ver(regla, [asig(LUN, 'pt', 't1', P(1)), asig(MIE, 'pm', 'm2', P(1))], { puestos })).toHaveLength(0);
  });

  it('cumple: personas distintas', () => {
    expect(ver(regla, [asig(LUN, 'pt', 't1', P(1)), asig(MAR, 'pm', 'm2', P(2))], { puestos })).toHaveLength(0);
  });

  it('blanda: defecto de 30 min con peso 5 → 10', () => {
    const r = ver(reglaDe('descansoEntreJornadas', { minMin: 720 }, { dura: false, peso: 5 }), [asig(LUN, 'pt', 't1', P(1)), asig(MAR, 'pm', 'm2', P(1))], { puestos });
    expect(r).toHaveLength(1);
    expect(r[0]!.penalizacion).toBe(10);
  });
});

// ───────────────────────── noRepetirConsecutivas ─────────────────────────
describe('noRepetirConsecutivas', () => {
  const regla = reglaDe('noRepetirConsecutivas', { ambito: { areaIds: [], puestoIds: [] } });

  it('cumple: personas distintas en franjas seguidas', () => {
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f2', P(2))])).toHaveLength(0);
  });

  it('cumple: la misma persona en franjas no consecutivas', () => {
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f3', P(1))])).toHaveLength(0);
  });

  it('cumple: franjas con hueco entre medias (fin distinto de inicio)', () => {
    const puestos = [puestoMini('p1', 'a1', [franja('f1', '10:00', '11:00'), franja('f2', '11:15', '12:15')])];
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f2', P(1))], { puestos })).toHaveLength(0);
  });

  it('incumple: repite en franjas consecutivas', () => {
    const r = ver(regla, [asig(MIE, 'p1', 'f1', P(1)), asig(MIE, 'p1', 'f2', P(1))]);
    expect(r).toHaveLength(1);
    expect(r[0]!.mensaje).toContain('EMP-01');
    expect(r[0]!.mensaje).toMatch(/miércoles/);
  });

  it('tres seguidas con la misma persona: dos incumplimientos (uno por par)', () => {
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f2', P(1)), asig(LUN, 'p1', 'f3', P(1))])).toHaveLength(2);
  });

  it('respeta el ámbito: un puesto fuera del ámbito no se comprueba', () => {
    const fuera = reglaDe('noRepetirConsecutivas', { ambito: { areaIds: [], puestoIds: ['otro'] } });
    expect(ver(fuera, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f2', P(1))])).toHaveLength(0);
    const dentro = reglaDe('noRepetirConsecutivas', { ambito: { areaIds: ['a1'], puestoIds: [] } });
    expect(ver(dentro, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f2', P(1))])).toHaveLength(1);
  });

  it('blanda: penaliza por ocurrencia (peso 4)', () => {
    const r = ver(reglaDe('noRepetirConsecutivas', { ambito: { areaIds: [], puestoIds: [] } }, { dura: false, peso: 4 }), [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f2', P(1))]);
    expect(r[0]!.penalizacion).toBe(4);
  });
});

// ───────────────────────── mismaPersonaBloque ─────────────────────────
describe('mismaPersonaBloque', () => {
  const puestos = (plazas = 1) => [
    puestoMini('pb', 'a1', franjasSeguidas('b', ['10:00', '11:00', '12:00', '13:00']), { plazas, bloques: [bloque('bq', ['b1', 'b2'])] }),
  ];
  const regla = reglaDe('mismaPersonaBloque', { ambito: { areaIds: [], puestoIds: [] } });

  it('cumple: la misma persona en todo el bloque', () => {
    expect(ver(regla, [asig(LUN, 'pb', 'b1', P(1)), asig(LUN, 'pb', 'b2', P(1))], { puestos: puestos() })).toHaveLength(0);
  });

  it('incumple: personas distintas en el mismo bloque (uno por bloque)', () => {
    const r = ver(regla, [asig(JUE, 'pb', 'b1', P(1)), asig(JUE, 'pb', 'b2', P(2))], { puestos: puestos() });
    expect(r).toHaveLength(1);
    expect(r[0]!.mensaje).toMatch(/EMP-0[12]/);
    expect(r[0]!.mensaje).toMatch(/jueves/);
  });

  it('cumple: solo una franja cubierta del bloque, o franjas fuera de bloque con personas distintas', () => {
    expect(ver(regla, [asig(LUN, 'pb', 'b1', P(1))], { puestos: puestos() })).toHaveLength(0);
    expect(ver(regla, [asig(LUN, 'pb', 'b3', P(1))], { puestos: puestos() })).toHaveLength(0);
  });

  it('cada plaza se evalúa por separado', () => {
    const bien = [asig(LUN, 'pb', 'b1', P(1), 0), asig(LUN, 'pb', 'b2', P(1), 0), asig(LUN, 'pb', 'b1', P(2), 1), asig(LUN, 'pb', 'b2', P(2), 1)];
    expect(ver(regla, bien, { puestos: puestos(2) })).toHaveLength(0);
    const cruzado = [asig(LUN, 'pb', 'b1', P(1), 0), asig(LUN, 'pb', 'b2', P(2), 0)];
    expect(ver(regla, cruzado, { puestos: puestos(2) })).toHaveLength(1);
  });

  it('respeta el ámbito', () => {
    const fuera = reglaDe('mismaPersonaBloque', { ambito: { areaIds: ['a2'], puestoIds: [] } });
    expect(ver(fuera, [asig(LUN, 'pb', 'b1', P(1)), asig(LUN, 'pb', 'b2', P(2))], { puestos: puestos() })).toHaveLength(0);
  });
});

// ───────────────────────── rotarEntreBloques ─────────────────────────
describe('rotarEntreBloques', () => {
  const franjas = () => franjasSeguidas('g', ['10:00', '11:00', '12:00', '13:00']);
  const bloques = () => [bloque('B1', ['g1', 'g2']), bloque('B2', ['g3', 'g4'])];
  const puestos = [
    puestoMini('c1', 'a1', franjas(), { bloques: bloques() }),
    puestoMini('c2', 'a1', franjas(), { bloques: bloques() }),
  ];
  const regla = reglaDe('rotarEntreBloques', { ambito: { areaIds: ['a1'], puestoIds: [] } }, { dura: false, peso: 5 });
  const pareja = (dia: 0 | 3, g: [string, string], a: number, b: number): Asignacion[] => [
    asig(dia, 'c1', g[0], P(a)), asig(dia, 'c1', g[1], P(a)), asig(dia, 'c2', g[0], P(b)), asig(dia, 'c2', g[1], P(b)),
  ];

  it('cumple: la pareja cambia entre bloques', () => {
    expect(ver(regla, [...pareja(JUE, ['g1', 'g2'], 1, 2), ...pareja(JUE, ['g3', 'g4'], 1, 3)], { puestos })).toHaveLength(0);
  });

  it('incumple: la misma pareja repite (aunque cambie de caja)', () => {
    const r = ver(regla, [...pareja(JUE, ['g1', 'g2'], 1, 2), ...pareja(JUE, ['g3', 'g4'], 2, 1)], { puestos });
    expect(r).toHaveLength(1);
    expect(r[0]!.dura).toBe(false);
    expect(r[0]!.penalizacion).toBe(5);
    expect(r[0]!.mensaje).toContain('EMP-01');
    expect(r[0]!.mensaje).toContain('EMP-02');
    expect(r[0]!.mensaje).toMatch(/jueves/);
  });

  it('cumple: un único grupo de bloques ese día (no hay anterior)', () => {
    expect(ver(regla, pareja(LUN, ['g1', 'g2'], 1, 2), { puestos })).toHaveLength(0);
  });

  it('cumple: la misma pareja en días distintos', () => {
    expect(ver(regla, [...pareja(LUN, ['g1', 'g2'], 1, 2), ...pareja(JUE, ['g3', 'g4'], 1, 2)], { puestos })).toHaveLength(0);
  });

  it('respeta el ámbito', () => {
    const fuera = reglaDe('rotarEntreBloques', { ambito: { areaIds: ['a2'], puestoIds: [] } }, { dura: false, peso: 5 });
    expect(ver(fuera, [...pareja(JUE, ['g1', 'g2'], 1, 2), ...pareja(JUE, ['g3', 'g4'], 2, 1)], { puestos })).toHaveLength(0);
  });
});

// ───────────────────────── exclusividadDiaria ─────────────────────────
describe('exclusividadDiaria', () => {
  const puestos = [puestoP1(), puestoMini('pe', 'a1', [franja('e1', '10:00', '11:00')])];
  const regla = reglaDe('exclusividadDiaria', { puestoIds: ['pe'], diasExcepcion: [DOM] });

  it('cumple: quien hace el puesto exclusivo no hace nada más ese día', () => {
    expect(ver(regla, [asig(LUN, 'pe', 'e1', P(1)), asig(LUN, 'p1', 'f3', P(2))], { puestos })).toHaveLength(0);
  });

  it('cumple: en otro día puede hacer otro puesto', () => {
    expect(ver(regla, [asig(LUN, 'pe', 'e1', P(1)), asig(MAR, 'p1', 'f3', P(1))], { puestos })).toHaveLength(0);
  });

  it('incumple: el puesto exclusivo más otro puesto el mismo día (uno por persona y día)', () => {
    const r = ver(regla, [asig(MAR, 'pe', 'e1', P(1)), asig(MAR, 'p1', 'f3', P(1)), asig(MAR, 'p1', 'f5', P(1))], { puestos });
    expect(r).toHaveLength(1);
    expect(r[0]!.mensaje).toContain('EMP-01');
    expect(r[0]!.mensaje).toMatch(/martes/);
  });

  it('cumple: el día de excepción (domingo) puede mezclar', () => {
    expect(ver(regla, [asig(DOM, 'pe', 'e1', P(1)), asig(DOM, 'p1', 'f3', P(1))], { puestos })).toHaveLength(0);
  });

  it('incumple el sábado, que no es excepción', () => {
    expect(ver(regla, [asig(SAB, 'pe', 'e1', P(1)), asig(SAB, 'p1', 'f3', P(1))], { puestos })).toHaveLength(1);
  });
});

// ───────────────────────── respetarEquipo ─────────────────────────
describe('respetarEquipo', () => {
  // q1 mañana; q4 15:30–15:45 (empieza antes del corte 15:45: mañana); q3 15:45–16:30 (tarde); q2 16:00–17:00 (tarde)
  const puestos = [puestoMini('pq', 'a1', [franja('q1', '10:00', '11:00'), franja('q4', '15:30', '15:45'), franja('q3', '15:45', '16:30'), franja('q2', '16:00', '17:00')])];
  const con = (equipo: 'M' | 'T' | 'A') => ({ puestos, personas: [personaMini(1, { equipo })] });
  const regla = (max: number, dias: (0 | 1 | 2 | 3 | 4 | 5 | 6)[]) => reglaDe('respetarEquipo', { maxDiasContrarioSemana: max, diasPermitidos: dias });

  it('cumple: equipo M en franjas de mañana y T en franjas de tarde', () => {
    expect(ver(regla(0, []), [asig(LUN, 'pq', 'q1', P(1))], con('M'))).toHaveLength(0);
    expect(ver(regla(0, []), [asig(LUN, 'pq', 'q3', P(1))], con('T'))).toHaveLength(0);
  });

  it('frontera: una franja que empieza antes del corte es de mañana aunque acabe en él; la que empieza en el corte es de tarde', () => {
    expect(ver(regla(0, []), [asig(LUN, 'pq', 'q4', P(1))], con('M'))).toHaveLength(0);
    expect(ver(regla(0, []), [asig(LUN, 'pq', 'q3', P(1))], con('M'))).toHaveLength(1);
    expect(ver(regla(0, []), [asig(LUN, 'pq', 'q4', P(1))], con('T'))).toHaveLength(1);
  });

  it('incumple: equipo M en tarde (mensaje con persona y día) y T en mañana', () => {
    const r = ver(regla(0, []), [asig(MIE, 'pq', 'q2', P(1))], con('M'));
    expect(r).toHaveLength(1);
    expect(r[0]!.mensaje).toContain('EMP-01');
    expect(r[0]!.mensaje).toMatch(/miércoles/);
    expect(ver(regla(0, []), [asig(MIE, 'pq', 'q1', P(1))], con('T'))).toHaveLength(1);
  });

  it('el equipo A nunca incumple', () => {
    expect(ver(regla(0, []), [asig(LUN, 'pq', 'q1', P(1)), asig(LUN, 'pq', 'q2', P(1)), asig(MAR, 'pq', 'q2', P(1))], con('A'))).toHaveLength(0);
  });

  it('un día al contrario permitido solo en los días permitidos (domingo sí, lunes no)', () => {
    const r = regla(1, [DOM]);
    expect(ver(r, [asig(DOM, 'pq', 'q2', P(1))], con('M'))).toHaveLength(0);
    expect(ver(r, [asig(LUN, 'pq', 'q2', P(1))], con('M'))).toHaveLength(1);
  });

  it('con diasPermitidos vacío, vale cualquier día hasta el máximo; el exceso incumple en orden de fecha', () => {
    const r = regla(1, []);
    expect(ver(r, [asig(LUN, 'pq', 'q2', P(1))], con('M'))).toHaveLength(0);
    const dos = ver(r, [asig(LUN, 'pq', 'q2', P(1)), asig(MAR, 'pq', 'q2', P(1))], con('M'));
    expect(dos).toHaveLength(1);
    expect(dos[0]!.fecha).toBe(fecha(MAR));
    expect(ver(r, [asig(LUN, 'pq', 'q2', P(1)), asig(MAR, 'pq', 'q2', P(1)), asig(MIE, 'pq', 'q2', P(1))], con('M'))).toHaveLength(2);
  });

  it('un día mixto (mañana y tarde) cuenta como un solo día al contrario', () => {
    expect(ver(regla(1, []), [asig(LUN, 'pq', 'q1', P(1)), asig(LUN, 'pq', 'q2', P(1))], con('M'))).toHaveLength(0);
  });

  it('usa el equipo efectivo del patrón rotatorio (semana A: M en el patrón del ciclo)', () => {
    const personas = [personaMini(1, { equipo: 'M', patron: [{ indiceCiclo: 0, equipo: 'T', diasLibres: [] }] })];
    // En la semana del lunes de referencia (índice 0) la persona es del equipo T: la tarde está bien y la mañana no.
    expect(ver(regla(0, []), [asig(LUN, 'pq', 'q2', P(1))], { puestos, personas })).toHaveLength(0);
    expect(ver(regla(0, []), [asig(LUN, 'pq', 'q1', P(1))], { puestos, personas })).toHaveLength(1);
  });
});

// ───────────────────────── maxDiasSemana ─────────────────────────
describe('maxDiasSemana (general)', () => {
  const regla = reglaDe('maxDiasSemana', { max: 2 });

  it('cumple: hasta el máximo de días', () => {
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1)), asig(MAR, 'p1', 'f1', P(1))])).toHaveLength(0);
  });

  it('varias franjas el mismo día cuentan como un día', () => {
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f2', P(1)), asig(MAR, 'p1', 'f1', P(1))])).toHaveLength(0);
  });

  it('incumple: un incumplimiento por persona que supera el máximo', () => {
    const r = ver(regla, [asig(LUN, 'p1', 'f1', P(1)), asig(MAR, 'p1', 'f1', P(1)), asig(MIE, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f2', P(2))]);
    expect(r).toHaveLength(1);
    expect(r[0]!.personaId).toBe(P(1));
    expect(r[0]!.mensaje).toContain('EMP-01');
  });

  it('una pausa no cuenta como día trabajado', () => {
    expect(ver(regla, [asig(LUN, 'p1', 'f1', P(1)), asig(MAR, 'p1', 'f1', P(1)), pausa(DOM, P(1), '14:00', '15:00')])).toHaveLength(0);
  });
});

// ───────────────────────── maxFranjasSiSoloArea ─────────────────────────
describe('maxFranjasSiSoloArea', () => {
  const puestos = [puestoP1(), puestoMini('pl', 'a2', franjasSeguidas('l', ['10:00', '11:00', '12:00', '13:00']))];
  const regla = reglaDe('maxFranjasSiSoloArea', { areaId: 'a2', maxFranjas: 1 }, { dura: false, peso: 10 });

  it('cumple: una sola franja en el área', () => {
    expect(ver(regla, [asig(LUN, 'pl', 'l1', P(1))], { puestos })).toHaveLength(0);
  });

  it('incumple: dos franjas y solo en esa área (blanda, peso 10 por ocurrencia)', () => {
    const r = ver(regla, [asig(VIE, 'pl', 'l1', P(1)), asig(VIE, 'pl', 'l3', P(1))], { puestos });
    expect(r).toHaveLength(1);
    expect(r[0]!.dura).toBe(false);
    expect(r[0]!.penalizacion).toBe(10);
    expect(r[0]!.mensaje).toContain('EMP-01');
    expect(r[0]!.mensaje).toMatch(/viernes/);
  });

  it('cumple: si ese día también trabaja en otra área, la regla no aplica', () => {
    expect(ver(regla, [asig(LUN, 'pl', 'l1', P(1)), asig(LUN, 'pl', 'l3', P(1)), asig(LUN, 'p1', 'f5', P(1))], { puestos })).toHaveLength(0);
  });

  it('cumple: dos franjas en días distintos', () => {
    expect(ver(regla, [asig(LUN, 'pl', 'l1', P(1)), asig(MAR, 'pl', 'l1', P(1))], { puestos })).toHaveLength(0);
  });
});

// ───────────────────────── comidasEscalonadas ─────────────────────────
describe('comidasEscalonadas', () => {
  const puestos = [
    puestoMini('pc', 'a1', [franja('c1', '10:00', '13:30'), franja('c2', '17:30', '22:00')], { plazas: 3 }),
    puestoMini('pj', 'a2', [franja('j1', '10:00', '18:00'), franja('j2', '10:00', '18:15')]),
  ];
  const params = {
    dias: [DOM] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[],
    umbralJornadaMin: 480,
    duracionMin: 60,
    franjas: [
      { inicio: aMinutos('14:00'), fin: aMinutos('15:00'), maxPersonas: 2 },
      { inicio: aMinutos('15:00'), fin: aMinutos('16:00'), maxPersonas: 2 },
    ],
  };
  const regla = reglaDe('comidasEscalonadas', params);
  /** Jornada larga del domingo (10:00–22:00) para la persona n en la plaza n-1. */
  const trabaja = (n: number, dia: 0 | 6 = DOM): Asignacion[] => [asig(dia, 'pc', 'c1', P(n), n - 1), asig(dia, 'pc', 'c2', P(n), n - 1)];

  it('cumple: jornada larga con comida dentro de una franja y respetando el máximo', () => {
    const asigs = [...trabaja(1), ...trabaja(2), ...trabaja(3), pausa(DOM, P(1), '14:00', '15:00'), pausa(DOM, P(2), '14:00', '15:00'), pausa(DOM, P(3), '15:00', '16:00')];
    expect(ver(regla, asigs, { puestos })).toHaveLength(0);
  });

  it('incumple (a): jornada de más de 8 h sin comida (uno por persona y día)', () => {
    const r = ver(regla, [...trabaja(1)], { puestos });
    expect(r).toHaveLength(1);
    expect(r[0]!.mensaje).toContain('EMP-01');
    expect(r[0]!.mensaje).toMatch(/domingo/);
    expect(r[0]!.personaId).toBe(P(1));
  });

  it('frontera del umbral: jornada de exactamente 8 h no necesita comida; 8h15 sí', () => {
    expect(ver(regla, [asig(DOM, 'pj', 'j1', P(1))], { puestos })).toHaveLength(0);
    expect(ver(regla, [asig(DOM, 'pj', 'j2', P(1))], { puestos })).toHaveLength(1);
  });

  it('solo se aplica en los días indicados: el lunes no se exige comida', () => {
    expect(ver(regla, [...trabaja(1, LUN)], { puestos })).toHaveLength(0);
  });

  it('incumple (b): comida de alguien que no trabaja ese día (marca comidaSinTurno)', () => {
    const r = ver(regla, [pausa(DOM, P(4), '14:00', '15:00')], { puestos });
    expect(r).toHaveLength(1);
    expect(r[0]!.marca).toBe('comidaSinTurno');
    expect(r[0]!.mensaje).toContain('EMP-04');
  });

  it('incumple (c): comida fuera de toda franja de comida', () => {
    const asigs = [...trabaja(1), pausa(DOM, P(1), '13:30', '14:30')];
    expect(ver(regla, asigs, { puestos }).length).toBeGreaterThanOrEqual(1);
  });

  it('incumple (c): comida más corta que la duración mínima', () => {
    const asigs = [...trabaja(1), pausa(DOM, P(1), '14:00', '14:30')];
    expect(ver(regla, asigs, { puestos }).length).toBeGreaterThanOrEqual(1);
  });

  it('incumple (d): más comidas simultáneas que el máximo de la franja', () => {
    const asigs = [
      ...trabaja(1), ...trabaja(2), ...trabaja(3),
      pausa(DOM, P(1), '14:00', '15:00'), pausa(DOM, P(2), '14:00', '15:00'), pausa(DOM, P(3), '14:00', '15:00'),
    ];
    const r = ver(regla, asigs, { puestos });
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r.every((i) => i.marca !== 'comidaSinTurno')).toBe(true);
  });
});

// ───────────────────────── repartoEquitativo ─────────────────────────
describe('repartoEquitativo', () => {
  const regla = (peso: number) => reglaDe('repartoEquitativo', {}, { dura: false, peso });
  const conObjetivo = (min: number | null) => ({ personas: [personaMini(1, { objetivoCoberturaMinSemana: min }), personaMini(2)] });

  it('cumple: la persona está justo en su objetivo', () => {
    const asigs = ['f1', 'f2', 'f3', 'f4', 'f5'].map((f) => asig(LUN, 'p1', f, P(1)));
    expect(ver(regla(1), asigs, conObjetivo(300))).toHaveLength(0);
  });

  it('incumple: defecto de 60 min con peso 2 → 4 unidades × 2 = 8', () => {
    const asigs = ['f1', 'f2', 'f3', 'f4'].map((f) => asig(LUN, 'p1', f, P(1)));
    const r = ver(regla(2), asigs, conObjetivo(300));
    expect(r).toHaveLength(1);
    expect(r[0]!.dura).toBe(false);
    expect(r[0]!.penalizacion).toBe(8);
    expect(r[0]!.mensaje).toContain('EMP-01');
  });

  it('incumple también por exceso (360 trabajados frente a 300)', () => {
    const asigs = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].map((f) => asig(LUN, 'p1', f, P(1)));
    expect(ver(regla(1), asigs, conObjetivo(300))[0]!.penalizacion).toBe(4);
  });

  it('quien no tiene objetivo no cuenta', () => {
    expect(ver(regla(1), [asig(LUN, 'p1', 'f1', P(2))], conObjetivo(null))).toHaveLength(0);
  });

  it('persona con objetivo y sin asignaciones: desviación completa (300 min → 20 unidades)', () => {
    const r = ver(regla(1), [], conObjetivo(300));
    expect(r).toHaveLength(1);
    expect(r[0]!.penalizacion).toBe(20);
  });
});
