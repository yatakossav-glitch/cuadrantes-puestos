import { describe, expect, it } from 'vitest';
import { aHTML, aTSV, etiquetaExportada, tablaPlana, tablaPorArea, tablaPorPersona } from '../../src/exportar/excel';
import type { TablaExportada } from '../../src/exportar/excel';
import type { Asignacion, EstadoApp } from '../../src/modelo/tipos';
import { LUNES, P, asig, conCuadrante, datosMini, pausa, personaMini, puestoP1 } from './ayudas';

const ALIAS = 'Zorrito';

function estado(): EstadoApp {
  const d = datosMini({
    puestos: [puestoP1({ nombre: 'Caja 1', dias: [0, 1, 2, 3, 4] })],
    personas: [personaMini(1, { alias: ALIAS }), personaMini(2), personaMini(3)],
  });
  const asigs: Asignacion[] = [
    asig(0, 'p1', 'f1', P(1)),
    asig(0, 'p1', 'f2', P(1)),
    asig(0, 'p1', 'f3', P(2)),
    asig(2, 'p1', 'f1', P(3)),
    pausa(0, P(2), '14:00', '15:00'),
  ];
  return conCuadrante(d, LUNES, asigs);
}
const SIN = { sinAlias: true };
const CON = { sinAlias: false };
const planoTexto = (t: TablaExportada) => t.filas.map((f) => f.join('|')).join('\n');

describe('etiquetaExportada', () => {
  const p = personaMini(7, { alias: 'Pepa' });
  it('con alias y sinAlias=false: «EMP-07 (alias)»', () => {
    expect(etiquetaExportada(p, CON)).toBe('EMP-07 (Pepa)');
  });
  it('con sinAlias=true: solo el código', () => {
    expect(etiquetaExportada(p, SIN)).toBe('EMP-07');
  });
  it('sin alias: solo el código en ambos casos', () => {
    expect(etiquetaExportada(personaMini(7), CON)).toBe('EMP-07');
    expect(etiquetaExportada(personaMini(7), SIN)).toBe('EMP-07');
  });
});

describe('tablaPlana', () => {
  const t = tablaPlana(estado(), LUNES, SIN);
  it('cabecera con las columnas acordadas', () => {
    expect(t.filas[0]!.map((c) => c.toLowerCase())).toEqual(
      ['fecha', 'día', 'área', 'puesto', 'plaza', 'franja', 'inicio', 'fin', 'minutos', 'persona'].map((c) => c.toLowerCase()),
    );
  });
  it('una fila por asignación (puestos y pausas) más la cabecera', () => {
    expect(t.filas).toHaveLength(1 + 5);
    expect(new Set(t.filas.map((f) => f.length)).size).toBe(1);
  });
  it('fila de puesto con fecha dd/mm/aaaa, franja, inicio, fin, minutos y persona', () => {
    const fila = t.filas.find((f) => f[0] === '23/11/2026' && f.includes('10:00') && f.includes('EMP-01'))!;
    expect(fila).toBeDefined();
    expect(fila[1]!.toLowerCase().startsWith('lun')).toBe(true);
    expect(fila[2]).toBe('Área uno');
    expect(fila[3]).toBe('Caja 1');
    expect(fila[5]).toBe('10:00–11:00');
    expect(fila[6]).toBe('10:00');
    expect(fila[7]).toBe('11:00');
    expect(fila[8]).toBe('60');
    expect(fila[9]).toBe('EMP-01');
  });
  it('la comida sale con área vacía y puesto «Comida»', () => {
    const fila = t.filas.find((f) => f[3] === 'Comida')!;
    expect(fila).toBeDefined();
    expect(fila[2]).toBe('');
    expect(fila[6]).toBe('14:00');
    expect(fila[7]).toBe('15:00');
    expect(fila[8]).toBe('60');
    expect(fila[9]).toBe('EMP-02');
  });
  it('sin asignaciones: solo la cabecera', () => {
    expect(tablaPlana(datosMini(), LUNES, SIN).filas).toHaveLength(1);
  });
});

