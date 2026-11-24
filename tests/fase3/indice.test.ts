/** Caja negra: IndiceSemana (ARQUITECTURA.md §10.1). */
import { describe, expect, it } from 'vitest';
import { conAsignacion, crearIndice } from '../../src/validacion/indice';
import {
  DOM, IDS_EJEMPLO, JUE, LUN, LUNES, MAR, MIE, P, VIE, aMinutos, asig, crearEstadoEjemplo, datosMini, fecha, franja,
  pausa, personaMini, puestoMini,
} from './ayudas';

const { pedidos, caja1, caja2, lego } = IDS_EJEMPLO.puestos;

describe('huecos de la semana (ejemplo)', () => {
  const datos = crearEstadoEjemplo();
  const indice = crearIndice(datos, LUNES, []);

  it('cuenta exacta: Pedidos 2 + Caja 1 8 + Caja 2 8 + LEGO 11 = 29 por día, 203 a la semana', () => {
    const huecos = indice.huecos();
    expect(huecos).toHaveLength(203);
    const de = (id: string) => huecos.filter((h) => h.puestoId === id).length;
    expect(de(pedidos)).toBe(2 * 7);
    expect(de(caja1)).toBe(8 * 7);
    expect(de(caja2)).toBe(8 * 7);
    expect(de(lego)).toBe(11 * 7);
    expect(huecos.every((h) => h.plaza === 0)).toBe(true);
  });

  it('las 7 fechas van de lunes a domingo', () => {
    expect(indice.lunes).toBe(LUNES);
    expect(indice.fechas).toHaveLength(7);
    expect(indice.fechas[0]).toBe('2026-11-23');
    expect(indice.fechas[6]).toBe('2026-11-29');
    expect(indice.diaDe('2026-11-23')).toBe(0);
    expect(indice.diaDe('2026-11-29')).toBe(6);
  });

  it('la clave de hueco es fecha|puesto|franja|plaza y hueco() la resuelve', () => {
    const h = indice.huecos().find((x) => x.puestoId === caja1 && x.franjaId === 'franja-caja-3' && x.fecha === fecha(JUE))!;
    const clave = `${fecha(JUE)}|${caja1}|franja-caja-3|0`;
    expect(indice.hueco(clave)).toEqual(h);
    expect(h.inicio).toBe(aMinutos('13:00'));
    expect(h.fin).toBe(aMinutos('14:30'));
    expect(h.dia).toBe(JUE);
    expect(h.areaId).toBe(IDS_EJEMPLO.areas.caja);
    expect(h.bloqueId).toBe('bloque-caja-m2');
    expect(indice.hueco('inexistente')).toBeUndefined();
  });

  it('Pedidos y LEGO no tienen bloque', () => {
    const hp = indice.huecos().filter((h) => h.puestoId === pedidos);
    const hl = indice.huecos().filter((h) => h.puestoId === lego);
    expect([...hp, ...hl].every((h) => h.bloqueId === null)).toBe(true);
  });

  it('el área inactiva (Librería) no aporta huecos y un puesto inactivo tampoco', () => {
    const d = crearEstadoEjemplo();
    d.puestos = d.puestos.map((p) => (p.id === lego ? { ...p, activo: false } : p));
    const ind = crearIndice(d, LUNES, []);
    expect(ind.huecos()).toHaveLength(203 - 77);
    expect(ind.horario(lego, fecha(LUN))).toBeNull();
  });

  it('un puesto de un área inactiva no tiene huecos', () => {
    const d = crearEstadoEjemplo();
    d.areas = d.areas.map((a) => (a.id === IDS_EJEMPLO.areas.caja ? { ...a, activa: false } : a));
    const ind = crearIndice(d, LUNES, []);
    expect(ind.huecos()).toHaveLength(203 - 112);
    expect(ind.horario(caja1, fecha(MAR))).toBeNull();
  });

  it('un puesto solo existe los días de `dias`', () => {
    const d = crearEstadoEjemplo();
    d.puestos = d.puestos.map((p) => (p.id === pedidos ? { ...p, dias: [0, 1, 2, 3, 4, 5] } : p));
    const ind = crearIndice(d, LUNES, []);
    expect(ind.horario(pedidos, fecha(DOM))).toBeNull();
    expect(ind.horario(pedidos, fecha(LUN))).not.toBeNull();
    expect(ind.huecos().filter((h) => h.puestoId === pedidos)).toHaveLength(2 * 6);
  });

  it('horario por día: el domingo puede tener otras franjas', () => {
    const d = crearEstadoEjemplo();
    d.puestos = d.puestos.map((p) =>
      p.id === pedidos
        ? { ...p, horario: { ...p.horario, porDia: { 6: { franjas: [franja('d1', '11:00', '14:00')], bloques: [] } } } }
        : p,
    );
    const ind = crearIndice(d, LUNES, []);
    expect(ind.huecos().filter((h) => h.puestoId === pedidos && h.fecha === fecha(DOM))).toHaveLength(1);
    expect(ind.franja(pedidos, fecha(DOM), 'd1')?.inicio).toBe(aMinutos('11:00'));
    expect(ind.franja(pedidos, fecha(LUN), 'd1')).toBeUndefined();
  });

  it('varias plazas multiplican los huecos', () => {
    const d = datosMini({ puestos: [puestoMini('p1', 'a1', [franja('f1', '10:00', '11:00')], { plazas: 3 })] });
    const ind = crearIndice(d, LUNES, []);
    expect(ind.huecos()).toHaveLength(7 * 3);
    expect(ind.hueco(`${fecha(LUN)}|p1|f1|2`)).toBeDefined();
    expect(ind.hueco(`${fecha(LUN)}|p1|f1|3`)).toBeUndefined();
  });
});

