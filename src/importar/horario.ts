/**
 * Lectura del horario semanal pegado desde Excel (§13.1). Funciones puras: texto → lectura.
 * No modifica datos; `edicion/horarios.ts` convierte la lectura en un `HorarioSemana`.
 */
import { NOMBRES_DIA, esFechaISO, hoyISO, lunesDe, sumarDias } from '../modelo/fechas';
import { aHora } from '../modelo/horas';
import type { DatosPlanificacion, Equipo, FechaISO, HorarioSemana, Id, Intervalo, TurnoDia } from '../modelo/tipos';
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
  /** Texto sin horas leído (mayúsculas y sin espacios): «L», «V7R»… Solo en celdas libres con texto; sirve para resumirlos. */
  codigo?: string;
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
  '', 'l', 'v', 'libre', 'libra', 'libranza', 'descanso', 'descanso semanal', 'd', 'fiesta', 'festivo', 'permiso', '-', '—', '–',
]);

/** Cualquier texto que empiece por «baja» o «vac» (Baja médica, Vac., Vacaciones…) cuenta como libre. */
const PATRON_LIBRE_PREFIJO = /^(baja|vac)/;

const HORA = String.raw`(\d{1,2})(?:[:.h](\d{2})(?:[:.]\d{2})?)?h?`;
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

const TOKEN_HORA = String.raw`\d{1,2}[:.]\d{2}`;
/** Varias horas sueltas separadas por espacios: «15:20 22:10» o «08:30 14:00 17:00 21:00» (entrada, salida, entrada, salida…). */
const PATRON_HORAS_SUELTAS = new RegExp(String.raw`^${TOKEN_HORA}(?:\s+${TOKEN_HORA})+$`);
/** ¿Tiene pinta de una hora o tramo mal escrito? (dígitos junto a «:», «.» entre cifras o un tramo con guion). «V6H» o «12h» sueltos son códigos. */
const PARECE_HORA = /\d\s*:|:\s*\d|\d\.\d|\d\s*[-–—]\s*\d/u;

function aMinTexto(token: string): number | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(token);
  return m ? aMin(m[1], m[2]) : null;
}

const codigoDeTexto = (original: string): string => original.toUpperCase().replace(/\s+/g, '');

function celdaSinHoras(original: string): CeldaLeida {
  const c = celda(original, [], true, null);
  if (original !== '') c.codigo = codigoDeTexto(original);
  return c;
}

