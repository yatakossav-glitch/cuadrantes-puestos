/**
 * Caja negra: los 10 tipos de restricción personal (ARQUITECTURA.md §10.2).
 * La restricción se pone solo a EMP-01; no hay reglas generales activas.
 */
import { describe, expect, it } from 'vitest';
import type { Asignacion, RestriccionPersona } from '../../src/modelo/tipos';
import type { Incumplimiento } from '../../src/reglas/contrato';
import {
  DOM, JUE, LUN, MAR, MIE, P, SAB, VIE, asig, conRestriccion, datosMini, fecha, franja, pausa, puestoMini, puestoP1,
  restriccionDe, aMinutos,
} from './ayudas';
import type { OpcionesDatosMini } from './ayudas';
import { deTipo, validar } from './ayudas-validar';

function ver(r: RestriccionPersona, asigs: Asignacion[], op: OpcionesDatosMini = {}): Incumplimiento[] {
  return deTipo(validar(conRestriccion(datosMini(op), 1, r), asigs), r.tipo);
}

describe('comunes a todas las restricciones', () => {
  const r = restriccionDe('diasNoDisponibles', { dias: [VIE] }, { id: 'restr-xyz' });

  it('el incumplimiento viene de la restricción, de la persona y con marca noDisponible', () => {
    const [i] = ver(r, [asig(VIE, 'p1', 'f1', P(1))]);
    expect(i).toBeDefined();
    expect(i!.origen).toBe('persona');
    expect(i!.reglaId).toBe('restr-xyz');
    expect(i!.personaId).toBe(P(1));
    expect(i!.fecha).toBe(fecha(VIE));
    expect(i!.marca).toBe('noDisponible');
    expect(i!.dura).toBe(true);
    expect(i!.penalizacion).toBe(0);
    expect(i!.mensaje).toContain('EMP-01');
    expect(i!.mensaje).toMatch(/viernes/);
    expect(i!.mensaje).toContain('27/11');
  });

  it('solo afecta a la persona que la tiene', () => {
    expect(ver(r, [asig(VIE, 'p1', 'f1', P(2))])).toHaveLength(0);
  });

  it('una restricción inactiva no se evalúa', () => {
    expect(ver(restriccionDe('diasNoDisponibles', { dias: [VIE] }, { activa: false }), [asig(VIE, 'p1', 'f1', P(1))])).toHaveLength(0);
  });
});

describe('diasDisponibles', () => {
  const r = restriccionDe('diasDisponibles', { dias: [LUN, MAR] });

  it('cumple: trabaja solo en días disponibles', () => {
    expect(ver(r, [asig(LUN, 'p1', 'f1', P(1)), asig(MAR, 'p1', 'f1', P(1))])).toHaveLength(0);
  });

  it('incumple: trabaja un día no disponible (uno por día, aunque tenga varias franjas)', () => {
    const v = ver(r, [asig(MIE, 'p1', 'f1', P(1)), asig(MIE, 'p1', 'f2', P(1)), asig(JUE, 'p1', 'f1', P(1))]);
    expect(v).toHaveLength(2);
    expect(v.every((i) => i.marca === 'noDisponible')).toBe(true);
  });
});

describe('diasNoDisponibles', () => {
  it('cumple y incumple', () => {
    const r = restriccionDe('diasNoDisponibles', { dias: [VIE, SAB] });
    expect(ver(r, [asig(JUE, 'p1', 'f1', P(1)), asig(DOM, 'p1', 'f1', P(1))])).toHaveLength(0);
    expect(ver(r, [asig(VIE, 'p1', 'f1', P(1)), asig(SAB, 'p1', 'f1', P(1))])).toHaveLength(2);
  });

  it('blanda: penaliza por ocurrencia (peso 5)', () => {
    const r = restriccionDe('diasNoDisponibles', { dias: [VIE] }, { dura: false, peso: 5 });
    const [i] = ver(r, [asig(VIE, 'p1', 'f1', P(1))]);
    expect(i!.dura).toBe(false);
    expect(i!.penalizacion).toBe(5);
  });
});

