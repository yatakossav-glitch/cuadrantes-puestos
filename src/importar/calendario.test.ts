import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, crearEstadoVacio } from '../datos-ejemplo/ejemplo';
import { sumarDias } from '../modelo/fechas';
import { aMinutos } from '../modelo/horas';
import { equiposDesdeCalendario, horariosDesdeCalendario, leerCalendario, leerCelda, letrasPorDefecto, resumirCodigosSinHorario } from './horario';

const datos = crearEstadoEjemplo();
const vacio = crearEstadoVacio();
const letras = letrasPorDefecto(datos);
const t = (a: string, b: string) => ({ inicio: aMinutos(a), fin: aMinutos(b) });
const HOY = '2026-11-27';

/** Tabla ficticia: personas × días consecutivos desde `inicio`; el patrón decide cada celda. */
function tabla(
  personas: { codigo: string; nombre?: string }[],
  dias: number,
  celda: (p: number, d: number) => string,
  { conNombre = true }: { conNombre?: boolean } = {},
): string {
  return personas
    .map((p, i) => [p.codigo, ...(conNombre ? [p.nombre ?? ''] : []), ...Array.from({ length: dias }, (_, d) => celda(i, d))].join('\t'))
    .join('\n');
}

const personas6 = Array.from({ length: 6 }, (_, i) => ({ codigo: String(10000001 + i), nombre: `PERSONA ${['UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS'][i]}` }));
const celdaAnual = (p: number, d: number) => (d % 7 === 5 || d % 7 === 6 ? 'L  ' : d === 10 ? 'V' : d === 17 ? 'V7R' : p % 2 ? '15:20 22:10' : '08:30 14:00 17:00 21:00');

describe('leerCalendario · formato anual de la empresa', () => {
  const l = leerCalendario(tabla(personas6, 365, celdaAnual), vacio, letras, { primerDia: '2026-01-01', hoy: HOY });
  it('detecta número, nombre y 365 días', () => {
    expect(l.errores).toEqual([]);
    expect(l.filas).toHaveLength(6);
    expect(l.filas[0]).toMatchObject({ codigo: '10000001', nombre: 'PERSONA UNO', personaId: null });
    expect(l.primerDia).toBe('2026-01-01');
    expect(l.ultimoDia).toBe('2026-12-31');
    expect(l.columnas).toBe('Código en la columna 1; nombre en la columna 2; 365 días en las columnas 3 a 367');
  });
  it('semanas completas y parciales', () => {
    // 1 de enero de 2026 es jueves: la semana del 29/12/2025 queda a medias; 31/12/2026 es jueves.
    expect(l.semanasParciales).toEqual(['2025-12-29', '2026-12-28']);
    expect(l.semanas).toHaveLength(51);
    expect(l.semanas[0]).toBe('2026-01-05');
    expect(l.semanas[50]).toBe('2026-12-21');
  });
  it('lee turnos, partidos y códigos sin horario', () => {
    expect(l.filas[1]?.dias.get('2026-01-01')?.tramos).toEqual([t('15:20', '22:10')]);
    expect(l.filas[0]?.dias.get('2026-01-01')?.tramos).toEqual([t('08:30', '14:00'), t('17:00', '21:00')]);
    expect(l.filas[0]?.dias.get('2026-01-06')).toMatchObject({ libre: true, codigo: 'L' });
    expect(l.codigosSinHorario.map((c) => c.codigo)).toEqual(['L', 'V', 'V7R']);
    expect(l.codigosSinHorario[1]?.veces).toBe(6);
    expect(l.avisos.some((a) => a.startsWith('Códigos sin horario: L ('))).toBe(true);
  });
  it('resume los códigos', () => {
    expect(resumirCodigosSinHorario([{ codigo: 'L', veces: 412 }, { codigo: 'V', veces: 96 }])).toBe('Códigos sin horario: L (412), V (96): esos días no trabaja');
    expect(resumirCodigosSinHorario([])).toBeNull();
  });
  it('sin primer día y con 365 columnas propone el 1 de enero del año en curso', () => {
    const r = leerCalendario(tabla(personas6, 365, celdaAnual), vacio, letras, { primerDia: null, hoy: HOY });
    expect(r.primerDia).toBe('2026-01-01');
    expect(r.avisos.some((a) => a.includes('Se ha supuesto que la tabla empieza el 01/01/2026'))).toBe(true);
  });
  it('sin primer día y otro número de columnas pide el primer día', () => {
    const r = leerCalendario(tabla(personas6, 40, celdaAnual), vacio, letras, { primerDia: null, hoy: HOY });
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toContain('Indica el primer día de la tabla');
    expect(r.errores[0]).toContain('se han contado 40 columnas de días');
    expect(r.pidePrimerDia).toBe(true);
  });
  it('columnas vacías para todos son días cerrados', () => {
    const r = leerCalendario(tabla(personas6, 14, (p, d) => (d === 3 ? '' : 'M')), vacio, letras, { primerDia: '2026-03-02', hoy: HOY });
    expect(r.diasCerrados).toEqual(['2026-03-05']);
    expect(r.avisos.some((a) => a.startsWith('Nadie trabaja ese día (columna vacía para todos): 05/03'))).toBe(true);
    expect(r.semanas).toEqual(['2026-03-02', '2026-03-09']);
  });
  it('una hora mal escrita queda en celdasConError sin bloquear la estructura', () => {
    const r = leerCalendario(tabla(personas6, 14, (p, d) => (p === 2 && d === 1 ? '15:2O 22:10' : 'M')), vacio, letras, { primerDia: '2026-03-02', hoy: HOY });
    expect(r.errores).toEqual([]);
    expect(r.celdasConError).toHaveLength(1);
    expect(r.celdasConError[0]).toMatchObject({ codigo: '10000003', fecha: '2026-03-03' });
  });
});

