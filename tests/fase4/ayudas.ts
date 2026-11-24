/**
 * Ayudas de los tests de la fase 4 (solo datos ficticios EMP-xx).
 * Reutiliza las ayudas independientes de la fase 3; no importa nada de src/motor
 * salvo lo que cada test pide explícitamente.
 */
import { CATALOGO } from '../../src/reglas/catalogo';
import { validarSemana } from '../../src/validacion/validador';
import { NOMBRES_DIA } from '../../src/modelo/fechas';
import type { Asignacion, AsignacionPuesto, DatosPlanificacion, EstadoApp, Id, ModoMotor } from '../../src/modelo/tipos';
import type { Incumplimiento } from '../../src/reglas/contrato';
import type { PeticionMotor } from '../../src/motor/contrato';
import { LUNES, P, asig, crearEstadoEjemplo, IDS_EJEMPLO } from '../fase3/ayudas';

export { LUNES, P, asig, crearEstadoEjemplo, IDS_EJEMPLO, CATALOGO, NOMBRES_DIA };
export * from '../fase3/ayudas';

export function peticion(
  datos: DatosPlanificacion,
  modo: ModoMotor,
  extra: Partial<PeticionMotor> = {},
): PeticionMotor {
  return {
    datos,
    lunes: LUNES,
    actuales: [],
    modo,
    semilla: 1,
    maxIteraciones: 800,
    // Holgado: los tests de determinismo exigen que no corte por tiempo.
    limiteMs: 60000,
    ...extra,
  };
}

export function validarTodo(datos: DatosPlanificacion, asignaciones: readonly Asignacion[]) {
  return validarSemana(datos, LUNES, asignaciones, CATALOGO);
}

export function duras(datos: DatosPlanificacion, asignaciones: readonly Asignacion[]): Incumplimiento[] {
  return validarTodo(datos, asignaciones).incumplimientos.filter((i) => i.dura);
}

/** Texto corto de un incumplimiento, para mensajes de fallo. */
export function resumir(incs: readonly Incumplimiento[], max = 6): string {
  return incs
    .slice(0, max)
    .map((i) => `[${i.tipo}] ${i.mensaje}`)
    .join(' | ') + (incs.length > max ? ` (+${incs.length - max})` : '');
}

/** Clave de hueco de una asignación de puesto. */
export function claveAsig(a: AsignacionPuesto): string {
  return `${a.fecha}|${a.puestoId}|${a.franjaId}|${a.plaza}`;
}

/** Mapa hueco → persona de las asignaciones de puesto. */
export function personasPorHueco(asigs: readonly Asignacion[]): Map<string, Id> {
  const m = new Map<string, Id>();
  for (const a of asigs) if (a.tipo === 'puesto') m.set(claveAsig(a), a.personaId);
  return m;
}

/** Copia de los datos del ejemplo con una modificación. */
export function datosEjemplo(modificar?: (d: EstadoApp) => void): EstadoApp {
  const d = crearEstadoEjemplo();
  modificar?.(d);
  return d;
}

/** Asignación bloqueada con candado, de la persona EMP-n. */
export function bloqueada(dia: 0 | 1 | 2 | 3 | 4 | 5 | 6, puestoId: Id, franjaId: Id, n: number): AsignacionPuesto {
  return asig(dia, puestoId, franjaId, P(n), 0, { bloqueada: true });
}
