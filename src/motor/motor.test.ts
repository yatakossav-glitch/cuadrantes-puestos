import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../datos-ejemplo/ejemplo';
import { CATALOGO } from '../reglas/catalogo';
import { crearIndice } from '../validacion/indice';
import { validarSemana } from '../validacion/validador';
import { diaSemana } from '../modelo/fechas';
import type { Asignacion, AsignacionPuesto, AsignacionTipo, EstadoApp } from '../modelo/tipos';
import type { PeticionMotor, ProgresoMotor } from './contrato';
import { crearMotor, MAX_ITERACIONES_POR_DEFECTO, motor } from './motor';

const LUNES = '2026-11-23';
const JUEVES = '2026-11-26';
const DOMINGO = '2026-11-29';
const P = IDS_EJEMPLO.puestos;

function peticion(datos: EstadoApp, extra: Partial<PeticionMotor> = {}): PeticionMotor {
  return {
    datos,
    lunes: LUNES,
    actuales: [],
    modo: 'desdeCero',
    semilla: 1,
    maxIteraciones: MAX_ITERACIONES_POR_DEFECTO,
    limiteMs: 60_000,
    ...extra,
  };
}

function asignacion(id: string, fecha: string, puestoId: string, franjaId: string, personaId: string, bloqueada = true): AsignacionPuesto {
  return { id, tipo: 'puesto', fecha, puestoId, franjaId, plaza: 0, personaId, bloqueada, origen: 'manual' };
}

/** Incumplimientos duros que no son huecos vacíos. */
function duras(datos: EstadoApp, asignaciones: Asignacion[], lunes = LUNES) {
  return validarSemana(datos, lunes, asignaciones, CATALOGO).incumplimientos.filter((i) => i.dura && i.marca !== 'hueco');
}

function huecosVacios(datos: EstadoApp, asignaciones: Asignacion[], lunes = LUNES): number {
  const indice = crearIndice(datos, lunes, asignaciones);
  return indice.huecos().filter((h) => !indice.enHueco(`${h.fecha}|${h.puestoId}|${h.franjaId}|${h.plaza}`)).length;
}

describe('MAX_ITERACIONES_POR_DEFECTO', () => {
  it('vale 800', () => expect(MAX_ITERACIONES_POR_DEFECTO).toBe(800));
});

describe('generar · desdeCero con los datos de ejemplo', () => {
  const datos = crearEstadoEjemplo();
  const inicio = performance.now();
  const r = motor.generar(peticion(datos));
  const ms = performance.now() - inicio;

  it('cubre el 100 % y no incumple ninguna regla dura', () => {
    expect(huecosVacios(datos, r.asignaciones)).toBe(0);
    expect(r.sinCubrir).toEqual([]);
    expect(r.comidasPendientes).toEqual([]);
    expect(duras(datos, r.asignaciones)).toEqual([]);
    expect(validarSemana(datos, LUNES, r.asignaciones, CATALOGO).incumplimientos.filter((i) => i.dura)).toEqual([]);
    expect(r.cortadoPorTiempo).toBe(false);
  });

  it('genera la semana en menos de 3 s con 800 iteraciones de presupuesto', () => {
    expect(ms).toBeLessThan(3000);
    expect(r.iteraciones).toBeLessThanOrEqual(800);
  });

  it('usa ids únicos y solo asignaciones de la semana', () => {
    const ids = r.asignaciones.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.asignaciones.every((a) => a.fecha >= LUNES && a.fecha <= DOMINGO)).toBe(true);
    expect(r.asignaciones.every((a) => a.origen === 'motor')).toBe(true);
  });

  it('es determinista (mismas asignaciones para la misma petición)', () => {
    const otra = motor.generar(peticion(crearEstadoEjemplo()));
    expect(otra.asignaciones).toEqual(r.asignaciones);
  });

  it('con otra semilla sigue siendo válido', () => {
    const o = motor.generar(peticion(datos, { semilla: 42 }));
    expect(huecosVacios(datos, o.asignaciones)).toBe(0);
    expect(duras(datos, o.asignaciones)).toEqual([]);
  });

  it('en la semana B del ciclo también', () => {
    const o = motor.generar(peticion(datos, { lunes: '2026-11-30', semilla: 3 }));
    expect(huecosVacios(datos, o.asignaciones, '2026-11-30')).toBe(0);
    expect(duras(datos, o.asignaciones, '2026-11-30')).toEqual([]);
  });
});

