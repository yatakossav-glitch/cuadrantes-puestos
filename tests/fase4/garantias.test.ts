/** Garantías del motor (ARQUITECTURA §5.6, spec §4 y §8). Caja negra: solo la API pública. */
import { describe, expect, it } from 'vitest';
import { motor } from '../../src/motor/motor';
import type { ResultadoMotor } from '../../src/motor/contrato';
import type { Asignacion, AsignacionTipo, EstadoApp, Id } from '../../src/modelo/tipos';
import {
  CATALOGO,
  DOM,
  IDS_EJEMPLO,
  LUNES,
  MIE,
  NOMBRES_DIA,
  P,
  SAB,
  bloqueada,
  claveAsig,
  crearEstadoEjemplo,
  datosEjemplo,
  duras,
  fecha,
  peticion,
  personasPorHueco,
  resumir,
  validarTodo,
} from './ayudas';

const { pedidos, caja1, caja2, lego } = IDS_EJEMPLO.puestos;

function generar(datos: EstadoApp, extra: Parameters<typeof peticion>[2] = {}, modo: Parameters<typeof peticion>[1] = 'desdeCero'): ResultadoMotor {
  return motor.generar(peticion(datos, modo, extra));
}

/** Verifica la garantía principal: nada duro incumplido y 0 huecos. */
function esperarSemanaValida(datos: EstadoApp, r: ResultadoMotor): void {
  expect(r.sinCubrir, resumen(r)).toHaveLength(0);
  expect(r.comidasPendientes).toHaveLength(0);
  const d = duras(datos, r.asignaciones);
  expect(d, resumir(d)).toHaveLength(0);
}
function resumen(r: ResultadoMotor): string {
  return r.sinCubrir.map((s) => s.resumen).slice(0, 4).join(' | ');
}

