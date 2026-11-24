import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../datos-ejemplo/ejemplo';
import { CATALOGO } from '../reglas/catalogo';
import { crearIndice } from '../validacion/indice';
import { validarSemana } from '../validacion/validador';
import type { Asignacion, AsignacionPausa, AsignacionPuesto, EstadoApp, RestriccionPersona } from '../modelo/tipos';
import { colocarComidas, repararComidas, repararPausasMinimas } from './comidas';
import { claveDeHueco, crearComprobador, crearUnidades } from './unidades';

const LUNES = '2026-11-23';
const DOMINGO = '2026-11-29';
const LEGO = IDS_EJEMPLO.puestos.lego;

function lego(id: string, fecha: string, franja: number, personaId: string, bloqueada = false): AsignacionPuesto {
  return { id, tipo: 'puesto', fecha, puestoId: LEGO, franjaId: `franja-lego-${franja}`, plaza: 0, personaId, bloqueada, origen: 'manual' };
}

/** Jornada de 10:00 a 22:00 con solo dos franjas cortas de LEGO (necesita comida el domingo). */
function jornadaLarga(personaId: string, n: string): Asignacion[] {
  return [lego(`${n}-1`, DOMINGO, 1, personaId), lego(`${n}-2`, DOMINGO, 11, personaId)];
}

function nuevo(): { datos: EstadoApp; comprobador: ReturnType<typeof crearComprobador> } {
  const datos = crearEstadoEjemplo();
  return { datos, comprobador: crearComprobador(datos, CATALOGO) };
}

describe('colocarComidas', () => {
  it('coloca la comida de quien supera el umbral, dentro de una franja y sin pisar sus puestos', () => {
    const { datos, comprobador } = nuevo();
    const r = colocarComidas(datos, comprobador, LUNES, jornadaLarga('per-16', 'a'));
    expect(r.pendientes).toEqual([]);
    expect(r.pausas).toHaveLength(1);
    expect(r.pausas[0]).toMatchObject({ tipo: 'pausa', fecha: DOMINGO, personaId: 'per-16', inicio: 840, fin: 900, origen: 'motor' });
  });

  it('no da comida a quien no supera el umbral ni fuera de los días de la regla', () => {
    const { datos, comprobador } = nuevo();
    const corta = [lego('c1', DOMINGO, 1, 'per-16'), lego('c2', DOMINGO, 6, 'per-16')];
    const entreSemana = [lego('d1', '2026-11-26', 1, 'per-16'), lego('d2', '2026-11-26', 11, 'per-16')];
    const r = colocarComidas(datos, comprobador, LUNES, [...corta, ...entreSemana]);
    expect(r.pausas).toEqual([]);
    expect(r.pendientes).toEqual([]);
  });

  it('escalona: reparte entre las franjas menos ocupadas respetando el máximo por franja', () => {
    const { datos, comprobador } = nuevo();
    const personas = ['per-01', 'per-02', 'per-03', 'per-04', 'per-05', 'per-06', 'per-07', 'per-09', 'per-10', 'per-11'];
    const asignaciones = personas.flatMap((p, i) => jornadaLarga(p, `p${i}`));
    const r = colocarComidas(datos, comprobador, LUNES, asignaciones);
    expect(r.pendientes).toEqual([]);
    expect(r.pausas).toHaveLength(10);
    const cuenta = (inicio: number) => r.pausas.filter((p) => p.inicio === inicio).length;
    expect(cuenta(840)).toBeLessThanOrEqual(4);
    expect(cuenta(900)).toBeLessThanOrEqual(4);
    expect(cuenta(960)).toBeLessThanOrEqual(3);
    // Resultado válido para el validador (ninguna regla dura de comidas incumplida).
    const v = validarSemana(datos, LUNES, [...asignaciones, ...r.pausas], CATALOGO);
    expect(v.incumplimientos.filter((i) => i.tipo === 'comidasEscalonadas')).toEqual([]);
  });

  it('deja pendiente (con motivo) lo que no cabe porque las franjas están llenas', () => {
    const { datos, comprobador } = nuevo();
    // 11 plazas de comida en total (4 + 4 + 3): la persona 12 queda pendiente.
    const personas = ['per-01', 'per-02', 'per-03', 'per-04', 'per-05', 'per-06', 'per-07', 'per-09', 'per-10', 'per-11', 'per-12', 'per-13'];
    const r = colocarComidas(datos, comprobador, LUNES, personas.flatMap((p, i) => jornadaLarga(p, `q${i}`)));
    expect(r.pausas).toHaveLength(11);
    expect(r.pendientes).toHaveLength(1);
    expect(r.pendientes[0]?.motivo).toMatch(/^EMP-\d\d trabaja 10:00–22:00 el domingo 29\/11 y necesita comer 1h/);
    expect(r.pendientes[0]?.motivo).toContain('completas');
  });

  it('deja pendiente a quien tiene puestos en todas las ventanas posibles', () => {
    const { datos, comprobador } = nuevo();
    const asignaciones = [...jornadaLarga('per-16', 'b'), lego('b-3', DOMINGO, 6, 'per-16'), lego('b-4', DOMINGO, 7, 'per-16')];
    const r = colocarComidas(datos, comprobador, LUNES, asignaciones);
    expect(r.pausas).toEqual([]);
    expect(r.pendientes).toHaveLength(1);
    expect(r.pendientes[0]).toMatchObject({ personaId: 'per-16', fecha: DOMINGO });
    expect(r.pendientes[0]?.motivo).toContain('se solapan con sus puestos');
  });

  it('respeta una pausa que ya existía (no duplica ni cuenta de más)', () => {
    const { datos, comprobador } = nuevo();
    const pausa: Asignacion = { id: 'p0', tipo: 'pausa', fecha: DOMINGO, inicio: 900, fin: 960, personaId: 'per-16', bloqueada: true, origen: 'manual' };
    const r = colocarComidas(datos, comprobador, LUNES, [...jornadaLarga('per-16', 'e'), pausa]);
    expect(r.pausas).toEqual([]);
    expect(r.pendientes).toEqual([]);
  });

  it('es determinista', () => {
    const { datos, comprobador } = nuevo();
    const entrada = ['per-01', 'per-02', 'per-03'].flatMap((p, i) => jornadaLarga(p, `r${i}`));
    expect(colocarComidas(datos, comprobador, LUNES, entrada)).toEqual(colocarComidas(datos, comprobador, LUNES, entrada));
  });
});

