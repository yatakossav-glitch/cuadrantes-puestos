/** Caja negra: copias de seguridad (§2) según ARQUITECTURA.md §6 y §8.2. */
import { describe, expect, it } from 'vitest';
import { gunzipSync, gzipSync } from 'node:zlib';
import { crearEstadoEjemplo, crearEstadoVacio } from '../../src/datos-ejemplo/ejemplo';
import { exportarRespaldo, importarRespaldo } from '../../src/persistencia/respaldo';
import { FORMATO_RESPALDO, PREFIJO_RESPALDO, VERSION_ESQUEMA } from '../../src/modelo/esquema';
import type { EstadoApp } from '../../src/modelo/tipos';

const AHORA = new Date('2026-11-24T10:00:00.000Z');

/** Descomprime el texto exportado a su JSON, con node:zlib (independiente de la implementación). */
function descomprimir(texto: string): string {
  expect(texto.startsWith(PREFIJO_RESPALDO)).toBe(true);
  return gunzipSync(Buffer.from(texto.slice(PREFIJO_RESPALDO.length), 'base64')).toString('utf8');
}
function comprimir(obj: unknown): string {
  return PREFIJO_RESPALDO + gzipSync(Buffer.from(JSON.stringify(obj), 'utf8')).toString('base64');
}
async function respaldoJson(estado: EstadoApp, sinAlias = false) {
  return JSON.parse(descomprimir(await exportarRespaldo(estado, { sinAlias }, AHORA)));
}
function conPersonas(codigos: string[]): EstadoApp {
  const s = crearEstadoEjemplo();
  const base = s.personas[0];
  s.personas = codigos.map((c, i) => ({ ...structuredClone(base), id: `per-x${i}`, codigo: c, habilitaciones: [] }));
  return s;
}

describe('exportarRespaldo', () => {
  it('empieza por el prefijo y el resto es base64 válido sin saltos de línea', async () => {
    const t = await exportarRespaldo(crearEstadoEjemplo(), { sinAlias: false }, AHORA);
    expect(t.startsWith(PREFIJO_RESPALDO)).toBe(true);
    expect(t.slice(PREFIJO_RESPALDO.length)).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(t).not.toMatch(/\s/);
  });

  it('el contenido descomprimido es un Respaldo con formato, versión, fecha y estado', async () => {
    const estado = crearEstadoEjemplo();
    const r = await respaldoJson(estado);
    expect(r.formato).toBe(FORMATO_RESPALDO);
    expect(r.version).toBe(VERSION_ESQUEMA);
    expect(r.exportado).toBe(AHORA.toISOString());
    expect(r.sinAlias).toBe(false);
    expect(r.estado).toEqual(estado);
  });

  it('es más corto que el JSON plano (va comprimido)', async () => {
    const estado = crearEstadoEjemplo();
    const t = await exportarRespaldo(estado, { sinAlias: false }, AHORA);
    expect(t.length).toBeLessThan(JSON.stringify(estado).length);
  });
});

describe('ida y vuelta', () => {
  it('estado de ejemplo: importar(exportar(x)) devuelve el mismo estado, sin avisos', async () => {
    const estado = crearEstadoEjemplo();
    const res = await importarRespaldo(await exportarRespaldo(estado, { sinAlias: false }, AHORA));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.estado).toEqual(estado);
    expect(res.versionOrigen).toBe(VERSION_ESQUEMA);
    expect(res.avisos).toEqual([]);
  });

  it('estado vacío', async () => {
    const estado = crearEstadoVacio();
    const res = await importarRespaldo(await exportarRespaldo(estado, { sinAlias: false }, AHORA));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.estado).toEqual(estado);
  });

  it('conserva alias, acentos y caracteres no ASCII cuando no se excluyen', async () => {
    const estado = crearEstadoEjemplo();
    estado.personas[2].alias = 'Ñandú · ü ✓';
    const res = await importarRespaldo(await exportarRespaldo(estado, { sinAlias: false }, AHORA));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.estado.personas[2].alias).toBe('Ñandú · ü ✓');
  });

  it('conserva un cuadrante con asignaciones', async () => {
    const estado = crearEstadoEjemplo();
    estado.cuadrantes['2026-11-23'] = {
      lunes: '2026-11-23',
      asignaciones: [
        { id: 'asg-1', tipo: 'puesto', fecha: '2026-11-23', puestoId: estado.puestos[0].id, franjaId: estado.puestos[0].horario.general.franjas[0].id, plaza: 0, personaId: estado.personas[0].id, bloqueada: true, origen: 'manual' },
      ],
      meta: { modo: null, semilla: null, generado: null },
    };
    const res = await importarRespaldo(await exportarRespaldo(estado, { sinAlias: false }, AHORA));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.estado).toEqual(estado);
  });
});

