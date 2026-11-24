import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../datos-ejemplo/ejemplo';
import { CATALOGO } from '../reglas/catalogo';
import { crearIndice } from '../validacion/indice';
import type { Asignacion, AsignacionPuesto, EstadoApp } from '../modelo/tipos';
import {
  asignacionDeHueco,
  claveDeHueco,
  crearComprobador,
  crearUnidades,
  unidadDeHueco,
  usaBloques,
} from './unidades';

const LUNES = '2026-11-23';
const JUEVES = '2026-11-26';

function unidadesSemana(datos: EstadoApp, ocupadas: string[] = []) {
  const indice = crearIndice(datos, LUNES, []);
  return { indice, unidades: crearUnidades(datos, indice, new Set(ocupadas)) };
}

describe('crearUnidades', () => {
  it('agrupa los bloques de Caja y deja Pedidos y LEGO en franjas sueltas', () => {
    const datos = crearEstadoEjemplo();
    const { unidades } = unidadesSemana(datos);
    // Por día: Pedidos 2 + Caja (2 puestos × 4 bloques) + LEGO 11 = 21.
    expect(unidades).toHaveLength(21 * 7);
    expect(unidades.filter((u) => u.puestoId === IDS_EJEMPLO.puestos.caja1 && u.fecha === JUEVES)).toHaveLength(4);
    expect(unidades.filter((u) => u.puestoId === IDS_EJEMPLO.puestos.caja1).every((u) => u.huecos.length === 2)).toBe(true);
    expect(unidades.filter((u) => u.puestoId === IDS_EJEMPLO.puestos.lego).every((u) => u.huecos.length === 1)).toBe(true);
  });

  it('ordena: Pedidos (habilitación y turno entero), luego bloques, luego franjas sueltas', () => {
    const { unidades } = unidadesSemana(crearEstadoEjemplo());
    const categorias = unidades.map((u) => u.categoria);
    expect(categorias).toEqual([...categorias].sort((a, b) => a - b));
    expect(unidades[0]?.puestoId).toBe(IDS_EJEMPLO.puestos.pedidos);
    expect(unidades.filter((u) => u.categoria === 0)).toHaveLength(14);
    expect(unidades.filter((u) => u.categoria === 1)).toHaveLength(56);
  });

  it('sin mismaPersonaBloque cada franja es una unidad', () => {
    const datos = crearEstadoEjemplo();
    datos.reglas = datos.reglas.map((r) => (r.tipo === 'mismaPersonaBloque' ? { ...r, activa: false } : r));
    const caja = datos.puestos.find((p) => p.id === IDS_EJEMPLO.puestos.caja1)!;
    expect(usaBloques(datos, caja)).toBe(false);
    const { unidades } = unidadesSemana(datos);
    expect(unidades.filter((u) => u.puestoId === IDS_EJEMPLO.puestos.caja1 && u.fecha === JUEVES)).toHaveLength(8);
  });

  it('un bloque con una franja ocupada da una unidad con la franja libre', () => {
    const datos = crearEstadoEjemplo();
    const clave = `${JUEVES}|${IDS_EJEMPLO.puestos.caja1}|franja-caja-1|0`;
    const { unidades } = unidadesSemana(datos, [clave]);
    const u = unidades.find((x) => x.id === `${JUEVES}|${IDS_EJEMPLO.puestos.caja1}|0|bloque-caja-m1`);
    expect(u?.huecos.map((h) => h.franjaId)).toEqual(['franja-caja-2']);
  });

  it('no crea unidades de puestos cerrados por incidencia', () => {
    const datos = crearEstadoEjemplo();
    datos.incidencias.push({ id: 'i1', tipo: 'puestoCerrado', puestoId: IDS_EJEMPLO.puestos.lego, desde: JUEVES, hasta: JUEVES, nota: '' });
    const { unidades } = unidadesSemana(datos);
    expect(unidades.filter((u) => u.puestoId === IDS_EJEMPLO.puestos.lego && u.fecha === JUEVES)).toHaveLength(0);
  });
});