describe('leerCalendario · códigos y columnas', () => {
  const celda = (p: number, d: number) => (d % 2 ? 'L' : p ? 'V7R' : '10:00 15:45');
  it('códigos alfanuméricos sin columna de nombre', () => {
    const r = leerCalendario(tabla([{ codigo: 'A1234B' }, { codigo: 'C9876D' }], 14, celda, { conNombre: false }), vacio, letras, { primerDia: '2026-03-02', hoy: HOY });
    expect(r.errores).toEqual([]);
    expect(r.filas.map((f) => [f.codigo, f.nombre])).toEqual([['A1234B', null], ['C9876D', null]]);
    expect(r.columnas).toBe('Código en la columna 1; 14 días en las columnas 2 a 15');
    expect(r.semanas).toHaveLength(2);
  });
  it('EMP-xx con nombre, y reconoce las personas existentes', () => {
    const r = leerCalendario(tabla([{ codigo: 'EMP-01', nombre: 'PERSONA UNO' }, { codigo: 'emp 2', nombre: 'PERSONA DOS' }, { codigo: 'EMP-99', nombre: 'PERSONA TRES' }], 14, () => 'M'), datos, letras, { primerDia: '2026-03-02', hoy: HOY });
    expect(r.filas.map((f) => f.codigo)).toEqual([datos.personas[0]?.codigo, datos.personas[1]?.codigo, 'EMP-99']);
    expect(r.filas[0]?.personaId).toBe(datos.personas[0]?.id);
    expect(r.codigosDesconocidos).toEqual([{ codigo: 'EMP-99', nombre: 'PERSONA TRES' }]);
  });
  it('la columna de días con códigos tipo V7R no se confunde con la de códigos', () => {
    const r = leerCalendario(tabla(personas6.slice(0, 2), 14, () => 'V7R', { conNombre: false }), vacio, letras, { primerDia: '2026-03-02', hoy: HOY });
    expect(r.filas.map((f) => f.codigo)).toEqual(['10000001', '10000002']);
  });
  it('cabecera con fechas dd/mm/aaaa', () => {
    const cab = ['Número', 'Nombre', '29/12/2025', '30/12/2025', '31/12/2025', '01/01/2026'].join('\t');
    const r = leerCalendario(`${cab}\n10000001\tPERSONA UNO\tM\tT\tL\t15:00 20:00`, vacio, letras, { primerDia: null, hoy: HOY });
    expect(r.errores).toEqual([]);
    expect(r.primerDia).toBe('2025-12-29');
    expect(r.ultimoDia).toBe('2026-01-01');
    expect(r.filas[0]?.dias.get('2026-01-01')?.tramos).toEqual([t('15:00', '20:00')]);
    expect(r.semanasParciales).toEqual(['2025-12-29']);
  });
  it('líneas sin código y repetidos', () => {
    const r = leerCalendario(['TOTAL\tx\tM', '10000001\tPERSONA UNO\tM\tM', '10000001\tPERSONA UNO\tT\tT'].join('\n'), vacio, letras, { primerDia: '2026-03-02', hoy: HOY });
    expect(r.filas).toHaveLength(2);
    expect(r.avisos.some((a) => a.includes('10000001 aparece 2 veces'))).toBe(true);
    expect(r.avisos.some((a) => a.includes('ignorado 1 línea'))).toBe(true);
  });
  it('errores de estructura', () => {
    expect(leerCalendario('  \n', vacio, letras, { primerDia: null, hoy: HOY }).errores[0]).toContain('No hay nada que leer');
    expect(leerCalendario('hola\nadiós', vacio, letras, { primerDia: null, hoy: HOY }).errores[0]).toContain('columna con los números o códigos');
  });
});

