/**
 * Lectura del horario semanal pegado desde Excel (§13.1). Funciones puras: texto → lectura.
 * No modifica datos; `edicion/horarios.ts` convierte la lectura en un `HorarioSemana`.
 */
import { NOMBRES_DIA, esFechaISO, sumarDias } from '../modelo/fechas';
import { aHora } from '../modelo/horas';
import type { DatosPlanificacion, FechaISO, Id, Intervalo } from '../modelo/tipos';
import { normalizarCodigo } from '../persistencia/coherencia';

// ───────────────────────── Tipos públicos ─────────────────────────

export interface TurnoConLetra {
  letra: string;
  nombre: string;
  tramos: Intervalo[];
}

export interface CeldaLeida {
  texto: string;
  tramos: Intervalo[];
  libre: boolean;
  error: string | null;
}

export interface FilaLeida {
  linea: number;
  codigo: string;
  personaId: Id | null;
  /** 7 posiciones, lunes…domingo; null = esa columna no venía. */
  dias: (CeldaLeida | null)[];
}

export interface LecturaHorario {
  lunes: FechaISO;
  filas: FilaLeida[];
  columnas: string;
  errores: string[];
  avisos: string[];
  codigosDesconocidos: string[];
}

// ───────────────────────── Utilidades de texto ─────────────────────────

/** Minúsculas, sin tildes y con los espacios colapsados. */
function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** 'emp 7' → 'EMP-07'; si no tiene forma de letras+número, el texto recortado en mayúsculas. */
export function codigoCanonico(codigo: string): string {
  const m = /^\s*(\p{L}+)[\s_.-]*(\d+)\s*$/u.exec(codigo);
  if (!m) return codigo.trim().toUpperCase();
  return `${(m[1] ?? '').toUpperCase()}-${String(Number(m[2])).padStart(2, '0')}`;
}

const pareceCodigo = (texto: string): boolean => /^\p{L}+[\s_.-]*\d+$/u.test(texto.trim());

// ───────────────────────── Letras por defecto ─────────────────────────

export function letrasPorDefecto(datos: DatosPlanificacion): TurnoConLetra[] {
  let primero = Infinity;
  let ultimo = -Infinity;
  for (const p of datos.puestos) {
    if (!p.activo) continue;
    const horarios = [p.horario.general, ...Object.values(p.horario.porDia)];
    for (const h of horarios) {
      for (const f of h?.franjas ?? []) {
        primero = Math.min(primero, f.inicio);
        ultimo = Math.max(ultimo, f.fin);
      }
    }
  }
  if (!Number.isFinite(primero) || !Number.isFinite(ultimo)) {
    primero = 10 * 60;
    ultimo = 22 * 60;
  }
  const corte = datos.config.corteMananaTarde;
  return [
    { letra: 'M', nombre: 'Mañana', tramos: [{ inicio: primero, fin: corte }] },
    { letra: 'T', nombre: 'Tarde', tramos: [{ inicio: corte, fin: ultimo }] },
  ];
}

// ───────────────────────── Celdas ─────────────────────────

const PALABRAS_LIBRE = new Set([
  '', 'l', 'libre', 'libra', 'descanso', 'd', 'fiesta', 'festivo', 'vacaciones', 'vac', 'baja', 'permiso', '-', '—', '–',
]);

const HORA = String.raw`(\d{1,2})(?:[:.h](\d{2}))?h?`;
const PATRON_TRAMO = new RegExp(String.raw`^${HORA}\s*(?:[-–—]|a|hasta)\s*${HORA}$`);

function aMin(h: string | undefined, m: string | undefined): number | null {
  const horas = Number(h);
  const minutos = m === undefined ? 0 : Number(m);
  if (minutos > 59) return null;
  const total = horas * 60 + minutos;
  return total <= 24 * 60 ? total : null;
}

function mensajeNoEntiendo(texto: string): string {
  return `No entiendo "${texto}": escribe un horario como 10:00-15:45, M, T o L`;
}

const celda = (texto: string, tramos: Intervalo[], libre: boolean, error: string | null): CeldaLeida => ({
  texto,
  tramos,
  libre,
  error,
});

