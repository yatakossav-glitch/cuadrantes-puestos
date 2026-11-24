/** Caja negra: semáforo, reglas descartadas o inactivas, marcas y comprobar (ARQUITECTURA.md §10.1). */
import { describe, expect, it } from 'vitest';
import type { Asignacion, ReglaGeneral, RestriccionPersona } from '../../src/modelo/tipos';
import { crearIndice } from '../../src/validacion/indice';
import { marcasPorAsignacion, marcasPorHueco, validarSemana } from '../../src/validacion/validador';
import {
  JUE, LUN, LUNES, MAR, P, asig, buscar, conRestriccion, crearCuadranteBase, crearEstadoEjemplo, datosMini, fecha, franja,
  franjasSeguidas, introducirCuatroSolapes, pausa, puestoMini, puestoP1, reglaDe, restriccionDe,
} from './ayudas';
import { CATALOGO, deTipo, validar } from './ayudas-validar';

const solapeLunes = (): Asignacion[] => [asig(LUN, 'p1', 'f1', P(1)), pausa(LUN, P(1), '10:00', '10:30')];
const cuadranteLimpioLunes = (): Asignacion[] => [asig(LUN, 'p1', 'f1', P(1)), asig(LUN, 'p1', 'f2', P(2))];

describe('semáforo', () => {
  it('verde: el cuadrante base cubre todo el ejemplo y cumple todas sus reglas', () => {
    const datos = crearEstadoEjemplo();
    // El cuadrante base usa 7 días a quien sobra de pool en la tarde; se relaja el máximo de días para aislar el resto.
    datos.reglas = datos.reglas.map((r) => (r.tipo === 'maxDiasSemana' ? ({ ...r, params: { max: 7 } } as ReglaGeneral) : r));
    const r = validarSemana(datos, LUNES, crearCuadranteBase(datos), CATALOGO);
    expect(r.incumplimientos).toEqual([]);
    expect(r.semaforo).toBe('verde');
    expect(r.penalizacionBlanda).toBe(0);
  });

  it('verde: sin reglas no hay nada que incumplir', () => {
    expect(validar(datosMini(), solapeLunes()).semaforo).toBe('verde');
  });

  it('ámbar: solo incumplimientos blandos, con la penalización sumada', () => {
    const datos = datosMini({ reglas: [reglaDe('sinSolapes', {}, { dura: false, peso: 3 })] });
    const r = validar(datos, solapeLunes());
    expect(r.semaforo).toBe('ambar');
    expect(r.incumplimientos).toHaveLength(1);
    expect(r.incumplimientos.every((i) => !i.dura)).toBe(true);
    expect(r.penalizacionBlanda).toBe(3);
  });

  it('rojo: algún incumplimiento duro', () => {
    const datos = datosMini({ reglas: [reglaDe('sinSolapes', {})] });
    const r = validar(datos, solapeLunes());
    expect(r.semaforo).toBe('rojo');
    expect(r.incumplimientos[0]!.dura).toBe(true);
    expect(r.penalizacionBlanda).toBe(0);
  });

  it('rojo si hay duras y blandas a la vez; la penalización solo suma las blandas; las duras salen primero', () => {
    const datos = datosMini({
      puestos: [puestoP1({ dias: [LUN] })],
      reglas: [reglaDe('coberturaCompleta', {}, { dura: false, peso: 2 }), reglaDe('sinSolapes', {})],
    });
    const r = validar(datos, solapeLunes());
    expect(r.semaforo).toBe('rojo');
    expect(r.incumplimientos.some((i) => !i.dura)).toBe(true);
    expect(r.incumplimientos[0]!.dura).toBe(true);
    const primeraBlanda = r.incumplimientos.findIndex((i) => !i.dura);
    expect(r.incumplimientos.slice(primeraBlanda).every((i) => !i.dura)).toBe(true);
    expect(r.penalizacionBlanda).toBe(r.incumplimientos.reduce((s, i) => s + i.penalizacion, 0));
    expect(r.penalizacionBlanda).toBe(2 * 5); // f2…f6 sin cubrir
  });

  it('el ejemplo con 4 solapes introducidos está en rojo', () => {
    const datos = crearEstadoEjemplo();
    const { asignaciones } = introducirCuatroSolapes(crearCuadranteBase(datos));
    expect(validarSemana(datos, LUNES, asignaciones, CATALOGO).semaforo).toBe('rojo');
  });

  it('un hueco vacío con cobertura dura da rojo; con cobertura blanda da ámbar', () => {
    const puestos = [puestoP1({ dias: [LUN] })];
    const parcial = ['f1', 'f2', 'f3', 'f4', 'f5'].map((f) => asig(LUN, 'p1', f, P(1)));
    expect(validar(datosMini({ puestos, reglas: [reglaDe('coberturaCompleta', {})] }), parcial).semaforo).toBe('rojo');
    expect(validar(datosMini({ puestos, reglas: [reglaDe('coberturaCompleta', {}, { dura: false })] }), parcial).semaforo).toBe('ambar');
  });
});

