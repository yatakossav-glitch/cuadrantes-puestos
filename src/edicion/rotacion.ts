/** Edición de la rotación, las semanas tipo y los patrones por persona (ARQUITECTURA §12.1). Puro. */
import { aSemanaTipo } from '../rotacion/semanaTipo';
import { semanaDelCiclo } from '../rotacion/ciclo';
import { diaSemana, esFechaISO, hoyISO, lunesDe } from '../modelo/fechas';
import { nuevoId } from '../modelo/ids';
import type { EstadoApp, FechaISO, Id, Persona, PasoPatron, Rotacion } from '../modelo/tipos';
import { cuenta } from './comun';
import type { Impacto } from './tipos';

export const MAX_CICLO = 12;
const MAX_ETIQUETA = 12;
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** ['A', 'B', …] para un ciclo de `n` semanas. */
export function etiquetasPorDefecto(n: number): string[] {
  return Array.from({ length: Math.max(0, Math.trunc(n)) }, (_, i) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : ''));
}

/** Problemas de una rotación, en español; vacío si es válida. */
export function erroresRotacion(r: Rotacion): string[] {
  const errores: string[] = [];
  if (!Number.isInteger(r.longitudCiclo) || r.longitudCiclo < 1 || r.longitudCiclo > MAX_CICLO) {
    errores.push(`El ciclo debe tener un número entero de semanas entre 1 y ${MAX_CICLO}`);
  }
  if (!esFechaISO(r.lunesReferencia)) errores.push('La fecha de referencia no es válida');
  else if (diaSemana(r.lunesReferencia) !== 0) errores.push('La fecha de referencia debe ser un lunes');
  if (r.etiquetas.length !== r.longitudCiclo) errores.push('Debe haber una etiqueta por cada semana del ciclo');
  const vistas = new Set<string>();
  for (const e of r.etiquetas) {
    const t = e.trim();
    if (t === '') errores.push('Las etiquetas no pueden estar vacías');
    else if (t.length > MAX_ETIQUETA) errores.push(`La etiqueta «${t}» supera los ${MAX_ETIQUETA} caracteres`);
    if (t !== '' && vistas.has(t)) errores.push(`La etiqueta «${t}» está repetida`);
    vistas.add(t);
  }
  return errores;
}

const etiquetaDe = (r: Rotacion, indice: number): string => r.etiquetas[indice] ?? String(indice + 1);

/** «30 nov». */
function fechaCorta(fecha: FechaISO): string {
  const [, m, d] = fecha.split('-');
  return `${Number(d)} ${MESES_CORTOS[Number(m) - 1] ?? ''}`;
}

/** Qué cambia al sustituir la rotación. `hoy` solo sirve para nombrar «la semana actual». */
export function impactoCambiarRotacion(estado: EstadoApp, nueva: Rotacion, hoy: FechaISO = hoyISO()): Impacto {
  const bloqueos = erroresRotacion(nueva);
  const efectos: string[] = [];
  const largo = Math.max(1, Math.trunc(nueva.longitudCiclo) || 1);
  for (const s of [...estado.semanasTipo].sort((a, b) => a.indiceCiclo - b.indiceCiclo)) {
    if (s.indiceCiclo >= largo) {
      efectos.push(`Se borrará la semana tipo ${etiquetaDe(estado.rotacion, s.indiceCiclo)} (${cuenta(s.asignaciones.length, 'asignación', 'asignaciones')})`);
    }
  }
  const pasos = estado.personas.reduce((n, p) => n + p.patron.filter((x) => x.indiceCiclo >= largo).length, 0);
  if (pasos > 0) efectos.push(`${pasos === 1 ? 'Se borrará' : 'Se borrarán'} ${cuenta(pasos, 'paso de patrón', 'pasos de patrón')} de las semanas que desaparecen`);
  if (esFechaISO(nueva.lunesReferencia) && esFechaISO(hoy)) {
    const lunes = lunesDe(hoy);
    const antes = semanaDelCiclo(estado.rotacion, lunes);
    const despues = semanaDelCiclo({ ...nueva, longitudCiclo: largo }, lunes);
    if (antes.indice !== despues.indice || antes.etiqueta !== despues.etiqueta) {
      efectos.push(`La semana del ${fechaCorta(lunes)} pasará a ser la ${despues.etiqueta} (antes ${antes.etiqueta})`);
    }
  }
  return { bloqueos, efectos };
}

/** Aplica la rotación y borra las semanas tipo y pasos de patrón que quedan fuera del ciclo. */
export function cambiarRotacion(estado: EstadoApp, nueva: Rotacion): EstadoApp {
  const largo = nueva.longitudCiclo;
  return {
    ...estado,
    rotacion: { ...nueva, etiquetas: nueva.etiquetas.map((e) => e.trim()) },
    semanasTipo: estado.semanasTipo.filter((s) => s.indiceCiclo < largo),
    personas: estado.personas.map((p) => (p.patron.some((x) => x.indiceCiclo >= largo) ? { ...p, patron: p.patron.filter((x) => x.indiceCiclo < largo) } : p)),
  };
}