describe('generar · mejora con objetivos de horas', () => {
  function conObjetivos(): EstadoApp {
    const datos = crearEstadoEjemplo();
    datos.personas.forEach((p, i) => {
      p.objetivoCoberturaMinSemana = 500 + (i % 5) * 100;
    });
    return datos;
  }

  it('la búsqueda local baja la penalización blanda sin romper nada duro y es determinista', () => {
    const datos = conObjetivos();
    const sin = motor.generar(peticion(datos, { maxIteraciones: 0 }));
    const con = motor.generar(peticion(datos, { maxIteraciones: 300 }));
    expect(con.penalizacionBlanda).toBeLessThan(sin.penalizacionBlanda);
    expect(duras(datos, con.asignaciones)).toEqual([]);
    expect(huecosVacios(datos, con.asignaciones)).toBe(0);
    expect(motor.generar(peticion(datos, { maxIteraciones: 300 })).asignaciones).toEqual(con.asignaciones);
  }, 30_000);

  it('si salta la salvaguarda de tiempo lo avisa', () => {
    let t = 0;
    const lento = crearMotor(CATALOGO, { reloj: () => (t += 10) });
    const r = lento.generar(peticion(conObjetivos(), { maxIteraciones: 500, limiteMs: 100 }));
    expect(r.cortadoPorTiempo).toBe(true);
    expect(r.iteraciones).toBeLessThan(500);
    // Aunque se corte, la solución respeta las reglas duras (las comidas que falten se avisan aparte).
    expect(duras(conObjetivos(), r.asignaciones).filter((i) => i.tipo !== 'comidasEscalonadas')).toEqual([]);
    expect(huecosVacios(conObjetivos(), r.asignaciones)).toBe(0);
  });
});

describe('generar · candados', () => {
  it('deja idénticas las asignaciones bloqueadas y construye alrededor', () => {
    const datos = crearEstadoEjemplo();
    const candados: Asignacion[] = [
      asignacion('c1', JUEVES, P.pedidos, 'franja-pedidos-t', 'per-04'),
      asignacion('c2', LUNES, P.caja1, 'franja-caja-1', 'per-07'),
      asignacion('c3', LUNES, P.caja1, 'franja-caja-2', 'per-07'),
      asignacion('c4', DOMINGO, P.lego, 'franja-lego-3', 'per-10'),
    ];
    const sueltas: Asignacion[] = [{ ...asignacion('s1', JUEVES, P.pedidos, 'franja-pedidos-m', 'per-01', false) }];
    const r = motor.generar(peticion(datos, { actuales: [...candados, ...sueltas] }));
    for (const c of candados) expect(r.asignaciones).toContainEqual(c);
    expect(r.asignaciones.filter((a) => a.bloqueada)).toHaveLength(4);
    expect(huecosVacios(datos, r.asignaciones)).toBe(0);
    expect(duras(datos, r.asignaciones)).toEqual([]);
    // La suelta no se conserva tal cual en desdeCero: se regenera con id del motor.
    expect(r.asignaciones.find((a) => a.id === 's1')).toBeUndefined();
  });
});

describe('generar · completarHuecos', () => {
  it('no toca lo existente y rellena solo lo vacío', () => {
    const datos = crearEstadoEjemplo();
    const completa = motor.generar(peticion(datos, { maxIteraciones: 100 })).asignaciones;
    // Se conservan las asignaciones de lunes a miércoles (algunas con candado) y se vacía el resto.
    const existentes = completa
      .filter((a) => a.fecha <= '2026-11-25')
      .map((a, i): Asignacion => ({ ...a, id: `e${i}`, bloqueada: i % 7 === 0, origen: 'manual' }));
    const r = motor.generar(peticion(datos, { modo: 'completarHuecos', actuales: existentes }));
    for (const e of existentes) expect(r.asignaciones).toContainEqual(e);
    expect(r.asignaciones.filter((a) => a.fecha <= '2026-11-25')).toHaveLength(existentes.length);
    expect(huecosVacios(datos, r.asignaciones)).toBe(0);
    expect(duras(datos, r.asignaciones)).toEqual([]);
  });
});

