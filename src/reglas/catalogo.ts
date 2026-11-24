/** Registro completo de tipos de regla: un tipo sin definición no compila. */
import type { CatalogoGeneral, CatalogoRestricciones } from './contrato';
import type { Catalogos } from '../validacion/validador';
import { definicion as g_sinSolapes } from './general/sinSolapes';
import { definicion as g_coberturaCompleta } from './general/coberturaCompleta';
import { definicion as g_personaDisponible } from './general/personaDisponible';
import { definicion as g_habilitacionRequerida } from './general/habilitacionRequerida';
import { definicion as g_maxMinutosDia } from './general/maxMinutosDia';
import { definicion as g_descansoEntreJornadas } from './general/descansoEntreJornadas';
import { definicion as g_noRepetirConsecutivas } from './general/noRepetirConsecutivas';
import { definicion as g_mismaPersonaBloque } from './general/mismaPersonaBloque';
import { definicion as g_rotarEntreBloques } from './general/rotarEntreBloques';
import { definicion as g_exclusividadDiaria } from './general/exclusividadDiaria';
import { definicion as g_respetarEquipo } from './general/respetarEquipo';
import { definicion as g_maxDiasSemana } from './general/maxDiasSemana';
import { definicion as g_maxFranjasSiSoloArea } from './general/maxFranjasSiSoloArea';
import { definicion as g_comidasEscalonadas } from './general/comidasEscalonadas';
import { definicion as g_repartoEquitativo } from './general/repartoEquitativo';
import { definicion as p_diasDisponibles } from './persona/diasDisponibles';
import { definicion as p_diasNoDisponibles } from './persona/diasNoDisponibles';
import { definicion as p_noAntesDe } from './persona/noAntesDe';
import { definicion as p_noDespuesDe } from './persona/noDespuesDe';
import { definicion as p_maxMinutosDia } from './persona/maxMinutosDia';
import { definicion as p_minutosSemana } from './persona/minutosSemana';
import { definicion as p_maxDiasSemana } from './persona/maxDiasSemana';
import { definicion as p_soloFinesDeSemana } from './persona/soloFinesDeSemana';
import { definicion as p_noAsignarA } from './persona/noAsignarA';
import { definicion as p_pausaMinima } from './persona/pausaMinima';

export const CATALOGO_GENERAL: CatalogoGeneral = {
  sinSolapes: g_sinSolapes,
  coberturaCompleta: g_coberturaCompleta,
  personaDisponible: g_personaDisponible,
  habilitacionRequerida: g_habilitacionRequerida,
  maxMinutosDia: g_maxMinutosDia,
  descansoEntreJornadas: g_descansoEntreJornadas,
  noRepetirConsecutivas: g_noRepetirConsecutivas,
  mismaPersonaBloque: g_mismaPersonaBloque,
  rotarEntreBloques: g_rotarEntreBloques,
  exclusividadDiaria: g_exclusividadDiaria,
  respetarEquipo: g_respetarEquipo,
  maxDiasSemana: g_maxDiasSemana,
  maxFranjasSiSoloArea: g_maxFranjasSiSoloArea,
  comidasEscalonadas: g_comidasEscalonadas,
  repartoEquitativo: g_repartoEquitativo,
};

export const CATALOGO_RESTRICCIONES: CatalogoRestricciones = {
  diasDisponibles: p_diasDisponibles,
  diasNoDisponibles: p_diasNoDisponibles,
  noAntesDe: p_noAntesDe,
  noDespuesDe: p_noDespuesDe,
  maxMinutosDia: p_maxMinutosDia,
  minutosSemana: p_minutosSemana,
  maxDiasSemana: p_maxDiasSemana,
  soloFinesDeSemana: p_soloFinesDeSemana,
  noAsignarA: p_noAsignarA,
  pausaMinima: p_pausaMinima,
};

export const CATALOGO: Catalogos = { general: CATALOGO_GENERAL, restricciones: CATALOGO_RESTRICCIONES };