describe('repararComidas', () => {
  it('mueve una unidad de la persona a otra para liberar su ventana de comida', () => {
    const { datos, comprobador } = nuevo();
    const fijas: Asignacion[] = [...jornadaLarga('per-16', 'f'), lego('f-3', DOMINGO, 7, 'per-16')];
    // Unidad libre: LEGO 14:48–15:45, asignada a EMP-16 (que así no tiene ventana libre antes de las 15:00).
    const indice = crearIndice(datos, LUNES, fijas);
    const libres = new Set(indice.huecos().map(claveDeHueco));
    libres.delete(`${DOMINGO}|${LEGO}|franja-lego-6|0`);
    const unidades = crearUnidades(datos, indice, libres);
    expect(unidades).toHaveLength(1);
    const personas = ['per-16'];
    const asignaciones = [...fijas, lego('m', DOMINGO, 6, 'per-16')];
    const inicial = colocarComidas(datos, comprobador, LUNES, asignaciones);
    expect(inicial.pendientes).toHaveLength(1);

    const r = repararComidas({
      datos,
      comprobador,
      lunes: LUNES,
      fijas,
      unidades,
      personas,
      comidas: inicial,
      reloj: () => 0,
      inicio: 0,
      limiteMs: 1000,
    });
    expect(r.cortadoPorTiempo).toBe(false);
    expect(r.comidas.pendientes).toEqual([]);
    expect(r.comidas.pausas).toHaveLength(1);
    expect(r.personas[0]).not.toBe('per-16');
    expect(r.personas[0]).not.toBeNull();
  });

  it('no cambia nada si no hay comidas pendientes', () => {
    const { datos, comprobador } = nuevo();
    const r = repararComidas({
      datos,
      comprobador,
      lunes: LUNES,
      fijas: [],
      unidades: [],
      personas: [],
      comidas: { pausas: [], pendientes: [] },
      reloj: () => 0,
      inicio: 0,
      limiteMs: 1000,
    });
    expect(r.personas).toEqual([]);
    expect(r.comidas).toEqual({ pausas: [], pendientes: [] });
  });
});