describe('generar · semanaTipo', () => {
  function aTipo(a: Asignacion): AsignacionTipo | null {
    if (a.tipo !== 'puesto') return null;
    return { id: a.id, tipo: 'puesto', dia: diaSemana(a.fecha), puestoId: a.puestoId, franjaId: a.franjaId, plaza: a.plaza, personaId: a.personaId, bloqueada: false };
  }

  it('parte de la semana tipo del ciclo y vuelve a cubrir solo lo afectado por una ausencia', () => {
    const datos = crearEstadoEjemplo();
    const base = motor.generar(peticion(datos, { maxIteraciones: 100 })).asignaciones;
    datos.semanasTipo = [
      { id: 'st-a', indiceCiclo: 0, nombre: 'Semana A', asignaciones: base.map(aTipo).filter((x): x is AsignacionTipo => x !== null) },
    ];
    // Se ausenta quien hace Pedidos por la mañana el jueves.
    const ausente = base.find((a) => a.tipo === 'puesto' && a.fecha === JUEVES && a.puestoId === P.pedidos && a.franjaId === 'franja-pedidos-m')!.personaId;
    datos.incidencias.push({ id: 'i1', tipo: 'ausencia', personaId: ausente, desde: JUEVES, hasta: JUEVES, tramo: null, nota: '' });

    const r = motor.generar(peticion(datos, { modo: 'semanaTipo', maxIteraciones: 100 }));
    expect(huecosVacios(datos, r.asignaciones)).toBe(0);
    expect(duras(datos, r.asignaciones)).toEqual([]);
    expect(r.asignaciones.some((a) => a.personaId === ausente && a.fecha === JUEVES)).toBe(false);

    const heredadas = r.asignaciones.filter((a) => a.origen === 'semanaTipo');
    expect(heredadas.length).toBeGreaterThan(base.length * 0.8);
    // Lo heredado coincide con la semana tipo (misma persona en el mismo hueco).
    for (const h of heredadas) {
      if (h.tipo !== 'puesto') continue;
      const original = base.find((b) => b.tipo === 'puesto' && b.fecha === h.fecha && b.puestoId === h.puestoId && b.franjaId === h.franjaId && b.plaza === h.plaza);
      expect(original?.personaId).toBe(h.personaId);
    }
    // El resto lo ha cubierto el motor.
    expect(r.asignaciones.some((a) => a.origen === 'motor')).toBe(true);
  }, 30_000);

  it('descarta lo que incumple duras: puesto cerrado ese día', () => {
    const datos = crearEstadoEjemplo();
    datos.semanasTipo = [
      {
        id: 'st-a',
        indiceCiclo: 0,
        nombre: 'A',
        asignaciones: [
          { id: 't1', tipo: 'puesto', dia: 3, puestoId: P.pedidos, franjaId: 'franja-pedidos-m', plaza: 0, personaId: 'per-01', bloqueada: false },
          { id: 't2', tipo: 'puesto', dia: 4, puestoId: P.pedidos, franjaId: 'franja-pedidos-m', plaza: 0, personaId: 'per-01', bloqueada: false },
        ],
      },
    ];
    datos.incidencias.push({ id: 'i2', tipo: 'puestoCerrado', puestoId: P.pedidos, desde: JUEVES, hasta: JUEVES, nota: '' });
    const r = motor.generar(peticion(datos, { modo: 'semanaTipo', maxIteraciones: 0 }));
    expect(r.asignaciones.filter((a) => a.tipo === 'puesto' && a.fecha === JUEVES && a.puestoId === P.pedidos)).toEqual([]);
    expect(r.asignaciones.find((a) => a.id === 't2@2026-11-27')?.origen).toBe('semanaTipo');
    expect(duras(datos, r.asignaciones)).toEqual([]);
  });
});