function asignacionesValidas(estado: EstadoApp, lunes: FechaISO) {
  const delaSemana = estado.cuadrantes[lunes]?.asignaciones ?? [];
  const validas = aSemanaTipo(estado, lunes, delaSemana, () => 'x');
  return { total: delaSemana.length, validas: validas.length };
}

/** Qué ocurre al guardar la semana `lunes` como semana tipo `indiceCiclo`. */
export function impactoGuardarSemanaTipo(estado: EstadoApp, lunes: FechaISO, indiceCiclo: number): Impacto {
  const bloqueos: string[] = [];
  const efectos: string[] = [];
  if (!Number.isInteger(indiceCiclo) || indiceCiclo < 0 || indiceCiclo >= estado.rotacion.longitudCiclo) {
    bloqueos.push('Esa semana no existe en el ciclo');
    return { bloqueos, efectos };
  }
  const { total, validas } = asignacionesValidas(estado, lunes);
  if (validas === 0) {
    bloqueos.push('La semana elegida no tiene asignaciones válidas que guardar');
    return { bloqueos, efectos };
  }
  const etiqueta = etiquetaDe(estado.rotacion, indiceCiclo);
  const previa = estado.semanasTipo.find((s) => s.indiceCiclo === indiceCiclo);
  const n = cuenta(validas, 'asignación', 'asignaciones');
  efectos.push(previa ? `Reemplazará la semana tipo ${etiqueta} (${cuenta(previa.asignaciones.length, 'asignación', 'asignaciones')}) por otra de ${n}` : `Creará la semana tipo ${etiqueta} con ${n}`);
  if (total > validas) {
    const omitidas = total - validas;
    efectos.push(`${omitidas === 1 ? 'Se omite' : 'Se omiten'} ${cuenta(omitidas, 'asignación', 'asignaciones')} fuera del horario`);
  }
  return { bloqueos, efectos };
}

/** Crea o reemplaza (conservando el id) la semana tipo del índice a partir de la semana `lunes`. */
export function guardarSemanaTipo(estado: EstadoApp, lunes: FechaISO, indiceCiclo: number, nombre: string, ids?: () => Id): EstadoApp {
  const asignaciones = aSemanaTipo(estado, lunes, estado.cuadrantes[lunes]?.asignaciones ?? [], ids ?? (() => nuevoId('asg')));
  const previa = estado.semanasTipo.find((s) => s.indiceCiclo === indiceCiclo);
  const nueva = { id: previa?.id ?? (ids ?? (() => nuevoId('sem')))(), indiceCiclo, nombre: nombre.trim(), asignaciones };
  const resto = estado.semanasTipo.filter((s) => s.indiceCiclo !== indiceCiclo);
  const semanasTipo = previa
    ? estado.semanasTipo.map((s) => (s.id === previa.id ? nueva : s))
    : [...resto, nueva].sort((a, b) => a.indiceCiclo - b.indiceCiclo);
  return { ...estado, semanasTipo };
}

export function renombrarSemanaTipo(estado: EstadoApp, id: Id, nombre: string): EstadoApp {
  return { ...estado, semanasTipo: estado.semanasTipo.map((s) => (s.id === id ? { ...s, nombre: nombre.trim() } : s)) };
}

export function borrarSemanaTipo(estado: EstadoApp, id: Id): EstadoApp {
  return { ...estado, semanasTipo: estado.semanasTipo.filter((s) => s.id !== id) };
}

/** Paso guardado para esa semana del ciclo o uno vacío. */
export function pasoPatron(persona: Persona, indiceCiclo: number): PasoPatron {
  return persona.patron.find((p) => p.indiceCiclo === indiceCiclo) ?? { indiceCiclo, equipo: null, diasLibres: [] };
}

/** Reemplaza o añade el paso; si queda vacío se quita. El patrón queda ordenado por semana del ciclo. */
export function cambiarPasoPatron(estado: EstadoApp, personaId: Id, paso: PasoPatron): EstadoApp {
  if (!Number.isInteger(paso.indiceCiclo) || paso.indiceCiclo < 0 || paso.indiceCiclo >= estado.rotacion.longitudCiclo) return estado;
  const limpio: PasoPatron = { ...paso, diasLibres: [...new Set(paso.diasLibres)].sort((a, b) => a - b) };
  const vacio = limpio.equipo === null && limpio.diasLibres.length === 0;
  return {
    ...estado,
    personas: estado.personas.map((p) => {
      if (p.id !== personaId) return p;
      const resto = p.patron.filter((x) => x.indiceCiclo !== paso.indiceCiclo);
      const patron = (vacio ? resto : [...resto, limpio]).sort((a, b) => a.indiceCiclo - b.indiceCiclo);
      return { ...p, patron };
    }),
  };
}

export function quitarPatron(estado: EstadoApp, personaId: Id): EstadoApp {
  return { ...estado, personas: estado.personas.map((p) => (p.id === personaId ? { ...p, patron: [] } : p)) };
}