describe('puestoCerrado', () => {
  const cerrar = (desde: string, hasta: string) => {
    const d = crearEstadoEjemplo();
    d.incidencias = [{ id: 'inc-1', tipo: 'puestoCerrado', puestoId: caja1, desde, hasta, nota: '' }];
    return crearIndice(d, LUNES, []);
  };

  it('elimina los huecos de los días cubiertos (extremos incluidos)', () => {
    const ind = cerrar(fecha(MIE), fecha(JUE));
    expect(ind.huecos()).toHaveLength(203 - 16);
    expect(ind.horario(caja1, fecha(MIE))).toBeNull();
    expect(ind.horario(caja1, fecha(JUE))).toBeNull();
    expect(ind.horario(caja1, fecha(MAR))).not.toBeNull();
    expect(ind.horario(caja1, fecha(VIE))).not.toBeNull();
    expect(ind.horario(caja2, fecha(MIE))).not.toBeNull();
  });

  it('un cierre fuera de la semana no cambia nada', () => {
    expect(cerrar('2026-12-01', '2026-12-03').huecos()).toHaveLength(203);
    expect(cerrar('2026-11-01', '2026-11-22').huecos()).toHaveLength(203);
  });

  it('un cierre que empieza antes y acaba dentro de la semana cierra solo los días de la semana', () => {
    expect(cerrar('2026-11-10', fecha(LUN)).huecos()).toHaveLength(203 - 8);
  });
});