describe('generar · inviabilidad explicada', () => {
  it('con una sola persona habilitada para Pedidos deja huecos vacíos y los explica', () => {
    const datos = crearEstadoEjemplo();
    for (const p of datos.personas) {
      if (p.codigo !== 'EMP-01') p.habilitaciones = p.habilitaciones.filter((h) => h !== IDS_EJEMPLO.areas.pedidos);
    }
    const r = motor.generar(peticion(datos, { maxIteraciones: 50 }));
    // Nada duro incumplido: solo huecos.
    expect(duras(datos, r.asignaciones)).toEqual([]);
    expect(r.sinCubrir.length).toBeGreaterThan(0);
    // EMP-01 es de mañana: las tardes de Pedidos no se pueden cubrir.
    const jueves = r.sinCubrir.find((s) => s.hueco.fecha === JUEVES && s.hueco.puestoId === P.pedidos && s.hueco.inicio === 945);
    expect(jueves?.resumen).toBe('Nadie disponible para Pedidos Web el jueves 26/11 15:45–22:00');
    // Descartes: una entrada por persona activa, cada una con su código y un motivo legible.
    expect(jueves?.descartes).toHaveLength(29);
    for (const d of jueves?.descartes ?? []) {
      const codigo = datos.personas.find((p) => p.id === d.personaId)!.codigo;
      expect(d.motivo).toContain(codigo);
    }
    expect(jueves?.descartes.find((d) => d.personaId === 'per-02')?.motivo.toLowerCase()).toContain('habilita');
    // Coherencia con sugerir: lo que se explica como «nadie disponible» no tiene ninguna candidata permitida.
    const sugeridas = motor.sugerir(datos, LUNES, r.asignaciones, jueves!.hueco);
    expect(sugeridas.some((c) => c.permitido)).toBe(false);
    // Lo demás sí se cubre: Caja y LEGO al completo.
    const indice = crearIndice(datos, LUNES, r.asignaciones);
    const vacios = indice.huecos().filter((h) => !indice.enHueco(`${h.fecha}|${h.puestoId}|${h.franjaId}|${h.plaza}`));
    expect(vacios.every((h) => h.puestoId === P.pedidos)).toBe(true);
    expect(vacios.length).toBe(r.sinCubrir.length);
  });
});

describe('generar · ids únicos', () => {
  it('si el id determinista ya existe en el estado, añade un sufijo', () => {
    const datos = crearEstadoEjemplo();
    const intruso: AsignacionPuesto = {
      ...asignacion('m|2026-11-26|puesto-pedidos|franja-pedidos-t|0', JUEVES, P.pedidos, 'franja-pedidos-m', 'per-01', false),
    };
    const r = motor.generar(peticion(datos, { modo: 'completarHuecos', actuales: [intruso], maxIteraciones: 0 }));
    const ids = r.asignaciones.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('m|2026-11-26|puesto-pedidos|franja-pedidos-t|0-2');
    expect(r.asignaciones).toContainEqual(intruso);
  });
});

describe('generar · pausa mínima dura', () => {
  it('avisa en comidasPendientes de quien no puede tener la pausa', () => {
    const datos = crearEstadoEjemplo();
    datos.personas.find((p) => p.codigo === 'EMP-25')!.restricciones.push({
      id: 'r-pausa', tipo: 'pausaMinima', params: { siJornadaSuperaMin: 300, pausaMin: 30 }, dura: true, peso: 0, activa: true, nota: '',
    });
    // EMP-25 con LEGO seguido de 10:00 a 15:45 (candados): no hay hueco para la pausa y no se puede mover.
    const candados = [1, 2, 3, 4, 5, 6].map((n) => asignacion(`k${n}`, JUEVES, P.lego, `franja-lego-${n}`, 'per-25'));
    const r = motor.generar(peticion(datos, { actuales: candados, maxIteraciones: 0 }));
    expect(r.comidasPendientes.map((c) => c.motivo)).toContain('EMP-25 trabaja de 10:00 a 15:45 sin una pausa de 30 min');
  });
});

describe('generar · comidas', () => {
  it('coloca la comida de quien tiene una jornada de más de 8 h el domingo', () => {
    const datos = crearEstadoEjemplo();
    const candados = [
      asignacion('d1', DOMINGO, P.lego, 'franja-lego-1', 'per-16'),
      asignacion('d2', DOMINGO, P.lego, 'franja-lego-11', 'per-16'),
    ];
    const r = motor.generar(peticion(datos, { actuales: candados, maxIteraciones: 50 }));
    const pausas = r.asignaciones.filter((a) => a.tipo === 'pausa');
    expect(pausas.some((p) => p.personaId === 'per-16' && p.fecha === DOMINGO)).toBe(true);
    expect(r.comidasPendientes).toEqual([]);
    expect(duras(datos, r.asignaciones)).toEqual([]);
  });
});

