/** Utilidades internas compartidas por los módulos de edición (puras). */
import { diaSemana } from '../modelo/fechas';
import type {
  Ambito,
  Asignacion,
  AsignacionTipo,
  CuadranteSemana,
  DiaSemana,
  EstadoApp,
  Id,
  Persona,
  ReglaGeneral,
  RestriccionPersona,
  SemanaTipo,
} from '../modelo/tipos';

/** «1 puesto» / «3 puestos». */
export function cuenta(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Inserta `nuevo` justo detrás del elemento con `id`; si no existe, al final. */
export function insertarDetras<T extends { id: Id }>(lista: readonly T[], id: Id, nuevo: T): T[] {
  const i = lista.findIndex((x) => x.id === id);
  const copia = [...lista];
  copia.splice(i < 0 ? copia.length : i + 1, 0, nuevo);
  return copia;
}

/** Intercambia el campo `orden` de `id` con su vecino dentro de `grupo` (ya ordenado por presentación). */
export function intercambiarOrden<T extends { id: Id; orden: number }>(
  grupo: readonly T[],
  id: Id,
  sentido: -1 | 1,
): Map<Id, number> {
  const i = grupo.findIndex((x) => x.id === id);
  const j = i + sentido;
  const cambios = new Map<Id, number>();
  const a = grupo[i];
  const b = grupo[j];
  if (!a || !b) return cambios;
  if (a.orden !== b.orden) {
    cambios.set(a.id, b.orden);
    cambios.set(b.id, a.orden);
    return cambios;
  }
  // Empate: se renumera el grupo según la nueva posición.
  const nuevo = [...grupo];
  nuevo[i] = b;
  nuevo[j] = a;
  const base = Math.min(...grupo.map((x) => x.orden));
  nuevo.forEach((x, k) => cambios.set(x.id, base + k));
  return cambios;
}

// ───────────────────────── Asignaciones ─────────────────────────

export type AsignacionCualquiera = Asignacion | AsignacionTipo;

export function diaDeAsignacion(a: AsignacionCualquiera): DiaSemana {
  return 'dia' in a ? a.dia : diaSemana(a.fecha);
}

export interface ResultadoQuitar {
  estado: EstadoApp;
  asignaciones: number;
  semanas: number;
  asignacionesTipo: number;
  semanasTipo: number;
}

/**
 * Aplica `decidir` a cada asignación de cuadrantes y semanas tipo: devolver la misma asignación la mantiene,
 * `null` la quita y otra distinta la sustituye (reasignación). Cuenta solo las quitadas.
 */
export function modificarAsignaciones(
  estado: EstadoApp,
  decidir: (a: AsignacionCualquiera) => AsignacionCualquiera | null,
): ResultadoQuitar {
  let asignaciones = 0;
  let semanas = 0;
  const aplicar = <T extends AsignacionCualquiera>(lista: readonly T[]): { lista: T[]; quitadas: number; cambiada: boolean } => {
    const resultado: T[] = [];
    let quitadas = 0;
    let cambiada = false;
    for (const a of lista) {
      const n = decidir(a);
      if (n === null) {
        quitadas += 1;
        cambiada = true;
      } else {
        if (n !== a) cambiada = true;
        resultado.push(n as T);
      }
    }
    return { lista: resultado, quitadas, cambiada };
  };
  const cuadrantes: Record<string, CuadranteSemana> = {};
  for (const [lunes, c] of Object.entries(estado.cuadrantes)) {
    const r = aplicar(c.asignaciones);
    if (r.quitadas > 0) {
      asignaciones += r.quitadas;
      semanas += 1;
    }
    cuadrantes[lunes] = r.cambiada ? { ...c, asignaciones: r.lista } : c;
  }
  let asignacionesTipo = 0;
  let semanasTipo = 0;
  const tipo: SemanaTipo[] = estado.semanasTipo.map((s) => {
    const r = aplicar(s.asignaciones);
    if (r.quitadas > 0) {
      asignacionesTipo += r.quitadas;
      semanasTipo += 1;
    }
    return r.cambiada ? { ...s, asignaciones: r.lista } : s;
  });
  return { estado: { ...estado, cuadrantes, semanasTipo: tipo }, asignaciones, semanas, asignacionesTipo, semanasTipo };
}

/** Quita de cuadrantes y semanas tipo las asignaciones para las que `quitar` devuelve true. */
export function quitarAsignaciones(estado: EstadoApp, quitar: (a: AsignacionCualquiera) => boolean): ResultadoQuitar {
  return modificarAsignaciones(estado, (a) => (quitar(a) ? null : a));
}

export function efectosAsignaciones(r: ResultadoQuitar): string[] {
  const efectos: string[] = [];
  if (r.asignaciones > 0) {
    efectos.push(
      `${r.asignaciones === 1 ? 'Se quitará' : 'Se quitarán'} ${cuenta(r.asignaciones, 'asignación', 'asignaciones')} en ${cuenta(r.semanas, 'semana', 'semanas')}`,
    );
  }
  if (r.asignacionesTipo > 0) {
    efectos.push(
      `${r.asignacionesTipo === 1 ? 'Se quitará' : 'Se quitarán'} ${cuenta(r.asignacionesTipo, 'asignación', 'asignaciones')} de ${cuenta(r.semanasTipo, 'semana tipo', 'semanas tipo')}`,
    );
  }
  return efectos;
}

// ───────────────────────── Referencias a áreas y puestos ─────────────────────────

export interface Referencias {
  areaIds: ReadonlySet<Id>;
  puestoIds: ReadonlySet<Id>;
}

export interface ResultadoReferencias {
  estado: EstadoApp;
  personas: number;
  reglas: number;
  restricciones: number;
  /** Avisos de reglas y restricciones que se desactivan por quedarse sin ámbito. */
  desactivaciones: string[];
}

const ambitoVacio = (a: Ambito): boolean => a.areaIds.length === 0 && a.puestoIds.length === 0;

/** Cambia el ámbito; si tenía contenido y queda vacío (= «todo»), desactiva la regla siempre. */
function conAmbito<T extends { activa: boolean }>(r: T, antes: Ambito, ref: Referencias): { r: T; ambito: Ambito } {
  const ambito = limpiarAmbito(antes, ref);
  const vacia = !ambitoVacio(antes) && ambitoVacio(ambito);
  return { r: vacia ? { ...r, activa: false } : r, ambito };
}

/**
 * Indica si una regla cuyo ámbito (o lista de puestos) es obligatorio para tener sentido lo tiene vacío.
 * Solo aplica a noRepetirConsecutivas, mismaPersonaBloque, rotarEntreBloques y exclusividadDiaria;
 * la UI pide confirmación al activarla porque un ámbito vacío significa «todos los puestos».
 */
export function ambitoVaciado(regla: ReglaGeneral): boolean {
  switch (regla.tipo) {
    case 'noRepetirConsecutivas':
    case 'mismaPersonaBloque':
    case 'rotarEntreBloques':
      return ambitoVacio(regla.params.ambito);
    case 'exclusividadDiaria':
      return regla.params.puestoIds.length === 0;
    default:
      return false;
  }
}

/** Igual que `ambitoVaciado`, para restricciones noAsignarA. */
function restriccionVaciada(r: RestriccionPersona): boolean {
  return r.tipo === 'noAsignarA' && ambitoVacio(r.params.ambito);
}

function limpiarAmbito(a: Ambito, ref: Referencias): Ambito {
  return {
    areaIds: a.areaIds.filter((x) => !ref.areaIds.has(x)),
    puestoIds: a.puestoIds.filter((x) => !ref.puestoIds.has(x)),
  };
}

function limpiarRegla(r: ReglaGeneral, ref: Referencias): ReglaGeneral {
  switch (r.tipo) {
    case 'noRepetirConsecutivas':
    case 'mismaPersonaBloque':
    case 'rotarEntreBloques': {
      const ambito = limpiarAmbito(r.params.ambito, ref);
      const nueva = { ...r, params: { ambito } };
      return !ambitoVacio(r.params.ambito) && ambitoVacio(ambito) ? { ...nueva, activa: false, estado: 'pendiente' as const } : nueva;
    }
    case 'exclusividadDiaria': {
      const puestoIds = r.params.puestoIds.filter((x) => !ref.puestoIds.has(x));
      const nueva = { ...r, params: { ...r.params, puestoIds } };
      return r.params.puestoIds.length > 0 && puestoIds.length === 0 ? { ...nueva, activa: false, estado: 'pendiente' as const } : nueva;
    }
    case 'maxMinutosDia':
      return {
        ...r,
        params: { ...r.params, excepciones: r.params.excepciones.filter((e) => !ref.areaIds.has(e.areaId)) },
      };
    default:
      return r;
  }
}

function limpiarRestriccion(r: RestriccionPersona, ref: Referencias): RestriccionPersona {
  if (r.tipo === 'noAsignarA') {
    const c = conAmbito(r, r.params.ambito, ref);
    return { ...c.r, params: { ambito: c.ambito } };
  }
  return r;
}

const distinto = (a: unknown, b: unknown): boolean => JSON.stringify(a) !== JSON.stringify(b);

/** Quita los ids de áreas/puestos de habilitaciones, ámbitos, excepciones y exclusividades. */
export function quitarReferencias(estado: EstadoApp, ref: Referencias): ResultadoReferencias {
  let personasTocadas = 0;
  let restriccionesTocadas = 0;
  const desactivaciones: string[] = [];
  const personas: Persona[] = estado.personas.map((p) => {
    const habilitaciones = p.habilitaciones.filter((h) => !ref.areaIds.has(h) && !ref.puestoIds.has(h));
    const restricciones = p.restricciones.map((r) => {
      const n = limpiarRestriccion(r, ref);
      if (distinto(n, r)) restriccionesTocadas += 1;
      if (!restriccionVaciada(r) && restriccionVaciada(n)) {
        desactivaciones.push(`Se desactivará una restricción de ${p.codigo} porque se queda sin puestos`);
      }
      return n;
    });
    if (habilitaciones.length !== p.habilitaciones.length) personasTocadas += 1;
    return { ...p, habilitaciones, restricciones };
  });
  let reglasTocadas = 0;
  const reglas = estado.reglas.map((r) => {
    const n = limpiarRegla(r, ref);
    if (distinto(n, r)) reglasTocadas += 1;
    if (!ambitoVaciado(r) && ambitoVaciado(n)) {
      desactivaciones.push(`La regla «${r.nombre}» se desactivará porque se queda sin puestos`);
    }
    return n;
  });
  return {
    estado: { ...estado, personas, reglas },
    personas: personasTocadas,
    reglas: reglasTocadas,
    restricciones: restriccionesTocadas,
    desactivaciones,
  };
}

/** Efectos legibles de un resultado de `quitarReferencias`. */
export function efectosReferencias(r: ResultadoReferencias): string[] {
  const efectos: string[] = [];
  if (r.personas > 0) efectos.push(`Se quitará la habilitación a ${cuenta(r.personas, 'persona', 'personas')}`);
  if (r.reglas > 0) efectos.push(`Se quitará de ${cuenta(r.reglas, 'regla', 'reglas')}`);
  if (r.restricciones > 0) {
    efectos.push(`Se quitará de ${cuenta(r.restricciones, 'restricción de personas', 'restricciones de personas')}`);
  }
  efectos.push(...r.desactivaciones);
  return efectos;
}
