/** Caja negra: edición de áreas. ARQUITECTURA.md §9.2. */
import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../src/datos-ejemplo/ejemplo';
import { crearGeneradorIds } from '../../src/modelo/ids';
import type { Ambito, EstadoApp, ReglaGeneral } from '../../src/modelo/tipos';
import {
  anadirArea, borrarArea, crearArea, erroresArea, impactoBorrarArea, moverArea, reemplazarArea,
} from '../../src/edicion/areas';
import { congelar, IDS_EJEMPLO } from './ayudas';

const { pedidos, caja, lego, libreria } = IDS_EJEMPLO.areas;

/** Ejemplo con Librería referenciada en habilitaciones, ámbitos y excepciones. */
function estadoConLibreria(): EstadoApp {
  const e = crearEstadoEjemplo();
  e.personas[0]!.habilitaciones.push(libreria);
  e.personas[1]!.habilitaciones.push(libreria);
  const regla = (id: string) => e.reglas.find((r) => r.id === id)!;
  (regla('regla-no-repetir-lego').params as { ambito: Ambito }).ambito.areaIds.push(libreria);
  (regla('regla-max-horas-dia').params as { excepciones: { areaId: string; maxMin: number | null }[] })
    .excepciones.push({ areaId: libreria, maxMin: 120 });
  e.personas[2]!.restricciones.push({
    id: 'restr-no-libreria', tipo: 'noAsignarA', params: { ambito: { areaIds: [libreria], puestoIds: [] } },
    dura: true, peso: 0, activa: true, nota: '',
  });
  return e;
}

describe('borrar área', () => {
  it('con puestos está bloqueado y el mensaje cuenta los puestos', () => {
    const e = crearEstadoEjemplo();
    const imp = impactoBorrarArea(e, caja);
    expect(imp.bloqueos.length).toBeGreaterThan(0);
    expect(imp.bloqueos.join(' ')).toMatch(/2 puestos/);
  });
  it('sin puestos ni reglas que la exijan no hay bloqueos', () => {
    expect(impactoBorrarArea(crearEstadoEjemplo(), libreria).bloqueos).toEqual([]);
  });
  it('anuncia efectos si hay habilitaciones o reglas que la mencionan', () => {
    expect(impactoBorrarArea(estadoConLibreria(), libreria).efectos.length).toBeGreaterThan(0);
  });
  it('sin puestos: quita su id de habilitaciones, ámbitos, excepciones y restricciones', () => {
    const e = congelar(estadoConLibreria());
    const e2 = borrarArea(e, libreria);
    expect(e2.areas.map((a) => a.id)).toEqual([pedidos, caja, lego]);
    expect(JSON.stringify(e2)).not.toContain(libreria);
    expect(e2.personas[0]!.habilitaciones).toEqual([pedidos, caja, lego]);
    const r = e2.reglas.find((x) => x.id === 'regla-max-horas-dia') as ReglaGeneral<'maxMinutosDia'>;
    expect(r.params.excepciones).toEqual([{ areaId: pedidos, maxMin: null }]);
    const n = e2.reglas.find((x) => x.id === 'regla-no-repetir-lego') as ReglaGeneral<'noRepetirConsecutivas'>;
    expect(n.params.ambito.areaIds).toEqual([lego]);
  });
  it('no toca el resto de áreas ni de puestos', () => {
    const e2 = borrarArea(estadoConLibreria(), libreria);
    expect(e2.puestos).toHaveLength(4);
    expect(e2.personas).toHaveLength(29);
  });
});