describe('soloFinesDeSemana', () => {
  const r = restriccionDe('soloFinesDeSemana', {});

  it('cumple: sábado y domingo', () => {
    expect(ver(r, [asig(SAB, 'p1', 'f1', P(1)), asig(DOM, 'p1', 'f1', P(1))])).toHaveLength(0);
  });

  it('incumple: viernes y lunes (uno por día)', () => {
    expect(ver(r, [asig(VIE, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f1', P(1)), asig(SAB, 'p1', 'f1', P(1))])).toHaveLength(2);
  });
});

describe('noAntesDe', () => {
  const r = restriccionDe('noAntesDe', { hora: aMinutos('11:00'), dias: [] });

  it('cumple: empieza justo a la hora límite', () => {
    expect(ver(r, [asig(LUN, 'p1', 'f2', P(1))])).toHaveLength(0);
  });

  it('incumple: empieza antes (una por día aunque haya varias franjas)', () => {
    const v = ver(r, [asig(MAR, 'p1', 'f1', P(1)), asig(MAR, 'p1', 'f2', P(1))]);
    expect(v).toHaveLength(1);
    expect(v[0]!.mensaje).toMatch(/martes/);
    expect(v[0]!.marca).toBe('noDisponible');
  });

  it('con días concretos solo se aplica en ellos', () => {
    const soloLunes = restriccionDe('noAntesDe', { hora: aMinutos('11:00'), dias: [LUN] });
    expect(ver(soloLunes, [asig(MAR, 'p1', 'f1', P(1))])).toHaveLength(0);
    expect(ver(soloLunes, [asig(LUN, 'p1', 'f1', P(1))])).toHaveLength(1);
  });

  it('no mira las pausas', () => {
    expect(ver(r, [pausa(LUN, P(1), '09:00', '09:30')])).toHaveLength(0);
  });
});

describe('noDespuesDe', () => {
  const r = restriccionDe('noDespuesDe', { hora: aMinutos('12:00'), dias: [] });

  it('cumple: termina justo a la hora límite', () => {
    expect(ver(r, [asig(LUN, 'p1', 'f2', P(1))])).toHaveLength(0);
  });

  it('incumple: termina después (una por día)', () => {
    const v = ver(r, [asig(JUE, 'p1', 'f3', P(1)), asig(JUE, 'p1', 'f4', P(1))]);
    expect(v).toHaveLength(1);
    expect(v[0]!.mensaje).toContain('EMP-01');
    expect(v[0]!.mensaje).toMatch(/jueves/);
  });

  it('con días concretos solo se aplica en ellos', () => {
    const soloMartes = restriccionDe('noDespuesDe', { hora: aMinutos('12:00'), dias: [MAR] });
    expect(ver(soloMartes, [asig(LUN, 'p1', 'f3', P(1))])).toHaveLength(0);
    expect(ver(soloMartes, [asig(MAR, 'p1', 'f3', P(1))])).toHaveLength(1);
  });
});

describe('maxMinutosDia (persona)', () => {
  it('cumple: justo en el máximo y por debajo', () => {
    const r = restriccionDe('maxMinutosDia', { maxMin: 120 });
    expect(ver(r, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f2', P(1))])).toHaveLength(0);
  });

  it('incumple: supera el máximo (un incumplimiento por día)', () => {
    const r = restriccionDe('maxMinutosDia', { maxMin: 120 });
    const v = ver(r, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f2', P(1)), asig(LUN, 'p1', 'f3', P(1)), asig(MAR, 'p1', 'f1', P(1))]);
    expect(v).toHaveLength(1);
    expect(v[0]!.mensaje).toContain('EMP-01');
    expect(v[0]!.mensaje).toMatch(/lunes/);
  });

  it('blanda: exceso de 20 min con peso 5 → penalización 10', () => {
    const r = restriccionDe('maxMinutosDia', { maxMin: 100 }, { dura: false, peso: 5 });
    const v = ver(r, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f2', P(1))]);
    expect(v).toHaveLength(1);
    expect(v[0]!.penalizacion).toBe(10);
  });
});

describe('minutosSemana', () => {
  const r = restriccionDe('minutosSemana', { minMin: 300, maxMin: 480 });
  const franjas = (n: number): Asignacion[] =>
    Array.from({ length: n }, (_, i) => asig(i < 6 ? LUN : MAR, 'p1', `f${(i % 6) + 1}`, P(1)));

  it('cumple: dentro de la horquilla (300 min y 480 min incluidos)', () => {
    expect(ver(r, franjas(5))).toHaveLength(0);
    expect(ver(r, franjas(8))).toHaveLength(0);
  });

  it('incumple por defecto: 240 min frente a un mínimo de 300', () => {
    const v = ver(r, franjas(4));
    expect(v).toHaveLength(1);
    expect(v[0]!.mensaje).toContain('EMP-01');
  });

  it('incumple por exceso: 540 min frente a un máximo de 480', () => {
    expect(ver(r, franjas(9))).toHaveLength(1);
  });

  it('blanda: 60 min de diferencia con peso 2 → 8', () => {
    const blanda = restriccionDe('minutosSemana', { minMin: 300, maxMin: 480 }, { dura: false, peso: 2 });
    expect(ver(blanda, franjas(4))[0]!.penalizacion).toBe(8);
    expect(ver(blanda, franjas(9))[0]!.penalizacion).toBe(8);
  });

  it('un límite null no limita ese lado', () => {
    expect(ver(restriccionDe('minutosSemana', { minMin: null, maxMin: 480 }), franjas(2))).toHaveLength(0);
    expect(ver(restriccionDe('minutosSemana', { minMin: 300, maxMin: null }), franjas(9))).toHaveLength(0);
  });
});

describe('maxDiasSemana (persona)', () => {
  const r = restriccionDe('maxDiasSemana', { max: 2 });

  it('cumple: hasta el máximo (varias franjas en un día = un día)', () => {
    expect(ver(r, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f2', P(1)), asig(MAR, 'p1', 'f1', P(1))])).toHaveLength(0);
  });

  it('incumple: más días que el máximo (uno por persona)', () => {
    const v = ver(r, [asig(LUN, 'p1', 'f1', P(1)), asig(MAR, 'p1', 'f1', P(1)), asig(MIE, 'p1', 'f1', P(1)), asig(JUE, 'p1', 'f1', P(1))]);
    expect(v).toHaveLength(1);
    expect(v[0]!.mensaje).toContain('EMP-01');
  });
});

describe('noAsignarA', () => {
  const puestos = [puestoP1(), puestoMini('p2', 'a2', [franja('g1', '10:00', '11:00'), franja('g2', '11:00', '12:00')])];

  it('cumple: trabaja en puestos fuera del ámbito', () => {
    const r = restriccionDe('noAsignarA', { ambito: { areaIds: ['a2'], puestoIds: [] } });
    expect(ver(r, [asig(LUN, 'p1', 'f1', P(1))], { puestos })).toHaveLength(0);
  });

  it('incumple por área: un incumplimiento por asignación (marca noDisponible)', () => {
    const r = restriccionDe('noAsignarA', { ambito: { areaIds: ['a2'], puestoIds: [] } });
    const v = ver(r, [asig(LUN, 'p2', 'g1', P(1)), asig(LUN, 'p2', 'g2', P(1))], { puestos });
    expect(v).toHaveLength(2);
    expect(v.every((i) => i.marca === 'noDisponible')).toBe(true);
    expect(v[0]!.mensaje).toContain('EMP-01');
  });

  it('incumple por puesto concreto', () => {
    const r = restriccionDe('noAsignarA', { ambito: { areaIds: [], puestoIds: ['p1'] } });
    expect(ver(r, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p2', 'g1', P(1))], { puestos })).toHaveLength(1);
  });
});

describe('pausaMinima', () => {
  const puestos = [
    puestoP1(),
    puestoMini('pg', 'a1', [franja('z1', '10:00', '12:00'), franja('z2', '12:15', '14:30'), franja('z3', '12:30', '14:30')]),
  ];
  const r = restriccionDe('pausaMinima', { siJornadaSuperaMin: 240, pausaMin: 30 });

  it('cumple: jornada larga con un hueco sin puesto de 3 horas', () => {
    expect(ver(r, [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f5', P(1))], { puestos })).toHaveLength(0);
  });

  it('cumple: hueco de justo la pausa mínima (30 min)', () => {
    expect(ver(r, [asig(LUN, 'pg', 'z1', P(1)), asig(LUN, 'pg', 'z3', P(1))], { puestos })).toHaveLength(0);
  });

  it('incumple: jornada de 5 h seguida, sin hueco ni pausa', () => {
    const seguidas = ['f1', 'f2', 'f3', 'f4', 'f5'].map((f) => asig(MIE, 'p1', f, P(1)));
    const v = ver(r, seguidas, { puestos });
    expect(v).toHaveLength(1);
    expect(v[0]!.mensaje).toContain('EMP-01');
    expect(v[0]!.mensaje).toMatch(/miércoles/);
  });

  it('incumple: el hueco entre franjas (15 min) es menor que la pausa mínima', () => {
    expect(ver(r, [asig(LUN, 'pg', 'z1', P(1)), asig(LUN, 'pg', 'z2', P(1))], { puestos })).toHaveLength(1);
  });

  it('cumple: jornada de exactamente el umbral (4 h) no necesita pausa', () => {
    expect(ver(r, ['f1', 'f2', 'f3', 'f4'].map((f) => asig(LUN, 'p1', f, P(1))), { puestos })).toHaveLength(0);
  });

  it('no cuenta una pausa asignada que se solapa con un puesto de la persona', () => {
    const seguidas = ['f1', 'f2', 'f3', 'f4', 'f5'].map((f) => asig(LUN, 'p1', f, P(1)));
    expect(ver(r, [...seguidas, pausa(LUN, P(1), '12:00', '12:30')], { puestos })).toHaveLength(1);
  });

  it('un incumplimiento por día', () => {
    const dia = (d: 0 | 1) => ['f1', 'f2', 'f3', 'f4', 'f5'].map((f) => asig(d, 'p1', f, P(1)));
    expect(ver(r, [...dia(LUN), ...dia(MAR)], { puestos })).toHaveLength(2);
  });
});