describe('plantilla (alta, baja, activa)', () => {
  const con = (cambios: Parameters<typeof personaMini>[1]) => {
    const d = datosMini({ personas: [personaMini(1, cambios)] });
    return crearIndice(d, LUNES, []);
  };

  it('persona activa sin alta ni baja está siempre en plantilla', () => {
    const ind = con({});
    for (const f of ind.fechas) expect(ind.enPlantilla(P(1), f)).toBe(true);
  });

  it('persona inactiva nunca está en plantilla', () => {
    const ind = con({ activa: false });
    for (const f of ind.fechas) expect(ind.enPlantilla(P(1), f)).toBe(false);
  });

  it('el alta cuenta desde ese día (inclusive)', () => {
    const ind = con({ alta: fecha(MIE) });
    expect(ind.enPlantilla(P(1), fecha(MAR))).toBe(false);
    expect(ind.enPlantilla(P(1), fecha(MIE))).toBe(true);
  });

  it('la baja deja de contar desde ese día (el propio día de baja ya no está)', () => {
    const ind = con({ baja: fecha(VIE) });
    expect(ind.enPlantilla(P(1), fecha(JUE))).toBe(true);
    expect(ind.enPlantilla(P(1), fecha(VIE))).toBe(false);
    expect(ind.enPlantilla(P(1), fecha(DOM))).toBe(false);
  });

  it('una persona inexistente no está en plantilla y persona() devuelve undefined', () => {
    const ind = con({});
    expect(ind.enPlantilla('per-99', fecha(LUN))).toBe(false);
    expect(ind.persona('per-99')).toBeUndefined();
    expect(ind.persona(P(1))?.codigo).toBe('EMP-01');
  });
});

describe('ausencias', () => {
  const ind = (tramo: { inicio: number; fin: number } | null) => {
    const d = datosMini({
      incidencias: [{ id: 'aus-1', tipo: 'ausencia', personaId: P(1), desde: fecha(MAR), hasta: fecha(MIE), tramo, nota: '' }],
    });
    return crearIndice(d, LUNES, []);
  };
  const todo = { inicio: aMinutos('10:00'), fin: aMinutos('22:00') };

  it('ausencia de día entero: cubre todo el intervalo en las fechas del rango (inclusive)', () => {
    const i = ind(null);
    expect(i.ausente(P(1), fecha(LUN), todo)).toBe(false);
    expect(i.ausente(P(1), fecha(MAR), todo)).toBe(true);
    expect(i.ausente(P(1), fecha(MIE), todo)).toBe(true);
    expect(i.ausente(P(1), fecha(JUE), todo)).toBe(false);
    expect(i.ausente(P(2), fecha(MAR), todo)).toBe(false);
  });

  it('ausencia con tramo: solo si el intervalo se solapa con el tramo', () => {
    const i = ind({ inicio: aMinutos('10:00'), fin: aMinutos('12:00') });
    expect(i.ausente(P(1), fecha(MAR), { inicio: aMinutos('11:00'), fin: aMinutos('13:00') })).toBe(true);
    expect(i.ausente(P(1), fecha(MAR), { inicio: aMinutos('09:00'), fin: aMinutos('10:30') })).toBe(true);
    // se tocan sin solaparse
    expect(i.ausente(P(1), fecha(MAR), { inicio: aMinutos('12:00'), fin: aMinutos('13:00') })).toBe(false);
    expect(i.ausente(P(1), fecha(MAR), { inicio: aMinutos('08:00'), fin: aMinutos('10:00') })).toBe(false);
    expect(i.ausente(P(1), fecha(MAR), { inicio: aMinutos('14:00'), fin: aMinutos('16:00') })).toBe(false);
    // fuera de las fechas
    expect(i.ausente(P(1), fecha(JUE), { inicio: aMinutos('10:00'), fin: aMinutos('12:00') })).toBe(false);
  });
});