describe('reglas descartadas, inactivas y pendientes', () => {
  const con = (regla: ReglaGeneral) => validar(datosMini({ reglas: [regla] }), solapeLunes());

  it('una regla descartada no cuenta', () => {
    const r = con(reglaDe('sinSolapes', {}, { estado: 'descartada' }));
    expect(r.incumplimientos).toHaveLength(0);
    expect(r.semaforo).toBe('verde');
  });

  it('una regla inactiva no cuenta', () => {
    const r = con(reglaDe('sinSolapes', {}, { activa: false }));
    expect(r.incumplimientos).toHaveLength(0);
    expect(r.semaforo).toBe('verde');
  });

  it('una regla pendiente de validar se evalúa igual', () => {
    expect(con(reglaDe('sinSolapes', {}, { estado: 'pendiente' })).semaforo).toBe('rojo');
  });

  it('una regla validada y activa cuenta', () => {
    expect(con(reglaDe('sinSolapes', {}, { estado: 'validada' })).semaforo).toBe('rojo');
  });

  it('una restricción personal inactiva no cuenta; activa sí', () => {
    const asigs = [asig(JUE, 'p1', 'f1', P(1))];
    const inactiva = restriccionDe('diasNoDisponibles', { dias: [JUE] }, { activa: false });
    expect(validar(conRestriccion(datosMini(), 1, inactiva), asigs).semaforo).toBe('verde');
    const activa = restriccionDe('diasNoDisponibles', { dias: [JUE] });
    expect(validar(conRestriccion(datosMini(), 1, activa), asigs).semaforo).toBe('rojo');
  });

  it('una restricción blanda da ámbar', () => {
    const blanda = restriccionDe('diasNoDisponibles', { dias: [JUE] }, { dura: false, peso: 4 });
    const r = validar(conRestriccion(datosMini(), 1, blanda), [asig(JUE, 'p1', 'f1', P(1))]);
    expect(r.semaforo).toBe('ambar');
    expect(r.penalizacionBlanda).toBe(4);
  });

  it('nunca lanza, aunque la regla sea de un tipo desconocido', () => {
    const rara = { ...reglaDe('sinSolapes', {}), tipo: 'tipoInventado' } as unknown as ReglaGeneral;
    expect(() => validar(datosMini({ reglas: [rara] }), solapeLunes())).not.toThrow();
  });
});

