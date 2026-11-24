import type { Persona, RestriccionPersona } from '../../modelo/tipos';
import type { ContextoEvaluacion, DefinicionRestriccion, Incumplimiento } from '../contrato';
import { cuando, etiquetaPersona, incumplimientoRestriccion, unidades15 } from '../util';
import { comprobarRapido, puestosDelDia } from './comun';
import type { Asignacion, Intervalo } from '../../modelo/tipos';
import type { MetadatosRestriccion } from '../metadatos';
import { formatearDuracion, seSolapan } from '../../modelo/horas';

const DIA = 24 * 60;
const valida = (v: number): boolean => Number.isInteger(v) && v > 0 && v <= DIA;

export const metadatos: MetadatosRestriccion<'pausaMinima'> = {
  tipo: 'pausaMinima',
  nombre: 'Pausa en jornadas largas',
  ayuda: 'Si la jornada es larga, necesita una pausa sin puesto asignado.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({ siJornadaSuperaMin: 480, pausaMin: 30 }),
  describir: (params) =>
    `Pausa de ${formatearDuracion(params.pausaMin)} si la jornada pasa de ${formatearDuracion(params.siJornadaSuperaMin)}`,
  validarParams: (params) => {
    const errores: string[] = [];
    if (!valida(params.siJornadaSuperaMin)) errores.push('La duración de jornada a partir de la cual hay pausa debe ser mayor que 0 y no pasar de 24h.');
    if (!valida(params.pausaMin)) errores.push('La pausa debe durar más de 0 min y no pasar de 24h.');
    return errores;
  },
  campos: [
    { clave: 'siJornadaSuperaMin', etiqueta: 'Si la jornada pasa de', tipo: 'duracion', ayuda: 'Desde el primer puesto hasta el último.', min: 1, max: DIA },
    { clave: 'pausaMin', etiqueta: 'Duración de la pausa', tipo: 'duracion', ayuda: 'Tiempo libre de puestos.', min: 1, max: DIA },
  ],
};

/** Mayor tiempo seguido sin puesto dentro de la jornada (entre puestos consecutivos). */
function mayorHueco(intervalos: Intervalo[]): number {
  const orden = [...intervalos].sort((a, b) => a.inicio - b.inicio);
  let finMax = orden[0]?.fin ?? 0;
  let mayor = 0;
  for (const i of orden) {
    mayor = Math.max(mayor, i.inicio - finMax);
    finMax = Math.max(finMax, i.fin);
  }
  return mayor;
}

/**
 * Unidades de 15 min que faltan de pausa ese día, o null si cumple o no hay jornada larga.
 * `asignaciones` son todas las del día de la persona (puestos y pausas).
 */
function faltaDePausa(
  ctx: ContextoEvaluacion,
  asignaciones: readonly Asignacion[],
  { siJornadaSuperaMin, pausaMin }: { siJornadaSuperaMin: number; pausaMin: number },
): number | null {
  // Solo cuentan los puestos con franja y con horario ese día (igual que la jornada del índice).
  const intervalos: Intervalo[] = [];
  for (const a of asignaciones) {
    if (a.tipo !== 'puesto') continue;
    const i = ctx.indice.intervalo(a);
    if (i && ctx.indice.horario(a.puestoId, a.fecha) !== null) intervalos.push(i);
  }
  if (intervalos.length === 0) return null;
  const inicio = Math.min(...intervalos.map((i) => i.inicio));
  const fin = Math.max(...intervalos.map((i) => i.fin));
  if (fin - inicio <= siJornadaSuperaMin) return null;
  // Una pausa solo cuenta si está dentro de la jornada y libre de puestos.
  let mejorPausa = 0;
  for (const p of asignaciones) {
    if (p.tipo !== 'pausa' || p.inicio < inicio || p.fin > fin || intervalos.some((i) => seSolapan(i, p))) continue;
    mejorPausa = Math.max(mejorPausa, p.fin - p.inicio);
  }
  const mejor = Math.max(mayorHueco(intervalos), mejorPausa);
  return mejor >= pausaMin ? null : unidades15(pausaMin - mejor);
}

function evaluar(
  restriccion: RestriccionPersona<'pausaMinima'>,
  persona: Persona,
  ctx: ContextoEvaluacion,
): Incumplimiento[] {
  const { pausaMin } = restriccion.params;
  const res: Incumplimiento[] = [];
  for (const fecha of ctx.indice.fechas) {
    const unidades = faltaDePausa(ctx, ctx.indice.dePersonaDia(persona.id, fecha), restriccion.params);
    if (unidades === null) continue;
    res.push(
      incumplimientoRestriccion(restriccion, persona, {
        mensaje: `${etiquetaPersona(persona)} no tiene una pausa de ${formatearDuracion(pausaMin)} ${cuando(fecha)}`,
        fecha,
        unidades,
        asignacionIds: puestosDelDia(ctx, persona, fecha).map((a) => a.id),
      }),
    );
  }
  return res;
}

/** Nunca bloquea: solo cuesta lo que empeora la falta de pausa de ese día. */
const comprobar = comprobarRapido<'pausaMinima'>((restriccion, persona, ctx, info) => {
  const fecha = info.candidata.fecha;
  const previas = ctx.indice.dePersonaDia(persona.id, fecha);
  const antes = faltaDePausa(ctx, previas, restriccion.params);
  const despues = faltaDePausa(ctx, [...previas, info.candidata], restriccion.params);
  const penal = (u: number | null): number => (u === null || restriccion.dura ? 0 : restriccion.peso * u);
  return {
    permitido: true,
    coste: Math.max(0, penal(despues) - penal(antes)),
    motivos: despues === null ? [] : [`${etiquetaPersona(persona)} no tiene una pausa de ${formatearDuracion(restriccion.params.pausaMin)} ${cuando(fecha)}`],
  };
}, true);

export const definicion: DefinicionRestriccion<'pausaMinima'> = { ...metadatos, evaluar, comprobar };