describe('«exportar sin alias»', () => {
  const ALIAS = ['Zaragoza-Secreto', 'OtroAliasRaro'];
  function estadoConAlias(): EstadoApp {
    const s = crearEstadoEjemplo();
    s.personas[0].alias = ALIAS[0];
    s.personas[5].alias = ALIAS[1];
    return s;
  }

  it('con alias incluidos, el texto descomprimido sí los contiene (control)', async () => {
    const json = descomprimir(await exportarRespaldo(estadoConAlias(), { sinAlias: false }, AHORA));
    for (const a of ALIAS) expect(json).toContain(a);
  });

  it('sin alias, el texto descomprimido no contiene ningún alias y marca sinAlias', async () => {
    const json = descomprimir(await exportarRespaldo(estadoConAlias(), { sinAlias: true }, AHORA));
    for (const a of ALIAS) expect(json).not.toContain(a);
    const r = JSON.parse(json);
    expect(r.sinAlias).toBe(true);
    for (const p of r.estado.personas) expect(p.alias).toBeNull();
  });

  it('no modifica el estado original', async () => {
    const s = estadoConAlias();
    const copia = structuredClone(s);
    await exportarRespaldo(s, { sinAlias: true }, AHORA);
    expect(s).toEqual(copia);
    expect(s.personas[0].alias).toBe(ALIAS[0]);
  });

  it('al importarlo, todos los alias son null y el resto de datos se conserva', async () => {
    const s = estadoConAlias();
    const res = await importarRespaldo(await exportarRespaldo(s, { sinAlias: true }, AHORA));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.estado.personas.every((p) => p.alias === null)).toBe(true);
    expect(res.estado.personas.map((p) => p.codigo)).toEqual(s.personas.map((p) => p.codigo));
    expect(res.estado.puestos).toEqual(s.puestos);
    expect(res.estado.reglas).toEqual(s.reglas);
  });
});

describe('tolerancia del texto pegado', () => {
  it('con espacios al principio y al final', async () => {
    const t = await exportarRespaldo(crearEstadoEjemplo(), { sinAlias: false }, AHORA);
    const res = await importarRespaldo(`  \n ${t} \n\n `);
    expect(res.ok).toBe(true);
  });

  it('con saltos de línea pegados cada 60 caracteres (y con \\r\\n)', async () => {
    const estado = crearEstadoEjemplo();
    const t = await exportarRespaldo(estado, { sinAlias: false }, AHORA);
    for (const sep of ['\n', '\r\n']) {
      const partido = t.match(/.{1,60}/g)!.join(sep);
      const res = await importarRespaldo(partido);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.estado).toEqual(estado);
    }
  });

  it('con saltos de línea justo después del prefijo y espacios intercalados', async () => {
    const t = await exportarRespaldo(crearEstadoEjemplo(), { sinAlias: false }, AHORA);
    const cuerpo = t.slice(PREFIJO_RESPALDO.length);
    const res = await importarRespaldo(`${PREFIJO_RESPALDO}\n${cuerpo.slice(0, 100)} \t ${cuerpo.slice(100)}`);
    expect(res.ok).toBe(true);
  });
});