describe('marcas por asignación y por hueco', () => {
  it('marcasPorAsignacion: las asignaciones en solape llevan la marca solape', () => {
    const a = asig(LUN, 'p1', 'f1', P(1));
    const b = pausa(LUN, P(1), '10:00', '10:30');
    const r = validar(datosMini({ reglas: [reglaDe('sinSolapes', {})] }), [a, b, asig(LUN, 'p1', 'f2', P(2))]);
    const marcas = marcasPorAsignacion(r);
    expect(marcas.get(a.id)).toContain('solape');
    expect(marcas.get(b.id)).toContain('solape');
    expect(marcas.has(asig(LUN, 'p1', 'f2', P(2)).id)).toBe(false);
  });

  it('marcasPorAsignacion: persona no disponible', () => {
    const a = asig(LUN, 'p1', 'f1', P(1));
    const datos = datosMini({ reglas: [reglaDe('personaDisponible', {})] });
    datos.personas[0]!.activa = false;
    expect(marcasPorAsignacion(validar(datos, [a])).get(a.id)).toContain('noDisponible');
  });

  it('marcasPorHueco: los huecos vacíos llevan la marca hueco', () => {
    const datos = datosMini({ puestos: [puestoP1({ dias: [LUN] })], reglas: [reglaDe('coberturaCompleta', {})] });
    const r = validar(datos, [asig(LUN, 'p1', 'f1', P(1))]);
    const marcas = marcasPorHueco(r);
    expect(marcas.get(`${fecha(LUN)}|p1|f2|0`)).toContain('hueco');
    expect(marcas.has(`${fecha(LUN)}|p1|f1|0`)).toBe(false);
  });

  it('el ejemplo con solapes: las asignaciones señaladas están marcadas', () => {
    const datos = crearEstadoEjemplo();
    const base = crearCuadranteBase(datos);
    const { asignaciones, pares } = introducirCuatroSolapes(base);
    const marcas = marcasPorAsignacion(validarSemana(datos, LUNES, asignaciones, CATALOGO));
    for (const [a, b] of pares) {
      expect(marcas.get(a)).toContain('solape');
      expect(marcas.get(b)).toContain('solape');
    }
    expect(buscar(base, fecha(MAR), 'puesto-pedidos', 'franja-pedidos-m')).toBeDefined();
  });
});

