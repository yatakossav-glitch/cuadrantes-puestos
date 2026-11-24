/** Validador de una semana (§4, §10.1). Función pura; nunca lanza. */
import type {
  CatalogoGeneral,
  CatalogoRestricciones,
  ContextoEvaluacion,
  Incumplimiento,
  IndiceSemana,
  MarcaCelda,
  ResultadoValidacion,
  Semaforo,
} from '../reglas/contrato';
import type { Asignacion, ClaveHueco, DatosPlanificacion, FechaISO, Id, Persona, ReglaGeneral, RestriccionPersona } from '../modelo/tipos';
import { crearIndice } from './indice';

export interface Catalogos {
  general: CatalogoGeneral;
  restricciones: CatalogoRestricciones;
}

interface EvaluadorGeneral {
  evaluar(regla: ReglaGeneral, ctx: ContextoEvaluacion): Incumplimiento[];
}
interface EvaluadorRestriccion {
  evaluar(r: RestriccionPersona, persona: Persona, ctx: ContextoEvaluacion): Incumplimiento[];
}

function avisoDeFallo(
  base: Pick<Incumplimiento, 'reglaId' | 'origen' | 'tipo'>,
  mensaje: string,
  personaId: Id | null,
): Incumplimiento {
  return {
    ...base,
    dura: false,
    penalizacion: 0,
    mensaje,
    marca: 'aviso',
    fecha: null,
    personaId,
    asignacionIds: [],
    huecos: [],
  };
}

/** Hora de inicio de un incumplimiento (para ordenar); Infinity si no se conoce. */
function horaDe(i: Incumplimiento, indice: IndiceSemana): number {
  let min = Infinity;
  for (const id of i.asignacionIds) {
    const a = indice.asignaciones().find((x) => x.id === id);
    const iv = a ? indice.intervalo(a) : undefined;
    if (iv) min = Math.min(min, iv.inicio);
  }
  for (const c of i.huecos) {
    const h = indice.hueco(c);
    if (h) min = Math.min(min, h.inicio);
  }
  return min;
}

export function validarSemana(
  datos: DatosPlanificacion,
  lunes: FechaISO,
  asignaciones: readonly Asignacion[],
  catalogos: Catalogos,
): ResultadoValidacion {
  const indice = crearIndice(datos, lunes, asignaciones);
  const ctx: ContextoEvaluacion = { datos, indice };
  const lista: Incumplimiento[] = [];

  for (const regla of datos.reglas) {
    if (!regla.activa || regla.estado === 'descartada') continue;
    try {
      const def = catalogos.general[regla.tipo] as unknown as EvaluadorGeneral;
      lista.push(...def.evaluar(regla, ctx));
    } catch {
      lista.push(
        avisoDeFallo(
          { reglaId: regla.id, origen: 'general', tipo: regla.tipo },
          `No se pudo comprobar la regla «${regla.nombre}»`,
          null,
        ),
      );
    }
  }

  for (const persona of datos.personas) {
    for (const r of persona.restricciones) {
      if (!r.activa) continue;
      try {
        const def = catalogos.restricciones[r.tipo] as unknown as EvaluadorRestriccion;
        lista.push(...def.evaluar(r, persona, ctx));
      } catch {
        lista.push(
          avisoDeFallo(
            { reglaId: r.id, origen: 'persona', tipo: r.tipo },
            `No se pudo comprobar una restricción de ${persona.codigo}`,
            persona.id,
          ),
        );
      }
    }
  }

  const clavesOrden = new Map<Incumplimiento, { hora: number; persona: string }>();
  for (const i of lista) {
    clavesOrden.set(i, {
      hora: horaDe(i, indice),
      persona: i.personaId ? (indice.persona(i.personaId)?.codigo ?? i.personaId) : '',
    });
  }
  const ordenados = lista
    .map((i, pos) => ({ i, pos }))
    .sort((x, y) => {
      if (x.i.dura !== y.i.dura) return x.i.dura ? -1 : 1;
      if (x.i.fecha !== y.i.fecha) {
        if (x.i.fecha === null) return 1;
        if (y.i.fecha === null) return -1;
        return x.i.fecha < y.i.fecha ? -1 : 1;
      }
      const kx = clavesOrden.get(x.i)!;
      const ky = clavesOrden.get(y.i)!;
      if (kx.hora !== ky.hora) return kx.hora < ky.hora ? -1 : 1;
      if (kx.persona !== ky.persona) return kx.persona < ky.persona ? -1 : 1;
      return x.pos - y.pos;
    })
    .map((x) => x.i);

  const semaforo: Semaforo = ordenados.some((i) => i.dura) ? 'rojo' : ordenados.length > 0 ? 'ambar' : 'verde';
  const penalizacionBlanda = ordenados.reduce((s, i) => s + (i.dura ? 0 : i.penalizacion), 0);
  return { semaforo, incumplimientos: ordenados, penalizacionBlanda };
}

function agrupar(r: ResultadoValidacion, claves: (i: Incumplimiento) => string[]): Map<string, MarcaCelda[]> {
  const mapa = new Map<string, MarcaCelda[]>();
  for (const i of r.incumplimientos) {
    for (const k of claves(i)) {
      const l = mapa.get(k) ?? [];
      if (!l.includes(i.marca)) l.push(i.marca);
      mapa.set(k, l);
    }
  }
  return mapa;
}

export function marcasPorAsignacion(r: ResultadoValidacion): Map<Id, MarcaCelda[]> {
  return agrupar(r, (i) => i.asignacionIds);
}

export function marcasPorHueco(r: ResultadoValidacion): Map<ClaveHueco, MarcaCelda[]> {
  return agrupar(r, (i) => i.huecos);
}
