/**
 * CONTRATO · Interfaz común de las reglas (§3.2, §3.3, §5).
 * No modificar sin permiso del director.
 *
 * Cada tipo de regla vive en su propio archivo:
 *   src/reglas/general/<tipo>.ts  → exporta `definicion: DefinicionReglaGeneral<'<tipo>'>`
 *   src/reglas/persona/<tipo>.ts  → exporta `definicion: DefinicionRestriccion<'<tipo>'>`
 * y se registra en src/reglas/catalogo.ts.
 *
 * Una regla tiene dos usos:
 *  1. `evaluar`: validación completa de la semana (validador, semáforo, tests).
 *  2. `comprobar`: coste incremental de añadir UNA asignación candidata a la semana
 *     actual (motor y sugerencias manuales). Debe ser coherente con `evaluar`:
 *     si `comprobar` permite la candidata, añadirla no crea incumplimientos duros
 *     nuevos de esta regla; y `coste` es la penalización blanda que añade.
 *     Las reglas que solo afectan al conjunto (cobertura, reparto) pueden devolver
 *     siempre { permitido: true, coste: 0 } y dejar que el motor use `evaluar`.
 */
import type {
  Area,
  Asignacion,
  AsignacionPausa,
  AsignacionPuesto,
  ClaveHueco,
  DatosPlanificacion,
  DiaSemana,
  FechaISO,
  Franja,
  Hueco,
  HorarioDia,
  Id,
  Minutos,
  ParamsReglaGeneral,
  ParamsRestriccion,
  Persona,
  Puesto,
  ReglaGeneral,
  RestriccionPersona,
  TipoReglaGeneral,
  TipoRestriccion,
} from '../modelo/tipos';

// ───────────────────────── Resultado de evaluar ─────────────────────────

/**
 * Marca visual de la celda (código de colores de su Excel, §10.1),
 * siempre acompañada de icono o texto en la UI.
 *  - solape        → rojo
 *  - noDisponible  → naranja (de baja, ausente, fuera de plantilla, sin habilitación)
 *  - comidaSinTurno→ amarillo
 *  - hueco         → hueco sin cubrir
 *  - aviso         → resto de incumplimientos
 */
export type MarcaCelda = 'solape' | 'noDisponible' | 'comidaSinTurno' | 'hueco' | 'aviso';

export interface Incumplimiento {
  /** Id de la regla general o de la restricción personal que lo produce. */
  reglaId: Id;
  origen: 'general' | 'persona';
  tipo: TipoReglaGeneral | TipoRestriccion;
  dura: boolean;
  /** 0 si es dura; si es blanda, peso × unidades. */
  penalizacion: number;
  /** Texto en español, legible por la usuaria, con códigos EMP-xx, día y hora. */
  mensaje: string;
  marca: MarcaCelda;
  fecha: FechaISO | null;
  personaId: Id | null;
  /** Asignaciones implicadas (para resaltar y navegar). */
  asignacionIds: Id[];
  /** Huecos implicados (para incumplimientos sin asignación, como huecos vacíos). */
  huecos: ClaveHueco[];
}

/** Resultado de `comprobar` una candidata. */
export interface Comprobacion {
  /** false si añadirla incumpliría esta regla siendo dura. */
  permitido: boolean;
  /** Penalización blanda adicional (0 si dura o si no empeora). */
  coste: number;
  /** Motivos legibles, cortos: «EMP-11 supera 4h30 el jueves». */
  motivos: string[];
}

// ───────────────────────── Contexto ─────────────────────────

/**
 * Índices precalculados de una semana. Implementación en src/validacion/indice.ts.
 * Todas las consultas son O(1) o O(asignaciones de esa persona y día).
 */
export interface IndiceSemana {
  lunes: FechaISO;
  /** Las 7 fechas de la semana, de lunes a domingo. */
  fechas: readonly FechaISO[];
  diaDe(fecha: FechaISO): DiaSemana;

  persona(id: Id): Persona | undefined;
  puesto(id: Id): Puesto | undefined;
  area(id: Id): Area | undefined;

  /** Horario efectivo del puesto ese día (null si el puesto no existe ese día o está cerrado por incidencia). */
  horario(puestoId: Id, fecha: FechaISO): HorarioDia | null;
  franja(puestoId: Id, fecha: FechaISO, franjaId: Id): Franja | undefined;
  /** Intervalo real de una asignación (franja del puesto o tramo de la pausa). Undefined si la franja ya no existe. */
  intervalo(a: Asignacion): { inicio: Minutos; fin: Minutos } | undefined;

