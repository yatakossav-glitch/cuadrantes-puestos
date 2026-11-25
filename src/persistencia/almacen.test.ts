import { describe, expect, it } from 'vitest';
import { CLAVE_ALMACEN, VERSION_ESQUEMA } from '../modelo/esquema';
import type { EstadoApp, Persona } from '../modelo/tipos';
 import { cargarEstado, guardarEstado, obtenerAlmacenNavegador, type AlmacenClaveValor } from './almacen';

function estadoMinimo(): EstadoApp {
  const franjas = [
    { id: 'f1', inicio: 600, fin: 690 },
    { id: 'f2', inicio: 690, fin: 780 },
  ];
  const persona = (n: number, alias: string | null): Persona => ({
    id: `p${n}`,
    codigo: `EMP-${String(n).padStart(2, '0')}`,
    alias,
    equipo: 'M',
    habilitaciones: ['a1'],
    activa: true,
    alta: null,
    baja: null,
    contratoMinSemana: null,
    objetivoCoberturaMinSemana: null,
    restricciones: [],
    patron: [],
  });
  return {
    config: { corteMananaTarde: 945, exportacionArea: 'diasEnColumnas', semilla: 1, limiteMotorMs: 3000 },
    areas: [{ id: 'a1', nombre: 'Caja', planta: 3, color: '#336699', icono: 'caja', activa: true, orden: 0 }],
    puestos: [
      {
        id: 'u1',
        areaId: 'a1',
        nombre: 'Caja 1',
        plazas: 1,
        dias: [0, 1, 2, 3, 4, 5, 6],
        horario: { general: { franjas, bloques: [{ id: 'b1', nombre: 'Mañana', franjaIds: ['f1', 'f2'] }] }, porDia: {} },
        requiereHabilitacion: true,
        activo: true,
        vigenteDesde: null,
        vigenteHasta: null,
        orden: 0,
      },
    ],
    personas: [persona(1, 'Alias ñandú'), persona(2, null)],
    reglas: [
      { id: 'r1', tipo: 'sinSolapes', params: {}, dura: true, peso: 1, activa: true, estado: 'pendiente', nombre: 'Sin solapes', nota: '' },
    ],
    rotacion: { longitudCiclo: 2, lunesReferencia: '2026-11-23', etiquetas: ['A', 'B'] },
    semanasTipo: [],
    incidencias: [{ id: 'i1', tipo: 'ausencia', personaId: 'p2', desde: '2026-11-24', hasta: '2026-11-25', tramo: null, nota: '' }],
    horarios: {},
    cuadrantes: {
      '2026-11-23': {
        lunes: '2026-11-23',
        asignaciones: [
          { id: 's1', tipo: 'puesto', fecha: '2026-11-23', puestoId: 'u1', franjaId: 'f1', plaza: 0, personaId: 'p1', bloqueada: false, origen: 'manual' },
        ],
        meta: { modo: null, semilla: null, generado: null },
      },
    },
  };
}

function almacenMemoria(): AlmacenClaveValor & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, v),
    removeItem: (k) => void datos.delete(k),
  };
}