describe('garantías del motor sobre el ejemplo', () => {
  const datos = crearEstadoEjemplo();

  it('desdeCero: cobertura 100 % y ninguna regla dura incumplida', () => {
    const r = generar(datos);
    esperarSemanaValida(datos, r);
    const v = validarTodo(datos, r.asignaciones);
    expect(v.incumplimientos.filter((i) => i.tipo === 'coberturaCompleta')).toHaveLength(0);
    expect(v.semaforo).not.toBe('rojo');
    expect(r.cortadoPorTiempo).toBe(false);
    expect(r.iteraciones).toBeLessThanOrEqual(800);
  });

  it('todas las asignaciones devueltas están en la semana y no hay dos en el mismo hueco', () => {
    const r = generar(datos);
    const claves = r.asignaciones.filter((a) => a.tipo === 'puesto').map((a) => claveAsig(a as never));
    expect(new Set(claves).size).toBe(claves.length);
    const fechas = new Set([0, 1, 2, 3, 4, 5, 6].map((d) => fecha(d as never)));
    for (const a of r.asignaciones) expect(fechas.has(a.fecha)).toBe(true);
    const ids = r.asignaciones.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('candados', () => {
    // Cinco asignaciones bloqueadas, algunas «raras» pero válidas:
    //  - EMP-01 (equipo M) en Pedidos de tarde el domingo (día al contrario permitido).
    //  - EMP-02 (equipo T) en el bloque de Caja 1 de mañana del domingo (2 franjas).
    //  - EMP-25 (solo LEGO) en la segunda franja de LEGO del sábado (mañana, su equipo).
    //  - EMP-29 (equipo A) en la primera franja de LEGO del lunes.
    const candados = [
      bloqueada(DOM, pedidos, 'franja-pedidos-t', 1),
      bloqueada(DOM, caja1, 'franja-caja-1', 2),
      bloqueada(DOM, caja1, 'franja-caja-2', 2),
      bloqueada(SAB, lego, 'franja-lego-2', 25),
      bloqueada(0, lego, 'franja-lego-1', 29),
    ];

    it('el montaje de candados es de 5 asignaciones y válido en sí mismo', () => {
      expect(candados).toHaveLength(5);
      expect(candados.every((c) => c.bloqueada)).toBe(true);
    });

    it('desdeCero con candados: salen idénticos y la semana sigue siendo válida', () => {
      const r = generar(datos, { actuales: candados });
      for (const c of candados) {
        const salida = r.asignaciones.find((a) => a.id === c.id);
        expect(salida, `falta el candado ${c.id}`).toEqual(c);
      }
      esperarSemanaValida(datos, r);
    });

    it('completarHuecos con candados: salen idénticos', () => {
      const r = generar(datos, { actuales: candados }, 'completarHuecos');
      for (const c of candados) expect(r.asignaciones.find((a) => a.id === c.id)).toEqual(c);
      esperarSemanaValida(datos, r);
    });

    it('el motor no usa a una persona con candado en otro puesto a la misma hora (sin solapes)', () => {
      const r = generar(datos, { actuales: candados });
      const solapes = validarTodo(datos, r.asignaciones).incumplimientos.filter((i) => i.tipo === 'sinSolapes');
      expect(solapes).toHaveLength(0);
    });
  });

  describe('determinismo y semilla', () => {
    it('misma petición, mismo resultado', () => {
      const a = generar(datos, { semilla: 7 });
      const b = generar(datos, { semilla: 7 });
      expect(a.cortadoPorTiempo).toBe(false);
      expect(b.asignaciones).toEqual(a.asignaciones);
      expect(b.penalizacionBlanda).toBe(a.penalizacionBlanda);
    });

    it('no modifica los datos de entrada', () => {
      const copia = JSON.parse(JSON.stringify(datos));
      generar(datos, { semilla: 3 });
      expect(JSON.parse(JSON.stringify(datos))).toEqual(copia);
    });

    it('otra semilla puede dar otro resultado, pero igual de válido', () => {
      const a = generar(datos, { semilla: 1 });
      const b = generar(datos, { semilla: 99 });
      esperarSemanaValida(datos, a);
      esperarSemanaValida(datos, b);
      // No se exige que difieran; si coinciden es solo por casualidad.
      expect(typeof b.penalizacionBlanda).toBe('number');
    });
  });

  describe('completarHuecos', () => {
    it('con media semana hecha no cambia lo existente y completa el resto', () => {
      const completa = generar(datos);
      esperarSemanaValida(datos, completa);
      // Lunes a jueves ya hechos (sin candado).
      const dias = new Set([0, 1, 2, 3].map((d) => fecha(d as never)));
      const existentes = completa.asignaciones.filter((a) => dias.has(a.fecha));
      expect(existentes.length).toBeGreaterThan(20);
      const r = generar(datos, { actuales: existentes }, 'completarHuecos');
      for (const e of existentes) {
        expect(r.asignaciones, `cambió ${e.id}`).toContainEqual(e);
      }
      esperarSemanaValida(datos, r);
    });

    it('con la semana ya completa no cambia nada', () => {
      const completa = generar(datos);
      const r = generar(datos, { actuales: completa.asignaciones }, 'completarHuecos');
      expect(r.sinCubrir).toHaveLength(0);
      const ordenar = (as: Asignacion[]) => [...as].sort((x, y) => x.id.localeCompare(y.id));
      expect(ordenar(r.asignaciones)).toEqual(ordenar(completa.asignaciones));
    });

    it('con la semana vacía equivale a generar y es válida', () => {
      const r = generar(datos, { actuales: [] }, 'completarHuecos');
      esperarSemanaValida(datos, r);
    });
  });

  describe('semanaTipo', () => {
    // Semana tipo A con EMP-05 (M, todo) en Caja 1 de mañana del miércoles, fijada con candado
    // al generarla para garantizar que ese día trabaja.
    const base = generar(datos, { actuales: [bloqueada(MIE, caja1, 'franja-caja-1', 5), bloqueada(MIE, caja1, 'franja-caja-2', 5)] });
    const tipoAsigs: AsignacionTipo[] = base.asignaciones.map((a) => {
      const { fecha: f, origen: _o, ...resto } = a;
      const dia = Math.round((Date.parse(f) - Date.parse(LUNES)) / 86400000) as AsignacionTipo['dia'];
      return { ...resto, bloqueada: false, dia } as AsignacionTipo;
    });
    const datosTipo = datosEjemplo((d) => {
      d.semanasTipo = [{ id: 'tipo-a', indiceCiclo: 0, nombre: 'Semana A', asignaciones: tipoAsigs }];
      d.incidencias = [
        { id: 'inc-ausencia-05', tipo: 'ausencia', personaId: P(5), desde: fecha(MIE), hasta: fecha(MIE), tramo: null, nota: '' },
      ];
    });

    it('el montaje es válido: EMP-05 trabaja el miércoles en la semana tipo', () => {
      expect(esperarSemanaValida(datos, base)).toBeUndefined();
      const trabaja = tipoAsigs.some((a) => a.tipo === 'puesto' && a.dia === MIE && a.personaId === P(5));
      expect(trabaja).toBe(true);
    });

    it('solo cambian las asignaciones de EMP-05 ese día, y se recubren', () => {
      const r = generar(datosTipo, {}, 'semanaTipo');
      esperarSemanaValida(datosTipo, r);

      const antes = personasPorHueco(base.asignaciones);
      const despues = personasPorHueco(r.asignaciones);
      const fechaMie = fecha(MIE);
      const afectados: string[] = [];
      for (const [k, persona] of antes) {
        if (persona === P(5) && k.startsWith(fechaMie)) afectados.push(k);
      }
      expect(afectados.length).toBeGreaterThan(0);

      for (const [k, persona] of antes) {
        if (afectados.includes(k)) {
          expect(despues.get(k), `hueco afectado ${k} sin recubrir`).toBeDefined();
          expect(despues.get(k)).not.toBe(P(5));
        } else {
          expect(despues.get(k), `cambió un hueco no afectado ${k}`).toBe(persona);
        }
      }
      expect(despues.size).toBe(antes.size);
    });

    it('EMP-05 no aparece ese día en ninguna asignación (ni pausa)', () => {
      const r = generar(datosTipo, {}, 'semanaTipo');
      const fechaMie = fecha(MIE);
      expect(r.asignaciones.filter((a) => a.fecha === fechaMie && a.personaId === P(5))).toHaveLength(0);
    });

    it('sin incidencias la semana tipo se reproduce tal cual', () => {
      const sinInc = datosEjemplo((d) => {
        d.semanasTipo = datosTipo.semanasTipo;
      });
      const r = generar(sinInc, {}, 'semanaTipo');
      esperarSemanaValida(sinInc, r);
      expect(personasPorHueco(r.asignaciones)).toEqual(personasPorHueco(base.asignaciones));
    });
  });

  describe('inviabilidad explicada', () => {
    // Solo EMP-01 queda habilitada para Pedidos.
    const datosInv = datosEjemplo((d) => {
      for (const p of d.personas) {
        if (p.id !== P(1)) p.habilitaciones = p.habilitaciones.filter((h) => h !== IDS_EJEMPLO.areas.pedidos);
      }
    });

    it('deja huecos de Pedidos vacíos con explicación legible', () => {
      const r = generar(datosInv);
      expect(r.sinCubrir.length).toBeGreaterThanOrEqual(5);
      for (const s of r.sinCubrir) {
        expect(s.hueco.puestoId).toBe(pedidos);
        expect(s.resumen.length).toBeGreaterThan(10);
        const nombreDia = NOMBRES_DIA.some((n) => s.resumen.toLowerCase().includes(n));
        expect(nombreDia, `sin día en: ${s.resumen}`).toBe(true);
        const nombraPuestoOPersona = /EMP-\d\d/.test(s.resumen) || /pedidos/i.test(s.resumen) || /habilitad/i.test(s.resumen);
        expect(nombraPuestoOPersona, `resumen poco claro: ${s.resumen}`).toBe(true);
        expect(s.descartes.length).toBeGreaterThan(0);
        for (const d of s.descartes) {
          expect(d.personaId).toBeTruthy();
          expect(d.motivo.length).toBeGreaterThan(3);
        }
      }
    });

    it('sin ninguna dura incumplida fuera de esos huecos', () => {
      const r = generar(datosInv);
      const duros = duras(datosInv, r.asignaciones);
      const otras = duros.filter((i) => i.tipo !== 'coberturaCompleta');
      expect(otras, resumir(otras)).toHaveLength(0);
      // Los huecos vacíos señalados por la validación son exactamente los explicados.
      const vacios = new Set(duros.filter((i) => i.tipo === 'coberturaCompleta').flatMap((i) => i.huecos));
      const explicados = new Set(r.sinCubrir.map((s) => `${s.hueco.fecha}|${s.hueco.puestoId}|${s.hueco.franjaId}|${s.hueco.plaza}`));
      for (const v of vacios) expect(explicados.has(v), `hueco vacío sin explicar: ${v}`).toBe(true);
    });

    it('EMP-01 sigue siendo la única persona de Pedidos', () => {
      const r = generar(datosInv);
      const enPedidos = r.asignaciones.filter((a) => a.tipo === 'puesto' && a.puestoId === pedidos);
      expect(enPedidos.every((a) => a.personaId === P(1))).toBe(true);
    });

    it('con nadie habilitado para Pedidos: los 14 huecos quedan vacíos y el resto se cubre', () => {
      const nadie = datosEjemplo((d) => {
        for (const p of d.personas) p.habilitaciones = p.habilitaciones.filter((h) => h !== IDS_EJEMPLO.areas.pedidos);
      });
      const r = generar(nadie);
      expect(r.sinCubrir).toHaveLength(14);
      const resto = duras(nadie, r.asignaciones).filter((i) => i.tipo !== 'coberturaCompleta');
      expect(resto, resumir(resto)).toHaveLength(0);
      const cajasYLego = r.asignaciones.filter((a) => a.tipo === 'puesto' && a.puestoId !== pedidos);
      expect(cajasYLego).toHaveLength(7 * (8 + 8 + 11));
    });
  });

  describe('comidas del domingo', () => {
    // Jornadas de más de 8 h ese domingo, forzadas con candados:
    //  EMP-20 LEGO 10:00 y 19:30; EMP-07 bloque de Caja 1 de mañana y LEGO 18:15; EMP-21 Pedidos de mañana y LEGO 20:45.
    const candados = [
      bloqueada(DOM, lego, 'franja-lego-1', 20),
      bloqueada(DOM, lego, 'franja-lego-10', 20),
      bloqueada(DOM, caja1, 'franja-caja-1', 7),
      bloqueada(DOM, caja1, 'franja-caja-2', 7),
      bloqueada(DOM, lego, 'franja-lego-9', 7),
      bloqueada(DOM, pedidos, 'franja-pedidos-m', 21),
      bloqueada(DOM, lego, 'franja-lego-11', 21),
    ];
    const r = generar(datos, { actuales: candados });
    const franjas = datos.reglas.find((x) => x.tipo === 'comidasEscalonadas')!.params as { franjas: { inicio: number; fin: number; maxPersonas: number }[] };
    const fDom = fecha(DOM);

    function jornada(personaId: Id): { inicio: number; fin: number } | null {
      let ini = Infinity, fin = -Infinity;
      for (const a of r.asignaciones) {
        if (a.tipo !== 'puesto' || a.fecha !== fDom || a.personaId !== personaId) continue;
        const f = datos.puestos.find((p) => p.id === a.puestoId)!.horario.general.franjas.find((x) => x.id === a.franjaId)!;
        ini = Math.min(ini, f.inicio);
        fin = Math.max(fin, f.fin);
      }
      return ini === Infinity ? null : { inicio: ini, fin };
    }

    it('la semana sale válida con los candados y sin comidas pendientes', () => {
      esperarSemanaValida(datos, r);
    });

    it('quien supera 8 h de jornada tiene su pausa de 60 min en una franja permitida y sin solapar puestos', () => {
      const quienes = datos.personas.filter((p) => {
        const j = jornada(p.id);
        return j !== null && j.fin - j.inicio > 480;
      });
      // Al menos los tres forzados.
      for (const n of [20, 7, 21]) expect(quienes.map((p) => p.id)).toContain(P(n));
      for (const p of quienes) {
        const pausas = r.asignaciones.filter((a) => a.tipo === 'pausa' && a.fecha === fDom && a.personaId === p.id);
        expect(pausas.length, `${p.codigo} sin pausa`).toBeGreaterThanOrEqual(1);
        const buena = pausas.some(
          (a) =>
            a.tipo === 'pausa' &&
            a.fin - a.inicio >= 60 &&
            franjas.franjas.some((f) => a.inicio >= f.inicio && a.fin <= f.fin),
        );
        expect(buena, `${p.codigo}: pausa fuera de las franjas permitidas`).toBe(true);
      }
    });

    it('ninguna pausa solapa un puesto de la misma persona', () => {
      const solapes = validarTodo(datos, r.asignaciones).incumplimientos.filter((i) => i.tipo === 'sinSolapes');
      expect(solapes).toHaveLength(0);
    });

    it('no se superan los máximos por franja de comida (4, 4, 3)', () => {
      const pausas = r.asignaciones.filter((a) => a.tipo === 'pausa' && a.fecha === fDom);
      for (const f of franjas.franjas) {
        const n = pausas.filter((a) => a.tipo === 'pausa' && a.inicio < f.fin && f.inicio < a.fin).length;
        expect(n, `franja ${f.inicio}-${f.fin}`).toBeLessThanOrEqual(f.maxPersonas);
      }
    });

    it('no hay pausas de personas que no trabajan ese día ni pausas otros días', () => {
      for (const a of r.asignaciones) {
        if (a.tipo !== 'pausa') continue;
        expect(a.fecha).toBe(fDom);
        expect(jornada(a.personaId), `${a.personaId} con pausa sin trabajar`).not.toBeNull();
      }
    });

    it('sin comidas escalonadas incumplidas según el validador', () => {
      const inc = validarTodo(datos, r.asignaciones).incumplimientos.filter((i) => i.tipo === 'comidasEscalonadas');
      expect(inc, resumir(inc)).toHaveLength(0);
    });
  });

  it('el catálogo usado es el real (sanidad)', () => {
    expect(Object.keys(CATALOGO.general)).toHaveLength(15);
    expect(Object.keys(CATALOGO.restricciones)).toHaveLength(10);
  });
  it('caja2 existe en el ejemplo (sanidad)', () => {
    expect(datos.puestos.some((p) => p.id === caja2)).toBe(true);
  });
});
