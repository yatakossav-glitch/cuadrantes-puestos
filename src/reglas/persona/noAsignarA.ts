import type { Persona, RestriccionPersona } from '../../modelo/tipos';
import type { ContextoEvaluacion, DefinicionRestriccion, Incumplimiento } from '../contrato';
import { cuando, enAmbito, etiquetaPersona, incumplimientoRestriccion } from '../util';
import { LIBRE, comprobarRapido, resultado } from './comun';
import type { MetadatosRestriccion } from '../metadatos';
import { describirAmbito, erroresAmbito } from '../texto';

export const metadatos: MetadatosRestriccion<'noAsignarA'> = {
  tipo: 'noAsignarA',
  nombre: 'No asignar a ciertos puestos',
  ayuda: 'La persona no se asigna a las áreas o puestos que elijas.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: (datos) => {
    const primera = [...datos.areas].filter((a) => a.activa).sort((a, b) => a.planta - b.planta || a.orden - b.orden)[0];
    return { ambito: { areaIds: primera ? [primera.id] : [], puestoIds: [] } };
  },
  describir: (params, datos) => `No asignar a ${describirAmbito(params.ambito, datos)}`,
  validarParams: (params, datos) => {
    const errores = erroresAmbito(params.ambito, datos);
    if (params.ambito.areaIds.length === 0 && params.ambito.puestoIds.length === 0) {
      errores.unshift('Elige al menos un área o un puesto.');
    }
    return errores;
  },
  campos: [{ clave: 'ambito', etiqueta: 'Áreas o puestos', tipo: 'ambito', ayuda: 'Donde no se le debe asignar.' }],
};

function evaluar(
  restriccion: RestriccionPersona<'noAsignarA'>,
  persona: Persona,
  ctx: ContextoEvaluacion,
): Incumplimiento[] {
  const res: Incumplimiento[] = [];
  for (const a of ctx.indice.dePersona(persona.id)) {
    if (a.tipo !== 'puesto') continue;
    const puesto = ctx.indice.puesto(a.puestoId);
    if (!puesto || !enAmbito(restriccion.params.ambito, puesto)) continue;
    const area = ctx.indice.area(puesto.areaId);
    const nombre = area && !puesto.nombre.startsWith(area.nombre) ? `${area.nombre} · ${puesto.nombre}` : puesto.nombre;
    const intervalo = ctx.indice.intervalo(a);
    res.push(
      incumplimientoRestriccion(restriccion, persona, {
        mensaje: `${etiquetaPersona(persona)} no debe cubrir ${nombre} ${cuando(a.fecha, intervalo)}`,
        marca: 'noDisponible',
        fecha: a.fecha,
        asignacionIds: [a.id],
        huecos: [ctx.indice.claveDe(a)],
      }),
    );
  }
  return res;
}


const comprobar = comprobarRapido<'noAsignarA'>((restriccion, persona, ctx, info) => {
  const a = info.puesto;
  const puesto = a ? ctx.indice.puesto(a.puestoId) : undefined;
  if (!a || !puesto || !enAmbito(restriccion.params.ambito, puesto)) return LIBRE;
  return resultado(restriccion, true, 0, restriccion.peso, `${etiquetaPersona(persona)} no debe cubrir ${puesto.nombre} ${cuando(a.fecha, info.intervalo)}`);
});

export const definicion: DefinicionRestriccion<'noAsignarA'> = { ...metadatos, evaluar, comprobar };
