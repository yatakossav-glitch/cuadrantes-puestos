/** Registro de los metadatos de las reglas generales y funciones para crearlas, describirlas y validarlas. */
import { nuevoId } from '../modelo/ids';
import type { DatosPlanificacion, Id, ReglaGeneral, TipoReglaGeneral } from '../modelo/tipos';
import { metadatos as coberturaCompleta } from './general/coberturaCompleta';
import { metadatos as comidasEscalonadas } from './general/comidasEscalonadas';
import { metadatos as descansoEntreJornadas } from './general/descansoEntreJornadas';
import { metadatos as exclusividadDiaria } from './general/exclusividadDiaria';
import { metadatos as habilitacionRequerida } from './general/habilitacionRequerida';
import { metadatos as maxDiasSemana } from './general/maxDiasSemana';
import { metadatos as maxFranjasSiSoloArea } from './general/maxFranjasSiSoloArea';
import { metadatos as maxMinutosDia } from './general/maxMinutosDia';
import { metadatos as mismaPersonaBloque } from './general/mismaPersonaBloque';
import { metadatos as noRepetirConsecutivas } from './general/noRepetirConsecutivas';
import { metadatos as personaDisponible } from './general/personaDisponible';
import { metadatos as repartoEquitativo } from './general/repartoEquitativo';
import { metadatos as respetarEquipo } from './general/respetarEquipo';
import { metadatos as rotarEntreBloques } from './general/rotarEntreBloques';
import { metadatos as sinSolapes } from './general/sinSolapes';
import type { CatalogoMetadatosGeneral, MetadatosReglaGeneral } from './metadatos';

export const METADATOS_GENERAL: CatalogoMetadatosGeneral = {
  sinSolapes,
  coberturaCompleta,
  personaDisponible,
  habilitacionRequerida,
  maxMinutosDia,
  descansoEntreJornadas,
  noRepetirConsecutivas,
  mismaPersonaBloque,
  rotarEntreBloques,
  exclusividadDiaria,
  respetarEquipo,
  maxDiasSemana,
  maxFranjasSiSoloArea,
  comidasEscalonadas,
  repartoEquitativo,
};

/** Orden del selector «Añadir regla»: primero las básicas, luego las de reparto y las de calendario. */
export const TIPOS_GENERAL_ORDENADOS: TipoReglaGeneral[] = [
  'sinSolapes',
  'coberturaCompleta',
  'personaDisponible',
  'habilitacionRequerida',
  'maxMinutosDia',
  'descansoEntreJornadas',
  'maxDiasSemana',
  'respetarEquipo',
  'noRepetirConsecutivas',
  'mismaPersonaBloque',
  'rotarEntreBloques',
  'exclusividadDiaria',
  'maxFranjasSiSoloArea',
  'comidasEscalonadas',
  'repartoEquitativo',
];

/** Accede a los metadatos de una regla sin perder la correlación entre tipo y parámetros. */
function metadatosDe<T extends TipoReglaGeneral>(tipo: T): MetadatosReglaGeneral<T> {
  return METADATOS_GENERAL[tipo];
}

export function crearReglaGeneral<T extends TipoReglaGeneral>(
  tipo: T,
  datos: DatosPlanificacion,
  id?: Id,
): ReglaGeneral<T> {
  const meta = metadatosDe(tipo);
  const regla = {
    id: id ?? nuevoId('regla'),
    tipo,
    params: meta.paramsPorDefecto(datos),
    activa: true,
    estado: 'validada',
    nombre: meta.nombre,
    nota: '',
    dura: meta.dureza !== 'soloBlanda',
    peso: meta.pesoPorDefecto,
  };
  return regla as unknown as ReglaGeneral<T>;
}

export function describirRegla(regla: ReglaGeneral, datos: DatosPlanificacion): string {
  const meta = metadatosDe(regla.tipo) as MetadatosReglaGeneral<typeof regla.tipo>;
  return meta.describir(regla.params as never, datos);
}

export function erroresRegla(regla: ReglaGeneral, datos: DatosPlanificacion): string[] {
  const meta = metadatosDe(regla.tipo) as MetadatosReglaGeneral<typeof regla.tipo>;
  const errores = meta.validarParams(regla.params as never, datos);
  if (!regla.dura && !(Number.isInteger(regla.peso) && regla.peso >= 1 && regla.peso <= 100)) {
    errores.push('El peso debe ser un número entero entre 1 y 100');
  }
  if (regla.dura && meta.dureza === 'soloBlanda') errores.push('Esta regla solo puede ser blanda (preferencia).');
  if (!regla.dura && meta.dureza === 'soloDura') errores.push('Esta regla solo puede ser dura (obligatoria).');
  return errores;
}