/** Une tramos ordenados; los que se tocan (fin = inicio) se funden. null si se solapan. */
function unir(tramos: Intervalo[]): Intervalo[] | null {
  const orden = tramos.map((t) => ({ ...t })).sort((a, b) => a.inicio - b.inicio || a.fin - b.fin);
  const resultado: Intervalo[] = [];
  for (const t of orden) {
    const ultimo = resultado[resultado.length - 1];
    if (ultimo && t.inicio < ultimo.fin) return null;
    if (ultimo && t.inicio === ultimo.fin) ultimo.fin = t.fin;
    else resultado.push(t);
  }
  return resultado;
}

export function leerCelda(texto: string, letras: readonly TurnoConLetra[]): CeldaLeida {
  const original = texto.trim().replace(/^"(.*)"$/s, '$1').trim();
  const norm = normalizarTexto(original);

  const porLetra = new Map<string, TurnoConLetra>();
  for (const l of letras) {
    porLetra.set(normalizarTexto(l.letra), l);
    porLetra.set(normalizarTexto(l.nombre), l);
  }

  if (!porLetra.has(norm) && PALABRAS_LIBRE.has(norm)) return celda(original, [], true, null);

  const partes = norm.split(/\s*[/+,;]\s*|\s+y\s+/).filter((p) => p !== '');
  const tramos: Intervalo[] = [];
  for (const parte of partes) {
    const turno = porLetra.get(parte);
    if (turno) {
      tramos.push(...turno.tramos);
      continue;
    }
    const m = PATRON_TRAMO.exec(parte);
    if (!m) return celda(original, [], false, mensajeNoEntiendo(original));
    const inicio = aMin(m[1], m[2]);
    const fin = aMin(m[3], m[4]);
    if (inicio === null || fin === null) {
      return celda(original, [], false, `La hora de "${parte}" no es válida: debe estar entre 00:00 y 24:00`);
    }
    if (fin <= inicio) {
      return celda(original, [], false, `El tramo "${parte}" no es válido: ${aHora(fin)} no es posterior a ${aHora(inicio)}`);
    }
    tramos.push({ inicio, fin });
  }
  if (tramos.length === 0) return celda(original, [], false, mensajeNoEntiendo(original));
  const unidos = unir(tramos);
  if (!unidos) return celda(original, [], false, `Los tramos de "${original}" se solapan`);
  return celda(original, unidos, false, null);
}

// ───────────────────────── Tabla ─────────────────────────

const DIAS_POR_NOMBRE: Record<string, number> = {
  lu: 0, lun: 0, lunes: 0,
  ma: 1, mar: 1, martes: 1,
  mi: 2, mie: 2, miercoles: 2,
  ju: 3, jue: 3, jueves: 3,
  vi: 4, vie: 4, viernes: 4,
  sa: 5, sab: 5, sabado: 5,
  do: 6, dom: 6, domingo: 6,
};