describe('colocarComidas · detalles', () => {
  it('el motivo enumera solo las franjas donde tendría libre', () => {
    const { datos, comprobador } = nuevo();
    const pausa = (id: string, personaId: string): AsignacionPausa => ({ id, tipo: 'pausa', fecha: DOMINGO, inicio: 960, fin: 1020, personaId, bloqueada: true, origen: 'manual' });
    const asignaciones: Asignacion[] = [
      ...['per-01', 'per-02', 'per-03'].flatMap((p, i) => jornadaLarga(p, `v${i}`)),
      pausa('x1', 'per-01'),
      pausa('x2', 'per-02'),
      pausa('x3', 'per-03'),
      ...jornadaLarga('per-16', 'w'),
      lego('w-3', DOMINGO, 6, 'per-16'),
    ];
    const r = colocarComidas(datos, comprobador, LUNES, asignaciones);
    expect(r.pendientes).toHaveLength(1);
    expect(r.pendientes[0]?.motivo).toContain('16:00–17:00');
    expect(r.pendientes[0]?.motivo).not.toContain('14:00–15:00');
  });

  it('el id de la pausa es único aunque el determinista ya exista', () => {
    const { datos, comprobador } = nuevo();
    const previa: Asignacion = { id: 'c|per-16|2026-11-29', tipo: 'pausa', fecha: '2026-11-29', inicio: 1080, fin: 1100, personaId: 'per-16', bloqueada: false, origen: 'motor' };
    const r = colocarComidas(datos, comprobador, LUNES, [...jornadaLarga('per-16', 'u'), previa]);
    expect(r.pausas).toHaveLength(1);
    expect(r.pausas[0]?.id).toBe('c|per-16|2026-11-29-2');
  });
});

describe('repararPausasMinimas', () => {
  const restr: RestriccionPersona = { id: 'r-pausa', tipo: 'pausaMinima', params: { siJornadaSuperaMin: 300, pausaMin: 30 }, dura: true, peso: 0, activa: true, nota: '' };
  const JUEVES = '2026-11-26';

  function escenario() {
    const datos = crearEstadoEjemplo();
    datos.personas.find((p) => p.codigo === 'EMP-22')!.restricciones.push(restr);
    const comprobador = crearComprobador(datos, CATALOGO);
    const indice = crearIndice(datos, LUNES, []);
    const libres = new Set(indice.huecos().map(claveDeHueco));
    libres.delete(`${JUEVES}|${IDS_EJEMPLO.puestos.pedidos}|franja-pedidos-m|0`);
    return { datos, comprobador, unidades: crearUnidades(datos, indice, libres) };
  }
  const entrada = (e: ReturnType<typeof escenario>, personas: (string | null)[]) => ({
    datos: e.datos,
    catalogos: CATALOGO,
    comprobador: e.comprobador,
    lunes: LUNES,
    fijas: [] as Asignacion[],
    unidades: e.unidades,
    personas,
    comidas: { pausas: [], pendientes: [] },
    reloj: () => 0,
    inicio: 0,
    limiteMs: 1000,
  });

  it('mueve la unidad a otra persona permitida para que no falte la pausa', () => {
    const e = escenario();
    expect(e.unidades).toHaveLength(1);
    const r = repararPausasMinimas(entrada(e, ['per-22']));
    expect(r.personas[0]).not.toBe('per-22');
    expect(r.personas[0]).not.toBeNull();
    expect(r.comidas.pendientes).toEqual([]);
  });

  it('si no hay forma, lo deja en comidasPendientes con un motivo legible', () => {
    const e = escenario();
    // Nadie más está habilitado para Pedidos.
    for (const p of e.datos.personas) if (p.codigo !== 'EMP-22') p.habilitaciones = p.habilitaciones.filter((h) => h !== IDS_EJEMPLO.areas.pedidos);
    const r = repararPausasMinimas(entrada(e, ['per-22']));
    expect(r.personas[0]).toBe('per-22');
    expect(r.comidas.pendientes).toHaveLength(1);
    expect(r.comidas.pendientes[0]?.motivo).toBe('EMP-22 trabaja de 10:00 a 15:45 sin una pausa de 30 min');
    expect(r.comidas.pendientes[0]).toMatchObject({ personaId: 'per-22', fecha: JUEVES });
  });
});
