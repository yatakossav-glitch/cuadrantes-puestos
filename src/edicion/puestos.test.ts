import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../datos-ejemplo/ejemplo';
import { crearGeneradorIds } from '../modelo/ids';
import { asigPuesto, estadoConAsignaciones } from '../../tests/ayudas/datosPrueba';
import { personalizarDia } from './horario';
import {
  anadirPuesto, aplicarCambioPuesto, borrarPuesto, crearPuesto, duplicarPuesto, erroresPuesto,
  impactoBorrarPuesto, impactoCambioPuesto, moverPuesto, reemplazarPuesto,
} from './puestos';

const P = IDS_EJEMPLO.puestos;
const get = (e: ReturnType<typeof crearEstadoEjemplo>, id: string) => e.puestos.find((p) => p.id === id)!;

describe('puestos', () => {
  it('crearPuesto, añadir y reemplazar', () => {
    const e = crearEstadoEjemplo();
    const p = crearPuesto(e, IDS_EJEMPLO.areas.libreria, crearGeneradorIds('pu'));
    expect(p).toMatchObject({ id: 'pu-1', nombre: 'Puesto nuevo', plazas: 1, dias: [0, 1, 2, 3, 4, 5, 6], requiereHabilitacion: false, activo: true, orden: 5 });
    expect(p.horario.general.franjas).toEqual([{ id: 'f-1', inicio: 600, fin: 1320 }]);
    expect(erroresPuesto(anadirPuesto(e, p), p)).toEqual([]);
    expect(reemplazarPuesto(e, { ...p, id: P.lego, nombre: 'X' }).puestos[3]!.nombre).toBe('X');
  });
  it('duplicarPuesto conserva ids de franja y se coloca detrás', () => {
    const e = crearEstadoEjemplo();
    const copia = structuredClone(e);
    const n = duplicarPuesto(e, P.caja1, crearGeneradorIds('pu'));
    expect(n.puestos.map((p) => p.id)).toEqual([P.pedidos, P.caja1, 'pu-1', P.caja2, P.lego]);
    expect(n.puestos[2]!.nombre).toBe('Caja 1 (copia)');
    expect(n.puestos[2]!.horario).toEqual(get(e, P.caja1).horario);
    expect(n.puestos.map((p) => p.orden)).toEqual([1, 2, 3, 4, 5]);
    expect(e).toEqual(copia);
  });
  it('moverPuesto dentro de su área', () => {
    const e = crearEstadoEjemplo();
    const n = moverPuesto(e, P.caja2, -1);
    expect(get(n, P.caja2).orden).toBe(2);
    expect(get(n, P.caja1).orden).toBe(3);
    expect(moverPuesto(e, P.caja1, -1)).toBe(e);
    expect(moverPuesto(e, P.caja2, 1)).toBe(e);
  });
  it('erroresPuesto', () => {
    const e = crearEstadoEjemplo();
    const p = get(e, P.caja1);
    expect(erroresPuesto(e, p)).toEqual([]);
    expect(erroresPuesto(e, { ...p, nombre: '' })).toEqual(['Falta el nombre del puesto']);
    expect(erroresPuesto(e, { ...p, id: 'x', nombre: 'caja 2' })).toEqual(['Ya hay un puesto llamado «caja 2» en esta área']);
    expect(erroresPuesto(e, { ...p, areaId: 'zz' })[0]).toMatch(/área elegida ya no existe/);
    expect(erroresPuesto(e, { ...p, plazas: 0 })[0]).toMatch(/entre 1 y 20/);
    expect(erroresPuesto(e, { ...p, dias: [] })[0]).toMatch(/al menos un día/);
    expect(erroresPuesto(e, { ...p, horario: { general: { franjas: [], bloques: [] }, porDia: {} } })[0]).toMatch(/Caja 1 · horario general: no tiene ninguna franja/);
    const pers = personalizarDia({ ...p, dias: [0, 1, 2, 3, 4, 5] }, 6);
    expect(erroresPuesto(e, pers)).toEqual(['Caja 1: tiene un horario propio el domingo, pero no abre ese día']);
  });
  it('impactoCambioPuesto cuenta lo que dejará de encajar', () => {
    const e = estadoConAsignaciones();
    const p = get(e, P.caja1);
    expect(impactoCambioPuesto(e, p)).toEqual({ bloqueos: [], efectos: [] });
    // Sin lunes: a1 y a4 (lunes) y t1.
    expect(impactoCambioPuesto(e, { ...p, dias: [1, 2, 3, 4, 5, 6] }).efectos).toEqual([
      'Se quitarán 3 asignaciones porque el puesto ya no abre el lunes',
    ]);
    // Sin la primera franja: a1, a4, a5 y t1.
    const sinF1 = { ...p, horario: { ...p.horario, general: { ...p.horario.general, franjas: p.horario.general.franjas.slice(1), bloques: p.horario.general.bloques.slice(1) } } };
    expect(impactoCambioPuesto(e, sinF1).efectos).toEqual([
      'Se quitarán 3 asignaciones del lunes porque su franja ya no existe',
      'Se quitará 1 asignación del domingo porque su franja ya no existe',
    ]);
    // Plazas: ninguna usa la plaza 1.
    expect(impactoCambioPuesto(e, { ...p, plazas: 2 }).efectos).toEqual([]);
  });
  it('quitar una plaza usada nombra la plaza', () => {
    const e = estadoConAsignaciones();
    const p = { ...get(e, P.caja1), plazas: 2 };
    const con = { ...e, puestos: e.puestos.map((x) => (x.id === p.id ? p : x)) };
    con.cuadrantes['2026-11-23']!.asignaciones.push(asigPuesto('a9', '2026-11-23', P.caja1, 'franja-caja-1', 'per-01', 1));
    expect(impactoCambioPuesto(con, { ...p, plazas: 1 }).efectos).toEqual([
      'Se quitará 1 asignación de la plaza 2, que deja de existir',
    ]);
  });
  it('personalizar un día idéntico reasigna las asignaciones sin quitar ninguna', () => {
    const e = estadoConAsignaciones();
    const p = get(e, P.caja1);
    const pers = personalizarDia(p, 0);
    expect(impactoCambioPuesto(e, pers).efectos).toEqual([]);
    const n = aplicarCambioPuesto(e, pers);
    const nuevaF1 = pers.horario.porDia[0]!.franjas[0]!.id;
    expect(nuevaF1).not.toBe('franja-caja-1');
    const lunes = n.cuadrantes['2026-11-23']!.asignaciones.find((a) => a.id === 'a1');
    expect(lunes).toMatchObject({ franjaId: nuevaF1 });
    expect(n.semanasTipo[0]!.asignaciones.find((a) => a.id === 't1')).toMatchObject({ franjaId: nuevaF1 });
    // Los demás días conservan sus franjas.
    expect(n.cuadrantes['2026-11-30']!.asignaciones.find((a) => a.id === 'a5')).toMatchObject({ franjaId: 'franja-caja-1' });
    expect(n.cuadrantes['2026-11-23']!.asignaciones).toHaveLength(4);
  });
  it('personalizar un día cambiando una franja solo quita la afectada', () => {
    const e = estadoConAsignaciones();
    const p = get(e, P.caja1);
    const pers = personalizarDia(p, 0);
    const h = pers.horario.porDia[0]!;
    const cambiada = { ...pers, horario: { ...pers.horario, porDia: { 0: { ...h, franjas: h.franjas.map((f, i) => (i === 0 ? { ...f, fin: f.fin - 15 } : f)) } } } };
    expect(impactoCambioPuesto(e, cambiada).efectos).toEqual(['Se quitarán 3 asignaciones del lunes porque su franja ya no existe']);
    const n = aplicarCambioPuesto(e, cambiada);
    expect(n.cuadrantes['2026-11-23']!.asignaciones.map((a) => a.id)).toEqual(['a2', 'a3', 'p1']);
    expect(n.cuadrantes['2026-11-30']!.asignaciones.map((a) => a.id)).toEqual(['a5']);
  });
  it('aplicarCambioPuesto reemplaza y quita asignaciones', () => {
    const e = estadoConAsignaciones();
    const copia = structuredClone(e);
    const p = get(e, P.caja1);
    const n = aplicarCambioPuesto(e, { ...p, dias: [1, 2, 3, 4, 5, 6], nombre: 'Caja uno' });
    expect(get(n, P.caja1).nombre).toBe('Caja uno');
    expect(n.cuadrantes['2026-11-23']!.asignaciones.map((a) => a.id)).toEqual(['a2', 'a3', 'p1']);
    expect(n.cuadrantes['2026-11-30']!.asignaciones.map((a) => a.id)).toEqual(['a5']);
    expect(n.semanasTipo[0]!.asignaciones.map((a) => a.id)).toEqual(['t2']);
    expect(e).toEqual(copia);
  });
  it('impacto y borrado de puesto en cascada', () => {
    const e = estadoConAsignaciones();
    e.personas[0]!.habilitaciones.push(P.caja1);
    e.personas[1]!.habilitaciones.push(P.caja1);
    e.reglas.find((r) => r.tipo === 'exclusividadDiaria')!.params = { puestoIds: [P.pedidos, P.caja1], diasExcepcion: [] };
    const copia = structuredClone(e);
    expect(impactoBorrarPuesto(e, P.caja1)).toEqual({
      bloqueos: [],
      efectos: [
        'Se quitarán 4 asignaciones en 2 semanas',
        'Se quitará 1 asignación de 1 semana tipo',
        'Se quitará 1 cierre del puesto',
        'Se quitará la habilitación a 2 personas',
        'Se quitará de 1 regla',
      ],
    });
    const solo = borrarPuesto(e, P.pedidos);
    expect(solo.reglas.find((x) => x.tipo === 'exclusividadDiaria')!.activa).toBe(true);
    const e2 = borrarPuesto(borrarPuesto(e, P.caja1), P.pedidos);
    const rx = e2.reglas.find((x) => x.tipo === 'exclusividadDiaria')!;
    expect(rx.activa).toBe(false);
    expect(impactoBorrarPuesto(borrarPuesto(e, P.pedidos), P.caja1).efectos).toContain('La regla «Pedidos en exclusiva» se desactivará porque se queda sin puestos');
    const n = borrarPuesto(e, P.caja1);
    expect(n.puestos.map((p) => p.id)).toEqual([P.pedidos, P.caja2, P.lego]);
    expect(n.cuadrantes['2026-11-23']!.asignaciones.map((a) => a.id)).toEqual(['a3', 'p1']);
    expect(n.cuadrantes['2026-11-30']!.asignaciones).toEqual([]);
    expect(n.semanasTipo[0]!.asignaciones.map((a) => a.id)).toEqual(['t2']);
    expect(n.incidencias.map((i) => i.id)).toEqual(['i1', 'i3']);
    expect(n.personas[0]!.habilitaciones).not.toContain(P.caja1);
    const r = n.reglas.find((x) => x.tipo === 'exclusividadDiaria')!;
    expect(r.tipo === 'exclusividadDiaria' && r.params.puestoIds).toEqual([P.pedidos]);
    expect(e).toEqual(copia);
  });

  it('crearPuesto sin vigencia', () => {
    const p = crearPuesto(crearEstadoEjemplo(), IDS_EJEMPLO.areas.libreria);
    expect(p).toMatchObject({ vigenteDesde: null, vigenteHasta: null });
  });
  it('erroresPuesto valida la vigencia', () => {
    const e = crearEstadoEjemplo();
    const p = get(e, P.caja1);
    expect(erroresPuesto(e, { ...p, vigenteDesde: '2026-12-01', vigenteHasta: '2027-01-06' })).toEqual([]);
    expect(erroresPuesto(e, { ...p, vigenteDesde: '2026-12-01', vigenteHasta: '2026-12-01' })).toEqual([]);
    expect(erroresPuesto(e, { ...p, vigenteDesde: '2027-01-06', vigenteHasta: '2026-12-01' })).toContain(
      'La fecha de fin de la vigencia es anterior a la de inicio.',
    );
    expect(erroresPuesto(e, { ...p, vigenteDesde: '2026-13-01' }).length).toBe(1);
  });
  it('un cambio de vigencia quita las asignaciones fuera de ella y las cuenta', () => {
    const con = crearEstadoEjemplo();
    const franja = get(con, P.caja1).horario.general.franjas[0]!.id;
    const persona = con.personas[0]!.id;
    const meta = { modo: null, semilla: null, generado: null };
    for (const [lunes, fecha, id] of [['2026-11-23', '2026-11-23', 'a1'], ['2026-11-30', '2026-11-30', 'a2'], ['2026-12-07', '2026-12-07', 'a3']] as const) {
      con.cuadrantes[lunes] = { lunes, meta, asignaciones: [asigPuesto(id, fecha, P.caja1, franja, persona)] };
    }
    const nuevo = { ...get(con, P.caja1), vigenteDesde: '2026-11-30', vigenteHasta: '2026-12-06' };
    expect(impactoCambioPuesto(con, nuevo).efectos.join(' ')).toContain('2 asignaciones');
    const r = aplicarCambioPuesto(con, nuevo);
    const fechas = Object.values(r.cuadrantes).flatMap((c) => c.asignaciones.map((a) => ('fecha' in a ? a.fecha : '')));
    expect(fechas).toEqual(['2026-11-30']);
  });
});
