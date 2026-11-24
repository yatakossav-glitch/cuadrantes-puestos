import type { Comprobacion, ContextoEvaluacion, DefinicionReglaGeneral, Incumplimiento } from '../contrato';
import { cuando, enAmbito, etiquetaPersona, incumplimientoGeneral } from '../util';
import type { Asignacion, AsignacionPuesto, FechaISO, Id, ReglaGeneral } from '../../modelo/tipos';
import type { MetadatosReglaGeneral } from '../metadatos';
import { describirAmbito, erroresAmbito } from '../texto';

export const metadatos: MetadatosReglaGeneral<'rotarEntreBloques'> = {
  tipo: 'rotarEntreBloques',
  nombre: 'Rotar entre bloques',
  ayuda: 'Entre bloques seguidos cambia la persona o la pareja.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({ ambito: { areaIds: [], puestoIds: [] } }),
  describir: (params, datos) => `Cambiar de persona entre bloques seguidos: ${describirAmbito(params.ambito, datos)}`,
  validarParams: (params, datos) => erroresAmbito(params.ambito, datos),
  campos: [
    { clave: 'ambito', etiqueta: 'Dónde se aplica', tipo: 'ambito', ayuda: 'Áreas o puestos afectados. Si no eliges ninguno, se aplica a todos.' },
  ],
};

interface GrupoBloques {
  fecha: FechaISO;
  inicio: number;
  fin: number;
  personas: Set<Id>;
  areas: Set<Id>;
  asignaciones: AsignacionPuesto[];
  /** Plazas de todos los bloques del grupo y cuántas están cubiertas. */
  plazas: number;
  cubiertas: number;
}

function evaluar(regla: ReglaGeneral<'rotarEntreBloques'>, ctx: ContextoEvaluacion): Incumplimiento[] {
  const { indice } = ctx;
  const porHueco = new Map<string, AsignacionPuesto>();
  for (const a of indice.asignaciones()) {
    if (a.tipo === 'puesto') porHueco.set(`${a.fecha}|${a.puestoId}|${a.franjaId}|${a.plaza}`, a);
  }
  // Primero cada bloque (puesto, plaza) y luego se agrupan por día e intervalo.
  const bloques = new Map<string, { fecha: FechaISO; inicio: number; fin: number; asignaciones: AsignacionPuesto[]; areaId: Id; huecos: number }>();
  for (const h of indice.huecos()) {
    if (h.bloqueId === null) continue;
    const puesto = indice.puesto(h.puestoId);
    if (!puesto || !enAmbito(regla.params.ambito, puesto)) continue;
    const clave = `${h.fecha}|${h.puestoId}|${h.bloqueId}|${h.plaza}`;
    const bloque = bloques.get(clave) ?? { fecha: h.fecha, inicio: h.inicio, fin: h.fin, asignaciones: [], areaId: puesto.areaId, huecos: 0 };
    bloque.inicio = Math.min(bloque.inicio, h.inicio);
    bloque.fin = Math.max(bloque.fin, h.fin);
    bloque.huecos += 1;
    const a = porHueco.get(`${h.fecha}|${h.puestoId}|${h.franjaId}|${h.plaza}`);
    if (a) bloque.asignaciones.push(a);
    bloques.set(clave, bloque);
  }
  const grupos = new Map<string, GrupoBloques>();
  for (const b of bloques.values()) {
    const clave = `${b.fecha}|${b.inicio}|${b.fin}`;
    const grupo = grupos.get(clave) ?? { fecha: b.fecha, inicio: b.inicio, fin: b.fin, personas: new Set<Id>(), areas: new Set<Id>(), asignaciones: [], plazas: 0, cubiertas: 0 };
    grupo.plazas += b.huecos;
    grupo.cubiertas += b.asignaciones.length;
    for (const a of b.asignaciones) grupo.personas.add(a.personaId);
    grupo.areas.add(b.areaId);
    grupo.asignaciones.push(...b.asignaciones);
    grupos.set(clave, grupo);
  }
  const ordenados = [...grupos.values()].sort((x, y) => (x.fecha === y.fecha ? x.inicio - y.inicio : x.fecha < y.fecha ? -1 : 1));
  const resultado: Incumplimiento[] = [];
  for (let i = 1; i < ordenados.length; i += 1) {
    const previo = ordenados[i - 1];
    const actual = ordenados[i];
    if (!previo || !actual || previo.fecha !== actual.fecha) continue;
    // Con grupos a medio llenar no se compara: aún no se sabe quién repetirá.
    if (previo.cubiertas < previo.plazas || actual.cubiertas < actual.plazas) continue;
    if (actual.personas.size === 0 || previo.personas.size !== actual.personas.size) continue;
    if (![...actual.personas].every((id) => previo.personas.has(id))) continue;
    const codigos = [...actual.personas].map((id) => etiquetaPersona(indice.persona(id))).sort();
    const quien =
      codigos.length === 1
        ? codigos[0]
        : `La pareja ${codigos.length === 2 ? codigos.join(' y ') : `${codigos.slice(0, -1).join(', ')} y ${codigos[codigos.length - 1]}`}`;
    const zona = [...actual.areas].map((id) => indice.area(id)?.nombre ?? 'puesto desconocido').join(' y ');
    resultado.push(
      incumplimientoGeneral(regla, {
        mensaje: `${quien} repite en ${zona} ${cuando(actual.fecha, { inicio: actual.inicio, fin: actual.fin })}`,
        fecha: actual.fecha,
        asignacionIds: [...previo.asignaciones, ...actual.asignaciones].map((a) => a.id),
      }),
    );
  }
  return resultado;
}

