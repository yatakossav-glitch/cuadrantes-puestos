import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../datos-ejemplo/ejemplo';
import { crearGeneradorIds } from '../modelo/ids';
import type { RestriccionPersona } from '../modelo/tipos';
import { anadirArea, borrarArea, crearArea, erroresArea, impactoBorrarArea, moverArea, PALETA_AREAS, reemplazarArea } from './areas'
import { ambitoVaciado } from './reglas';

const A = IDS_EJEMPLO.areas;

describe('areas', () => {
  it('crearArea usa la planta de la última, color libre e icono tienda', () => {
    const e = crearEstadoEjemplo();
    const a = crearArea(e, crearGeneradorIds('area'));
    expect(a).toMatchObject({ id: 'area-1', nombre: 'Área nueva', planta: 4, icono: 'tienda', activa: true, orden: 5 });
    expect(a.color).toBe(PALETA_AREAS[4]);
    expect(crearArea({ ...e, areas: [] }).planta).toBe(3);
    expect(crearArea({ ...e, areas: [] }).color).toBe(PALETA_AREAS[0]);
  });
  it('añade y reemplaza', () => {
    const e = crearEstadoEjemplo();
    const a = crearArea(e);
    expect(anadirArea(e, a).areas).toHaveLength(5);
    expect(reemplazarArea(e, { ...e.areas[0]!, nombre: 'Otra' }).areas[0]!.nombre).toBe('Otra');
  });
  it('moverArea intercambia dentro de la planta', () => {
    const e = crearEstadoEjemplo();
    const copia = structuredClone(e);
    const n = moverArea(e, A.caja, -1);
    expect(n.areas.find((a) => a.id === A.caja)!.orden).toBe(1);
    expect(n.areas.find((a) => a.id === A.pedidos)!.orden).toBe(2);
    expect(moverArea(e, A.pedidos, -1)).toBe(e); // ya es la primera de su planta
    expect(moverArea(e, A.lego, 1)).toBe(e); // la siguiente está en otra planta
    expect(e).toEqual(copia);
  });
  it('erroresArea', () => {
    const e = crearEstadoEjemplo();
    const a = e.areas[0]!;
    expect(erroresArea(e, a)).toEqual([]);
    expect(erroresArea(e, { ...a, nombre: ' ' })).toEqual(['Falta el nombre del área']);
    expect(erroresArea(e, { ...a, id: 'x', nombre: 'caja' })).toEqual(['Ya hay un área llamada «caja» en la planta 3']);
    expect(erroresArea(e, { ...a, id: 'x', nombre: 'Caja', planta: 5 })).toEqual([]);
    expect(erroresArea(e, { ...a, planta: 100 })).toHaveLength(1);
    expect(erroresArea(e, { ...a, color: 'rojo' })).toHaveLength(1);
    expect(erroresArea(e, { ...a, icono: 'x' as never })).toHaveLength(1);
  });
  it('impacto: bloqueos por puestos y por regla', () => {
    const e = crearEstadoEjemplo();
    expect(impactoBorrarArea(e, A.caja).bloqueos).toEqual(['Tiene 2 puestos: bórralos o muévelos a otra área antes']);
    expect(impactoBorrarArea(e, A.pedidos).bloqueos).toEqual(['Tiene 1 puesto: bórralo o muévelo a otra área antes']);
    expect(impactoBorrarArea(e, A.lego).bloqueos).toEqual([
      'Tiene 1 puesto: bórralo o muévelo a otra área antes',
      'La regla «Una sola franja si solo LEGO» exige esta área: cámbiala o bórrala antes',
    ]);
    expect(impactoBorrarArea(e, A.libreria).bloqueos).toEqual([]);
  });
  it('impacto: efectos contados', () => {
    const e = crearEstadoEjemplo();
    e.personas[0]!.restricciones.push({
      id: 'r-n', tipo: 'noAsignarA', params: { ambito: { areaIds: [A.caja], puestoIds: [] } }, dura: true, peso: 0, activa: true, nota: '',
    } as RestriccionPersona);
    expect(impactoBorrarArea(e, A.caja).efectos).toEqual([
      'Se quitará la habilitación a 19 personas',
      'Se quitará de 2 reglas',
      'Se quitará de 1 restricción de personas',
      'Se desactivará una restricción de EMP-01 porque se queda sin puestos',
      'La regla «Mismo bloque en Caja» se desactivará porque se queda sin puestos',
      'La regla «Rotar entre bloques de Caja» se desactivará porque se queda sin puestos',
    ]);
    expect(impactoBorrarArea(e, A.libreria).efectos).toEqual([]);
  });
  it('borrarArea limpia habilitaciones, ámbitos y excepciones', () => {
    const e = crearEstadoEjemplo();
    e.personas[0]!.restricciones.push({
      id: 'r-n', tipo: 'noAsignarA', params: { ambito: { areaIds: [A.pedidos, A.caja], puestoIds: [] } }, dura: true, peso: 0, activa: true, nota: '',
    } as RestriccionPersona);
    const copia = structuredClone(e);
    const n = borrarArea(e, A.pedidos);
    expect(n.areas.map((a) => a.id)).not.toContain(A.pedidos);
    expect(n.personas.some((p) => p.habilitaciones.includes(A.pedidos))).toBe(false);
    expect(n.personas[0]!.habilitaciones).toEqual([A.caja, A.lego]);
    const r = n.personas[0]!.restricciones.find((x) => x.id === 'r-n')!;
    expect(r.tipo === 'noAsignarA' && r.params.ambito.areaIds).toEqual([A.caja]);
    const m = n.reglas.find((x) => x.tipo === 'maxMinutosDia')!;
    expect(m.tipo === 'maxMinutosDia' && m.params.excepciones).toEqual([]);
    expect(e).toEqual(copia);
  });
  it('una regla ya inactiva o descartada que se queda sin ámbito queda inactiva y pendiente', () => {
    const e = crearEstadoEjemplo();
    e.reglas = e.reglas.map((r) => (r.id === 'regla-bloque-caja' ? { ...r, activa: true, estado: 'descartada' as const } : r));
    const inactiva = { ...e, reglas: e.reglas.map((r) => (r.id === 'regla-bloque-caja' ? { ...r, activa: false } : r)) };
    for (const base of [e, inactiva]) {
      const r = borrarArea(base, A.caja).reglas.find((x) => x.id === 'regla-bloque-caja')!;
      expect(r.activa).toBe(false);
      expect(r.estado).toBe('pendiente');
      expect(ambitoVaciado(r)).toBe(true);
      expect(impactoBorrarArea(base, A.caja).efectos).toContain('La regla «Mismo bloque en Caja» se desactivará porque se queda sin puestos');
    }
    expect(ambitoVaciado(e.reglas.find((x) => x.id === 'regla-bloque-caja')!)).toBe(false);
    expect(ambitoVaciado(e.reglas.find((x) => x.id === 'regla-sin-solapes')!)).toBe(false);
  });
  it('un ámbito que queda vacío desactiva la regla en vez de ampliarla', () => {
    const e = crearEstadoEjemplo();
    e.personas[4]!.restricciones.push({
      id: 'r-n', tipo: 'noAsignarA', params: { ambito: { areaIds: [A.caja], puestoIds: [] } }, dura: true, peso: 0, activa: true, nota: '',
    } as RestriccionPersona);
    expect(impactoBorrarArea(e, A.caja).efectos).toContain('La regla «Mismo bloque en Caja» se desactivará porque se queda sin puestos');
    expect(impactoBorrarArea(e, A.caja).efectos).toContain('Se desactivará una restricción de EMP-05 porque se queda sin puestos');
    const n = borrarArea(e, A.caja);
    const r = n.reglas.find((x) => x.id === 'regla-bloque-caja')!;
    expect(r.activa).toBe(false);
    expect(r.tipo === 'mismaPersonaBloque' && r.params.ambito).toEqual({ areaIds: [], puestoIds: [] });
    expect(n.reglas.find((x) => x.id === 'regla-sin-solapes')!.activa).toBe(true);
    expect(n.personas[4]!.restricciones.find((x) => x.id === 'r-n')!.activa).toBe(false);
  });
});