describe('importaciones erróneas: nunca lanzan y dan error en español', () => {
  async function esperarError(texto: string, patron?: RegExp) {
    const res = await importarRespaldo(texto);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.length).toBeGreaterThan(5);
      if (patron) expect(res.error).toMatch(patron);
    }
  }

  it('texto vacío o solo espacios', async () => {
    await esperarError('');
    await esperarError('   \n  ');
  });

  it('texto ajeno sin prefijo', async () => {
    await esperarError('hola, esto no es una copia', /prefijo|copia|reconoc|no (es|parece)|v[aá]lid/i);
    await esperarError('{"formato":"cuadrantes-puestos"}');
  });

  it('el prefijo solo', async () => {
    await esperarError(PREFIJO_RESPALDO);
  });

  it('prefijo con base64 inválido', async () => {
    await esperarError(PREFIJO_RESPALDO + '!!!!no-es-base64@@@@');
  });

  it('prefijo con base64 válido pero que no es gzip', async () => {
    await esperarError(PREFIJO_RESPALDO + Buffer.from('texto plano cualquiera').toString('base64'));
  });

  it('gzip válido pero que no es JSON', async () => {
    await esperarError(PREFIJO_RESPALDO + gzipSync(Buffer.from('esto no es json {')).toString('base64'));
  });

  it('texto truncado', async () => {
    const t = await exportarRespaldo(crearEstadoEjemplo(), { sinAlias: false }, AHORA);
    await esperarError(t.slice(0, Math.floor(t.length / 2)));
  });

  it('texto con un carácter dañado en medio', async () => {
    const t = await exportarRespaldo(crearEstadoEjemplo(), { sinAlias: false }, AHORA);
    const m = Math.floor(t.length / 2);
    const res = await importarRespaldo(t.slice(0, m) + '#' + t.slice(m + 1));
    expect(res.ok).toBe(false);
  });

  it('JSON ajeno: otro formato', async () => {
    const r = await respaldoJson(crearEstadoEjemplo());
    await esperarError(comprimir({ ...r, formato: 'otra-aplicacion' }), /formato/i);
    await esperarError(comprimir({ cosa: 1 }));
    await esperarError(comprimir([1, 2, 3]));
    await esperarError(comprimir(null));
  });

  it('versión futura: se rechaza con un mensaje sobre la versión', async () => {
    const r = await respaldoJson(crearEstadoEjemplo());
    await esperarError(comprimir({ ...r, version: VERSION_ESQUEMA + 1 }), /versi[oó]n|moderna|nueva|actualiz/i);
    await esperarError(comprimir({ ...r, version: 999 }), /versi[oó]n|moderna|nueva|actualiz/i);
  });

  it('versión 0, negativa o no numérica: se rechaza', async () => {
    const r = await respaldoJson(crearEstadoEjemplo());
    await esperarError(comprimir({ ...r, version: 0 }));
    await esperarError(comprimir({ ...r, version: -1 }));
    await esperarError(comprimir({ ...r, version: 'uno' }));
  });

  it('estructura incorrecta: sin estado, o estado con colecciones que no son listas', async () => {
    const r = await respaldoJson(crearEstadoEjemplo());
    const { estado: _quitado, ...sinEstado } = r;
    await esperarError(comprimir(sinEstado));
    await esperarError(comprimir({ ...r, estado: { ...r.estado, personas: 'EMP-01' } }));
    await esperarError(comprimir({ ...r, estado: { ...r.estado, config: null } }));
  });
});

describe('avisos de coherencia (no bloquean la importación)', () => {
  async function importar(estado: EstadoApp) {
    const res = await importarRespaldo(await exportarRespaldo(estado, { sinAlias: false }, AHORA));
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    return res;
  }

  it('EMP-07 frente a « emp-7 »: duplicado probable', async () => {
    const res = await importar(conPersonas(['EMP-07', ' emp-7']));
    expect(res.avisos.length).toBeGreaterThanOrEqual(1);
    expect(res.avisos.join('\n')).toMatch(/EMP-07|emp-7/i);
  });

  it('EMP-07 frente a EMP-007 y a «EMP-7 »', async () => {
    const res = await importar(conPersonas(['EMP-07', 'EMP-007', 'EMP-7 ']));
    expect(res.avisos.length).toBeGreaterThanOrEqual(1);
  });

  it('código repetido exacto', async () => {
    const res = await importar(conPersonas(['EMP-01', 'EMP-01']));
    expect(res.avisos.length).toBeGreaterThanOrEqual(1);
  });

  it('códigos distintos no avisan por duplicados', async () => {
    const res = await importar(conPersonas(['EMP-01', 'EMP-02', 'EMP-17']));
    expect(res.avisos).toEqual([]);
  });

  it('EMP-17 y EMP-71 no se confunden (los dígitos importan)', async () => {
    const res = await importar(conPersonas(['EMP-17', 'EMP-71']));
    expect(res.avisos).toEqual([]);
  });

  it('referencia huérfana: habilitación a un área inexistente', async () => {
    const s = crearEstadoEjemplo();
    s.personas[0].habilitaciones.push('area-que-no-existe');
    const res = await importar(s);
    expect(res.avisos.length).toBeGreaterThanOrEqual(1);
    expect(res.avisos.join('\n')).toMatch(/EMP-01|area-que-no-existe|habilitaci/);
  });

  it('referencia huérfana: puesto de un área inexistente', async () => {
    const s = crearEstadoEjemplo();
    s.puestos[0].areaId = 'area-fantasma';
    const res = await importar(s);
    expect(res.avisos.length).toBeGreaterThanOrEqual(1);
  });

  it('franja mal formada (fin antes que inicio)', async () => {
    const s = crearEstadoEjemplo();
    const f = s.puestos[0].horario.general.franjas[0];
    f.fin = f.inicio - 10;
    const res = await importar(s);
    expect(res.avisos.length).toBeGreaterThanOrEqual(1);
  });

  it('franjas solapadas dentro del mismo puesto', async () => {
    const s = crearEstadoEjemplo();
    const fr = s.puestos[1].horario.general.franjas;
    fr[1].inicio = fr[0].fin - 30;
    const res = await importar(s);
    expect(res.avisos.length).toBeGreaterThanOrEqual(1);
  });
});