describe('generar · progreso', () => {
  it('avisa al cambiar de fase y cada 200 iteraciones', () => {
    const datos = crearEstadoEjemplo();
    datos.personas.forEach((p, i) => {
      p.objetivoCoberturaMinSemana = 500 + (i % 5) * 100;
    });
    const avisos: ProgresoMotor[] = [];
    motor.generar(peticion(datos, { maxIteraciones: 400 }), (p) => avisos.push(p));
    const fases = avisos.map((a) => a.fase).filter((f, i, l) => i === 0 || f !== l[i - 1]);
    expect(fases).toEqual(['preparacion', 'construccion', 'mejora', 'comidas']);
    expect(avisos.filter((a) => a.fase === 'mejora' && a.fraccion > 0)).toHaveLength(2);
    expect(avisos.every((a) => a.fraccion >= 0 && a.fraccion <= 1)).toBe(true);
  }, 30_000);
});

describe('sugerir', () => {
  const datos = crearEstadoEjemplo();
  const indice = crearIndice(datos, LUNES, []);
  const hueco = indice.hueco(`${JUEVES}|${P.caja1}|franja-caja-2|0`)!;

  it('devuelve todas las personas activas: permitidas por coste y código, luego las no permitidas con motivo', () => {
    const c = motor.sugerir(datos, LUNES, [], hueco);
    expect(c).toHaveLength(29);
    const primeraNoPermitida = c.findIndex((x) => !x.permitido);
    expect(primeraNoPermitida).toBeGreaterThan(0);
    expect(c.slice(primeraNoPermitida).every((x) => !x.permitido && x.motivos.length > 0)).toBe(true);
    const permitidas = c.slice(0, primeraNoPermitida);
    const codigo = (id: string) => datos.personas.find((p) => p.id === id)!.codigo;
    for (let i = 1; i < permitidas.length; i += 1) {
      const a = permitidas[i - 1]!;
      const b = permitidas[i]!;
      expect(a.coste <= b.coste).toBe(true);
      if (a.coste === b.coste) expect(codigo(a.personaId) < codigo(b.personaId)).toBe(true);
    }
    // EMP-08 solo trabaja fines de semana: no permitida un jueves. EMP-01 no tiene Caja bloqueada: sí.
    expect(c.find((x) => x.personaId === 'per-08')?.permitido).toBe(false);
    expect(c.find((x) => x.personaId === 'per-08')?.motivos[0]).toContain('EMP-08');
    expect(c.find((x) => x.personaId === 'per-01')?.permitido).toBe(true);
  });

  it('con persona ausente la marca como no permitida', () => {
    const d = crearEstadoEjemplo();
    d.incidencias.push({ id: 'i', tipo: 'ausencia', personaId: 'per-01', desde: JUEVES, hasta: JUEVES, tramo: null, nota: '' });
    const c = motor.sugerir(d, LUNES, [], hueco);
    expect(c.find((x) => x.personaId === 'per-01')?.permitido).toBe(false);
  });

  it('trabaja sobre el bloque entero si el puesto usa bloques', () => {
    const estricto = crearEstadoEjemplo();
    // Máximo 2h30 al día: una franja (1h30) cabe, el bloque entero (3h) no.
    estricto.reglas = estricto.reglas.map((r) => (r.tipo === 'maxMinutosDia' ? { ...r, params: { ...r.params, maxMin: 150 } } : r));
    const conBloque = motor.sugerir(estricto, LUNES, [], hueco);
    expect(conBloque.find((x) => x.personaId === 'per-01')?.permitido).toBe(false);
    estricto.reglas = estricto.reglas.map((r) => (r.tipo === 'mismaPersonaBloque' ? { ...r, activa: false } : r));
    const sinBloque = motor.sugerir(estricto, LUNES, [], hueco);
    expect(sinBloque.find((x) => x.personaId === 'per-01')?.permitido).toBe(true);
  });

  it('al cambiar a quien ya está en el hueco no cuenta su propia asignación', () => {
    const actual = asignacion('x', JUEVES, P.caja1, 'franja-caja-2', 'per-01', false);
    const x1 = asignacion('x0', JUEVES, P.caja1, 'franja-caja-1', 'per-01', false);
    const c = motor.sugerir(datos, LUNES, [x1, actual], hueco);
    expect(c.find((y) => y.personaId === 'per-01')?.permitido).toBe(true);
  });

  it('un hueco de otra semana no tiene sugerencias', () => {
    expect(motor.sugerir(datos, '2026-11-30', [], hueco)).toEqual([]);
  });
});
