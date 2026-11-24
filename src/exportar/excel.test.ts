import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../datos-ejemplo/ejemplo';
import { aMinutos } from '../modelo/horas';
import type { EstadoApp, Puesto } from '../modelo/tipos';
import { aHTML, aTSV, etiquetaExportada, tablaPlana, tablaPorArea, tablaPorPersona } from './excel';

const LUNES = '2026-11-30';

function estadoConAsignaciones(): { estado: EstadoApp; caja1: Puesto } {
  const estado = crearEstadoEjemplo();
  const caja1 = estado.puestos.find((p) => p.id === IDS_EJEMPLO.puestos.caja1)!;
  const franjas = caja1.horario.general.franjas;
  const [p1, p2] = [estado.personas[6]!, estado.personas[10]!]; // EMP-07, EMP-11
  estado.cuadrantes[LUNES] = {
    lunes: LUNES,
    meta: { modo: null, semilla: null, generado: null },
    asignaciones: [
      { id: 'a1', tipo: 'puesto', fecha: LUNES, puestoId: caja1.id, franjaId: franjas[0]!.id, plaza: 0, personaId: p1.id, bloqueada: false, origen: 'manual' },
      { id: 'a2', tipo: 'puesto', fecha: LUNES, puestoId: caja1.id, franjaId: franjas[1]!.id, plaza: 0, personaId: p1.id, bloqueada: false, origen: 'manual' },
      { id: 'a3', tipo: 'puesto', fecha: LUNES, puestoId: caja1.id, franjaId: franjas[2]!.id, plaza: 0, personaId: p2.id, bloqueada: false, origen: 'manual' },
      { id: 'a4', tipo: 'pausa', fecha: LUNES, inicio: aMinutos('14:00'), fin: aMinutos('15:00'), personaId: p1.id, bloqueada: false, origen: 'manual' },
    ],
  };
  return { estado, caja1 };
}

describe('etiquetaExportada', () => {
  it('pone o quita el alias', () => {
    const p = { ...crearEstadoEjemplo().personas[6]!, alias: 'Ficticio' };
    expect(etiquetaExportada(p, { sinAlias: true })).toBe(p.codigo);
    expect(etiquetaExportada(p, { sinAlias: false })).toBe(`${p.codigo} (Ficticio)`);
    expect(etiquetaExportada({ ...p, alias: null }, { sinAlias: false })).toBe(p.codigo);
  });
});

describe('tablaPorArea', () => {
  it('días en columnas con cabecera, personas y «—»', () => {
    const { estado, caja1 } = estadoConAsignaciones();
    const t = tablaPorArea(estado, LUNES, IDS_EJEMPLO.areas.caja, 'diasEnColumnas', { sinAlias: true });
    expect(t.filas[0]).toEqual(['Puesto', 'Franja', 'Lun 30/11', 'Mar 01/12', 'Mié 02/12', 'Jue 03/12', 'Vie 04/12', 'Sáb 05/12', 'Dom 06/12']);
    const f = caja1.horario.general.franjas[0]!;
    const fila = t.filas.find((x) => x[0]!.startsWith(caja1.nombre) && x[1] === `${String(Math.floor(f.inicio / 60)).padStart(2, '0')}:${String(f.inicio % 60).padStart(2, '0')}–${String(Math.floor(f.fin / 60)).padStart(2, '0')}:${String(f.fin % 60).padStart(2, '0')}`)!;
    expect(fila[2]).toBe('EMP-07');
    expect(fila[3]).toBe('');
    expect(t.filas.every((r) => r.length === t.filas[0]!.length)).toBe(true);
    expect(t.filas.at(-1)![0]).toBe('Comidas');
    expect(t.filas.at(-1)![2]).toBe('EMP-07 14:00–15:00');
  });
  it('marca «—» cuando el puesto no abre ese día', () => {
    const { estado, caja1 } = estadoConAsignaciones();
    const sinSabado = { ...caja1, dias: caja1.dias.filter((d) => d !== 5) };
    estado.puestos = estado.puestos.map((p) => (p.id === caja1.id ? sinSabado : p));
    const t = tablaPorArea(estado, LUNES, IDS_EJEMPLO.areas.caja, 'diasEnColumnas', { sinAlias: true });
    const fila = t.filas.find((x) => x[0] === caja1.nombre)!;
    expect(fila[7]).toBe('—');
  });
  it('franjas en columnas es la traspuesta', () => {
    const { estado } = estadoConAsignaciones();
    const a = tablaPorArea(estado, LUNES, IDS_EJEMPLO.areas.caja, 'diasEnColumnas', { sinAlias: true });
    const b = tablaPorArea(estado, LUNES, IDS_EJEMPLO.areas.caja, 'franjasEnColumnas', { sinAlias: true });
    expect(b.filas[0]![0]).toBe('Día');
    expect(b.filas).toHaveLength(8);
    expect(b.filas[1]![0]).toBe('Lun 30/11');
    expect(b.filas[1]!.at(-1)).toBe('EMP-07 14:00–15:00'); // columna Comidas
    expect(b.filas[0]).toHaveLength(a.filas.length - 2 + 1 + 1);
  });
  it('un área inactiva o inexistente no da filas de puestos', () => {
    const { estado } = estadoConAsignaciones();
    const t = tablaPorArea(estado, LUNES, IDS_EJEMPLO.areas.libreria, 'diasEnColumnas', { sinAlias: true });
    expect(t.filas).toHaveLength(1);
  });
});