describe('leerCalendario · formato semanal (≤ 7 columnas)', () => {
  it('se comporta como una semana que empieza en el lunes del primer día', () => {
    const r = leerCalendario('EMP-01\tM\tM\tT\tT\tL\tL\tL\nEMP-02\tT\tT\tM\tM\tL\tL\tL', datos, letras, { primerDia: '2026-12-02', hoy: HOY, usarLetras: true });
    expect(r.errores).toEqual([]);
    expect(r.semanas).toEqual(['2026-11-30']);
    expect(r.semanasParciales).toEqual([]);
    expect(r.filas[0]?.dias.get('2026-12-02')?.tramos).toEqual(letras[1]?.tramos);
  });
  it('sin primer día toma la semana que viene y lo avisa', () => {
    const r = leerCalendario('EMP-01\tM\tM\tT\tT\tL\tL\tL', datos, letras, { primerDia: null, hoy: HOY, usarLetras: true });
    expect(r.semanas).toEqual(['2026-11-30']);
    expect(r.avisos[0]).toContain('No has indicado el primer día');
  });
  it('con cabecera de nombres de día usa las columnas por nombre', () => {
    const r = leerCalendario('Código\tMar\tLun\nEMP-01\tT\tM', datos, letras, { primerDia: '2026-11-30', hoy: HOY, usarLetras: true });
    expect(r.filas[0]?.dias.get('2026-11-30')?.tramos).toEqual(letras[0]?.tramos);
    expect(r.filas[0]?.dias.get('2026-12-01')?.tramos).toEqual(letras[1]?.tramos);
    expect(r.semanasParciales).toEqual(['2026-11-30']);
  });
});

describe('horariosDesdeCalendario', () => {
  const l = leerCalendario(tabla(personas6, 21, (p, d) => (d % 7 === 6 ? 'L' : '10:00 15:45')), vacio, letras, { primerDia: '2026-03-02', hoy: HOY });
  it('solo semanas completas del rango y personas con personaId', () => {
    expect(horariosDesdeCalendario(l, '2026-03-02', '2026-03-23')).toEqual(
      horariosDesdeCalendario(l, '2026-01-01', '2026-12-31'),
    );
    expect(horariosDesdeCalendario(l, '2026-03-02', '2026-03-23')).toHaveLength(3);
    expect(horariosDesdeCalendario(l, '2026-03-09', '2026-03-09')).toHaveLength(1);
    // Sin personas existentes: turnos vacíos.
    expect(horariosDesdeCalendario(l, '2026-03-02', '2026-03-02')[0]?.turnos).toEqual([]);
  });
  it('genera 7 días por persona existente, con tramos y libres', () => {
    const p = crearEstadoEjemplo();
    const codigo = p.personas[0]!.codigo;
    const r = leerCalendario(`${codigo}\tPERSONA UNO\t${Array(6).fill('10:00 15:45').join('\t')}\tL`, p, letras, { primerDia: '2026-03-02', hoy: HOY });
    const [h] = horariosDesdeCalendario(r, '2026-03-02', '2026-03-02', 'ahora');
    expect(h).toMatchObject({ lunes: '2026-03-02', actualizado: 'ahora' });
    expect(h?.turnos).toHaveLength(7);
    expect(h?.turnos[0]).toEqual({ personaId: p.personas[0]!.id, fecha: '2026-03-02', tramos: [t('10:00', '15:45')] });
    expect(h?.turnos[6]).toEqual({ personaId: p.personas[0]!.id, fecha: sumarDias('2026-03-02', 6), tramos: [] });
  });
});