describe('tablaPorArea', () => {
  const dias = tablaPorArea(estado(), LUNES, 'a1', 'diasEnColumnas', SIN);
  const franjas = tablaPorArea(estado(), LUNES, 'a1', 'franjasEnColumnas', SIN);

  function celda(t: TablaExportada, etiquetaFila: string, etiquetaColumna: string): string {
    const col = t.filas[0]!.findIndex((c) => c.includes(etiquetaColumna));
    const fila = t.filas.slice(1).find((f) => f.slice(0, 2).some((c) => c.includes(etiquetaFila)));
    if (col < 0 || !fila) throw new Error(`No existe ${etiquetaFila} / ${etiquetaColumna}`);
    return fila[col]!;
  }

  it('días en columnas: cabecera con los 7 días con fecha', () => {
    const cab = dias.filas[0]!.join('|');
    for (const x of ['Lun 23/11', 'Mar 24/11', 'Mié 25/11', 'Jue 26/11', 'Vie 27/11', 'Sáb 28/11', 'Dom 29/11']) expect(cab).toContain(x);
  });
  it('las celdas contienen la persona o vacío', () => {
    expect(celda(dias, '10:00–11:00', 'Lun 23/11')).toBe('EMP-01');
    expect(celda(dias, '12:00–13:00', 'Lun 23/11')).toBe('EMP-02');
    expect(celda(dias, '10:00–11:00', 'Mié 25/11')).toBe('EMP-03');
    expect(celda(dias, '13:00–14:00', 'Lun 23/11')).toBe('');
  });
  it('«—» si el puesto no abre ese día', () => {
    expect(celda(dias, '10:00–11:00', 'Sáb 28/11')).toBe('—');
    expect(celda(dias, '10:00–11:00', 'Dom 29/11')).toBe('—');
  });
  it('rectangular: todas las filas con las mismas columnas', () => {
    expect(new Set(dias.filas.map((f) => f.length)).size).toBe(1);
    expect(new Set(franjas.filas.map((f) => f.length)).size).toBe(1);
  });
  it('franjas en columnas es la traspuesta', () => {
    expect(franjas.filas[0]!.join('|')).toContain('10:00–11:00');
    expect(celda(franjas, 'Lun 23/11', '10:00–11:00')).toBe('EMP-01');
    expect(celda(franjas, 'Mié 25/11', '10:00–11:00')).toBe('EMP-03');
    expect(celda(franjas, 'Sáb 28/11', '10:00–11:00')).toBe('—');
    expect(celda(franjas, 'Lun 23/11', '13:00–14:00')).toBe('');
  });
  it('mismo número de celdas de datos en ambas disposiciones', () => {
    const n = (t: TablaExportada) => t.filas.slice(1).reduce((s, f) => s + f.filter((c) => c === 'EMP-01' || c === 'EMP-02' || c === 'EMP-03').length, 0);
    expect(n(dias)).toBe(n(franjas));
    expect(n(dias)).toBe(4);
  });
  it('solo texto: sin emojis ni iconos', () => {
    expect(planoTexto(dias)).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('tablaPorPersona', () => {
  const t = tablaPorPersona(estado(), LUNES, SIN);
  it('solo personas con alguna asignación, ordenadas por código', () => {
    const codigos = t.filas.slice(1).map((f) => f[0]!);
    expect(codigos).toEqual(['EMP-01', 'EMP-02', 'EMP-03']);
  });
  it('cabecera con los días y la última columna «Horas»', () => {
    expect(t.filas[0]![t.filas[0]!.length - 1]).toBe('Horas');
    expect(t.filas[0]!.join('|')).toContain('Lun 23/11');
  });
  it('celda con puesto y franja; comida incluida; horas en h:mm', () => {
    const col = t.filas[0]!.findIndex((c) => c.includes('Lun 23/11'));
    const emp1 = t.filas.find((f) => f[0] === 'EMP-01')!;
    expect(emp1[col]).toMatch(/10:00–1[12]:00/); // franjas contiguas pueden fusionarse
    expect(emp1[col]).toContain('Caja 1');
    expect(emp1[emp1.length - 1]).toBe('2:00');
    const emp2 = t.filas.find((f) => f[0] === 'EMP-02')!;
    expect(emp2[col]).toContain('Comida');
    expect(emp2[col]).toContain('14:00–15:00');
  });
  it('filas rectangulares', () => {
    expect(new Set(t.filas.map((f) => f.length)).size).toBe(1);
  });
});

describe('alias en lo exportado', () => {
  it('con sinAlias=true el alias no aparece en ninguna tabla ni en TSV/HTML', () => {
    const e = estado();
    const tablas = [
      tablaPlana(e, LUNES, SIN),
      tablaPorPersona(e, LUNES, SIN),
      tablaPorArea(e, LUNES, 'a1', 'diasEnColumnas', SIN),
      tablaPorArea(e, LUNES, 'a1', 'franjasEnColumnas', SIN),
    ];
    for (const t of tablas) {
      expect(planoTexto(t)).not.toContain(ALIAS);
      expect(aTSV(t)).not.toContain(ALIAS);
      expect(aHTML(t)).not.toContain(ALIAS);
    }
  });
  it('con sinAlias=false el alias aparece junto al código', () => {
    const e = estado();
    expect(planoTexto(tablaPlana(e, LUNES, CON))).toContain(`EMP-01 (${ALIAS})`);
    expect(planoTexto(tablaPorArea(e, LUNES, 'a1', 'diasEnColumnas', CON))).toContain(`EMP-01 (${ALIAS})`);
  });
});

describe('aTSV', () => {
  const t: TablaExportada = { titulo: 'x', filas: [['A', 'B'], ['uno\tdos', 'tres\ncuatro'], ['', 'z']] };
  it('una línea por fila, separada por tabuladores, sin tabuladores ni saltos dentro de celdas', () => {
    const lineas = aTSV(t).replace(/\n$/, '').split('\n');
    expect(lineas).toHaveLength(3);
    for (const l of lineas) expect(l.split('\t')).toHaveLength(2);
    expect(lineas[1]).toBe('uno dos\ttres cuatro');
  });
  it('celda vacía se conserva', () => {
    expect(aTSV(t).split('\n')[2]).toBe('\tz');
  });
  it('tabla exportada real: columnas constantes', () => {
    const lineas = aTSV(tablaPlana(estado(), LUNES, SIN)).replace(/\n$/, '').split('\n');
    expect(lineas).toHaveLength(6);
    for (const l of lineas) expect(l.split('\t')).toHaveLength(10);
  });
});

describe('aHTML', () => {
  it('genera una tabla y escapa & < > "', () => {
    const t: TablaExportada = { titulo: 'T<&>', filas: [['a<b>', 'c&d'], ['say "hola"', "x>y"]] };
    const html = aHTML(t);
    expect(html).toContain('<table');
    expect(html).toContain('a&lt;b&gt;');
    expect(html).toContain('c&amp;d');
    expect(html).toContain('&quot;hola&quot;');
    expect(html).not.toContain('a<b>');
    expect(html).not.toContain('c&d');
    expect(html).not.toContain('"hola"');
  });
  it('un <tr> por fila y sin colores ni imágenes', () => {
    const t: TablaExportada = { titulo: 'T', filas: [['a'], ['b'], ['c']] };
    const html = aHTML(t);
    expect(html.match(/<tr/g)).toHaveLength(3);
    expect(html).not.toMatch(/<img|<svg|background|color/i);
  });
  it('no inyecta etiquetas desde celdas', () => {
    const html = aHTML({ titulo: 'T', filas: [['<script>alert(1)</script>']] });
    expect(html).not.toContain('<script>');
  });
});
