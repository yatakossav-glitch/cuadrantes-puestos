import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, crearEstadoVacio } from '../datos-ejemplo/ejemplo';
import { aMinutos } from '../modelo/horas';
import { codigoCanonico, leerCelda, leerHorario, letrasPorDefecto } from './horario';

const LUNES = '2026-11-30';
const datos = crearEstadoEjemplo();
const letras = letrasPorDefecto(datos);
const t = (a: string, b: string) => ({ inicio: aMinutos(a), fin: aMinutos(b) });
const M = [t('10:00', '15:45')];
const T = [t('15:45', '22:00')];

describe('letrasPorDefecto', () => {
  it('M y T con el corte de la configuración y los límites de los puestos', () => {
    expect(letras).toEqual([
      { letra: 'M', nombre: 'Mañana', tramos: M },
      { letra: 'T', nombre: 'Tarde', tramos: T },
    ]);
  });
  it('sin puestos usa 10:00 y 22:00', () => {
    expect(letrasPorDefecto(crearEstadoVacio())[0]?.tramos).toEqual(M);
  });
});

describe('leerCelda · horas con espacios y códigos', () => {
  it('«HH:MM HH:MM» con uno o varios espacios', () => {
    expect(leerCelda('15:20 22:10', letras).tramos).toEqual([t('15:20', '22:10')]);
    expect(leerCelda('  15:20    22:10 ', letras)).toMatchObject({ libre: false, error: null, tramos: [t('15:20', '22:10')] });
  });
  it('combinación partida: dos tramos', () => {
    expect(leerCelda('08:30 14:00 17:00 21:00', letras).tramos).toEqual([t('08:30', '14:00'), t('17:00', '21:00')]);
    expect(leerCelda('08:30 14:00 / 17:00 21:00', letras).tramos).toHaveLength(2);
  });
  it('texto sin horas: libre y con su código', () => {
    for (const [s, c] of [['L  ', 'L'], ['V', 'V'], ['V7R', 'V7R'], ['vks', 'VKS'], ['xx', 'XX'], ['baja médica', 'BAJAMÉDICA']] as const) {
      expect(leerCelda(s, letras)).toMatchObject({ libre: true, tramos: [], error: null, codigo: c });
    }
    expect(leerCelda('   ', letras).codigo).toBeUndefined();
  });
  it('horas mal escritas son error', () => {
    for (const s of ['15:2O 22:10', '25:00 26:00', '22:10 15:20', '15:20', '15:20 22:10 17:00']) {
      expect(leerCelda(s, letras).error, s).not.toBeNull();
    }
  });
  it('las letras de turno definidas siguen valiendo', () => {
    expect(leerCelda('M', letras).tramos).toEqual(M);
    expect(leerCelda('m', letras).codigo).toBeUndefined();
  });
});