const PATRON_FECHA_CABECERA = /(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/;
const PATRON_FECHA_ISO = /(\d{4})-(\d{2})-(\d{2})/;

/** Fecha escrita en una celda de cabecera, como [año|null, mes, día]. */
function fechaDeCelda(texto: string): { anio: number | null; mes: number; dia: number } | null {
  const iso = PATRON_FECHA_ISO.exec(texto);
  if (iso) return { anio: Number(iso[1]), mes: Number(iso[2]), dia: Number(iso[3]) };
  const m = PATRON_FECHA_CABECERA.exec(texto);
  if (!m) return null;
  let anio: number | null = m[3] === undefined ? null : Number(m[3]);
  if (anio !== null && anio < 100) anio += 2000;
  return { anio, mes: Number(m[2]), dia: Number(m[1]) };
}

/** Día de la semana (0–6) que representa una celda de cabecera, o null. */
function diaDeCabecera(texto: string, fechas: readonly FechaISO[]): number | null {
  const palabra = /^[a-z]+/.exec(normalizarTexto(texto))?.[0];
  if (palabra !== undefined && palabra in DIAS_POR_NOMBRE) return DIAS_POR_NOMBRE[palabra] ?? null;
  const f = fechaDeCelda(texto);
  if (!f) return null;
  const i = fechas.findIndex((x) => {
    const [a, m, d] = x.split('-').map(Number);
    return d === f.dia && m === f.mes && (f.anio === null || a === f.anio);
  });
  return i >= 0 ? i : null;
}

function separarLinea(linea: string, separador: string | null): string[] {
  if (separador !== null) return linea.split(separador).map((c) => c.trim().replace(/^"(.*)"$/s, '$1').trim());
  // Sin separador claro: por espacios, pero 'emp 7' se mantiene junto.
  const trozos = linea.trim().split(/\s+/);
  const celdas: string[] = [];
  for (let i = 0; i < trozos.length; i++) {
    const t = trozos[i] ?? '';
    const siguiente = trozos[i + 1];
    if (/^\p{L}+$/u.test(t) && siguiente !== undefined && /^\d+$/.test(siguiente) && celdas.length === 0) {
      celdas.push(`${t} ${siguiente}`);
      i += 1;
    } else celdas.push(t);
  }
  return celdas;
}

function elegirSeparador(lineas: readonly string[]): string | null {
  if (lineas.some((l) => l.includes('\t'))) return '\t';
  if (lineas.some((l) => l.includes(';'))) return ';';
  const primera = lineas[0] ?? '';
  if ((primera.match(/,/g) ?? []).length >= 5) return ',';
  return null;
}

function describirColumnas(columnaCodigo: number, columnasDia: (number | null)[]): string {
  const presentes = columnasDia
    .map((c, dia) => ({ c, dia }))
    .filter((x): x is { c: number; dia: number } => x.c !== null)
    .sort((a, b) => a.dia - b.dia);
  const codigo = `Código en la columna ${columnaCodigo + 1}`;
  if (presentes.length === 0) return `${codigo}; sin columnas de días`;
  const primero = presentes[0]!;
  const ultimo = presentes[presentes.length - 1]!;
  const seguidos = presentes.every((x, i) => x.dia === primero.dia + i && x.c === primero.c + i);
  if (seguidos) {
    const dias = primero.dia === ultimo.dia ? `el ${NOMBRES_DIA[primero.dia]}` : `${NOMBRES_DIA[primero.dia]} a ${NOMBRES_DIA[ultimo.dia]}`;
    const cols = primero.c === ultimo.c ? `la columna ${primero.c + 1}` : `las columnas ${primero.c + 1} a ${ultimo.c + 1}`;
    return `${codigo}; ${dias} en ${cols}`;
  }
  return `${codigo}; ${presentes.map((x) => `${NOMBRES_DIA[x.dia]} en la columna ${x.c + 1}`).join(', ')}`;
}

export function leerHorario(
  texto: string,
  lunes: FechaISO,
  datos: DatosPlanificacion,
  letras: readonly TurnoConLetra[],
): LecturaHorario {
  const lectura: LecturaHorario = { lunes, filas: [], columnas: '', errores: [], avisos: [], codigosDesconocidos: [] };
  const fechas = esFechaISO(lunes) ? Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)) : [];

  // Líneas no vacías con su número original.
  const lineas: { linea: number; texto: string }[] = [];
  texto.split(/\r?\n/).forEach((t, i) => {
    if (t.replace(/[\t;,\s]/g, '') !== '') lineas.push({ linea: i + 1, texto: t });
  });
  if (lineas.length === 0) {
    lectura.errores.push('No hay nada que leer: pega el horario copiado de Excel');
    return lectura;
  }
  const separador = elegirSeparador(lineas.map((l) => l.texto));
  const tabla = lineas.map((l) => ({ linea: l.linea, celdas: separarLinea(l.texto, separador) }));

  // Cabecera: entre las primeras filas, la que tenga 2+ celdas con día o fecha de la semana.
  let indiceCabecera = -1;
  const columnasDia: (number | null)[] = [null, null, null, null, null, null, null];
  for (let i = 0; i < Math.min(tabla.length, 5) && indiceCabecera < 0; i++) {
    const celdas = tabla[i]!.celdas;
    const dias = celdas.map((c) => diaDeCabecera(c, fechas));
    if (dias.filter((d) => d !== null).length >= 2) {
      indiceCabecera = i;
      dias.forEach((d, col) => {
        if (d !== null && columnasDia[d] === null) columnasDia[d] = col;
      });
    } else if (celdas.filter((c) => fechaDeCelda(c) !== null && /\d{1,2}[/.-]\d{1,2}/.test(c)).length >= 2) {
      lectura.errores.push(`Las fechas de la cabecera no son de la semana del ${fechas[0]?.split('-').reverse().join('/') ?? lunes}`);
      return lectura;
    }
  }
  const hayCabecera = indiceCabecera >= 0;
  const datosTabla = hayCabecera ? tabla.slice(indiceCabecera + 1) : tabla;
  const columnasDeDia = new Set(columnasDia.filter((c): c is number => c !== null));

  // Columna del código.
  const existentes = new Map(datos.personas.map((p) => [normalizarCodigo(p.codigo), p]));
  const anchoMax = Math.max(0, ...tabla.map((f) => f.celdas.length));
  let columnaCodigo = -1;
  let mejor = 0;
  for (let col = 0; col < anchoMax; col++) {
    if (columnasDeDia.has(col)) continue;
    const aciertos = datosTabla.filter((f) => existentes.has(normalizarCodigo(f.celdas[col] ?? ''))).length;
    if (aciertos > mejor) {
      mejor = aciertos;
      columnaCodigo = col;
    }
  }
  if (columnaCodigo < 0) {
    for (let col = 0; col < anchoMax && columnaCodigo < 0; col++) {
      if (columnasDeDia.has(col)) continue;
      if (datosTabla.some((f) => pareceCodigo(f.celdas[col] ?? ''))) columnaCodigo = col;
    }
  }
  if (columnaCodigo < 0) {
    lectura.errores.push('No encuentro la columna con los códigos de las personas (por ejemplo EMP-07)');
    return lectura;
  }

  if (!hayCabecera) {
    for (let d = 0; d < 7; d++) {
      const col = columnaCodigo + 1 + d;
      columnasDia[d] = col < anchoMax ? col : null;
    }
  }
  if (columnasDia.every((c) => c === null)) {
    lectura.errores.push('No encuentro las columnas de los días: tras el código debe haber una columna por cada día de la semana');
    return lectura;
  }
  lectura.columnas = describirColumnas(columnaCodigo, columnasDia);

  // Filas.
  const vistos = new Map<string, number[]>();
  for (const fila of datosTabla) {
    const bruto = (fila.celdas[columnaCodigo] ?? '').trim();
    if (bruto === '') continue;
    const clave = normalizarCodigo(bruto);
    const persona = existentes.get(clave);
    if (!persona && !pareceCodigo(bruto)) {
      lectura.avisos.push(`Se ignora la línea ${fila.linea}: "${bruto}" no parece un código de persona`);
      continue;
    }
    const codigo = persona ? persona.codigo : codigoCanonico(bruto);
    const dias = columnasDia.map((col) => (col === null ? null : leerCelda(fila.celdas[col] ?? '', letras)));
    lectura.filas.push({ linea: fila.linea, codigo, personaId: persona ? persona.id : null, dias });
    vistos.set(clave, [...(vistos.get(clave) ?? []), fila.linea]);
    if (!persona && !lectura.codigosDesconocidos.includes(codigo)) lectura.codigosDesconocidos.push(codigo);
    dias.forEach((c, d) => {
      if (c?.error) lectura.errores.push(`${codigo} el ${NOMBRES_DIA[d]}: ${c.error}`);
    });
  }
  if (lectura.filas.length === 0) {
    lectura.errores.push('No hay ninguna fila con el código de una persona');
    return lectura;
  }

  for (const [clave, lineasRepetidas] of vistos) {
    if (lineasRepetidas.length < 2) continue;
    const codigo = existentes.get(clave)?.codigo ?? codigoCanonico(clave);
    lectura.avisos.push(`${codigo} aparece ${lineasRepetidas.length} veces (líneas ${lineasRepetidas.join(', ')}): se usa la última`);
  }
  if (lectura.codigosDesconocidos.length > 0) {
    lectura.avisos.push(
      `Códigos que no existen en la plantilla: ${lectura.codigosDesconocidos.join(', ')}. Puedes crearlos o se ignorarán`,
    );
  }
  const presentes = new Set(lectura.filas.map((f) => f.personaId));
  const sinFigurar = datos.personas.filter((p) => p.activa && !presentes.has(p.id)).map((p) => p.codigo);
  if (sinFigurar.length > 0) {
    const lista = sinFigurar.length > 8 ? `${sinFigurar.slice(0, 8).join(', ')} y ${sinFigurar.length - 8} más` : sinFigurar.join(', ');
    lectura.avisos.push(`Personas activas que no figuran en el horario (no trabajarán esa semana): ${lista}`);
  }
  return lectura;
}
