import { describe, expect, it } from 'vitest';
import { PREFIJO_RESPALDO, VERSION_ESQUEMA } from '../modelo/esquema';
import type { EstadoApp, Persona } from '../modelo/tipos';
 import { exportarRespaldo, importarRespaldo } from './respaldo';

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

const AHORA = new Date('2026-11-24T10:00:00Z');

describe('exportarRespaldo / importarRespaldo', () => {
  it('ida y vuelta idéntica', async () => {
    const e = estadoMinimo();
    const texto = await exportarRespaldo(e, { sinAlias: false }, AHORA);
    expect(texto.startsWith(PREFIJO_RESPALDO)).toBe(true);
    const r = await importarRespaldo(texto);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.estado).toEqual(e);
      expect(r.estado.personas[0]!.alias).toBe('Alias ñandú');
      expect(r.versionOrigen).toBe(VERSION_ESQUEMA);
      expect(r.avisos).toEqual([]);
    }
  });

  it('sinAlias pone los alias a null sin mutar el original', async () => {
    const e = estadoMinimo();
    const r = await importarRespaldo(await exportarRespaldo(e, { sinAlias: true }, AHORA));
    expect(r.ok && r.estado.personas.every((p) => p.alias === null)).toBe(true);
    expect(e.personas[0]!.alias).toBe('Alias ñandú');
  });

  it('tolera espacios y saltos de línea en el texto pegado', async () => {
    const e = estadoMinimo();
    const texto = await exportarRespaldo(e, { sinAlias: false }, AHORA);
    const troceado = '  ' + texto.replace(/(.{40})/g, '$1\n') + '\r\n  ';
    const r = await importarRespaldo(troceado);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.estado).toEqual(e);
  });

  it('maneja estados grandes sin desbordar la pila', async () => {
    const e = estadoMinimo();
    for (let i = 0; i < 6000; i++) {
      e.personas.push({ ...e.personas[1]!, id: `x${i}`, codigo: `EMP-${100 + i}`, alias: Math.random().toString(36) });
    }
    const texto = await exportarRespaldo(e, { sinAlias: false }, AHORA);
    const r = await importarRespaldo(texto);
    expect(r.ok && r.estado.personas.length).toBe(6002);
  });

  it('rechaza texto sin prefijo', async () => {
    const r = await importarRespaldo('hola mundo');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('no empieza');
    expect((await importarRespaldo('')).ok).toBe(false);
  });

  it('rechaza base64 dañado y gzip dañado', async () => {
    expect((await importarRespaldo(PREFIJO_RESPALDO + '@@@no-base64@@@')).ok).toBe(false);
    const r = await importarRespaldo(PREFIJO_RESPALDO + btoa('esto no es gzip'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('dañada');
    const texto = await exportarRespaldo(estadoMinimo(), { sinAlias: false }, AHORA);
    expect((await importarRespaldo(texto.slice(0, texto.length - 30))).ok).toBe(false);
  });

  async function respaldoDe(objeto: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(objeto));
    const flujo = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    const comprimido = new Uint8Array(await new Response(flujo).arrayBuffer());
    let bin = '';
    for (const b of comprimido) bin += String.fromCharCode(b);
    return PREFIJO_RESPALDO + btoa(bin);
  }

  it('rechaza un formato distinto', async () => {
    const r = await importarRespaldo(await respaldoDe({ formato: 'otra-cosa', version: 1, estado: estadoMinimo() }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('formato');
  });

  it('rechaza una versión futura', async () => {
    const r = await importarRespaldo(await respaldoDe({ formato: 'cuadrantes-puestos', version: VERSION_ESQUEMA + 1, estado: estadoMinimo() }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('más moderna');
  });

  it('rechaza una estructura incorrecta', async () => {
    const r = await importarRespaldo(await respaldoDe({ formato: 'cuadrantes-puestos', version: 1, estado: { config: {} } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('formato esperado');
  });

  it('devuelve avisos de duplicados y huérfanos', async () => {
    const e = estadoMinimo();
    e.personas[0]!.codigo = 'EMP-07';
    e.personas[1]!.codigo = 'emp-7';
    e.incidencias[0] = { id: 'i1', tipo: 'ausencia', personaId: 'fantasma', desde: '2026-11-24', hasta: '2026-11-24', tramo: null, nota: '' };
    const r = await importarRespaldo(await exportarRespaldo(e, { sinAlias: false }, AHORA));
    expect(r.ok && r.avisos.length).toBe(2);
  });

  it('importa una copia de versión 1 (sin vigencia) y la migra a null/null', async () => {
    const antiguo = structuredClone(estadoMinimo()) as unknown as { puestos: Record<string, unknown>[] };
    for (const p of antiguo.puestos) {
      delete p['vigenteDesde'];
      delete p['vigenteHasta'];
    }
    const r = await importarRespaldo(await respaldoDe({ formato: 'cuadrantes-puestos', version: 1, estado: antiguo }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.versionOrigen).toBe(1);
      expect(r.estado.puestos[0]).toMatchObject({ vigenteDesde: null, vigenteHasta: null });
    }
  });
});