interface BloqueDia {
  inicio: number;
  fin: number;
  areaId: Id;
  /** Claves de los huecos del bloque (una plaza). */
  claves: string[];
}

/** Bloques (puesto, bloque, plaza) del ámbito en un día, en el orden de los huecos. */
function bloquesDelDia(regla: ReglaGeneral<'rotarEntreBloques'>, ctx: ContextoEvaluacion, molde: AsignacionPuesto): BloqueDia[] {
  const { indice, datos } = ctx;
  const bloques = new Map<string, BloqueDia>();
  for (const puesto of datos.puestos) {
    if (!enAmbito(regla.params.ambito, puesto)) continue;
    const horario = indice.horario(puesto.id, molde.fecha);
    if (!horario) continue;
    for (const franja of horario.franjas) {
      const bloque = horario.bloques.find((b) => b.franjaIds.includes(franja.id));
      if (!bloque) continue;
      for (let plaza = 0; plaza < puesto.plazas; plaza += 1) {
        const clave = `${puesto.id}|${bloque.id}|${plaza}`;
        const actual = bloques.get(clave) ?? { inicio: franja.inicio, fin: franja.fin, areaId: puesto.areaId, claves: [] };
        actual.inicio = Math.min(actual.inicio, franja.inicio);
        actual.fin = Math.max(actual.fin, franja.fin);
        actual.claves.push(indice.claveDe({ ...molde, puestoId: puesto.id, franjaId: franja.id, plaza }));
        bloques.set(clave, actual);
      }
    }
  }
  return [...bloques.values()];
}

/** Incumplimientos de un día según quién cubra cada hueco (mismo criterio que `evaluar`). */
function violacionesDelDia(
  ctx: ContextoEvaluacion,
  fecha: FechaISO,
  bloques: BloqueDia[],
  quien: (clave: string) => AsignacionPuesto | undefined,
): { mensaje: string; ids: Id[] }[] {
  const { indice } = ctx;
  const grupos = new Map<string, GrupoBloques>();
  for (const b of bloques) {
    const asignaciones = b.claves.map(quien).filter((a): a is AsignacionPuesto => a !== undefined);
    const clave = `${b.inicio}|${b.fin}`;
    const grupo = grupos.get(clave) ?? { fecha, inicio: b.inicio, fin: b.fin, personas: new Set<Id>(), areas: new Set<Id>(), asignaciones: [], plazas: 0, cubiertas: 0 };
    grupo.plazas += b.claves.length;
    grupo.cubiertas += asignaciones.length;
    for (const a of asignaciones) grupo.personas.add(a.personaId);
    grupo.areas.add(b.areaId);
    grupo.asignaciones.push(...asignaciones);
    grupos.set(clave, grupo);
  }
  const ordenados = [...grupos.values()].sort((x, y) => x.inicio - y.inicio);
  const resultado: { mensaje: string; ids: Id[] }[] = [];
  for (let i = 1; i < ordenados.length; i += 1) {
    const previo = ordenados[i - 1];
    const actual = ordenados[i];
    if (!previo || !actual) continue;
    if (previo.cubiertas < previo.plazas || actual.cubiertas < actual.plazas) continue;
    if (actual.personas.size === 0 || previo.personas.size !== actual.personas.size) continue;
    if (![...actual.personas].every((id) => previo.personas.has(id))) continue;
    const codigos = [...actual.personas].map((id) => etiquetaPersona(indice.persona(id))).sort();
    const quienes =
      codigos.length === 1
        ? codigos[0]
        : `La pareja ${codigos.length === 2 ? codigos.join(' y ') : `${codigos.slice(0, -1).join(', ')} y ${codigos[codigos.length - 1]}`}`;
    const zona = [...actual.areas].map((id) => indice.area(id)?.nombre ?? 'puesto desconocido').join(' y ');
    resultado.push({
      mensaje: `${quienes} repite en ${zona} ${cuando(fecha, { inicio: actual.inicio, fin: actual.fin })}`,
      ids: [...previo.asignaciones, ...actual.asignaciones].map((a) => a.id),
    });
  }
  return resultado;
}

function comprobar(regla: ReglaGeneral<'rotarEntreBloques'>, ctx: ContextoEvaluacion, candidata: Asignacion): Comprobacion {
  const { indice } = ctx;
  const sinEfecto: Comprobacion = { permitido: true, coste: 0, motivos: [] };
  if (candidata.tipo !== 'puesto' || !indice.fechas.includes(candidata.fecha)) return sinEfecto;
  const puesto = indice.puesto(candidata.puestoId);
  if (!puesto || !enAmbito(regla.params.ambito, puesto)) return sinEfecto;
  // Solo cambia lo del día de la candidata.
  const bloques = bloquesDelDia(regla, ctx, candidata);
  const claveCandidata = indice.claveDe(candidata);
  const antes = violacionesDelDia(ctx, candidata.fecha, bloques, (c) => indice.enHueco(c));
  const despues = violacionesDelDia(ctx, candidata.fecha, bloques, (c) => (c === claveCandidata ? candidata : indice.enHueco(c)));
  const suyas = despues.filter((v) => v.ids.includes(candidata.id));
  return {
    permitido: !(regla.dura && suyas.length > 0),
    coste: regla.dura ? 0 : Math.max(0, regla.peso * (despues.length - antes.length)),
    motivos: suyas.map((v) => v.mensaje),
  };
}

export const definicion: DefinicionReglaGeneral<'rotarEntreBloques'> = {
  ...metadatos,
  evaluar,
  comprobar,
};