describe('maxFranjasSiSoloArea bloquea borrar su área', () => {
  it('sobre un área sin puestos', () => {
    const e = crearEstadoEjemplo();
    e.reglas.push({
      id: 'regla-x', tipo: 'maxFranjasSiSoloArea', params: { areaId: libreria, maxFranjas: 1 },
      dura: false, peso: 5, activa: true, estado: 'validada', nombre: 'X', nota: '',
    });
    const imp = impactoBorrarArea(e, libreria);
    expect(imp.bloqueos.length).toBeGreaterThan(0);
  });
  it('en el ejemplo, LEGO queda bloqueada (tiene puestos y una regla)', () => {
    expect(impactoBorrarArea(crearEstadoEjemplo(), lego).bloqueos.length).toBeGreaterThanOrEqual(1);
  });
});

describe('crearArea', () => {
  it('valores por defecto', () => {
    const e = crearEstadoEjemplo();
    const a = crearArea(e, crearGeneradorIds('area-t'));
    expect(a.id).toBe('area-t-1');
    expect(a.nombre).toBe('Área nueva');
    expect(a.icono).toBe('tienda');
    expect(a.activa).toBe(true);
    expect(a.planta).toBe(4);
    expect(a.orden).toBeGreaterThan(Math.max(...e.areas.map((x) => x.orden)));
    expect(a.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
  it('planta 3 si no hay áreas', () => {
    const e = crearEstadoEjemplo();
    e.areas = [];
    e.puestos = [];
    expect(crearArea(e, crearGeneradorIds('a')).planta).toBe(3);
  });
  it('no repite color en uso, ni al añadir varias seguidas', () => {
    let e = congelar(crearEstadoEjemplo());
    const ids = crearGeneradorIds('area-t');
    for (let i = 0; i < 4; i++) {
      const a = crearArea(e, ids);
      expect(e.areas.map((x) => x.color.toLowerCase())).not.toContain(a.color.toLowerCase());
      e = congelar(anadirArea(e, { ...a, nombre: `Área ${i}` }));
    }
    expect(new Set(e.areas.map((x) => x.color.toLowerCase())).size).toBe(8);
  });
});

describe('erroresArea, mover y reemplazar', () => {
  it('detecta nombre vacío, repetido en la misma planta, color y planta inválidos', () => {
    const e = crearEstadoEjemplo();
    const base = crearArea(e, crearGeneradorIds('a'));
    expect(erroresArea(e, { ...base, nombre: '' }).length).toBeGreaterThan(0);
    expect(erroresArea(e, { ...base, nombre: 'Caja', planta: 3 }).length).toBeGreaterThan(0);
    expect(erroresArea(e, { ...base, nombre: 'Caja', planta: 5 })).toEqual([]);
    expect(erroresArea(e, { ...base, color: 'rojo' }).length).toBeGreaterThan(0);
    expect(erroresArea(e, { ...base, planta: 100 }).length).toBeGreaterThan(0);
    expect(erroresArea(e, { ...base, planta: 2.5 }).length).toBeGreaterThan(0);
  });
  it('las áreas del ejemplo no dan errores', () => {
    const e = crearEstadoEjemplo();
    for (const a of e.areas) expect(erroresArea(e, a)).toEqual([]);
  });
  it('moverArea intercambia el orden con la vecina y no muta', () => {
    const e = congelar(crearEstadoEjemplo());
    const e2 = moverArea(e, caja, -1);
    const ord = (x: EstadoApp, id: string) => x.areas.find((a) => a.id === id)!.orden;
    expect(ord(e2, caja)).toBe(ord(e, pedidos));
    expect(ord(e2, pedidos)).toBe(ord(e, caja));
  });
  it('mover la primera hacia arriba no cambia nada', () => {
    const e = crearEstadoEjemplo();
    expect(moverArea(e, pedidos, -1).areas.map((a) => [a.id, a.orden])).toEqual(e.areas.map((a) => [a.id, a.orden]));
  });
  it('reemplazarArea cambia por id', () => {
    const e = congelar(crearEstadoEjemplo());
    const e2 = reemplazarArea(e, { ...e.areas[1]!, activa: false });
    expect(e2.areas[1]!.activa).toBe(false);
    expect(e.areas[1]!.activa).toBe(true);
  });
});
