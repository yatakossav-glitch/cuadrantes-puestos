/** Registro de metadatos de las restricciones personales (§9.1). Funciones puras. */
import type { DatosPlanificacion, Id, RestriccionPersona, TipoRestriccion } from '../modelo/tipos';
import { nuevoId } from '../modelo/ids';
import type { CatalogoMetadatosRestricciones, MetadatosRestriccion } from './metadatos';
import { metadatos as diasDisponibles } from './persona/diasDisponibles';
import { metadatos as diasNoDisponibles } from './persona/diasNoDisponibles';
import { metadatos as noAntesDe } from './persona/noAntesDe';
import { metadatos as noDespuesDe } from './persona/noDespuesDe';
import { metadatos as maxMinutosDia } from './persona/maxMinutosDia';
import { metadatos as minutosSemana } from './persona/minutosSemana';
import { metadatos as maxDiasSemana } from './persona/maxDiasSemana';
import { metadatos as soloFinesDeSemana } from './persona/soloFinesDeSemana';
import { metadatos as noAsignarA } from './persona/noAsignarA';
import { metadatos as pausaMinima } from './persona/pausaMinima';

export const METADATOS_RESTRICCION: CatalogoMetadatosRestricciones = {
  diasDisponibles,
  diasNoDisponibles,
  noAntesDe,
  noDespuesDe,
  maxMinutosDia,
  minutosSemana,
  maxDiasSemana,
  soloFinesDeSemana,
  noAsignarA,
  pausaMinima,
};

/** Orden del selector «Añadir restricción». */
export const TIPOS_RESTRICCION_ORDENADOS: TipoRestriccion[] = [
  'diasNoDisponibles',
  'diasDisponibles',
  'soloFinesDeSemana',
  'noAntesDe',
  'noDespuesDe',
  'maxMinutosDia',
  'minutosSemana',
  'maxDiasSemana',
  'pausaMinima',
  'noAsignarA',
];

/** Las funciones genéricas pierden la correlación tipo/params; se estrecha aquí en un único punto. */
function metadatosDe<T extends TipoRestriccion>(tipo: T): MetadatosRestriccion<T> {
  return METADATOS_RESTRICCION[tipo];
}

export function crearRestriccion<T extends TipoRestriccion>(
  tipo: T,
  datos: DatosPlanificacion,
  id: Id = nuevoId('restr'),
): RestriccionPersona<T> {
  const m = metadatosDe(tipo);
  const restriccion = {
    id,
    tipo,
    params: m.paramsPorDefecto(datos),
    activa: true,
    nota: '',
    dura: m.dureza !== 'soloBlanda',
    peso: m.pesoPorDefecto,
  };
  return restriccion as unknown as RestriccionPersona<T>;
}

export function describirRestriccion(r: RestriccionPersona, datos: DatosPlanificacion): string {
  const m = METADATOS_RESTRICCION[r.tipo] as MetadatosRestriccion<typeof r.tipo>;
  return (m.describir as (p: unknown, d: DatosPlanificacion) => string)(r.params, datos);
}

export function erroresRestriccion(r: RestriccionPersona, datos: DatosPlanificacion): string[] {
  const m = METADATOS_RESTRICCION[r.tipo];
  const errores = (m.validarParams as (p: unknown, d: DatosPlanificacion) => string[])(r.params, datos);
  if (!r.dura && !(Number.isInteger(r.peso) && r.peso >= 1 && r.peso <= 100)) {
    errores.push('El peso debe ser un número entero entre 1 y 100');
  }
  if (r.dura && m.dureza === 'soloBlanda') errores.push('Esta restricción solo puede ser blanda.');
  if (!r.dura && m.dureza === 'soloDura') errores.push('Esta restricción solo puede ser obligatoria.');
  return errores;
}
