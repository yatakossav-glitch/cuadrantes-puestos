/**
 * CONTRATO · Modelo de datos de la aplicación (§3 de la especificación).
 * No modificar sin permiso del director. Cualquier cambio exige subir
 * VERSION_ESQUEMA en esquema.ts y escribir su migración.
 *
 * Convenciones:
 *  - Horas: minutos desde las 00:00 (`Minutos`). 10:00 = 600, 15:45 = 945.
 *    Las duraciones también van en minutos. 4h30 = 270.
 *  - Intervalos semiabiertos [inicio, fin): 13:00–14:30 y 14:30–15:45 NO se solapan.
 *  - Fechas: texto ISO 'AAAA-MM-DD' en hora local, sin zona horaria.
 *  - Días de la semana: 0 = lunes … 6 = domingo.
 *  - Identificadores: texto opaco y estable (`Id`), generado por la app.
 */

// ───────────────────────── Tipos base ─────────────────────────

export type Id = string;
/** 'AAAA-MM-DD' */
export type FechaISO = string;
/** Minutos desde las 00:00, o duración en minutos. */
export type Minutos = number;
/** 0 = lunes … 6 = domingo */
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const DIAS_SEMANA: readonly DiaSemana[] = [0, 1, 2, 3, 4, 5, 6];

/** M = mañana, T = tarde, A = ambos. */
export type Equipo = 'M' | 'T' | 'A';

/** Intervalo horario [inicio, fin). */
export interface Intervalo {
  inicio: Minutos;
  fin: Minutos;
}

/**
 * Ámbito de aplicación de una regla. Si ambas listas están vacías, aplica a todo.
 * Si no, aplica a los puestos listados y a todos los puestos de las áreas listadas.
 */
export interface Ambito {
  areaIds: Id[];
  puestoIds: Id[];
}

/**
 * Dureza: una regla dura nunca se puede incumplir en lo que genera el motor;
 * una blanda suma `peso × unidades` a la penalización (la unidad la define cada tipo).
 * `peso` se ignora si `dura` es true.
 */
export interface Dureza {
  dura: boolean;
  peso: number;
}

// ───────────────────────── Áreas y puestos (§3.1) ─────────────────────────

/** Iconos de área disponibles (SVG de línea embebidos en src/ui/iconos). */
export type IconoArea = 'caja' | 'paquete' | 'bloques' | 'libro' | 'tienda' | 'etiqueta' | 'reloj' | 'usuarios';

export interface Area {
  id: Id;
  nombre: string;
  /** Planta del edificio: 3, 4… */
  planta: number;
  /** Color de acento en hexadecimal (#rrggbb). La UI deriva el fondo pastel. */
  color: string;
  icono: IconoArea;
  activa: boolean;
  orden: number;
}

/** Franja horaria de un puesto. El id es único dentro del puesto (en todos sus días). */
export interface Franja extends Intervalo {
  id: Id;
}

/**
 * Bloque: franjas consecutivas del mismo puesto y día que exigen la misma
 * persona en todas ellas (p. ej. caja 10:00–13:00 = dos franjas).
 * Una franja pertenece como mucho a un bloque.
 */
export interface Bloque {
  id: Id;
  nombre: string;
  franjaIds: Id[];
}

export interface HorarioDia {
  franjas: Franja[];
  bloques: Bloque[];
}

export interface Puesto {
  id: Id;
  areaId: Id;
  /** «Caja 1», «Caja 2», «Puesto único»… */
  nombre: string;
  /** Plazas simultáneas (personas a la vez en cada franja). Normalmente 1. */
  plazas: number;
  /** Días en que existe el puesto. */
  dias: DiaSemana[];
  /** Horario general y, opcionalmente, horario distinto para días concretos (p. ej. domingo). */
  horario: {
    general: HorarioDia;
    porDia: Partial<Record<DiaSemana, HorarioDia>>;
  };
  /**
   * Si es true, solo pueden ocupar el puesto las personas cuyas `habilitaciones`
   * incluyan el id de este puesto o el id de su área.
   */
  requiereHabilitacion: boolean;
  activo: boolean;
  /**
   * Vigencia (versión 2 del esquema): primer y último día en que existe el puesto, ambos inclusive.
   * null = sin límite. Sirve para puestos de temporada («Caja 3» solo en la campaña de Navidad).
   */
  vigenteDesde: FechaISO | null;
  vigenteHasta: FechaISO | null;
  orden: number;
}

