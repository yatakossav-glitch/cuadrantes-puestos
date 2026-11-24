/** Resumen de una semana por persona y por puesto (§10.1). Función pura. */
import type { IndiceSemana, ResultadoValidacion } from '../reglas/contrato';
import type { DatosPlanificacion, Id, Intervalo, Minutos } from '../modelo/tipos';

export interface ResumenPersona {
  personaId: Id;
  /** 7 valores, de lunes a domingo. */
  minutosDia: Minutos[];
  minutosSemana: Minutos;
  dias: number;
  porArea: Record<Id, Minutos>;
  jornadaDomingo: Intervalo | null;
  objetivo: Minutos | null;
  /** minutosSemana − objetivo (null si no hay objetivo). */
  desviacion: Minutos | null;
  /** Incumplimientos con ese personaId. */
  avisos: number;
}

export interface ResumenPuesto {
  puestoId: Id;
  huecos: number;
  cubiertos: number;
  /** 0–100, entero. 100 si no hay huecos que cubrir. */
  porcentaje: number;
}

export function resumirSemana(
  indice: IndiceSemana,
  datos: DatosPlanificacion,
  r: ResultadoValidacion,
): { personas: ResumenPersona[]; puestos: ResumenPuesto[] } {
  const avisos = new Map<Id, number>();
  for (const i of r.incumplimientos) {
    if (i.personaId !== null) avisos.set(i.personaId, (avisos.get(i.personaId) ?? 0) + 1);
  }

  const personas = datos.personas.map((p): ResumenPersona => {
    const porArea: Record<Id, Minutos> = {};
    for (const a of indice.dePersona(p.id)) {
      if (a.tipo !== 'puesto') continue;
      const iv = indice.intervalo(a);
      const puesto = indice.puesto(a.puestoId);
      if (!iv || !puesto) continue;
      porArea[puesto.areaId] = (porArea[puesto.areaId] ?? 0) + (iv.fin - iv.inicio);
    }
    const minutosSemana = indice.minutosSemana(p.id);
    const objetivo = p.objetivoCoberturaMinSemana;
    return {
      personaId: p.id,
      minutosDia: indice.fechas.map((f) => indice.minutosDia(p.id, f)),
      minutosSemana,
      dias: indice.diasTrabajados(p.id).length,
      porArea,
      jornadaDomingo: indice.jornada(p.id, indice.fechas[6]!),
      objetivo,
      desviacion: objetivo === null ? null : minutosSemana - objetivo,
      avisos: avisos.get(p.id) ?? 0,
    };
  });

  const todos = indice.huecos();
  const puestos = datos.puestos
    .filter((p) => p.activo)
    .map((p): ResumenPuesto => {
      const suyos = todos.filter((h) => h.puestoId === p.id);
      const cubiertos = suyos.filter((h) =>
        indice.enHueco(`${h.fecha}|${h.puestoId}|${h.franjaId}|${h.plaza}`) !== undefined,
      ).length;
      return {
        puestoId: p.id,
        huecos: suyos.length,
        cubiertos,
        porcentaje: suyos.length === 0 ? 100 : Math.round((cubiertos * 100) / suyos.length),
      };
    });

  return { personas, puestos };
}