describe('minutosDia, minutosSemana, jornada, diasTrabajados', () => {
  const datos = crearEstadoEjemplo();
  // EMP-20 (per-20): LEGO 10:00–10:58 (58) y 12:53–13:50 (57) el lunes; Caja 1 10:00–11:30 (90) el miércoles.
  const asigs = [
    asig(LUN, lego, 'franja-lego-1', 'per-20'),
    asig(LUN, lego, 'franja-lego-4', 'per-20'),
    asig(MIE, caja1, 'franja-caja-1', 'per-20'),
    pausa(DOM, 'per-20', '14:00', '15:00'),
  ];
  const ind = crearIndice(datos, LUNES, asigs);

  it('minutosDia suma solo franjas de puesto', () => {
    expect(ind.minutosDia('per-20', fecha(LUN))).toBe(58 + 57);
    expect(ind.minutosDia('per-20', fecha(MIE))).toBe(90);
    expect(ind.minutosDia('per-20', fecha(MAR))).toBe(0);
  });

  it('las pausas no cuentan como cobertura ni como jornada', () => {
    expect(ind.minutosDia('per-20', fecha(DOM))).toBe(0);
    expect(ind.jornada('per-20', fecha(DOM))).toBeNull();
    expect(ind.diasTrabajados('per-20')).not.toContain(fecha(DOM));
  });

  it('minutosSemana suma toda la semana', () => {
    expect(ind.minutosSemana('per-20')).toBe(58 + 57 + 90);
    expect(ind.minutosSemana('per-21')).toBe(0);
  });

  it('jornada = inicio del primer puesto → fin del último; null si no trabaja', () => {
    expect(ind.jornada('per-20', fecha(LUN))).toEqual({ inicio: aMinutos('10:00'), fin: aMinutos('13:50') });
    expect(ind.jornada('per-20', fecha(MAR))).toBeNull();
  });

  it('diasTrabajados lista las fechas con algún puesto', () => {
    expect([...ind.diasTrabajados('per-20')].sort()).toEqual([fecha(LUN), fecha(MIE)]);
    expect(ind.diasTrabajados('per-21')).toHaveLength(0);
  });

  it('ignora las asignaciones de fuera de la semana', () => {
    const fuera = [
      { ...asig(LUN, lego, 'franja-lego-1', 'per-21'), fecha: '2026-11-22' },
      { ...asig(LUN, lego, 'franja-lego-1', 'per-21'), fecha: '2026-11-30' },
    ];
    const i = crearIndice(datos, LUNES, fuera);
    expect(i.minutosSemana('per-21')).toBe(0);
    expect(i.asignaciones()).toHaveLength(0);
  });

  it('una asignación a una franja que ya no existe no cuenta minutos y su intervalo es undefined', () => {
    const rara = asig(LUN, lego, 'franja-inexistente', 'per-21');
    const i = crearIndice(datos, LUNES, [rara]);
    expect(i.minutosDia('per-21', fecha(LUN))).toBe(0);
    expect(i.jornada('per-21', fecha(LUN))).toBeNull();
    expect(i.intervalo(rara)).toBeUndefined();
  });

  it('una asignación en un puesto cerrado ese día no cuenta minutos', () => {
    const d = crearEstadoEjemplo();
    d.incidencias = [{ id: 'c1', tipo: 'puestoCerrado', puestoId: lego, desde: fecha(LUN), hasta: fecha(LUN), nota: '' }];
    const i = crearIndice(d, LUNES, [asig(LUN, lego, 'franja-lego-1', 'per-21')]);
    expect(i.minutosDia('per-21', fecha(LUN))).toBe(0);
  });
});

