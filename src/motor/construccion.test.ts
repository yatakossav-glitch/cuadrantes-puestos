import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../datos-ejemplo/ejemplo';
import { CATALOGO } from '../reglas/catalogo';
import { validarSemana } from '../validacion/validador';
import type { Asignacion, EstadoApp } from '../modelo/tipos';
import { mulberry32 } from './azar';
import { construir, cubrirVacias } from './construccion';
import type { PeticionMotor } from './contrato';
import { preparar } from './preparacion';
import { asignacionesDeUnidad, crearComprobador } from './unidades';

const LUNES = '2026-11-23';

function peticion(datos: EstadoApp): PeticionMotor {
  return { datos, lunes: LUNES, actuales: [], modo: 'desdeCero', semilla: 1, maxIteraciones: 0, limiteMs: 3000 };
}

function ejecutar(datos: EstadoApp, semilla = 1) {
  const prep = preparar(peticion(datos), CATALOGO);
  const r = construir(datos, crearComprobador(datos, CATALOGO), prep, mulberry32(semilla));
  const asignaciones: Asignacion[] = [...prep.fijas];
  prep.unidades.forEach((u, i) => {
    const p = r.personas[i];
    if (p != null) asignaciones.push(...asignacionesDeUnidad(u, p));
  });
  return { prep, r, asignaciones };
}

describe('construir', () => {
  it('cubre toda la semana del ejemplo sin incumplir ninguna regla dura (salvo comidas, que van después)', () => {
    const datos = crearEstadoEjemplo();
    const { r, asignaciones } = ejecutar(datos);
    expect(r.personas.every((p) => p !== null)).toBe(true);
    const v = validarSemana(datos, LUNES, asignaciones, CATALOGO);
    expect(v.incumplimientos.filter((i) => i.dura && i.tipo !== 'comidasEscalonadas')).toEqual([]);
  });

  it('es determinista para una misma semilla', () => {
    const datos = crearEstadoEjemplo();
    expect(ejecutar(datos, 5).r.personas).toEqual(ejecutar(datos, 5).r.personas);
  });

  it('deja sin cubrir (null) lo inviable y cubre el resto', () => {
    const datos = crearEstadoEjemplo();
    for (const p of datos.personas) p.habilitaciones = p.habilitaciones.filter((h) => h !== IDS_EJEMPLO.areas.pedidos);
    const { prep, r } = ejecutar(datos);
    prep.unidades.forEach((u, i) => {
      if (u.puestoId === IDS_EJEMPLO.puestos.pedidos) expect(r.personas[i]).toBeNull();
      else expect(r.personas[i]).not.toBeNull();
    });
  });

  it('no repite persona en un bloque de Caja (misma pareja todo el bloque)', () => {
    const datos = crearEstadoEjemplo();
    const { prep, r, asignaciones } = ejecutar(datos);
    prep.unidades.forEach((u, i) => {
      if (u.huecos.length < 2) return;
      const personas = new Set(asignaciones.filter((a) => a.tipo === 'puesto' && u.huecos.some((h) => h.franjaId === a.franjaId && h.fecha === a.fecha && a.puestoId === u.puestoId && a.plaza === u.plaza)).map((a) => a.personaId));
      expect(personas.size).toBe(1);
      expect(personas.has(r.personas[i]!)).toBe(true);
    });
  });
});

describe('construir · tiempo agotado', () => {
  it('cubre el resto con la primera candidata permitida y avisa', () => {
    const datos = crearEstadoEjemplo();
    const prep = preparar(peticion(datos), CATALOGO);
    const r = construir(datos, crearComprobador(datos, CATALOGO), prep, mulberry32(1), undefined, { reloj: () => 100, inicio: 0, limiteMs: 5 });
    expect(r.cortadoPorTiempo).toBe(true);
    expect(r.personas.every((p) => p !== null)).toBe(true);
    const asignaciones: Asignacion[] = [];
    prep.unidades.forEach((u, i) => asignaciones.push(...asignacionesDeUnidad(u, r.personas[i]!)));
    const v = validarSemana(datos, LUNES, asignaciones, CATALOGO);
    expect(v.incumplimientos.filter((i) => i.dura && i.tipo !== 'comidasEscalonadas')).toEqual([]);
  });

  it('sin agotar el tiempo no lo avisa', () => {
    const datos = crearEstadoEjemplo();
    const prep = preparar(peticion(datos), CATALOGO);
    const r = construir(datos, crearComprobador(datos, CATALOGO), prep, mulberry32(1), undefined, { reloj: () => 0, inicio: 0, limiteMs: 5 });
    expect(r.cortadoPorTiempo).toBe(false);
  });
});

describe('cubrirVacias', () => {
  it('cubre con la mejor candidata las unidades vacías que tengan alguna permitida', () => {
    const datos = crearEstadoEjemplo();
    const prep = preparar(peticion(datos), CATALOGO);
    const r = construir(datos, crearComprobador(datos, CATALOGO), prep, mulberry32(1));
    const parcial = r.personas.map((p, i) => (i % 5 === 0 ? null : p));
    const rellena = cubrirVacias(datos, crearComprobador(datos, CATALOGO), LUNES, prep.fijas, prep.unidades, parcial);
    expect(rellena.every((p) => p !== null)).toBe(true);
    const asignaciones: Asignacion[] = [];
    prep.unidades.forEach((u, i) => asignaciones.push(...asignacionesDeUnidad(u, rellena[i]!)));
    const v = validarSemana(datos, LUNES, asignaciones, CATALOGO);
    expect(v.incumplimientos.filter((i) => i.dura && i.tipo !== 'comidasEscalonadas')).toEqual([]);
  });

  it('deja vacío lo que nadie puede hacer', () => {
    const datos = crearEstadoEjemplo();
    for (const p of datos.personas) p.habilitaciones = p.habilitaciones.filter((h) => h !== IDS_EJEMPLO.areas.pedidos);
    const prep = preparar(peticion(datos), CATALOGO);
    const vacias = prep.unidades.map(() => null);
    const r = cubrirVacias(datos, crearComprobador(datos, CATALOGO), LUNES, prep.fijas, prep.unidades, vacias);
    prep.unidades.forEach((u, i) => {
      if (u.puestoId === IDS_EJEMPLO.puestos.pedidos) expect(r[i]).toBeNull();
    });
  });
});