describe('leerCelda', () => {
  const tramos = (s: string) => leerCelda(s, letras).tramos;
  it.each(['', '  ', 'L', 'l', 'libre', 'Descanso', 'D', 'fiesta', 'Vacaciones', 'vac', 'BAJA', '-', '—', '–'])('«%s» es libre', (s) => {
    const c = leerCelda(s, letras);
    expect(c).toMatchObject({ libre: true, tramos: [], error: null });
  });
  it.each(['10:00-15:45', '10-15:45', '10.00 a 15.45', '10:00–15:45', '10h-15:45h', '10:00 - 15:45', '10:00—15:45', '10 a 15:45', '10:00 hasta 15:45'])(
    '«%s» es un tramo',
    (s) => {
      expect(tramos(s)).toEqual(M);
      expect(leerCelda(s, letras).libre).toBe(false);
    },
  );
  it('turnos partidos', () => {
    const esperado = [t('10:00', '14:00'), t('17:00', '21:00')];
    for (const s of ['10:00-14:00 / 17:00-21:00', '10-14 y 17-21', '10-14, 17-21', '17-21/10-14', '10h30-14 y 17-21'.replace('10h30', '10')]) {
      expect(tramos(s)).toEqual(esperado);
    }
    expect(tramos('10h30-14')).toEqual([t('10:30', '14:00')]);
  });
  it('letras y nombres sin distinguir mayúsculas ni tildes', () => {
    for (const s of ['M', 'm', 'mañana', 'MAÑANA', 'manana']) expect(tramos(s)).toEqual(M);
    for (const s of ['T', 'tarde', 'Tarde']) expect(tramos(s)).toEqual(T);
  });
  it('M+T y M/T son la unión', () => {
    expect(tramos('M+T')).toEqual([t('10:00', '22:00')]);
    expect(tramos('M/T')).toEqual([t('10:00', '22:00')]);
  });
  it('letras personalizadas', () => {
    const c = leerCelda('P', [...letras, { letra: 'P', nombre: 'Partido', tramos: [t('10:00', '14:00'), t('17:00', '21:00')] }]);
    expect(c.tramos).toHaveLength(2);
  });
  it('errores legibles', () => {
    expect(leerCelda('10:3O 12', letras).error).toBe('No entiendo "10:3O 12": escribe un horario como 10:00-15:45, M, T o L');
    expect(leerCelda('15:45-10:00', letras).error).toContain('no es posterior');
    expect(leerCelda('10-25', letras).error).toContain('entre 00:00 y 24:00');
    expect(leerCelda('10:75-12', letras).error).toContain('no es válida');
    expect(leerCelda('10-14 y 12-16', letras).error).toContain('se solapan');
    expect(leerCelda('M+xx', letras).error).toContain('No entiendo');
    expect(leerCelda('10:3O 12', letras).tramos).toEqual([]);
  });
});

describe('codigoCanonico', () => {
  it('normaliza', () => {
    expect(codigoCanonico('emp 7')).toBe('EMP-07');
    expect(codigoCanonico('EMP_007')).toBe('EMP-07');
    expect(codigoCanonico(' emp-12 ')).toBe('EMP-12');
    expect(codigoCanonico('xyz')).toBe('XYZ');
  });
});