// ───────────────────────── Restricciones por persona (§3.2) ─────────────────────────

/**
 * Catálogo de tipos de restricción personal y sus parámetros.
 * Para añadir un tipo: una entrada aquí + un archivo en src/reglas/persona/.
 * Las ausencias temporales NO van aquí: son `Incidencia` (se muestran como incidencia).
 */
export interface ParamsRestriccion {
  /** Solo puede trabajar estos días. */
  diasDisponibles: { dias: DiaSemana[] };
  /** No puede trabajar estos días. */
  diasNoDisponibles: { dias: DiaSemana[] };
  /** No empezar antes de `hora`. `dias` vacío = todos los días. */
  noAntesDe: { hora: Minutos; dias: DiaSemana[] };
  /** No terminar después de `hora`. `dias` vacío = todos los días. */
  noDespuesDe: { hora: Minutos; dias: DiaSemana[] };
  /** Máximo de minutos de cobertura en un día. */
  maxMinutosDia: { maxMin: Minutos };
  /** Mínimo y máximo de minutos de cobertura en la semana (null = sin límite). */
  minutosSemana: { minMin: Minutos | null; maxMin: Minutos | null };
  maxDiasSemana: { max: number };
  /** Solo sábado y domingo. */
  soloFinesDeSemana: Record<string, never>;
  /** No asignar a los puestos o áreas del ámbito. */
  noAsignarA: { ambito: Ambito };
  /** Si la jornada (primer inicio → último fin) supera `siJornadaSuperaMin`, necesita una pausa sin puesto de `pausaMin`. */
  pausaMinima: { siJornadaSuperaMin: Minutos; pausaMin: Minutos };
}
export type TipoRestriccion = keyof ParamsRestriccion;

interface BaseRestriccion<T extends TipoRestriccion> extends Dureza {
  id: Id;
  tipo: T;
  params: ParamsRestriccion[T];
  activa: boolean;
  /** Nota opcional. NUNCA el motivo (salud, guarda legal…) ni datos personales. */
  nota: string;
}
/** Unión discriminada por `tipo`. */
export type RestriccionPersona<T extends TipoRestriccion = TipoRestriccion> = T extends TipoRestriccion
  ? BaseRestriccion<T>
  : never;

// ───────────────────────── Personas (§3.2) ─────────────────────────

/** Paso del patrón rotatorio de una persona para una semana del ciclo. */
export interface PasoPatron {
  /** 0 = semana A, 1 = B… */
  indiceCiclo: number;
  /** Equipo esa semana (si no se indica, el de la persona). */
  equipo: Equipo | null;
  /** Días libres esa semana. */
  diasLibres: DiaSemana[];
}

export interface Persona {
  id: Id;
  /** Código visible y único: «EMP-07». */
  codigo: string;
  /** Alias opcional. Solo vive en este navegador; la exportación puede excluirlo. */
  alias: string | null;
  equipo: Equipo;
  /** Ids de áreas o puestos para los que está habilitada. */
  habilitaciones: Id[];
  activa: boolean;
  /** Fecha de alta (null = siempre). */
  alta: FechaISO | null;
  /** Fecha de baja: desde ese día ya no está en plantilla (null = sigue). */
  baja: FechaISO | null;
  /** Horas de contrato por semana, en minutos (informativo; distinto de la cobertura). */
  contratoMinSemana: Minutos | null;
  /** Objetivo de minutos de cobertura por semana (para el reparto equitativo). */
  objetivoCoberturaMinSemana: Minutos | null;
  restricciones: RestriccionPersona[];
  /** Patrón rotatorio opcional, una entrada por semana del ciclo. */
  patron: PasoPatron[];
}

// ───────────────────────── Reglas generales (§3.3) ─────────────────────────

export interface FranjaComida extends Intervalo {
  maxPersonas: number;
}

/**
 * Catálogo de tipos de regla general y sus parámetros.
 * Para añadir un tipo: una entrada aquí + un archivo en src/reglas/general/.
 */