describe('consultas de asignaciones', () => {
  const datos = crearEstadoEjemplo();
  const a1 = asig(JUE, caja1, 'franja-caja-1', 'per-07');
  const a2 = asig(JUE, lego, 'franja-lego-3', 'per-07');
  const a3 = asig(VIE, lego, 'franja-lego-3', 'per-07');
  const p1 = pausa(DOM, 'per-07', '14:00', '15:00');
  const ind = crearIndice(datos, LUNES, [a1, a2, a3, p1]);

  it('enHueco, claveDe, dePersona, dePersonaDia y pausasDe', () => {
    expect(ind.claveDe(a1)).toBe(`${fecha(JUE)}|${caja1}|franja-caja-1|0`);
    expect(ind.enHueco(ind.claveDe(a1))?.id).toBe(a1.id);
    expect(ind.enHueco(`${fecha(JUE)}|${caja1}|franja-caja-2|0`)).toBeUndefined();
    expect(ind.dePersona('per-07')).toHaveLength(4);
    expect(ind.dePersonaDia('per-07', fecha(JUE)).map((a) => a.id).sort()).toEqual([a1.id, a2.id].sort());
    expect(ind.pausasDe('per-07', fecha(DOM)).map((a) => a.id)).toEqual([p1.id]);
    expect(ind.pausasDe('per-07', fecha(JUE))).toHaveLength(0);
  });

  it('intervalo() devuelve la franja del puesto o el tramo de la pausa', () => {
    expect(ind.intervalo(a1)).toEqual({ inicio: aMinutos('10:00'), fin: aMinutos('11:30') });
    expect(ind.intervalo(p1)).toEqual({ inicio: aMinutos('14:00'), fin: aMinutos('15:00') });
  });

  it('puesto() y area() resuelven por id', () => {
    expect(ind.puesto(caja1)?.nombre).toBe('Caja 1');
    expect(ind.area(IDS_EJEMPLO.areas.caja)?.nombre).toBe('Caja');
    expect(ind.puesto('x')).toBeUndefined();
    expect(ind.area('x')).toBeUndefined();
  });

  it('conAsignacion devuelve un índice nuevo sin modificar el original', () => {
    const nueva = asig(MAR, lego, 'franja-lego-2', 'per-08');
    const i2 = conAsignacion(ind, datos, nueva);
    expect(i2.asignaciones()).toHaveLength(5);
    expect(i2.minutosDia('per-08', fecha(MAR))).toBe(57);
    expect(i2.enHueco(i2.claveDe(nueva))?.personaId).toBe('per-08');
    expect(ind.asignaciones()).toHaveLength(4);
    expect(ind.minutosDia('per-08', fecha(MAR))).toBe(0);
  });
});

describe('equipoEfectivo con patrón rotatorio', () => {
  // Ciclo de 2 semanas, lunes de referencia 2026-11-23 = semana A (índice 0); 2026-11-30 = semana B (índice 1).
  const datos = datosMini({
    personas: [
      personaMini(1, { equipo: 'M', patron: [{ indiceCiclo: 1, equipo: 'T', diasLibres: [] }] }),
      personaMini(2, { equipo: 'M', patron: [{ indiceCiclo: 1, equipo: null, diasLibres: [5] }] }),
      personaMini(3, { equipo: 'T' }),
    ],
  });
  datos.rotacion = { longitudCiclo: 2, lunesReferencia: '2026-11-23', etiquetas: ['A', 'B'] };

  it('semana A: sin paso para el índice 0 se usa el equipo de la persona', () => {
    const ind = crearIndice(datos, '2026-11-23', []);
    expect(ind.equipoEfectivo(P(1), '2026-11-25')).toBe('M');
  });

  it('semana B: el paso del patrón cambia el equipo', () => {
    const ind = crearIndice(datos, '2026-11-30', []);
    for (const f of ind.fechas) expect(ind.equipoEfectivo(P(1), f)).toBe('T');
  });

  it('semana B con equipo null en el paso: se usa el de la persona', () => {
    const ind = crearIndice(datos, '2026-11-30', []);
    expect(ind.equipoEfectivo(P(2), '2026-12-01')).toBe('M');
  });

  it('el ciclo se repite: semana A otra vez en 2026-12-07 y semana B hacia atrás en 2026-11-16', () => {
    expect(crearIndice(datos, '2026-12-07', []).equipoEfectivo(P(1), '2026-12-08')).toBe('M');
    expect(crearIndice(datos, '2026-11-16', []).equipoEfectivo(P(1), '2026-11-17')).toBe('T');
    expect(crearIndice(datos, '2026-12-14', []).equipoEfectivo(P(1), '2026-12-15')).toBe('T');
  });

  it('una persona sin patrón conserva su equipo en todas las semanas', () => {
    expect(crearIndice(datos, '2026-11-30', []).equipoEfectivo(P(3), '2026-11-30')).toBe('T');
  });
});