describe('leerCalendario · rendimiento', () => {
  it('40 personas × 365 días en menos de 300 ms', () => {
    const personas = Array.from({ length: 40 }, (_, i) => ({ codigo: String(20000001 + i), nombre: `PERSONA ${i}` }));
    const texto = tabla(personas, 365, (p, d) => (d % 7 > 4 ? 'L  ' : (d + p) % 9 === 0 ? 'V7R' : `${8 + (p % 3)}:30 ${14 + (d % 3)}:00 17:00 21:00`));
    const ini = performance.now();
    const r = leerCalendario(texto, vacio, letras, { primerDia: '2026-01-01', hoy: HOY });
    const ms = performance.now() - ini;
    expect(r.filas).toHaveLength(40);
    expect(r.errores).toEqual([]);
    expect(ms).toBeLessThan(300);
  });
});

describe('leerCalendario · columna de nombre', () => {
  const opc = { primerDia: null, hoy: HOY };
  const hoyAnual = (nombres: string[]) => {
    const filas = nombres.map((n, i) => [String(10000001 + i), n, ...Array.from({ length: 365 }, (_, d) => (d % 7 > 4 ? 'L' : d === 3 ? 'V7R' : '15:20 22:10'))].join('\t'));
    return leerCalendario(filas.join('\n'), vacio, letras, opc);
  };
  it('un nombre corto («ANA») o con paréntesis («MARIA (H)») no desplaza los días', () => {
    const r = hoyAnual(['ANA', 'MARIA (H)', 'PERSONA UNO']);
    expect(r.errores).toEqual([]);
    expect(r.filas.map((f) => f.nombre)).toEqual(['ANA', 'MARIA (H)', 'PERSONA UNO']);
    expect(r.primerDia).toBe('2026-01-01');
    expect(r.filas[0]?.dias.get('2026-01-01')?.tramos).toEqual([t('15:20', '22:10')]);
    expect(r.filas[0]?.dias.get('2026-01-04')?.codigo).toBe('V7R');
  });
  it('una columna de nombre vacía no se toma por el 1 de enero', () => {
    const r = hoyAnual(['', '', '']);
    expect(r.errores).toEqual([]);
    expect(r.columnas).toContain('nombre en la columna 2');
    expect(r.filas[0]?.dias.get('2026-01-01')?.tramos).toEqual([t('15:20', '22:10')]);
  });
  it('sin nombre y con el número de columnas que no cuadra con un año, pide el primer día y cuenta las columnas', () => {
    const filas = ['10000001', '10000002'].map((c) => [c, ...Array.from({ length: 364 }, () => 'L')].join('\t'));
    const r = leerCalendario(filas.join('\n'), vacio, letras, opc);
    expect(r.pidePrimerDia).toBe(true);
    expect(r.errores[0]).toContain('se han contado 364 columnas de días');
  });
});

describe('leerCalendario · filas irregulares', () => {
  const opc = { primerDia: '2026-03-02', hoy: HOY };
  const fila = (codigo: string, dias: number) => [codigo, `PERSONA ${codigo.slice(-1)}`, ...Array.from({ length: dias }, () => '10:00 15:45')].join('\t');
  it('una fila corta avisa, no da por libres los días que faltan y deja esa semana sin ella', () => {
    const texto = [fila('10000001', 14), fila('10000002', 14), fila('10000003', 10)].join('\n');
    const r = leerCalendario(texto, vacio, letras, opc);
    expect(r.errores).toEqual([]);
    expect(r.avisos.some((a) => a.includes('La fila de 10000003 tiene 10 días y las demás 14'))).toBe(true);
    expect(r.filas[2]?.dias.has('2026-03-12')).toBe(false);
    const p = { ...vacio, personas: ['10000001', '10000003'].map((codigo, i) => ({ ...crearEstadoEjemplo().personas[0]!, id: `p${i}`, codigo })) };
    const l = leerCalendario(texto, p, letras, opc);
    const [s1, s2] = horariosDesdeCalendario(l, '2026-03-02', '2026-03-09');
    expect(new Set(s1?.turnos.map((x) => x.personaId))).toEqual(new Set(['p0', 'p1']));
    expect(new Set(s2?.turnos.map((x) => x.personaId))).toEqual(new Set(['p0']));
  });
  it('una fila con columnas de más avisa con su código y se ignoran las sobrantes (el ancho es el más frecuente)', () => {
    const texto = [fila('10000001', 14), fila('10000002', 14), fila('10000003', 200)].join('\n');
    const r = leerCalendario(texto, vacio, letras, opc);
    expect(r.errores).toEqual([]);
    expect(r.avisos.some((a) => a.includes('La fila de 10000003 tiene 200 días y las demás 14'))).toBe(true);
    expect(r.ultimoDia).toBe('2026-03-15');
  });
});