export interface ParamsReglaGeneral {
  /** Nadie en dos puestos (ni puesto y pausa) a la vez. */
  sinSolapes: Record<string, never>;
  /** Todos los huecos de los puestos activos deben estar cubiertos. */
  coberturaCompleta: Record<string, never>;
  /** No asignar a quien está inactivo, fuera de alta/baja o ausente (incidencia). */
  personaDisponible: Record<string, never>;
  /** Respetar `Puesto.requiereHabilitacion`. */
  habilitacionRequerida: Record<string, never>;
  /** Máximo de minutos de cobertura por persona y día; las áreas en `excepciones` tienen su propio límite (null = sin límite). */
  maxMinutosDia: { maxMin: Minutos; excepciones: { areaId: Id; maxMin: Minutos | null }[] };
  /** Descanso mínimo entre el fin de una jornada y el inicio de la siguiente. */
  descansoEntreJornadas: { minMin: Minutos };
  /** Nadie repite en franjas consecutivas del mismo puesto. */
  noRepetirConsecutivas: { ambito: Ambito };
  /** La misma persona cubre todas las franjas de cada bloque. */
  mismaPersonaBloque: { ambito: Ambito };
  /** Entre bloques consecutivos del mismo puesto (o grupo) cambia la persona o la pareja. */
  rotarEntreBloques: { ambito: Ambito };
  /** Quien hace alguno de estos puestos un día no hace nada más ese día, salvo en `diasExcepcion`. */
  exclusividadDiaria: { puestoIds: Id[]; diasExcepcion: DiaSemana[] };
  /**
   * Cada persona trabaja en franjas de su equipo. Una franja es de mañana si empieza
   * antes de `Config.corteMananaTarde`. Se permiten hasta `maxDiasContrarioSemana`
   * días al contrario, y solo en `diasPermitidos` (vacío = cualquier día).
   */
  respetarEquipo: { maxDiasContrarioSemana: number; diasPermitidos: DiaSemana[] };
  maxDiasSemana: { max: number };
  /** Quien ese día solo trabaja en el área indicada hace como máximo `maxFranjas` franjas. */
  maxFranjasSiSoloArea: { areaId: Id; maxFranjas: number };
  /**
   * En `dias`, quien tenga una jornada (inicio de su primer hueco → fin del último)
   * de más de `umbralJornadaMin` necesita una pausa de `duracionMin` dentro de una
   * de las `franjas`, sin coincidir con un puesto suyo y respetando `maxPersonas`.
   */
  comidasEscalonadas: { dias: DiaSemana[]; umbralJornadaMin: Minutos; duracionMin: Minutos; franjas: FranjaComida[] };
  /** Blanda: minimizar la desviación respecto a `objetivoCoberturaMinSemana` de cada persona. */
  repartoEquitativo: Record<string, never>;
}
export type TipoReglaGeneral = keyof ParamsReglaGeneral;

/** pendiente = cargada de los patrones observados, aún sin confirmar por la usuaria. */
export type EstadoValidacion = 'pendiente' | 'validada' | 'descartada';

interface BaseReglaGeneral<T extends TipoReglaGeneral> extends Dureza {
  id: Id;
  tipo: T;
  params: ParamsReglaGeneral[T];
  activa: boolean;
  estado: EstadoValidacion;
  /** Nombre corto editable; la descripción legible la genera el catálogo a partir de los parámetros. */
  nombre: string;
  nota: string;
}
export type ReglaGeneral<T extends TipoReglaGeneral = TipoReglaGeneral> = T extends TipoReglaGeneral
  ? BaseReglaGeneral<T>
  : never;

// ───────────────────────── Rotación (§3.4) ─────────────────────────

export interface Rotacion {
  /** Número de semanas del ciclo (1 = sin rotación). */
  longitudCiclo: number;
  /** Un lunes que es la semana A (índice 0). */
  lunesReferencia: FechaISO;
  /** Etiquetas de cada semana: ['A', 'B', …]. */
  etiquetas: string[];
}

// ───────────────────────── Cuadrante (§3.5) ─────────────────────────

export type OrigenAsignacion = 'manual' | 'motor' | 'semanaTipo';

/** Una persona en un hueco: (fecha, puesto, franja, plaza). */
export interface AsignacionPuesto {
  id: Id;
  tipo: 'puesto';
  fecha: FechaISO;
  puestoId: Id;
  franjaId: Id;
  /** 0 … plazas-1 */
  plaza: number;
  personaId: Id;
  /** Candado: el motor no la toca. */
  bloqueada: boolean;
  origen: OrigenAsignacion;
}

/** Pausa (comida) de una persona. */
export interface AsignacionPausa extends Intervalo {
  id: Id;
  tipo: 'pausa';
  fecha: FechaISO;
  personaId: Id;
  bloqueada: boolean;
  origen: OrigenAsignacion;
}

