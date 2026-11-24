/** Atajos para llamar al validador a través del catálogo real. */
import { CATALOGO } from '../../src/reglas/catalogo';
import { validarSemana } from '../../src/validacion/validador';
import type { Asignacion, EstadoApp } from '../../src/modelo/tipos';
import type { Incumplimiento, ResultadoValidacion } from '../../src/reglas/contrato';
import { LUNES } from './ayudas';

export { CATALOGO };

export function validar(datos: EstadoApp, asignaciones: readonly Asignacion[]): ResultadoValidacion {
  return validarSemana(datos, LUNES, asignaciones, CATALOGO);
}

export function deTipo(r: ResultadoValidacion, tipo: Incumplimiento['tipo']): Incumplimiento[] {
  return r.incumplimientos.filter((i) => i.tipo === tipo);
}