describe('unidadDeHueco', () => {
  it('devuelve el bloque entero si el hueco tiene bloque y la regla está activa', () => {
    const datos = crearEstadoEjemplo();
    const indice = crearIndice(datos, LUNES, []);
    const hueco = indice.hueco(`${JUEVES}|${IDS_EJEMPLO.puestos.caja1}|franja-caja-2|0`)!;
    expect(unidadDeHueco(datos, indice, hueco)?.huecos.map((h) => h.franjaId)).toEqual(['franja-caja-1', 'franja-caja-2']);
  });

  it('devuelve solo el hueco si no hay bloque', () => {
    const datos = crearEstadoEjemplo();
    const indice = crearIndice(datos, LUNES, []);
    const hueco = indice.hueco(`${JUEVES}|${IDS_EJEMPLO.puestos.lego}|franja-lego-3|0`)!;
    expect(unidadDeHueco(datos, indice, hueco)?.huecos).toHaveLength(1);
  });
});

describe('crearComprobador', () => {
  const datos = crearEstadoEjemplo();
  const comprobador = crearComprobador(datos, CATALOGO);
  const indice = crearIndice(datos, LUNES, []);
  const { unidades } = unidadesSemana(datos);
  const pedidosJueves = unidades.find((u) => u.puestoId === IDS_EJEMPLO.puestos.pedidos && u.fecha === JUEVES && u.inicio === 600)!;
  const cajaJueves = unidades.find((u) => u.puestoId === IDS_EJEMPLO.puestos.caja1 && u.fecha === JUEVES && u.inicio === 600)!;

  it('permite a una persona habilitada y de su equipo', () => {
    // EMP-01: Pedidos + Caja + LEGO, equipo M.
    const r = comprobador.unidad(indice, pedidosJueves, 'per-01');
    expect(r.permitido).toBe(true);
    expect(r.primerMotivoDuro).toBeNull();
  });

  it('rechaza a quien no está habilitada, con un motivo legible', () => {
    // EMP-07: Caja + LEGO, sin Pedidos.
    const r = comprobador.unidad(indice, pedidosJueves, 'per-07');
    expect(r.permitido).toBe(false);
    expect(r.primerMotivoDuro).toContain('EMP-07');
  });

  it('rechaza una restricción personal dura', () => {
    // EMP-08: solo fines de semana.
    const r = comprobador.unidad(indice, cajaJueves, 'per-08');
    expect(r.permitido).toBe(false);
    expect(r.primerMotivoDuro).toContain('EMP-08');
  });

  it('en un bloque, la segunda franja ve la primera (suman para el máximo diario)', () => {
    // Máximo 2h30 al día: cada franja de 1h30 cabe sola, pero las dos juntas (3h) no.
    const estricto = crearEstadoEjemplo();
    estricto.reglas = estricto.reglas.map((r) =>
      r.tipo === 'maxMinutosDia' ? { ...r, params: { ...r.params, maxMin: 150 } } : r,
    );
    const comp = crearComprobador(estricto, CATALOGO);
    const idx = crearIndice(estricto, LUNES, []);
    const bloque = unidadesSemana(estricto).unidades.find(
      (u) => u.puestoId === IDS_EJEMPLO.puestos.caja1 && u.fecha === JUEVES && u.inicio === 600,
    )!;
    const sola = comp.unidad(idx, { ...bloque, huecos: [bloque.huecos[0]!] }, 'per-01');
    expect(sola.permitido).toBe(true);
    const entera = comp.unidad(idx, bloque, 'per-01');
    expect(entera.permitido).toBe(false);
    expect(entera.primerMotivoDuro).toContain('EMP-01');
  });

  it('con completo reúne motivos de varias reglas', () => {
    const r = comprobador.unidad(indice, cajaJueves, 'per-08', { completo: true });
    expect(r.permitido).toBe(false);
    expect(r.motivos.length).toBeGreaterThanOrEqual(1);
  });

  it('claveDeHueco coincide con la del índice', () => {
    const h = indice.huecos()[0]!;
    expect(claveDeHueco(h)).toBe(indice.claveDe(asignacionDeHueco(h, 'per-01') as AsignacionPuesto));
  });
});