export type Asignacion = AsignacionPuesto | AsignacionPausa;

export type ModoMotor = 'desdeCero' | 'semanaTipo' | 'completarHuecos';

export interface CuadranteSemana {
  /** Lunes de la semana. */
  lunes: FechaISO;
  asignaciones: Asignacion[];
  meta: {
    modo: ModoMotor | null;
    semilla: number | null;
    /** Fecha y hora ISO de la última generación. */
    generado: string | null;
  };
}

/** Asignación de una semana tipo: igual que una asignación, pero con día de la semana en vez de fecha. */
export type AsignacionTipo =
  | (Omit<AsignacionPuesto, 'fecha' | 'origen'> & { dia: DiaSemana })
  | (Omit<AsignacionPausa, 'fecha' | 'origen'> & { dia: DiaSemana });

export interface SemanaTipo {
  id: Id;
  /** Semana del ciclo a la que corresponde (0 = A). */
  indiceCiclo: number;
  nombre: string;
  asignaciones: AsignacionTipo[];
}

// ───────────────────────── Horario de la plantilla (versión 3) ─────────────────────────

/** Turno de una persona un día: tramos de trabajo ordenados y sin solapes. Vacío = libra ese día. */
export interface TurnoDia {
  personaId: Id;
  fecha: FechaISO;
  tramos: Intervalo[];
}

/** Horario de la plantilla de una semana, tal como lo pasan la semana anterior (importado o escrito a mano). */
export interface HorarioSemana {
  /** Lunes de la semana. */
  lunes: FechaISO;
  turnos: TurnoDia[];
  /** Fecha y hora ISO de la última importación o edición. */
  actualizado: string | null;
}

// ───────────────────────── Incidencias ─────────────────────────

/**
 * Incidencias puntuales con fechas. No guardan el motivo (salud, permiso…):
 * solo el hecho y una nota sin datos personales.
 */
export type Incidencia =
  | {
      id: Id;
      tipo: 'ausencia';
      personaId: Id;
      desde: FechaISO;
      /** Inclusive. */
      hasta: FechaISO;
      /** null = el día entero; si no, solo ese tramo horario. */
      tramo: Intervalo | null;
      nota: string;
    }
  | {
      id: Id;
      tipo: 'puestoCerrado';
      puestoId: Id;
      desde: FechaISO;
      hasta: FechaISO;
      nota: string;
    };

// ───────────────────────── Configuración y estado ─────────────────────────

export interface Config {
  /** Corte mañana/tarde (hoy 15:45 = 945). */
  corteMananaTarde: Minutos;
  /** Disposición de la exportación por área. */
  exportacionArea: 'diasEnColumnas' | 'franjasEnColumnas';
  /** Semilla por defecto del motor. */
  semilla: number;
  /** Límite de tiempo del motor en ms (~3000). */
  limiteMotorMs: number;
}

/** Todo lo que el motor y el validador necesitan, salvo los cuadrantes. */
export interface DatosPlanificacion {
  config: Config;
  areas: Area[];
  puestos: Puesto[];
  personas: Persona[];
  reglas: ReglaGeneral[];
  rotacion: Rotacion;
  semanasTipo: SemanaTipo[];
  incidencias: Incidencia[];
  /**
   * Horario de la plantilla por semana (versión 3 del esquema), clave = lunes. Si una semana tiene horario,
   * cada persona solo está disponible en los tramos de su turno de cada día; quien no figura, no trabaja esa semana.
   * Sin horario para la semana, no hay limitación (comportamiento anterior).
   */
  horarios: Record<FechaISO, HorarioSemana>;
}

/** Estado completo persistido. */
export interface EstadoApp extends DatosPlanificacion {
  /** Cuadrantes por lunes de la semana. */
  cuadrantes: Record<FechaISO, CuadranteSemana>;
}

// ───────────────────────── Huecos (derivados, no se persisten) ─────────────────────────

/** Hueco concreto a cubrir: una plaza de una franja de un puesto en una fecha. */
export interface Hueco extends Intervalo {
  fecha: FechaISO;
  dia: DiaSemana;
  puestoId: Id;
  areaId: Id;
  franjaId: Id;
  plaza: number;
  bloqueId: Id | null;
}

/** Clave estable de un hueco: `${fecha}|${puestoId}|${franjaId}|${plaza}`. */
export type ClaveHueco = string;