  /** Todos los huecos de la semana (puestos activos × días × franjas × plazas). */
  huecos(): readonly Hueco[];
  hueco(clave: ClaveHueco): Hueco | undefined;
  claveDe(a: AsignacionPuesto): ClaveHueco;

  asignaciones(): readonly Asignacion[];
  enHueco(clave: ClaveHueco): AsignacionPuesto | undefined;
  dePersona(personaId: Id): readonly Asignacion[];
  dePersonaDia(personaId: Id, fecha: FechaISO): readonly Asignacion[];
  pausasDe(personaId: Id, fecha: FechaISO): readonly AsignacionPausa[];

  /** Minutos de cobertura (solo puestos, no pausas). */
  minutosDia(personaId: Id, fecha: FechaISO): Minutos;
  minutosSemana(personaId: Id): Minutos;
  /** Jornada del día: inicio del primer puesto → fin del último (null si no trabaja). */
  jornada(personaId: Id, fecha: FechaISO): { inicio: Minutos; fin: Minutos } | null;
  diasTrabajados(personaId: Id): readonly FechaISO[];

  /** ¿Está ausente (incidencia) en ese intervalo? */
  ausente(personaId: Id, fecha: FechaISO, intervalo: { inicio: Minutos; fin: Minutos }): boolean;
  /** ¿Está en plantilla ese día (activa y dentro de alta/baja)? */
  enPlantilla(personaId: Id, fecha: FechaISO): boolean;
  /** Equipo efectivo ese día, teniendo en cuenta el patrón rotatorio. */
  equipoEfectivo(personaId: Id, fecha: FechaISO): Persona['equipo'];
}

export interface ContextoEvaluacion {
  datos: DatosPlanificacion;
  indice: IndiceSemana;
}

// ───────────────────────── Definición de un tipo de regla ─────────────────────────

interface DefinicionBase<P> {
  /** Nombre del tipo en la UI: «Sin solapes». */
  nombre: string;
  /** Texto de ayuda corto para la usuaria. */
  ayuda: string;
  /** Restricciones de dureza que admite el tipo. */
  dureza: 'ambas' | 'soloDura' | 'soloBlanda';
  /** Peso por defecto si es blanda. */
  pesoPorDefecto: number;
  /** Parámetros por defecto al crear una regla nueva de este tipo. */
  paramsPorDefecto(datos: DatosPlanificacion): P;
  /** Descripción legible a partir de los parámetros: «Máximo 4h30 al día (Pedidos: sin límite)». */
  describir(params: P, datos: DatosPlanificacion): string;
  /** Errores de parámetros (vacío = válidos). Se usa en el editor y al importar. */
  validarParams(params: P, datos: DatosPlanificacion): string[];
}

export interface DefinicionReglaGeneral<T extends TipoReglaGeneral> extends DefinicionBase<ParamsReglaGeneral[T]> {
  tipo: T;
  evaluar(regla: ReglaGeneral<T>, ctx: ContextoEvaluacion): Incumplimiento[];
  comprobar(regla: ReglaGeneral<T>, ctx: ContextoEvaluacion, candidata: Asignacion): Comprobacion;
}

export interface DefinicionRestriccion<T extends TipoRestriccion> extends DefinicionBase<ParamsRestriccion[T]> {
  tipo: T;
  evaluar(restriccion: RestriccionPersona<T>, persona: Persona, ctx: ContextoEvaluacion): Incumplimiento[];
  /** Solo se llama si `candidata.personaId === persona.id`. */
  comprobar(
    restriccion: RestriccionPersona<T>,
    persona: Persona,
    ctx: ContextoEvaluacion,
    candidata: Asignacion,
  ): Comprobacion;
}

/** Forma del registro completo (src/reglas/catalogo.ts): un tipo sin definición no compila. */
export type CatalogoGeneral = { [T in TipoReglaGeneral]: DefinicionReglaGeneral<T> };
export type CatalogoRestricciones = { [T in TipoRestriccion]: DefinicionRestriccion<T> };

// ───────────────────────── Resultado global de la validación ─────────────────────────

export type Semaforo = 'verde' | 'ambar' | 'rojo';

export interface ResultadoValidacion {
  semaforo: Semaforo;
  incumplimientos: Incumplimiento[];
  penalizacionBlanda: number;
}