describe('leerCalendario · errores de celda', () => {
  const opc = { primerDia: '2026-03-02', hoy: HOY };
  it('traen la persona y solo cuenta la última fila de cada código', () => {
    const buena = (c: string, x: string) => [c, `PERSONA ${c.slice(-1)}`, x, ...Array(6).fill('L')].join('\t');
    const r = leerCalendario([buena('10000001', '15:2O 22:10'), buena('10000001', '10:00 15:45'), buena('10000002', '25:00 26:00')].join('\n'), vacio, letras, opc);
    expect(r.celdasConError).toHaveLength(1);
    expect(r.celdasConError[0]).toMatchObject({ codigo: '10000002', personaId: null, fecha: '2026-03-02' });
  });
});

describe('leerCalendario · letras de turno y códigos tipo V6H', () => {
  const texto = '10000001\tPERSONA UNO\tM\tT\tV6H\tL\tL\tL\tL';
  it('por defecto M y T son códigos sin horas', () => {
    const r = leerCalendario(texto, vacio, letras, { primerDia: '2026-03-02', hoy: HOY });
    expect(r.filas[0]?.dias.get('2026-03-02')).toMatchObject({ libre: true, codigo: 'M' });
    expect(r.celdasConError).toEqual([]);
  });
  it('con usarLetras se entienden como turnos', () => {
    const r = leerCalendario(texto, vacio, letras, { primerDia: '2026-03-02', hoy: HOY, usarLetras: true });
    expect(r.filas[0]?.dias.get('2026-03-02')?.tramos).toEqual(letras[0]?.tramos);
    expect(r.celdasConError).toEqual([]);
  });
  it('V6H, 12h y similares son códigos, no horas mal escritas', () => {
    for (const x of ['V6H', '12h', 'V7R']) expect(leerCelda(x, letras)).toMatchObject({ libre: true, error: null, codigo: x.toUpperCase() });
    expect(leerCelda('15:2O 22:10', letras).error).not.toBeNull();
    expect(leerCelda('10h-15', letras).error).toBeNull();
  });
});

describe('leerCalendario · días sin nadie', () => {
  it('avisa con las fechas y la columna vacía para todos', () => {
    const r = leerCalendario(tabla(personas6, 14, (p, d) => (d === 3 || d === 10 ? '' : '10:00 15:45')), vacio, letras, { primerDia: '2026-03-02', hoy: HOY });
    expect(r.avisos).toContain('Nadie trabaja esos días (columna vacía para todos): 05/03, 12/03. Puedes marcarlos como cerrados al guardar');
  });
});

describe('equiposDesdeCalendario', () => {
  it('M si casi todo es de mañana, T si de tarde, A si mezcla; ignora a quien no tiene tramos', () => {
    const celda = (p: number, d: number) => (p === 0 ? '08:00 14:00' : p === 1 ? '16:00 22:00' : p === 2 ? (d % 2 ? '08:00 14:00' : '16:00 22:00') : 'L');
    const l = leerCalendario(tabla(personas6.slice(0, 4), 14, celda), vacio, letras, { primerDia: '2026-03-02', hoy: HOY });
    expect([...equiposDesdeCalendario(l, aMinutos('15:45'))]).toEqual([['10000001', 'M'], ['10000002', 'T'], ['10000003', 'A']]);
    expect(equiposDesdeCalendario(l, aMinutos('15:45'), '2026-03-02', '2026-03-02').get('10000003')).toBe('T');
  });
});
