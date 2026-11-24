import type { Comprobacion, ContextoEvaluacion, DefinicionReglaGeneral, Incumplimiento } from '../contrato';
import { cuando, enAmbito, etiquetaPersona, incumplimientoGeneral } from '../util';
import { nombrePuesto as nombrePuestoTexto } from '../texto';
import type { Asignacion, AsignacionPuesto, Id, ReglaGeneral } from '../../modelo/tipos';
import type { MetadatosReglaGeneral } from '../metadatos';
import { describirAmbito, erroresAmbito } from '../texto';

export const metadatos: MetadatosReglaGeneral<'mismaPersonaBloque'> = {
  tipo: 'mismaPersonaBloque',
  nombre: 'Misma persona en todo el bloque',
  ayuda: 'Una sola persona cubre todas las franjas de cada bloque.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: () => ({ ambito: { areaIds: [], puestoIds: [] } }),
  describir: (params, datos) => `Una misma persona cubre todo el bloque: ${describirAmbito(params.ambito, datos)}`,
  validarParams: (params, datos) => erroresAmbito(params.ambito, datos),
  campos: [
    { clave: 'ambito', etiqueta: 'Dónde se aplica', tipo: 'ambito', ayuda: 'Áreas o puestos afectados. Si no eliges ninguno, se aplica a todos.' },
  ],
};

function evaluar(regla: ReglaGeneral<'mismaPersonaBloque'>, ctx: ContextoEvaluacion): Incumplimiento[] {
  const { indice, datos } = ctx;
  const porHueco = new Map<string, AsignacionPuesto>();
  for (const a of indice.asignaciones()) {
    if (a.tipo === 'puesto') porHueco.set(`${a.fecha}|${a.puestoId}|${a.franjaId}|${a.plaza}`, a);
  }
  // Un grupo por (fecha, puesto, bloque, plaza), en el orden de los huecos.
  const grupos = new Map<string, { inicio: number; fin: number; bloque: string; asignaciones: AsignacionPuesto[] }>();
  for (const h of indice.huecos()) {
    if (h.bloqueId === null) continue;
    const puesto = indice.puesto(h.puestoId);
    if (!puesto || !enAmbito(regla.params.ambito, puesto)) continue;
    const clave = `${h.fecha}|${h.puestoId}|${h.bloqueId}|${h.plaza}`;
    const grupo = grupos.get(clave) ?? { inicio: h.inicio, fin: h.fin, bloque: h.bloqueId, asignaciones: [] };
    grupo.inicio = Math.min(grupo.inicio, h.inicio);
    grupo.fin = Math.max(grupo.fin, h.fin);
    const a = porHueco.get(`${h.fecha}|${h.puestoId}|${h.franjaId}|${h.plaza}`);
    if (a) grupo.asignaciones.push(a);
    grupos.set(clave, grupo);
  }
  const resultado: Incumplimiento[] = [];
  for (const grupo of grupos.values()) {
    const ids = [...new Set(grupo.asignaciones.map((a) => a.personaId))];
    const primera = grupo.asignaciones[0];
    if (ids.length < 2 || !primera) continue;
    const codigos = ids.map((id) => etiquetaPersona(indice.persona(id)));
    const lista = codigos.length === 2 ? codigos.join(' y ') : `${codigos.slice(0, -1).join(', ')} y ${codigos[codigos.length - 1]}`;
    resultado.push(
      incumplimientoGeneral(regla, {
        mensaje: `${nombrePuestoTexto(primera.puestoId, datos)} ${cuando(primera.fecha, { inicio: grupo.inicio, fin: grupo.fin })} lo cubren ${lista} y debería ser una sola persona`,
        fecha: primera.fecha,
        asignacionIds: grupo.asignaciones.map((a) => a.id),
      }),
    );
  }
  return resultado;
}

/** Une los códigos: «EMP-01 y EMP-02» o «EMP-01, EMP-02 y EMP-03». */
function listaDeCodigos(codigos: string[]): string {
  return codigos.length === 2 ? codigos.join(' y ') : `${codigos.slice(0, -1).join(', ')} y ${codigos[codigos.length - 1]}`;
}

function comprobar(regla: ReglaGeneral<'mismaPersonaBloque'>, ctx: ContextoEvaluacion, candidata: Asignacion): Comprobacion {
  const { indice, datos } = ctx;
  const sinEfecto: Comprobacion = { permitido: true, coste: 0, motivos: [] };
  if (candidata.tipo !== 'puesto' || !indice.fechas.includes(candidata.fecha)) return sinEfecto;
  const puesto = indice.puesto(candidata.puestoId);
  const hueco = indice.hueco(indice.claveDe(candidata));
  if (!puesto || !hueco || hueco.bloqueId === null || !enAmbito(regla.params.ambito, puesto)) return sinEfecto;
  const horario = indice.horario(candidata.puestoId, candidata.fecha);
  if (!horario) return sinEfecto;
  // Franjas de ese bloque (mismo criterio que los huecos: el primer bloque que contiene la franja).
  const franjas = horario.franjas.filter((f) => horario.bloques.find((b) => b.franjaIds.includes(f.id))?.id === hueco.bloqueId);
  const antes: AsignacionPuesto[] = [];
  const despues: AsignacionPuesto[] = [];
  for (const f of franjas) {
    const propia = f.id === candidata.franjaId;
    const previa = indice.enHueco(indice.claveDe({ ...candidata, franjaId: f.id }));
    if (previa) antes.push(previa);
    const actual = propia ? candidata : previa;
    if (actual) despues.push(actual);
  }
  const personas = (l: AsignacionPuesto[]): Id[] => [...new Set(l.map((a) => a.personaId))];
  const incumpleAntes = personas(antes).length >= 2;
  const idsDespues = personas(despues);
  const incumpleDespues = idsDespues.length >= 2;
  const inicio = Math.min(...franjas.map((f) => f.inicio));
  const fin = Math.max(...franjas.map((f) => f.fin));
  const motivo = incumpleDespues
    ? [`${nombrePuestoTexto(candidata.puestoId, datos)} ${cuando(candidata.fecha, { inicio, fin })} lo cubren ${listaDeCodigos(idsDespues.map((id) => etiquetaPersona(indice.persona(id))))} y debería ser una sola persona`]
    : [];
  return {
    permitido: !(regla.dura && incumpleDespues),
    coste: !regla.dura && incumpleDespues && !incumpleAntes ? regla.peso : 0,
    motivos: motivo,
  };
}

export const definicion: DefinicionReglaGeneral<'mismaPersonaBloque'> = {
  ...metadatos,
  evaluar,
  comprobar,
};
