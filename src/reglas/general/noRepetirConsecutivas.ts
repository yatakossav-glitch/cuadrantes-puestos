import type { DefinicionReglaGeneral } from '../contrato';
import type { Comprobacion, ContextoEvaluacion, IndiceSemana, Incumplimiento } from '../contrato';
import { cuando, enAmbito, etiquetaPersona, incumplimientoGeneral } from '../util';
import { nombrePuesto as nombrePuestoTexto } from '../texto';
import type { Asignacion, AsignacionPuesto, Intervalo, ReglaGeneral } from '../../modelo/tipos';
import type { MetadatosReglaGeneral } from '../metadatos';
import { describirAmbito, erroresAmbito } from '../texto';

export const metadatos: MetadatosReglaGeneral<'noRepetirConsecutivas'> = {
  tipo: 'noRepetirConsecutivas',
  nombre: 'No repetir en franjas seguidas',
  ayuda: 'Nadie repite en dos franjas consecutivas del mismo puesto.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({ ambito: { areaIds: [], puestoIds: [] } }),
  describir: (params, datos) => `No repetir en franjas seguidas: ${describirAmbito(params.ambito, datos)}`,
  validarParams: (params, datos) => erroresAmbito(params.ambito, datos),
  campos: [
    { clave: 'ambito', etiqueta: 'Dónde se aplica', tipo: 'ambito', ayuda: 'Áreas o puestos afectados. Si no eliges ninguno, se aplica a todos.' },
  ],
};

interface Tramo {
  a: AsignacionPuesto;
  iv: Intervalo;
}

/** Pares de franjas seguidas (fin = inicio) de una misma persona, día y puesto. Ordena `lista`. */
function paresConsecutivos(lista: Tramo[], indice: IndiceSemana): [Tramo, Tramo][] {
  lista.sort((x, y) => x.iv.inicio - y.iv.inicio);
  const pares: [Tramo, Tramo][] = [];
  for (let i = 1; i < lista.length; i += 1) {
    const previa = lista[i - 1];
    const actual = lista[i];
    if (!previa || !actual || previa.iv.fin !== actual.iv.inicio) continue;
    // Dos franjas del mismo bloque: ahí repetir es lo que exige mismaPersonaBloque.
    const bloquePrevio = indice.hueco(indice.claveDe(previa.a))?.bloqueId ?? null;
    const bloqueActual = indice.hueco(indice.claveDe(actual.a))?.bloqueId ?? null;
    if (bloquePrevio !== null && bloquePrevio === bloqueActual) continue;
    pares.push([previa, actual]);
  }
  return pares;
}

function mensajePar(par: [Tramo, Tramo], ctx: ContextoEvaluacion): string {
  const [previa, actual] = par;
  const tramo = { inicio: previa.iv.inicio, fin: actual.iv.fin };
  return `${etiquetaPersona(ctx.indice.persona(actual.a.personaId))} repite en ${nombrePuestoTexto(actual.a.puestoId, ctx.datos)} en franjas seguidas ${cuando(actual.a.fecha, tramo)}`;
}

function evaluar(regla: ReglaGeneral<'noRepetirConsecutivas'>, ctx: ContextoEvaluacion): Incumplimiento[] {
  const { indice } = ctx;
  const grupos = new Map<string, Tramo[]>();
  for (const a of indice.asignaciones()) {
    if (a.tipo !== 'puesto') continue;
    const puesto = indice.puesto(a.puestoId);
    const iv = indice.intervalo(a);
    if (!puesto || !iv || !enAmbito(regla.params.ambito, puesto)) continue;
    const clave = `${a.personaId}|${a.fecha}|${a.puestoId}`;
    const lista = grupos.get(clave) ?? [];
    lista.push({ a, iv });
    grupos.set(clave, lista);
  }
  const resultado: Incumplimiento[] = [];
  for (const lista of grupos.values()) {
    for (const par of paresConsecutivos(lista, indice)) {
      resultado.push(
        incumplimientoGeneral(regla, {
          mensaje: mensajePar(par, ctx),
          fecha: par[1].a.fecha,
          personaId: par[1].a.personaId,
          asignacionIds: [par[0].a.id, par[1].a.id],
        }),
      );
    }
  }
  return resultado;
}

function comprobar(regla: ReglaGeneral<'noRepetirConsecutivas'>, ctx: ContextoEvaluacion, candidata: Asignacion): Comprobacion {
  const { indice } = ctx;
  const sinEfecto: Comprobacion = { permitido: true, coste: 0, motivos: [] };
  if (candidata.tipo !== 'puesto' || !indice.fechas.includes(candidata.fecha)) return sinEfecto;
  const puesto = indice.puesto(candidata.puestoId);
  const iv = indice.intervalo(candidata);
  if (!puesto || !iv || !enAmbito(regla.params.ambito, puesto)) return sinEfecto;
  // Solo importan las franjas de esa persona, ese día y ese puesto.
  const antes: Tramo[] = [];
  for (const a of indice.dePersonaDia(candidata.personaId, candidata.fecha)) {
    if (a.tipo !== 'puesto' || a.puestoId !== candidata.puestoId) continue;
    const i = indice.intervalo(a);
    if (i) antes.push({ a, iv: i });
  }
  const paresAntes = paresConsecutivos([...antes], indice).length;
  const paresDespues = paresConsecutivos([...antes, { a: candidata, iv }], indice);
  const suyos = paresDespues.filter(([p, q]) => p.a.id === candidata.id || q.a.id === candidata.id);
  return {
    permitido: !(regla.dura && suyos.length > 0),
    coste: regla.dura ? 0 : Math.max(0, regla.peso * (paresDespues.length - paresAntes)),
    motivos: suyos.map((par) => mensajePar(par, ctx)),
  };
}

export const definicion: DefinicionReglaGeneral<'noRepetirConsecutivas'> = {
  ...metadatos,
  evaluar,
  comprobar,
};