describe('comprobar (comprobarPorDiferencia vía catálogo)', () => {
  const puestos = [puestoP1(), puestoMini('p2', 'a1', franjasSeguidas('g', ['10:00', '11:00', '12:00']))];
  const datos = (regla: ReglaGeneral) => datosMini({ puestos, reglas: [regla] });
  const ctx = (d: ReturnType<typeof datos>, asigs: Asignacion[]) => ({ datos: d, indice: crearIndice(d, LUNES, asigs) });
  const existente = asig(LUN, 'p1', 'f1', P(1)); // EMP-01 10:00–11:00

  it('sinSolapes dura: no permite una candidata que solapa', () => {
    const regla = reglaDe('sinSolapes', {});
    const c = CATALOGO.general.sinSolapes.comprobar(regla as ReglaGeneral<'sinSolapes'>, ctx(datos(regla), [existente]), asig(LUN, 'p2', 'g1', P(1)));
    expect(c.permitido).toBe(false);
    expect(c.motivos.length).toBeGreaterThanOrEqual(1);
    expect(c.motivos[0]).toContain('EMP-01');
  });

  it('sinSolapes dura: permite una que no solapa (otra persona, franja que solo toca, otro día)', () => {
    const regla = reglaDe('sinSolapes', {});
    const cx = ctx(datos(regla), [existente]);
    const comp = (a: Asignacion) => CATALOGO.general.sinSolapes.comprobar(regla as ReglaGeneral<'sinSolapes'>, cx, a);
    for (const cand of [asig(LUN, 'p2', 'g1', P(2)), asig(LUN, 'p2', 'g2', P(1)), asig(MAR, 'p2', 'g1', P(1))]) {
      const c = comp(cand);
      expect(c.permitido).toBe(true);
      expect(c.coste).toBe(0);
      expect(c.motivos).toEqual([]);
    }
  });

  it('sinSolapes blanda: permite la candidata que solapa pero con coste = peso', () => {
    const regla = reglaDe('sinSolapes', {}, { dura: false, peso: 3 });
    const c = CATALOGO.general.sinSolapes.comprobar(regla as ReglaGeneral<'sinSolapes'>, ctx(datos(regla), [existente]), asig(LUN, 'p2', 'g1', P(1)));
    expect(c.permitido).toBe(true);
    expect(c.coste).toBe(3);
  });

  it('maxMinutosDia: dura no permite superar; blanda cuesta por cada 15 min (20 min × peso 5 → 10)', () => {
    const pa = [puestoMini('pa', 'a1', [franja('g1', '10:00', '12:00'), franja('g2', '12:00', '14:30'), franja('g3', '14:30', '14:50')])];
    const base = [asig(LUN, 'pa', 'g1', P(1)), asig(LUN, 'pa', 'g2', P(1))];
    const cand = asig(LUN, 'pa', 'g3', P(1));
    const dura = reglaDe('maxMinutosDia', { maxMin: 270, excepciones: [] });
    const d1 = datosMini({ puestos: pa, reglas: [dura] });
    const c1 = CATALOGO.general.maxMinutosDia.comprobar(dura as ReglaGeneral<'maxMinutosDia'>, { datos: d1, indice: crearIndice(d1, LUNES, base) }, cand);
    expect(c1.permitido).toBe(false);
    const blanda = reglaDe('maxMinutosDia', { maxMin: 270, excepciones: [] }, { dura: false, peso: 5 });
    const d2 = datosMini({ puestos: pa, reglas: [blanda] });
    const c2 = CATALOGO.general.maxMinutosDia.comprobar(blanda as ReglaGeneral<'maxMinutosDia'>, { datos: d2, indice: crearIndice(d2, LUNES, base) }, cand);
    expect(c2.permitido).toBe(true);
    expect(c2.coste).toBe(10);
    const c3 = CATALOGO.general.maxMinutosDia.comprobar(dura as ReglaGeneral<'maxMinutosDia'>, { datos: d1, indice: crearIndice(d1, LUNES, base) }, asig(MAR, 'pa', 'g3', P(1)));
    expect(c3.permitido).toBe(true);
  });

  it('coherencia con evaluar: comprobar permite exactamente las candidatas que no crean un solape duro nuevo', () => {
    const regla = reglaDe('sinSolapes', {});
    const d = datos(regla);
    const base = [existente, asig(LUN, 'p2', 'g2', P(2))];
    const cx = ctx(d, base);
    for (const huecoP of [['p1', 'f1'], ['p1', 'f2'], ['p1', 'f3'], ['p2', 'g1'], ['p2', 'g2']] as const) {
      for (const n of [1, 2, 3]) {
        const cand = asig(LUN, huecoP[0], huecoP[1], P(n), 1);
        const antes = deTipo(validar(d, base), 'sinSolapes').length;
        const despues = deTipo(validar(d, [...base, cand]), 'sinSolapes').length;
        const c = CATALOGO.general.sinSolapes.comprobar(regla as ReglaGeneral<'sinSolapes'>, cx, cand);
        expect(c.permitido, `${huecoP.join('/')} EMP-0${n}`).toBe(despues === antes);
      }
    }
  });

  it('restricción personal: noDespuesDe no permite terminar tarde y sí a la hora', () => {
    const r = restriccionDe('noDespuesDe', { hora: 12 * 60, dias: [] }) as RestriccionPersona<'noDespuesDe'>;
    const d = conRestriccion(datosMini(), 1, r);
    const cx = { datos: d, indice: crearIndice(d, LUNES, []) };
    const persona = d.personas[0]!;
    expect(CATALOGO.restricciones.noDespuesDe.comprobar(r, persona, cx, asig(LUN, 'p1', 'f3', P(1))).permitido).toBe(false);
    expect(CATALOGO.restricciones.noDespuesDe.comprobar(r, persona, cx, asig(LUN, 'p1', 'f2', P(1))).permitido).toBe(true);
  });
});
