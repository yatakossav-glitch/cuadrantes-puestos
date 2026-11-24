import { formatearDuracion } from '../../modelo/horas';
import type { ReglaGeneral } from '../../modelo/tipos';
import type { ContextoEvaluacion, DefinicionReglaGeneral, Incumplimiento } from '../contrato';
import { cuando, etiquetaPersona, incumplimientoGeneral, penalizacion, unidades15 } from '../util';
import type { MetadatosReglaGeneral } from '../metadatos';
import { nombreArea } from '../texto';

const DIA_MIN = 24 * 60;

export const metadatos: MetadatosReglaGeneral<'maxMinutosDia'> = {
  tipo: 'maxMinutosDia',
  nombre: 'Máximo de horas al día',
  ayuda: 'Límite de horas de cobertura por persona y día, con posibles excepciones por área.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({ maxMin: 270, excepciones: [] }),
  describir(params, datos) {
    const base = `Máximo ${formatearDuracion(params.maxMin)} al día`;
    if (params.excepciones.length === 0) return base;
    const exc = params.excepciones.map((e) =>
      e.maxMin === null
        ? `${nombreArea(e.areaId, datos)}: sin límite`
        : `${nombreArea(e.areaId, datos)}: ${formatearDuracion(e.maxMin)}`,
    );
    return `${base} (${exc.join('; ')})`;
  },
  validarParams(params, datos) {
    const errores: string[] = [];
    if (!Number.isFinite(params.maxMin) || params.maxMin <= 0 || params.maxMin > DIA_MIN) {
      errores.push('El máximo diario debe ser mayor que 0 y no superar 24h.');
    }
    const vistas = new Set<string>();
    for (const e of params.excepciones) {
      if (!datos.areas.some((a) => a.id === e.areaId)) errores.push('Una de las áreas de las excepciones ya no existe.');
      if (vistas.has(e.areaId)) errores.push('Hay un área repetida en las excepciones.');
      vistas.add(e.areaId);
      if (e.maxMin !== null && (!Number.isFinite(e.maxMin) || e.maxMin <= 0 || e.maxMin > DIA_MIN)) {
        errores.push('El límite de una excepción debe ser mayor que 0 y no superar 24h (o quedar sin límite).');
      }
    }
    return [...new Set(errores)];
  },
  campos: [
    { clave: 'maxMin', etiqueta: 'Máximo al día', tipo: 'duracion', ayuda: 'Horas de cobertura que puede hacer una persona en un día.', min: 1, max: DIA_MIN },
    { clave: 'excepciones', etiqueta: 'Excepciones por área', tipo: 'excepcionesArea', ayuda: 'Áreas con otro límite o sin límite.' },
  ],
};

function evaluar(regla: ReglaGeneral<'maxMinutosDia'>, ctx: ContextoEvaluacion): Incumplimiento[] {
  const { indice, datos } = ctx;
  const excepciones = new Map(regla.params.excepciones.map((e) => [e.areaId, e.maxMin]));
  const dias = new Map<string, { personaId: string; fecha: string }>();
  for (const a of indice.asignaciones()) dias.set(`${a.personaId}|${a.fecha}`, { personaId: a.personaId, fecha: a.fecha });
  const resultado: Incumplimiento[] = [];
  for (const { personaId, fecha } of dias.values()) {
    // Minutos y asignaciones por grupo: '' = resto de áreas, o el id de un área con excepción.
    const grupos = new Map<string, { min: number; ids: string[] }>();
    for (const a of indice.dePersonaDia(personaId, fecha)) {
      if (a.tipo !== 'puesto') continue;
      const iv = indice.intervalo(a);
      const puesto = indice.puesto(a.puestoId);
      if (!iv || !puesto || indice.horario(a.puestoId, a.fecha) === null) continue;
      const clave = excepciones.has(puesto.areaId) ? puesto.areaId : '';
      const g = grupos.get(clave) ?? { min: 0, ids: [] };
      g.min += iv.fin - iv.inicio;
      g.ids.push(a.id);
      grupos.set(clave, g);
    }
    for (const [clave, g] of grupos) {
      const limite = clave === '' ? regla.params.maxMin : excepciones.get(clave) ?? null;
      if (limite === null || g.min <= limite) continue;
      const enArea = clave === '' ? '' : ` en ${nombreArea(clave, datos)}`;
      resultado.push(
        incumplimientoGeneral(regla, {
          mensaje: `${etiquetaPersona(indice.persona(personaId))} supera ${formatearDuracion(limite)}${enArea} ${cuando(fecha)} (${formatearDuracion(g.min)})`,
          fecha,
          personaId,
          asignacionIds: g.ids,
          unidades: unidades15(g.min - limite),
        }),
      );
    }
  }
  return resultado;
}

export const definicion: DefinicionReglaGeneral<'maxMinutosDia'> = {
  ...metadatos,
  evaluar,
  comprobar(regla, ctx, candidata) {
    const { indice, datos } = ctx;
    const libre = { permitido: true, coste: 0, motivos: [] };
    if (candidata.tipo !== 'puesto' || !indice.fechas.includes(candidata.fecha)) return libre;
    const iv = indice.intervalo(candidata);
    const puesto = indice.puesto(candidata.puestoId);
    if (!iv || !puesto || indice.horario(candidata.puestoId, candidata.fecha) === null) return libre;
    const excepcion = regla.params.excepciones.find((e) => e.areaId === puesto.areaId);
    const limite = excepcion ? excepcion.maxMin : regla.params.maxMin;
    if (limite === null) return libre;
    // Minutos que ya suma la persona ese día en el mismo grupo (área con excepción o resto).
    let antes = 0;
    for (const a of indice.dePersonaDia(candidata.personaId, candidata.fecha)) {
      if (a.tipo !== 'puesto') continue;
      const ia = indice.intervalo(a);
      const pa = indice.puesto(a.puestoId);
      if (!ia || !pa || indice.horario(a.puestoId, a.fecha) === null) continue;
      if ((excepcion ? pa.areaId === excepcion.areaId : !regla.params.excepciones.some((e) => e.areaId === pa.areaId))) {
        antes += ia.fin - ia.inicio;
      }
    }
    const despues = antes + (iv.fin - iv.inicio);
    if (despues <= limite) return libre;
    const enArea = excepcion ? ` en ${nombreArea(puesto.areaId, datos)}` : '';
    return {
      permitido: !regla.dura,
      coste: penalizacion(regla.dura, regla.peso, unidades15(despues - limite) - unidades15(antes - limite)),
      motivos: [`${etiquetaPersona(indice.persona(candidata.personaId))} supera ${formatearDuracion(limite)}${enArea} ${cuando(candidata.fecha)} (${formatearDuracion(despues)})`],
    };
  },
};