describe('leerHorario · formatos de tabla', () => {
  const cabeceraDias = ['Código', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].join('\t');
  const dia = (l: ReturnType<typeof leerHorario>, codigo: string, i: number) => l.filas.find((f) => f.codigo === codigo)?.dias[i];

  it('con cabecera de nombres de día y tabulador', () => {
    const texto = [cabeceraDias, 'EMP-01\tM\tM\tL\tT\tT\t10-14 y 17-21\tL', 'EMP-02\tT\tT\tT\tL\tL\tM\tM'].join('\n');
    const l = leerHorario(texto, LUNES, datos, letras);
    expect(l.errores).toEqual([]);
    expect(l.columnas).toBe('Código en la columna 1; lunes a domingo en las columnas 2 a 8');
    expect(l.filas).toHaveLength(2);
    expect(l.filas[0]).toMatchObject({ codigo: 'EMP-01', personaId: 'per-01', linea: 2 });
    expect(dia(l, 'EMP-01', 0)?.tramos).toEqual(M);
    expect(dia(l, 'EMP-01', 2)?.libre).toBe(true);
    expect(dia(l, 'EMP-01', 5)?.tramos).toHaveLength(2);
    expect(dia(l, 'EMP-02', 3)?.libre).toBe(true);
  });

  it('sin cabecera: las 7 columnas tras el código', () => {
    const l = leerHorario('EMP-03\tM\tM\tM\tM\tM\tL\tL\nEMP-04\tT\tT\tT\tT\tT\tL\tL', LUNES, datos, letras);
    expect(l.errores).toEqual([]);
    expect(l.filas).toHaveLength(2);
    expect(l.filas[1]?.dias.every((d) => d !== null)).toBe(true);
    expect(l.columnas).toBe('Código en la columna 1; lunes a domingo en las columnas 2 a 8');
  });

  it('separador punto y coma y cabecera abreviada', () => {
    const texto = ['Persona;lu;ma;mi;ju;vi;sa;do', 'EMP-05;M;M;M;M;M;L;L'].join('\n');
    const l = leerHorario(texto, LUNES, datos, letras);
    expect(l.errores).toEqual([]);
    expect(dia(l, 'EMP-05', 4)?.tramos).toEqual(M);
  });

  it('cabecera con fechas dd/mm y dd/mm/aaaa', () => {
    const a = leerHorario(['x\t30/11\t01/12\t02/12\t03/12\t04/12\t05/12\t06/12', 'EMP-06\tM\tM\tM\tM\tM\tL\tL'].join('\n'), LUNES, datos, letras);
    expect(a.errores).toEqual([]);
    expect(dia(a, 'EMP-06', 0)?.tramos).toEqual(M);
    const b = leerHorario(['x\t30/11/2026\t01/12/2026\t02/12/2026\t03/12/2026\t04/12/2026\t05/12/2026\t06/12/2026', 'EMP-06\tM\tM\tM\tM\tM\tL\tL'].join('\n'), LUNES, datos, letras);
    expect(b.errores).toEqual([]);
    expect(dia(b, 'EMP-06', 6)?.libre).toBe(true);
  });

  it('cabecera con fechas de otra semana da error', () => {
    const l = leerHorario(['x\t23/11\t24/11\t25/11\t26/11\t27/11\t28/11\t29/11', 'EMP-06\tM\tM\tM\tM\tM\tL\tL'].join('\n'), LUNES, datos, letras);
    expect(l.errores[0]).toBe('La cabecera es de la semana del 23/11, no de la del 30/11. Cambia la semana o revisa lo pegado.');
  });

  it('cabecera con días en otro orden o incompletos asigna por nombre', () => {
    const l = leerHorario(['Código\tViernes\tLunes\tMartes', 'EMP-01\tT\tM\tL'].join('\n'), LUNES, datos, letras);
    expect(l.errores).toEqual([]);
    expect(dia(l, 'EMP-01', 4)?.tramos).toEqual(T);
    expect(dia(l, 'EMP-01', 0)?.tramos).toEqual(M);
    expect(dia(l, 'EMP-01', 1)?.libre).toBe(true);
    expect(dia(l, 'EMP-01', 2)).toBeNull();
    expect(l.columnas).toContain('viernes en la columna 2');
  });

  it('código en la segunda columna (la primera es un número de orden)', () => {
    const texto = ['1\tEMP-01\tM\tM\tM\tM\tM\tL\tL', '2\tEMP-02\tT\tT\tT\tT\tT\tL\tL'].join('\n');
    const l = leerHorario(texto, LUNES, datos, letras);
    expect(l.errores).toEqual([]);
    expect(l.columnas).toBe('Código en la columna 2; lunes a domingo en las columnas 3 a 9');
    expect(l.filas.map((f) => f.personaId)).toEqual(['per-01', 'per-02']);
  });

  it('código en la segunda columna con cabecera', () => {
    const texto = ['Nº\tCódigo\tLun\tMar\tMié\tJue\tVie\tSáb\tDom', '1\tEMP-01\tM\tM\tM\tM\tM\tL\tL'].join('\n');
    const l = leerHorario(texto, LUNES, datos, letras);
    expect(l.columnas).toBe('Código en la columna 2; lunes a domingo en las columnas 3 a 9');
    expect(l.filas).toHaveLength(1);
  });

  it('códigos «emp 7» y «EMP_007» se normalizan', () => {
    const l = leerHorario('emp 7\tM\tM\tM\tM\tM\tL\tL\nEMP_008\tT\tT\tT\tT\tT\tL\tL', LUNES, datos, letras);
    expect(l.filas.map((f) => [f.codigo, f.personaId])).toEqual([['EMP-07', 'per-07'], ['EMP-08', 'per-08']]);
  });

  it('códigos desconocidos: personaId null y listados', () => {
    const l = leerHorario('EMP-90\tM\tM\tM\tM\tM\tL\tL\nemp 91\tT\tT\tT\tT\tT\tL\tL\nEMP-01\tM\tM\tM\tM\tM\tL\tL', LUNES, datos, letras);
    expect(l.codigosDesconocidos).toEqual(['EMP-90', 'EMP-91']);
    expect(l.filas[0]?.personaId).toBeNull();
    expect(l.avisos.some((a) => a.includes('EMP-90, EMP-91'))).toBe(true);
  });

  it('código repetido: aviso y se mantienen ambas filas (gana la última al guardar)', () => {
    const l = leerHorario('EMP-01\tM\tM\tM\tM\tM\tL\tL\nEMP-01\tT\tT\tT\tT\tT\tL\tL', LUNES, datos, letras);
    expect(l.filas).toHaveLength(2);
    expect(l.avisos.some((a) => a.includes('EMP-01 aparece 2 veces (líneas 1, 2): se usa la última'))).toBe(true);
  });

  it('avisa de personas activas que no figuran', () => {
    const l = leerHorario('EMP-01\tM\tM\tM\tM\tM\tL\tL', LUNES, datos, letras);
    const aviso = l.avisos.find((a) => a.startsWith('Personas activas'));
    expect(aviso).toContain('EMP-02');
    expect(aviso).toContain('y 20 más');
    expect(aviso).not.toContain('EMP-01,');
  });

  it('celdas partidas y filas vacías, saltos de línea de Windows y comillas', () => {
    const texto = `\r\n${cabeceraDias}\r\n\r\n"EMP-01"\t"10:00-14:00 / 17:00-21:00"\tM\tM\tM\tM\tL\tL\r\n`;
    const l = leerHorario(texto, LUNES, datos, letras);
    expect(l.errores).toEqual([]);
    expect(l.filas[0]?.linea).toBe(4);
    expect(dia(l, 'EMP-01', 0)?.tramos).toHaveLength(2);
  });

  it('fila con menos celdas: las que faltan quedan libres; columnas inexistentes null sin cabecera', () => {
    const l = leerHorario('EMP-01\tM\tM\tM\nEMP-02\tT\tT\tT', LUNES, datos, letras);
    expect(l.filas[0]?.dias[2]?.tramos).toEqual(M);
    expect(l.filas[0]?.dias[3]).toBeNull();
    expect(l.columnas).toBe('Código en la columna 1; lunes a miércoles en las columnas 2 a 4');
  });

  it('errores con persona y día', () => {
    const l = leerHorario(['Código\tLun\tMar\tMié\tJue\tVie\tSáb\tDom', 'EMP-07\tM\t10:3O 12\tM\tM\tM\tL\tL'].join('\n'), LUNES, datos, letras);
    expect(l.errores).toEqual(['EMP-07 el martes: No entiendo "10:3O 12": escribe un horario como 10:00-15:45, M, T o L']);
    expect(l.filas[0]?.dias[1]?.error).not.toBeNull();
  });

  it('separador por espacios cuando no hay tabuladores', () => {
    const l = leerHorario('emp 7 M M M M M L L', LUNES, datos, letras);
    expect(l.errores).toEqual([]);
    expect(l.filas[0]).toMatchObject({ codigo: 'EMP-07', personaId: 'per-07' });
  });

  it('coma como separador de columnas', () => {
    const l = leerHorario('EMP-01,M,M,M,M,M,L,L\nEMP-02,T,T,T,T,T,L,L', LUNES, datos, letras);
    expect(l.errores).toEqual([]);
    expect(l.filas).toHaveLength(2);
  });

  it('líneas que no parecen códigos se ignoran con aviso', () => {
    const l = leerHorario(['Horario de la semana', 'EMP-01\tM\tM\tM\tM\tM\tL\tL'].join('\n'), LUNES, datos, letras);
    expect(l.errores).toEqual([]);
    expect(l.avisos.some((a) => a.includes('Se ignora la línea 1'))).toBe(true);
  });

  it('errores bloqueantes: texto vacío, sin códigos, sin columnas de días', () => {
    expect(leerHorario('  \n', LUNES, datos, letras).errores[0]).toContain('No hay nada que leer');
    expect(leerHorario('hola\nadiós', LUNES, datos, letras).errores[0]).toContain('columna con los códigos');
    expect(leerHorario('EMP-01', LUNES, datos, letras).errores[0]).toContain('columnas de los días');
  });
});