export function leerCelda(texto: string, letras: readonly TurnoConLetra[]): CeldaLeida {
  const original = texto.trim().replace(/^"(.*)"$/s, '$1').trim();
  const norm = normalizarTexto(original);

  const porLetra = new Map<string, TurnoConLetra>();
  for (const l of letras) {
    porLetra.set(normalizarTexto(l.letra), l);
    porLetra.set(normalizarTexto(l.nombre), l);
  }

  if (!porLetra.has(norm) && (PALABRAS_LIBRE.has(norm) || PATRON_LIBRE_PREFIJO.test(norm))) return celdaSinHoras(original);

  const partes = norm.split(/\s*[/+,;]\s*|\s+y\s+/).filter((p) => p !== '');
  const tramos: Intervalo[] = [];
  let noEntendida: string | null = null;
  for (const parte of partes) {
    const turno = porLetra.get(parte);
    if (turno) {
      tramos.push(...turno.tramos);
      continue;
    }
    if (PATRON_HORAS_SUELTAS.test(parte)) {
      const horas = parte.split(' ').map(aMinTexto);
      if (horas.length % 2 !== 0) {
        return celda(original, [], false, `En "${original}" falta una hora: cada tramo necesita entrada y salida`);
      }
      for (let i = 0; i < horas.length; i += 2) {
        const inicio = horas[i] ?? null;
        const fin = horas[i + 1] ?? null;
        if (inicio === null || fin === null) {
          return celda(original, [], false, `La hora de "${parte}" no es válida: debe estar entre 00:00 y 24:00`);
        }
        if (fin <= inicio) {
          return celda(original, [], false, `El tramo "${aHora(inicio)} ${aHora(fin)}" no es válido: ${aHora(fin)} no es posterior a ${aHora(inicio)}`);
        }
        tramos.push({ inicio, fin });
      }
      continue;
    }
    const m = PATRON_TRAMO.exec(parte);
    if (!m) {
      noEntendida = parte;
      continue;
    }
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
  if (noEntendida !== null) {
    // Sin ninguna hora entendida y sin pinta de hora mal escrita: es un código (L, V7R…) y ese día no trabaja.
    if (tramos.length === 0 && !PARECE_HORA.test(norm)) return celdaSinHoras(original);
    return celda(original, [], false, mensajeNoEntiendo(original));
  }
  if (tramos.length === 0) return celdaSinHoras(original);
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

const PATRON_FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Una celda de cabecera con fecha: solo la fecha, opcionalmente precedida del nombre del día. */
const PATRON_CABECERA_FECHA = /^(?:([a-z]+)\.?[\s,]*)?(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/;
const PATRON_CABECERA_NOMBRE = /^([a-z]+)\.?$/;

interface CabeceraCelda {
  /** Día de la semana (0–6) al que corresponde la columna, si es de esta semana. */
  dia: number | null;
  /** Si la celda trae una fecha de otra semana: el lunes de esa semana. */
  otraSemana: FechaISO | null;
}

const SIN_CABECERA: CabeceraCelda = { dia: null, otraSemana: null };

function lunesDeFechaSinAnio(dia: number, mes: number, referencia: FechaISO): FechaISO | null {
  const anioRef = Number(referencia.slice(0, 4));
  let mejor: FechaISO | null = null;
  let distancia = Infinity;
  for (const anio of [anioRef - 1, anioRef, anioRef + 1]) {
    const f = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    if (!esFechaISO(f)) continue;
    const d = Math.abs(Date.parse(f) - Date.parse(referencia));
    if (d < distancia) {
      distancia = d;
      mejor = f;
    }
  }
  return mejor === null ? null : lunesDe(mejor);
}

/** Interpreta una celda de cabecera: nombre de día, fecha o «nombre fecha»; cualquier otra cosa no cuenta. */
function leerCabeceraCelda(texto: string, fechas: readonly FechaISO[], lunes: FechaISO): CabeceraCelda {
  const norm = normalizarTexto(texto);
  if (norm === '' || PATRON_TRAMO.test(norm)) return SIN_CABECERA;
  const solo = PATRON_CABECERA_NOMBRE.exec(norm);
  if (solo) {
    const d = DIAS_POR_NOMBRE[solo[1] ?? ''];
    return d === undefined ? SIN_CABECERA : { dia: d, otraSemana: null };
  }
  let anio: number | null;
  let mes: number;
  let dia: number;
  let nombre: string | undefined;
  const iso = PATRON_FECHA_ISO.exec(norm);
  if (iso) {
    anio = Number(iso[1]);
    mes = Number(iso[2]);
    dia = Number(iso[3]);
  } else {
    const m = PATRON_CABECERA_FECHA.exec(norm);
    if (!m) return SIN_CABECERA;
    nombre = m[1];
    if (nombre !== undefined && !(nombre in DIAS_POR_NOMBRE)) return SIN_CABECERA;
    dia = Number(m[2]);
    mes = Number(m[3]);
    anio = m[4] === undefined ? null : Number(m[4]);
    if (anio !== null && anio < 100) anio += 2000;
  }
  const i = fechas.findIndex((x) => {
    const [a, mm, d] = x.split('-').map(Number);
    return d === dia && mm === mes && (anio === null || a === anio);
  });
  if (i >= 0) return { dia: i, otraSemana: null };
  const fecha = anio === null ? null : `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const otra = fecha !== null ? (esFechaISO(fecha) ? lunesDe(fecha) : null) : lunesDeFechaSinAnio(dia, mes, lunes);
  return { dia: null, otraSemana: otra };
}

/** Parte el texto en líneas respetando las comillas de Excel (una celda entrecomillada puede contener saltos). */
function partirLineas(texto: string): string[] {
  const lineas: string[] = [];
  let actual = '';
  let dentro = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i] ?? '';
    if (c === '"') dentro = !dentro;
    if (!dentro && (c === '\n' || c === '\r')) {
      if (c === '\r' && texto[i + 1] === '\n') i += 1;
      lineas.push(actual);
      actual = '';
    } else actual += c;
  }
  lineas.push(actual);
  // Comillas sin cerrar: no se puede fiar de ellas, se parte por saltos simples.
  return dentro ? texto.split(/\r?\n/) : lineas;
}

const SALTO_INTERNO = /\s*[\r\n]+\s*/g;

/** Separa una línea por `separador` al estilo TSV de Excel: «"..."» agrupa y «""» es una comilla literal. */
function separarConComillas(linea: string, separador: string): string[] {
  const celdas: string[] = [];
  let actual = '';
  let entrecomillada = false;
  let dentro = false;
  const cerrar = () => {
    celdas.push((entrecomillada ? actual : actual.trim()).replace(SALTO_INTERNO, ' / ').trim());
    actual = '';
    entrecomillada = false;
  };
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i] ?? '';
    if (dentro) {
      if (c === '"') {
        if (linea[i + 1] === '"') {
          actual += '"';
          i += 1;
        } else dentro = false;
      } else actual += c;
    } else if (c === '"' && actual.trim() === '') {
      dentro = true;
      entrecomillada = true;
      actual = '';
    } else if (linea.startsWith(separador, i)) {
      cerrar();
      i += separador.length - 1;
    } else actual += c;
  }
  cerrar();
  return celdas;
}

function separarLinea(linea: string, separador: string | null): string[] {
  if (separador !== null) return separarConComillas(linea, separador);
  // Sin separador claro: por espacios, pero 'emp 7' se mantiene junto.
  const trozos = linea.replace(/"/g, '').trim().split(/\s+/);
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
  partirLineas(texto).forEach((t, i) => {
    if (t.replace(/[\t;,\s]/g, '') !== '') lineas.push({ linea: i + 1, texto: t });
  });
  if (lineas.length === 0) {
    lectura.errores.push('No hay nada que leer: pega el horario copiado de Excel');
    return lectura;
  }
  const separador = elegirSeparador(lineas.map((l) => l.texto));
  const tabla = lineas.map((l) => ({ linea: l.linea, celdas: separarLinea(l.texto, separador) }));

  // Cabecera: entre las primeras filas, la que tenga 2+ celdas con día o fecha. Si esas fechas son de otra semana, error.
  let indiceCabecera = -1;
  const columnasDia: (number | null)[] = [null, null, null, null, null, null, null];
  for (let i = 0; i < Math.min(tabla.length, 5) && indiceCabecera < 0; i++) {
    const celdas = tabla[i]!.celdas.map((c) => leerCabeceraCelda(c, fechas, lunes));
    const otra = celdas.find((c) => c.otraSemana !== null)?.otraSemana ?? null;
    const dias = celdas.filter((c) => c.dia !== null).length;
    if (otra !== null && dias + celdas.filter((c) => c.otraSemana !== null).length >= 2) {
      const corto = (f: FechaISO) => f.split('-').reverse().slice(0, 2).join('/');
      lectura.errores.push(`La cabecera es de la semana del ${corto(otra)}, no de la del ${corto(lunes)}. Cambia la semana o revisa lo pegado.`);
      return lectura;
    }
    if (dias >= 2) {
      indiceCabecera = i;
      celdas.forEach((c, col) => {
        if (c.dia !== null && columnasDia[c.dia] === null) columnasDia[c.dia] = col;
      });
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
  if (!lectura.filas.some((f) => f.personaId !== null)) {
    lectura.errores.push('No se ha reconocido ningún código de la plantilla (EMP-…). Revisa la columna de códigos o crea las personas.');
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

// ───────────────────────── Calendario anual (§14) ─────────────────────────

export interface FilaCalendario {
  linea: number;
  codigo: string;
  /** Nombre de la columna de nombres, si la hay. Solo se usa como alias (nunca se guarda sin que la usuaria lo elija). */
  nombre: string | null;
  personaId: Id | null;
  dias: Map<FechaISO, CeldaLeida>;
}

export interface LecturaCalendario {
  filas: FilaCalendario[];
  primerDia: FechaISO | null;
  ultimoDia: FechaISO | null;
  /** Lunes de las semanas completas (lunes a domingo dentro de la tabla). */
  semanas: FechaISO[];
  /** Lunes de las semanas que la tabla solo cubre en parte. */
  semanasParciales: FechaISO[];
  /** Días cuya columna está vacía para todas las personas (día sin abrir). */
  diasCerrados: FechaISO[];
  /** Texto sin horas de las celdas (L, V, V7R…) y cuántas veces aparece, de más a menos. */
  codigosSinHorario: { codigo: string; veces: number }[];
  columnas: string;
  /** Bloquean cualquier guardado: estructura de la tabla. */
  errores: string[];
  /** Celdas con una hora mal escrita; bloquean solo si caen en las semanas a guardar. */
  celdasConError: { codigo: string; personaId: Id | null; fecha: FechaISO; mensaje: string }[];
  /** true si falta el primer día de la tabla (hay que pedirlo en la interfaz). */
  pidePrimerDia: boolean;
  avisos: string[];
  codigosDesconocidos: { codigo: string; nombre: string | null }[];
}

export interface OpcionesCalendario {
  primerDia: FechaISO | null;
  /** Fecha de hoy (para proponer el año y la semana por defecto). Por defecto, la del reloj. */
  hoy?: FechaISO;
  /** Entender las letras de turno (M, T…) como horarios. Por defecto no: en la tabla anual son códigos sin horas. */
  usarLetras?: boolean;
}

const esCodigoPlausible = (t: string): boolean =>
  /^\d{4,12}$/.test(t) ||
  (/^[\p{L}\d]{3,16}$/u.test(t) && /\p{L}/u.test(t) && /\d/.test(t)) ||
  /^emp[\s_.-]*\d+$/i.test(t);

const f2 = (n: number) => String(n).padStart(2, '0');
const corto = (f: FechaISO) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const largo = (f: FechaISO) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const lista = (xs: readonly string[], max = 6) => (xs.length > max ? `${xs.slice(0, max).join(', ')}… (${xs.length} en total)` : xs.join(', '));

/** «Códigos sin horario: L (412), V (96)…: esos días no trabaja» (null si no hay). */
export function resumirCodigosSinHorario(codigos: readonly { codigo: string; veces: number }[], max = 8): string | null {
  if (codigos.length === 0) return null;
  const texto = codigos.slice(0, max).map((c) => `${c.codigo} (${c.veces})`).join(', ');
  return `Códigos sin horario: ${texto}${codigos.length > max ? '…' : ''}: esos días no trabaja`;
}

/** Fecha de una celda de cabecera: ISO, dd/mm/aaaa o dd/mm (año por referencia), con nombre de día opcional delante. */
function fechaDeCabecera(texto: string, anio: { valor: number; mes: number }): FechaISO | null {
  const norm = normalizarTexto(texto).replace(/^[a-z]+\.?[\s,]+(?=\d)/, '');
  const iso = PATRON_FECHA_ISO.exec(norm);
  let a: number;
  let m: number;
  let d: number;
  if (iso) {
    a = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    const x = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(norm);
    if (!x) return null;
    d = Number(x[1]);
    m = Number(x[2]);
    if (x[3] === undefined) {
      if (m < anio.mes) anio.valor += 1;
      a = anio.valor;
    } else a = Number(x[3]) < 100 ? 2000 + Number(x[3]) : Number(x[3]);
  }
  const f = `${a}-${f2(m)}-${f2(d)}`;
  if (!esFechaISO(f)) return null;
  anio.mes = m;
  return f;
}

function descripcionColumnas(col: number, nombre: number | null, dias: number[], conFechas: boolean): string {
  const partes = [`Código en la columna ${col + 1}`];
  if (nombre !== null) partes.push(`nombre en la columna ${nombre + 1}`);
  if (dias.length === 0) partes.push('sin columnas de días');
  else {
    const a = Math.min(...dias);
    const b = Math.max(...dias);
    partes.push(
      `${dias.length} ${dias.length === 1 ? 'día' : 'días'} en ${a === b ? `la columna ${a + 1}` : `las columnas ${a + 1} a ${b + 1}`}${conFechas ? ' (fechas de la cabecera)' : ''}`,
    );
  }
  return partes.join('; ');
}

export function leerCalendario(
  texto: string,
  datos: DatosPlanificacion,
  letras: readonly TurnoConLetra[],
  opciones: OpcionesCalendario,
): LecturaCalendario {
  const hoy = opciones.hoy ?? hoyISO();
  const letrasUsadas: readonly TurnoConLetra[] = opciones.usarLetras ? letras : [];
  const lectura: LecturaCalendario = {
    filas: [], primerDia: null, ultimoDia: null, semanas: [], semanasParciales: [], diasCerrados: [],
    codigosSinHorario: [], columnas: '', errores: [], celdasConError: [], pidePrimerDia: false, avisos: [], codigosDesconocidos: [],
  };
  const lineas: { linea: number; texto: string }[] = [];
  partirLineas(texto).forEach((t, i) => {
    if (t.replace(/[\t;,\s]/g, '') !== '') lineas.push({ linea: i + 1, texto: t });
  });
  if (lineas.length === 0) {
    lectura.errores.push('No hay nada que leer: pega el horario copiado de Excel');
    return lectura;
  }
  const separador = elegirSeparador(lineas.map((l) => l.texto));
  const tabla = lineas.map((l) => ({ linea: l.linea, celdas: separarLinea(l.texto, separador) }));

  // Cabecera (opcional): fechas o nombres de día en una de las primeras filas.
  const anioRef = Number((opciones.primerDia ?? hoy).slice(0, 4));
  const columnaFecha = new Map<number, FechaISO>();
  const columnaNombreDia = new Map<number, number>();
  let filaCabecera = -1;
  for (let i = 0; i < Math.min(tabla.length, 3) && filaCabecera < 0; i++) {
    const ref = { valor: anioRef, mes: 0 };
    const fechas = new Map<number, FechaISO>();
    const nombres = new Map<number, number>();
    tabla[i]!.celdas.forEach((c, col) => {
      const f = fechaDeCabecera(c, ref);
      if (f !== null) fechas.set(col, f);
      else {
        const n = normalizarTexto(c);
        const d = n.length >= 2 ? DIAS_POR_NOMBRE[n] : undefined;
        if (d !== undefined && PATRON_CABECERA_NOMBRE.test(n)) nombres.set(col, d);
      }
    });
    if (fechas.size >= 2) {
      filaCabecera = i;
      fechas.forEach((f, c) => columnaFecha.set(c, f));
    } else if (nombres.size >= 2) {
      filaCabecera = i;
      nombres.forEach((d, c) => columnaNombreDia.set(c, d));
    }
  }
  const columnasCabecera = new Set([...columnaFecha.keys(), ...columnaNombreDia.keys()]);
  const filasDatos = (filaCabecera >= 0 ? tabla.slice(filaCabecera + 1) : tabla).filter((f) => f.celdas.some((c) => c !== ''));
  const ancho = Math.max(0, ...tabla.map((f) => f.celdas.length));
  const existentes = new Map(datos.personas.map((p) => [normalizarCodigo(p.codigo), p]));

  // Columna de códigos: la que más coincide con personas existentes; si no, la primera casi completa de códigos plausibles; si no, la de más valores distintos.
  let colCodigo = -1;
  let mejor = 0;
  for (let c = 0; c < ancho; c++) {
    if (columnasCabecera.has(c)) continue;
    const aciertos = filasDatos.filter((f) => existentes.has(normalizarCodigo(f.celdas[c] ?? ''))).length;
    if (aciertos > mejor) {
      mejor = aciertos;
      colCodigo = c;
    }
  }
  if (colCodigo < 0) {
    let distintosMax = 0;
    for (let c = 0; c < ancho; c++) {
      if (columnasCabecera.has(c)) continue;
      const plausibles = filasDatos.map((f) => (f.celdas[c] ?? '').trim()).filter(esCodigoPlausible);
      if (plausibles.length >= Math.max(1, 0.8 * filasDatos.length)) {
        colCodigo = c;
        break;
      }
      const distintos = new Set(plausibles).size;
      if (distintos > distintosMax) {
        distintosMax = distintos;
        colCodigo = c;
      }
    }
  }
  if (colCodigo < 0) {
    lectura.errores.push('No encuentro la columna con los números o códigos de las personas');
    return lectura;
  }

  // Ancho de la tabla: el más frecuente entre las filas con código (si empatan, el mayor).
  const anchos = new Map<number, number>();
  for (const f of filasDatos) {
    const bruto = (f.celdas[colCodigo] ?? '').trim();
    if (bruto === '' || (!existentes.has(normalizarCodigo(bruto)) && !esCodigoPlausible(bruto))) continue;
    anchos.set(f.celdas.length, (anchos.get(f.celdas.length) ?? 0) + 1);
  }
  let anchoModal = ancho;
  let vecesModal = 0;
  for (const [a, n] of anchos) {
    if (n > vecesModal || (n === vecesModal && a > anchoModal)) {
      anchoModal = a;
      vecesModal = n;
    }
  }

  // Columna de nombres (opcional): contigua al código. Es nombre si casi ninguna de sus celdas es un horario
  // ni un código de la tabla (L, V, V7R…: los que se repiten en las columnas siguientes).
  const esColNombre = (c: number): boolean => {
    if (c < 0 || c >= anchoModal || columnasCabecera.has(c)) return false;
    const vals = filasDatos.map((f) => (f.celdas[c] ?? '').trim()).filter((v) => v !== '');
    // Sin cabecera, el número de columnas de día decide si hay una semana (7) o un año entero: si solo cuadra con esta columna como nombre
    // (o solo sin ella), no hace falta mirar su contenido.
    if (c === colCodigo + 1 && columnasCabecera.size === 0) {
      const anio = Number((opciones.primerDia ?? hoy).slice(0, 4));
      const diasAnio = esFechaISO(`${anio}-02-29`) ? 366 : 365;
      const cuadra = (n: number) => n === 7 || n === diasAnio;
      const sin = cuadra(anchoModal - colCodigo - 1);
      const con = cuadra(anchoModal - colCodigo - 2);
      if (sin !== con) return con;
    }
    if (vals.length === 0) return c > colCodigo && columnasCabecera.size > 0;
    const tipicos = new Map<string, number>();
    for (const f of filasDatos) {
      for (let k = Math.max(colCodigo, c) + 1; k < anchoModal; k++) {
        const cel = leerCelda(f.celdas[k] ?? '', letrasUsadas);
        if (cel.codigo !== undefined) tipicos.set(cel.codigo, (tipicos.get(cel.codigo) ?? 0) + 1);
      }
    }
    const esDato = (v: string): boolean => {
      const cel = leerCelda(v, letrasUsadas);
      return cel.tramos.length > 0 || cel.error !== null || (cel.codigo !== undefined && (tipicos.get(cel.codigo) ?? 0) >= 2);
    };
    return vals.filter(esDato).length < 0.2 * vals.length;
  };
  let colNombre: number | null = null;
  if (esColNombre(colCodigo + 1)) colNombre = colCodigo + 1;
  else if (esColNombre(colCodigo - 1)) colNombre = colCodigo - 1;
  const primeraColDia = Math.max(colCodigo, colNombre ?? -1) + 1;

  // Columna → fecha.
  const fechaDeColumna = new Map<number, FechaISO>();
  let conFechas = false;
  if (columnaFecha.size > 0) {
    columnaFecha.forEach((f, c) => fechaDeColumna.set(c, f));
    conFechas = true;
  } else {
    const columnasDia: number[] = [];
    if (columnaNombreDia.size > 0) columnaNombreDia.forEach((_, c) => columnasDia.push(c));
    else for (let c = primeraColDia; c < anchoModal; c++) columnasDia.push(c);
    if (columnasDia.length === 0) {
      lectura.errores.push('No encuentro las columnas de los días: tras el código y el nombre debe haber una columna por cada día');
      return lectura;
    }
    if (columnaNombreDia.size > 0 || columnasDia.length <= 7) {
      // Formato semanal: lunes a domingo.
      let lunes: FechaISO;
      if (opciones.primerDia !== null && esFechaISO(opciones.primerDia)) lunes = lunesDe(opciones.primerDia);
      else {
        lunes = sumarDias(lunesDe(hoy), 7);
        lectura.avisos.push(`No has indicado el primer día: se toma la semana que viene (del ${largo(lunes)} al ${largo(sumarDias(lunes, 6))})`);
      }
      columnasDia.forEach((c, i) => fechaDeColumna.set(c, sumarDias(lunes, columnaNombreDia.get(c) ?? i)));
    } else {
      let primero = opciones.primerDia;
      if (primero === null || !esFechaISO(primero)) {
        const anio = Number(hoy.slice(0, 4));
        const diasAnio = esFechaISO(`${anio}-02-29`) ? 366 : 365;
        if (columnasDia.length === diasAnio) {
          primero = `${anio}-01-01`;
          lectura.avisos.push(`Se ha supuesto que la tabla empieza el ${largo(primero)}. Si no es así, cambia el primer día de la tabla`);
        } else {
          lectura.pidePrimerDia = true;
          lectura.errores.push(
            `Indica el primer día de la tabla: se han contado ${columnasDia.length} columnas de días (desde la columna ${primeraColDia + 1}) y un año completo tiene ${diasAnio}. ` +
              'Si la tabla debería tener un año entero, revisa si falta o sobra alguna columna, por ejemplo la del nombre.',
          );
          return lectura;
        }
      }
      columnasDia.forEach((c, i) => fechaDeColumna.set(c, sumarDias(primero as FechaISO, i)));
    }
  }
  const columnasDia = [...fechaDeColumna.keys()].sort((a, b) => a - b);
  lectura.columnas = descripcionColumnas(colCodigo, colNombre, columnasDia, conFechas);

  // Filas.
  const memoria = new Map<string, CeldaLeida>();
  const leer = (t: string): CeldaLeida => {
    let c = memoria.get(t);
    if (!c) {
      c = leerCelda(t, letrasUsadas);
      memoria.set(t, c);
    }
    return c;
  };
  const repetidos = new Map<string, number[]>();
  const conteo = new Map<string, number>();
  const desconocidos = new Map<string, string | null>();
  const vacioPorFecha = new Map<FechaISO, boolean>();
  const erroresCelda: { clave: string; linea: number; codigo: string; personaId: Id | null; fecha: FechaISO; mensaje: string }[] = [];
  const filasIrregulares: string[] = [];
  const ultimaColumnaDia = columnasDia.length > 0 ? (columnasDia[columnasDia.length - 1] as number) : -1;
  let ignoradas = 0;
  for (const fila of filasDatos) {
    const bruto = (fila.celdas[colCodigo] ?? '').trim();
    if (bruto === '') continue;
    const clave = normalizarCodigo(bruto);
    const persona = existentes.get(clave);
    if (!persona && !esCodigoPlausible(bruto)) {
      ignoradas += 1;
      continue;
    }
    const codigo = persona ? persona.codigo : /^emp/i.test(bruto) ? codigoCanonico(bruto) : bruto.toUpperCase().replace(/\s+/g, '');
    const nombreBruto = colNombre === null ? '' : (fila.celdas[colNombre] ?? '').trim();
    const nombre = nombreBruto === '' ? null : nombreBruto;
    const dias = new Map<FechaISO, CeldaLeida>();
    const largoFila = fila.celdas.length;
    const diasDeLaFila = columnasDia.filter((c) => c < largoFila).length + Math.max(0, largoFila - Math.max(anchoModal, ultimaColumnaDia + 1));
    if (diasDeLaFila !== columnasDia.length) {
      filasIrregulares.push(`La fila de ${codigo} tiene ${diasDeLaFila} ${diasDeLaFila === 1 ? 'día' : 'días'} y las demás ${columnasDia.length}`);
    }
    for (const c of columnasDia) {
      if (c >= largoFila) continue; // la fila no llega hasta esa columna: ese día no consta para la persona (no se da por libre)
      const fecha = fechaDeColumna.get(c) as FechaISO;
      const cel = leer(fila.celdas[c] ?? '');
      dias.set(fecha, cel);
      if (cel.error !== null) erroresCelda.push({ clave, linea: fila.linea, codigo, personaId: persona ? persona.id : null, fecha, mensaje: cel.error });
      else if (cel.codigo !== undefined) conteo.set(cel.codigo, (conteo.get(cel.codigo) ?? 0) + 1);
      if (cel.texto !== '') vacioPorFecha.set(fecha, false);
      else if (!vacioPorFecha.has(fecha)) vacioPorFecha.set(fecha, true);
    }
    lectura.filas.push({ linea: fila.linea, codigo, nombre, personaId: persona ? persona.id : null, dias });
    repetidos.set(clave, [...(repetidos.get(clave) ?? []), fila.linea]);
    if (!persona && !desconocidos.has(codigo)) desconocidos.set(codigo, nombre);
  }
  if (lectura.filas.length === 0) {
    lectura.errores.push('No hay ninguna fila con el número o código de una persona');
    return lectura;
  }
  // Solo cuenta la última fila de cada código (las anteriores se descartan).
  lectura.celdasConError = erroresCelda
    .filter((e) => e.linea === repetidos.get(e.clave)?.at(-1))
    .map(({ codigo, personaId, fecha, mensaje }) => ({ codigo, personaId, fecha, mensaje }));
  if (filasIrregulares.length > 0) {
    lectura.avisos.push(
      `${filasIrregulares.slice(0, 5).join('; ')}${filasIrregulares.length > 5 ? `; y ${filasIrregulares.length - 5} filas más con otra longitud` : ''}. ` +
        'Los días que faltan no se dan por libres: esas semanas quedan incompletas para esa persona y no se guardan; las columnas de más se ignoran',
    );
  }
  if (ignoradas > 0) lectura.avisos.push(`Se han ignorado ${ignoradas} ${ignoradas === 1 ? 'línea' : 'líneas'} cuyo primer dato no parece un número o código de persona`);
  for (const [clave, ls] of repetidos) {
    if (ls.length > 1) {
      const codigo = existentes.get(clave)?.codigo ?? lectura.filas.find((f) => f.linea === ls[0])?.codigo ?? clave;
      lectura.avisos.push(`${codigo} aparece ${ls.length} veces (líneas ${ls.join(', ')}): se usa la última`);
    }
  }

  // Fechas, semanas y días cerrados.
  const fechas = [...new Set(fechaDeColumna.values())].sort();
  const presentes = new Set(fechas);
  lectura.primerDia = fechas[0] ?? null;
  lectura.ultimoDia = fechas[fechas.length - 1] ?? null;
  const lunesVistos = [...new Set(fechas.map(lunesDe))];
  for (const l of lunesVistos) {
    (Array.from({ length: 7 }, (_, i) => sumarDias(l, i)).every((d) => presentes.has(d)) ? lectura.semanas : lectura.semanasParciales).push(l);
  }
  lectura.diasCerrados = fechas.filter((f) => vacioPorFecha.get(f) === true);
  lectura.codigosSinHorario = [...conteo].map(([codigo, veces]) => ({ codigo, veces })).sort((a, b) => b.veces - a.veces || a.codigo.localeCompare(b.codigo));
  lectura.codigosDesconocidos = [...desconocidos].map(([codigo, nombre]) => ({ codigo, nombre }));

  if (lectura.semanasParciales.length > 0) {
    lectura.avisos.push(`Semanas incompletas en la tabla (no se pueden guardar): ${lista(lectura.semanasParciales.map((l) => `la del ${corto(l)}`))}`);
  }
  if (lectura.diasCerrados.length > 0) {
    const unico = lectura.diasCerrados.length === 1;
    lectura.avisos.push(
      `Nadie trabaja ${unico ? 'ese día' : 'esos días'} (columna vacía para todos): ${lista(lectura.diasCerrados.map(corto), 8)}. Puedes marcarlos como cerrados al guardar`,
    );
  }
  const resumen = resumirCodigosSinHorario(lectura.codigosSinHorario);
  if (resumen) lectura.avisos.push(resumen);
  if (lectura.codigosDesconocidos.length > 0) {
    lectura.avisos.push(`Personas que no existen en la plantilla: ${lista(lectura.codigosDesconocidos.map((c) => c.codigo))}. Puedes crearlas o se ignorarán`);
  }
  return lectura;
}

/** Semanas completas de la lectura entre `desdeLunes` y `hastaLunes` (ambos incluidos) como horarios; solo personas ya existentes (la última fila gana). */
export function horariosDesdeCalendario(
  lectura: LecturaCalendario,
  desdeLunes: FechaISO,
  hastaLunes: FechaISO,
  ahora: string | null = null,
): HorarioSemana[] {
  const porPersona = new Map<Id, FilaCalendario>();
  for (const f of lectura.filas) if (f.personaId !== null) porPersona.set(f.personaId, f);
  return lectura.semanas
    .filter((l) => l >= desdeLunes && l <= hastaLunes)
    .map((lunes) => {
      const turnos: TurnoDia[] = [];
      for (const [personaId, fila] of porPersona) {
        const fechasSemana = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
        // Semana incompleta para esta persona (a su fila le faltan días): no figura esa semana.
        if (!fechasSemana.every((f) => fila.dias.has(f))) continue;
        for (const fecha of fechasSemana) {
          const c = fila.dias.get(fecha);
          turnos.push({ personaId, fecha, tramos: c && c.error === null ? c.tramos.map((t) => ({ inicio: t.inicio, fin: t.fin })) : [] });
        }
      }
      return { lunes, turnos, actualizado: ahora };
    });
}

/**
 * Equipo de cada persona según los tramos de su horario: 'M' si casi todos empiezan antes del corte mañana/tarde,
 * 'T' si casi todos empiezan después, 'A' si mezcla. Solo personas con algún tramo; se pueden limitar las fechas.
 * La clave es el código de la fila (el mismo de `codigosDesconocidos`).
 */
export function equiposDesdeCalendario(
  lectura: LecturaCalendario,
  corte: number,
  desde?: FechaISO,
  hasta?: FechaISO,
  umbral = 0.8,
): Map<string, Equipo> {
  const resultado = new Map<string, Equipo>();
  for (const fila of lectura.filas) {
    let manana = 0;
    let tarde = 0;
    for (const [fecha, c] of fila.dias) {
      if ((desde !== undefined && fecha < desde) || (hasta !== undefined && fecha > hasta) || c.error !== null) continue;
      for (const t of c.tramos) {
        // Un tramo es de mañana o de tarde según dónde caiga la mayor parte de su duración respecto al corte
        // (15:20–22:10 empieza antes de las 15:45, pero es de tarde).
        const antes = Math.max(0, Math.min(t.fin, corte) - t.inicio);
        const despues = Math.max(0, t.fin - Math.max(t.inicio, corte));
        if (antes >= despues) manana += 1;
        else tarde += 1;
      }
    }
    const total = manana + tarde;
    if (total === 0) continue;
    resultado.set(fila.codigo, manana >= umbral * total ? 'M' : tarde >= umbral * total ? 'T' : 'A');
  }
  return resultado;
}
