import { esFechaISO } from '../modelo/fechas';
import { nuevoId } from '../modelo/ids';
import type { EstadoApp, Id, Persona, RestriccionPersona } from '../modelo/tipos';
import { normalizarCodigo } from '../persistencia/coherencia';
import { cuenta, efectosAsignaciones, insertarDetras, quitarAsignaciones } from './comun';
import type { Impacto } from './tipos';

const MAX_MINUTOS_SEMANA = 7 * 24 * 60;

/** 'EMP-30': máximo numérico de los códigos existentes + 1, con 2 cifras como mínimo. */
export function siguienteCodigo(estado: EstadoApp): string {
  let max = 0;
  for (const p of estado.personas) {
    const m = /(\d+)\s*$/.exec(p.codigo);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `EMP-${String(max + 1).padStart(2, '0')}`;
}

export function crearPersona(estado: EstadoApp, ids: () => Id = () => nuevoId('per')): Persona {
  return {
    id: ids(),
    codigo: siguienteCodigo(estado),
    alias: null,
    equipo: 'M',
    habilitaciones: [],
    activa: true,
    alta: null,
    baja: null,
    contratoMinSemana: null,
    objetivoCoberturaMinSemana: null,
    restricciones: [],
    patron: [],
  };
}

export function anadirPersona(estado: EstadoApp, persona: Persona): EstadoApp {
  return { ...estado, personas: [...estado.personas, persona] };
}

export function reemplazarPersona(estado: EstadoApp, persona: Persona): EstadoApp {
  return { ...estado, personas: estado.personas.map((p) => (p.id === persona.id ? persona : p)) };
}

/** Copia con código siguiente, sin alias y con restricciones de ids nuevos; justo detrás de la original. */
export function duplicarPersona(
  estado: EstadoApp,
  id: Id,
  ids: () => Id = () => nuevoId('per'),
  idsRestriccion: () => Id = () => nuevoId('restr'),
): EstadoApp {
  const original = estado.personas.find((p) => p.id === id);
  if (!original) return estado;
  const copia: Persona = {
    ...structuredClone(original),
    id: ids(),
    codigo: siguienteCodigo(estado),
    alias: null,
  };
  copia.restricciones = copia.restricciones.map((r) => ({ ...r, id: idsRestriccion() }));
  return { ...estado, personas: insertarDetras(estado.personas, id, copia) };
}

function horasNoValidas(min: number | null): boolean {
  return min !== null && (!Number.isFinite(min) || min < 0 || min > MAX_MINUTOS_SEMANA);
}

export function erroresPersona(estado: EstadoApp, persona: Persona): string[] {
  const errores: string[] = [];
  const codigo = persona.codigo.trim();
  const nombre = codigo || 'La persona';
  if (!codigo) {
    errores.push('Falta el código de la persona');
  } else {
    const clave = normalizarCodigo(codigo);
    for (const otra of estado.personas) {
      if (otra.id === persona.id) continue;
      if (normalizarCodigo(otra.codigo) !== clave) continue;
      errores.push(
        otra.codigo === persona.codigo
          ? `El código ${codigo} ya lo tiene otra persona`
          : `El código ${codigo} coincide con ${otra.codigo}`,
      );
    }
  }
  if (persona.alta !== null && !esFechaISO(persona.alta)) errores.push(`${nombre}: la fecha de alta no es válida`);
  if (persona.baja !== null && !esFechaISO(persona.baja)) errores.push(`${nombre}: la fecha de baja no es válida`);
  if (
    persona.alta !== null && persona.baja !== null &&
    esFechaISO(persona.alta) && esFechaISO(persona.baja) && persona.alta >= persona.baja
  ) {
    errores.push(`${nombre}: la fecha de alta no es anterior a la de baja`);
  }
  for (const h of persona.habilitaciones) {
    const existe = estado.areas.some((a) => a.id === h) || estado.puestos.some((p) => p.id === h);
    if (!existe) errores.push(`${nombre} está habilitada para un área o puesto que ya no existe`);
  }
  if (horasNoValidas(persona.contratoMinSemana)) {
    errores.push(`${nombre}: las horas de contrato deben estar entre 0 y 168 horas semanales`);
  }
  if (horasNoValidas(persona.objetivoCoberturaMinSemana)) {
    errores.push(`${nombre}: el objetivo de cobertura debe estar entre 0 y 168 horas semanales`);
  }
  if (persona.alias !== null && persona.alias.length > 40) {
    errores.push(`${nombre}: el alias no puede tener más de 40 caracteres`);
  }
  return errores;
}

export function impactoBorrarPersona(estado: EstadoApp, id: Id): Impacto {
  const efectos = efectosAsignaciones(quitarAsignaciones(estado, (a) => a.personaId === id));
  const incidencias = estado.incidencias.filter((i) => i.tipo === 'ausencia' && i.personaId === id).length;
  if (incidencias > 0) {
    efectos.push(`${incidencias === 1 ? 'Se quitará' : 'Se quitarán'} ${cuenta(incidencias, 'incidencia', 'incidencias')}`);
  }
  return { bloqueos: [], efectos };
}

/** Quita la persona con sus asignaciones (cuadrantes y semanas tipo) e incidencias. */
export function borrarPersona(estado: EstadoApp, id: Id): EstadoApp {
  const { estado: sinAsignaciones } = quitarAsignaciones(estado, (a) => a.personaId === id);
  return {
    ...sinAsignaciones,
    personas: sinAsignaciones.personas.filter((p) => p.id !== id),
    incidencias: sinAsignaciones.incidencias.filter((i) => !(i.tipo === 'ausencia' && i.personaId === id)),
  };
}

// ───────────────────────── Restricciones ─────────────────────────

function conRestricciones(
  estado: EstadoApp,
  personaId: Id,
  f: (rs: RestriccionPersona[]) => RestriccionPersona[],
): EstadoApp {
  return {
    ...estado,
    personas: estado.personas.map((p) => (p.id === personaId ? { ...p, restricciones: f(p.restricciones) } : p)),
  };
}

export function anadirRestriccion(estado: EstadoApp, personaId: Id, r: RestriccionPersona): EstadoApp {
  return conRestricciones(estado, personaId, (rs) => [...rs, r]);
}

export function reemplazarRestriccion(estado: EstadoApp, personaId: Id, r: RestriccionPersona): EstadoApp {
  return conRestricciones(estado, personaId, (rs) => rs.map((x) => (x.id === r.id ? r : x)));
}

export function borrarRestriccion(estado: EstadoApp, personaId: Id, restriccionId: Id): EstadoApp {
  return conRestricciones(estado, personaId, (rs) => rs.filter((x) => x.id !== restriccionId));
}
