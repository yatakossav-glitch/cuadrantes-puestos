/**
 * CONTRATO · Motor de asignación (§4). Diseño detallado en ARQUITECTURA.md §5.
 * No modificar sin permiso del director.
 */
import type { Asignacion, DatosPlanificacion, FechaISO, Hueco, Id, ModoMotor } from '../modelo/tipos';

export interface PeticionMotor {
  datos: DatosPlanificacion;
  /** Lunes de la semana a generar. */
  lunes: FechaISO;
  /** Asignaciones actuales de la semana (incluye las bloqueadas con candado). */
  actuales: Asignacion[];
  modo: ModoMotor;
  semilla: number;
  /**
   * Presupuesto de la búsqueda local en iteraciones. Es lo que garantiza el
   * determinismo: misma entrada + misma semilla + mismo presupuesto = mismo resultado.
   */
  maxIteraciones: number;
  /** Salvaguarda de tiempo (ms). Si salta antes que maxIteraciones, `cortadoPorTiempo` = true. */
  limiteMs: number;
}

export interface ProgresoMotor {
  fase: 'preparacion' | 'construccion' | 'comidas' | 'mejora';
  /** 0 … 1 */
  fraccion: number;
  huecosSinCubrir: number;
  penalizacionBlanda: number;
}

/** Por qué no se pudo cubrir un hueco. */
export interface ExplicacionHueco {
  hueco: Hueco;
  /** «Nadie habilitado disponible el jueves 19:00–22:00». */
  resumen: string;
  /** Primer motivo duro de cada persona descartada: «EMP-03 ya está en Caja 1». */
  descartes: { personaId: Id; motivo: string }[];
}

export interface ResultadoMotor {
  /** Asignaciones finales de la semana (incluye las bloqueadas, intactas). */
  asignaciones: Asignacion[];
  sinCubrir: ExplicacionHueco[];
  /** Personas que necesitan comida y no la tienen, con explicación. */
  comidasPendientes: { personaId: Id; fecha: FechaISO; motivo: string }[];
  penalizacionBlanda: number;
  iteraciones: number;
  ms: number;
  cortadoPorTiempo: boolean;
}

/** Candidata para un hueco (sugerencias manuales, §4). */
export interface Candidato {
  personaId: Id;
  /** false = incumpliría alguna regla dura (se muestra, pero al final y marcada). */
  permitido: boolean;
  /** Penalización blanda que añadiría. Menor = más idónea. */
  coste: number;
  /** Reglas que incumpliría (duras) o empeoraría (blandas). */
  motivos: string[];
}

/** API del motor (implementación en src/motor/motor.ts; se ejecuta en un Web Worker). */
export interface Motor {
  generar(peticion: PeticionMotor, alProgresar?: (p: ProgresoMotor) => void): ResultadoMotor;
  /** Candidatas para un hueco o un bloque entero (si el hueco pertenece a un bloque), ordenadas por idoneidad. */
  sugerir(datos: DatosPlanificacion, lunes: FechaISO, actuales: Asignacion[], hueco: Hueco): Candidato[];
}