describe('leerHorario · hallazgos de la revisión', () => {
  const dia = (l: ReturnType<typeof leerHorario>, codigo: string, i: number) => l.filas.find((f) => f.codigo === codigo)?.dias[i];
  it('sin cabecera, una primera fila con horas no se toma por cabecera de fechas', () => {
    const l = leerHorario('EMP-07\t10:00-15:45\t10-14\t15:45-22:00\tM\tT\tL\tL\nEMP-01\tM\tM\tM\tM\tM\tL\tL', LUNES, datos, letras);
    expect(l.errores).toEqual([]);
    expect(l.filas).toHaveLength(2);
    expect(dia(l, 'EMP-07', 0)?.tramos).toEqual(M);
  });

  it('cabecera con nombre de día y fecha de otra semana: error bloqueante', () => {
    const l = leerHorario(['Código\tLunes 23/11\tMartes 24/11\tMiércoles 25/11', 'EMP-01\tM\tM\tM'].join('\n'), LUNES, datos, letras);
    expect(l.errores[0]).toBe('La cabecera es de la semana del 23/11, no de la del 30/11. Cambia la semana o revisa lo pegado.');
  });

  it('cabecera con nombre de día y fecha de la semana correcta', () => {
    const l = leerHorario(['Código\tLunes 30/11\tMartes 01/12', 'EMP-01\tM\tT'].join('\n'), LUNES, datos, letras);
    expect(l.errores).toEqual([]);
    expect(dia(l, 'EMP-01', 1)?.tramos).toEqual(T);
  });

  it('ninguna persona conocida: error bloqueante', () => {
    const l = leerHorario('EMP-90\tL\tL\tL\tL\tL\tL\tL', LUNES, datos, letras);
    expect(l.errores).toContain('No se ha reconocido ningún código de la plantilla (EMP-…). Revisa la columna de códigos o crea las personas.');
    expect(l.codigosDesconocidos).toEqual(['EMP-90']);
  });

  it('celda con salto de línea entre comillas: separa tramos y respeta "" y las filas', () => {
    const texto = 'EMP-01\t"10:00-14:00\n17:00-21:00"\tM\tM\tM\tM\tL\tL\nEMP-02\t"M"\tT\tT\tT\tT\tL\tL';
    const l = leerHorario(texto, LUNES, datos, letras);
    expect(l.errores).toEqual([]);
    expect(l.filas).toHaveLength(2);
    expect(dia(l, 'EMP-01', 0)?.tramos).toHaveLength(2);
    expect(l.filas[1]?.linea).toBe(2);
    expect(dia(l, 'EMP-02', 0)?.tramos).toEqual(M);
  });

  it('comilla literal ("") dentro de una celda entrecomillada', () => {
    const l = leerHorario('EMP-01\t"x""y"\tM\tM\tM\tM\tL\tL', LUNES, datos, letras);
    expect(l.filas[0]?.dias[0]?.texto).toBe('x"y');
  });

  it.each(['V', 'Vac.', 'Baja médica', 'baja', 'Permiso', 'Libranza', 'Descanso semanal', 'Vacaciones pagadas'])('«%s» es libre sin guardar el texto', (s) => {
    expect(leerCelda(s, letras)).toMatchObject({ libre: true, tramos: [], error: null });
  });

  it('acepta horas con segundos', () => {
    expect(leerCelda('10:00:00-15:45:00', letras).tramos).toEqual(M);
  });
});