describe('tablaPorPersona', () => {
  it('une franjas contiguas, añade comidas y suma horas', () => {
    const { estado, caja1 } = estadoConAsignaciones();
    const t = tablaPorPersona(estado, LUNES, { sinAlias: true });
    expect(t.filas.map((f) => f[0])).toEqual(['Persona', 'EMP-07', 'EMP-11']);
    const f = caja1.horario.general.franjas;
    const total = f[0]!.fin - f[0]!.inicio + f[1]!.fin - f[1]!.inicio;
    const fila = t.filas[1]!;
    expect(fila[1]).toMatch(new RegExp(`^${caja1.nombre} \\d\\d:\\d\\d–\\d\\d:\\d\\d; Comida 14:00–15:00$`));
    expect(fila.at(-1)).toBe(`${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`);
    expect(t.filas[0]!.at(-1)).toBe('Horas');
  });
});

describe('tablaPlana', () => {
  it('lista puestos y comidas, sin alias por defecto', () => {
    const { estado } = estadoConAsignaciones();
    estado.personas[6] = { ...estado.personas[6]!, alias: 'Ficticio' };
    const t = tablaPlana(estado, LUNES, { sinAlias: true });
    expect(t.filas[0]).toEqual(['Fecha', 'Día', 'Área', 'Puesto', 'Plaza', 'Franja', 'Inicio', 'Fin', 'Minutos', 'Persona']);
    expect(t.filas).toHaveLength(5);
    expect(t.filas[1]!.slice(0, 2)).toEqual(['30/11/2026', 'Lun']);
    expect(t.filas[1]![9]).toBe('EMP-07');
    expect(t.filas[4]).toEqual(['30/11/2026', 'Lun', '', 'Comida', '', '14:00–15:00', '14:00', '15:00', '60', 'EMP-07']);
    expect(tablaPlana(estado, LUNES, { sinAlias: false }).filas[1]![9]).toBe('EMP-07 (Ficticio)');
  });
  it('incluye una asignación fuera de horario', () => {
    const { estado, caja1 } = estadoConAsignaciones();
    const sinLunes = { ...caja1, dias: caja1.dias.filter((d) => d !== 0) };
    estado.puestos = estado.puestos.map((p) => (p.id === caja1.id ? sinLunes : p));
    expect(tablaPlana(estado, LUNES, { sinAlias: true }).filas).toHaveLength(5);
  });
  it('sin cuadrante solo hay cabecera', () => {
    expect(tablaPlana(crearEstadoEjemplo(), LUNES, { sinAlias: true }).filas).toHaveLength(1);
  });
});

describe('aTSV y aHTML', () => {
  const t = { titulo: 'x', filas: [['A', 'B'], ['a\tb\nc', 'x<y & "z"']] };
  it('TSV sustituye tabuladores y saltos', () => {
    expect(aTSV(t)).toBe('A\tB\na b c\tx<y & "z"');
  });
  it('neutraliza fórmulas con apóstrofo y respeta la raya y las horas', () => {
    const f = { titulo: 'x', filas: [['=1+1', '+2', '-3', '@SUMA', '  =A1', '—', '10:00–11:30', 'EMP-07']] };
    expect(aTSV(f)).toBe("'=1+1\t'+2\t'-3\t'@SUMA\t'  =A1\t—\t10:00–11:30\tEMP-07");
    const h = aHTML(f);
    expect(h).toContain('>\'=1+1<');
    expect(h).toContain('>—<');
    expect(h).toContain('>10:00–11:30<');
  });
  it('HTML escapa y no lleva iconos ni colores', () => {
    const h = aHTML(t);
    expect(h).toContain('x&lt;y &amp; &quot;z&quot;');
    expect(h).toContain('<th');
    expect(h).not.toMatch(/color|<svg|<img/);
  });
});

describe('vigencia del puesto en la exportación', () => {
  it('pone «—» en los días fuera de la vigencia', () => {
    const { estado, caja1 } = estadoConAsignaciones();
    caja1.vigenteDesde = '2026-12-01';
    const t = tablaPorArea(estado, LUNES, caja1.areaId, 'diasEnColumnas', { sinAlias: true });
    const fila = t.filas.find((f) => f[0]!.startsWith('Caja 1'))!;
    expect(fila[2]).toBe('—');
    expect(fila[3]).toBe('');
  });
});