describe('guardarEstado y cargarEstado', () => {
  it('ida y vuelta idéntica', () => {
    const a = almacenMemoria();
    const e = estadoMinimo();
    expect(guardarEstado(e, a, new Date('2026-11-24T10:00:00Z'))).toEqual({ ok: true });
    const doc = JSON.parse(a.datos.get(CLAVE_ALMACEN)!);
    expect(doc.version).toBe(VERSION_ESQUEMA);
    expect(doc.guardado).toBe('2026-11-24T10:00:00.000Z');
    const r = cargarEstado(a);
    expect(r.tipo).toBe('ok');
    if (r.tipo === 'ok') {
      expect(r.estado).toEqual(e);
      expect(r.versionOrigen).toBe(VERSION_ESQUEMA);
      expect(r.avisos).toEqual([]);
    }
  });

  it('cargar datos de versión 1 (sin vigencia) los migra y deja null/null', () => {
    const antiguo = structuredClone(estadoMinimo()) as unknown as { puestos: Record<string, unknown>[] };
    for (const p of antiguo.puestos) {
      delete p['vigenteDesde'];
      delete p['vigenteHasta'];
    }
    const a = almacenMemoria();
    a.datos.set(CLAVE_ALMACEN, JSON.stringify({ version: 1, estado: antiguo }));
    const r = cargarEstado(a);
    expect(r.tipo).toBe('ok');
    if (r.tipo === 'ok') {
      expect(r.versionOrigen).toBe(1);
      expect(r.estado.puestos[0]).toMatchObject({ vigenteDesde: null, vigenteHasta: null });
    }
  });

  it('cargar datos de versión 2 (sin horarios) los migra y deja horarios vacío', () => {
    const antiguo = structuredClone(estadoMinimo()) as unknown as Record<string, unknown>;
    delete antiguo['horarios'];
    const a = almacenMemoria();
    a.datos.set(CLAVE_ALMACEN, JSON.stringify({ version: 2, estado: antiguo }));
    const r = cargarEstado(a);
    expect(r.tipo).toBe('ok');
    if (r.tipo === 'ok') {
      expect(r.versionOrigen).toBe(2);
      expect(r.estado.horarios).toEqual({});
    }
  });

  it('almacén vacío o null → vacio', () => {
    expect(cargarEstado(almacenMemoria())).toEqual({ tipo: 'vacio' });
    expect(cargarEstado(null)).toEqual({ tipo: 'vacio' });
  });

  it('guardar con almacén null falla con mensaje', () => {
    const r = guardarEstado(estadoMinimo(), null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Exportar datos');
  });

  it('setItem que lanza por cuota → ok false con mensaje de espacio', () => {
    const a = almacenMemoria();
    a.setItem = () => {
      throw new DOMException('lleno', 'QuotaExceededError');
    };
    const r = guardarEstado(estadoMinimo(), a);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('espacio');
  });

  it('setItem que lanza otro error → ok false genérico', () => {
    const a = almacenMemoria();
    a.setItem = () => {
      throw new Error('bloqueado');
    };
    const r = guardarEstado(estadoMinimo(), a);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('No se han podido guardar');
  });

  it('JSON corrupto → error', () => {
    const a = almacenMemoria();
    a.datos.set(CLAVE_ALMACEN, '{no es json');
    const r = cargarEstado(a);
    expect(r.tipo).toBe('error');
  });

  it('documento sin versión, de versión futura o con estructura incorrecta → error', () => {
    const a = almacenMemoria();
    a.datos.set(CLAVE_ALMACEN, JSON.stringify({ estado: {} }));
    expect(cargarEstado(a).tipo).toBe('error');
    a.datos.set(CLAVE_ALMACEN, JSON.stringify({ version: 99, estado: estadoMinimo() }));
    const futuro = cargarEstado(a);
    expect(futuro.tipo).toBe('error');
    a.datos.set(CLAVE_ALMACEN, JSON.stringify({ version: 1, estado: { config: {} } }));
    expect(cargarEstado(a).tipo).toBe('error');
    a.datos.set(CLAVE_ALMACEN, '[]');
    expect(cargarEstado(a).tipo).toBe('error');
  });

  it('getItem que lanza → error sin lanzar', () => {
    const a = almacenMemoria();
    a.getItem = () => {
      throw new Error('x');
    };
    expect(cargarEstado(a).tipo).toBe('error');
  });

  it('devuelve avisos de coherencia al cargar', () => {
    const a = almacenMemoria();
    const e = estadoMinimo();
    e.personas[0]!.codigo = 'EMP-07';
    e.personas[1]!.codigo = 'emp-7';
    guardarEstado(e, a);
    const r = cargarEstado(a);
    expect(r.tipo === 'ok' && r.avisos.length).toBe(1);
  });
});

describe('obtenerAlmacenNavegador', () => {
  it('devuelve null en Node (sin localStorage) sin lanzar', () => {
    expect(() => obtenerAlmacenNavegador()).not.toThrow();
  });
});
