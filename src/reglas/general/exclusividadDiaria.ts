import type { Comprobacion, ContextoEvaluacion, DefinicionReglaGeneral, Incumplimiento } from '../contrato';
import { cuando, etiquetaPersona, incumplimientoGeneral } from '../util';
import { nombrePuesto as nombrePuestoTexto } from '../texto';
import type { Asignacion, AsignacionPuesto, ReglaGeneral } from '../../modelo/tipos';
import type { MetadatosReglaGeneral } from '../metadatos';
import { describirDias, enumerar, erroresDias, nombrePuesto } from '../texto';

export const metadatos: MetadatosReglaGeneral<'exclusividadDiaria'> = {
  tipo: 'exclusividadDiaria',
  nombre: 'Puesto en exclusiva',
  ayuda: 'Quien hace estos puestos un día no hace nada más ese día, salvo en los días de excepción.',
  dureza: 'ambas',
  pesoPorDefecto: 5,
  paramsPorDefecto: (datos) => {
    const primero = datos.puestos.find((p) => datos.areas.some((a) => a.id === p.areaId && a.activa));
    return { puestoIds: primero ? [primero.id] : [], diasExcepcion: [] };
  },
  describir(params, datos) {
    const puestos = enumerar(params.puestoIds.map((id) => nombrePuesto(id, datos)));
    const base = `Quien hace ${puestos || 'estos puestos'} no hace nada más ese día`;
    return params.diasExcepcion.length === 0 ? base : `${base} (salvo ${describirDias(params.diasExcepcion)})`;
  },
  validarParams(params, datos) {
    const errores: string[] = [];
    if (params.puestoIds.length === 0) errores.push('Elige al menos un puesto.');
    if (params.puestoIds.some((id) => !datos.puestos.some((p) => p.id === id))) {
      errores.push('Uno de los puestos elegidos ya no existe.');
    }
    errores.push(...erroresDias(params.diasExcepcion, false, 'Días de excepción'));
    return errores;
  },
  campos: [
    { clave: 'puestoIds', etiqueta: 'Puestos en exclusiva', tipo: 'puestos', ayuda: 'Quien los haga ese día no hará otros puestos.' },
    { clave: 'diasExcepcion', etiqueta: 'Días de excepción', tipo: 'dias', ayuda: 'Días en que sí se puede combinar con otros puestos.' },
  ],
};

function evaluar(regla: ReglaGeneral<'exclusividadDiaria'>, ctx: ContextoEvaluacion): Incumplimiento[] {
  const { indice, datos } = ctx;
  const porPersonaDia = new Map<string, AsignacionPuesto[]>();
  for (const a of indice.asignaciones()) {
    if (a.tipo !== 'puesto') continue;
    const clave = `${a.personaId}|${a.fecha}`;
    const lista = porPersonaDia.get(clave) ?? [];
    lista.push(a);
    porPersonaDia.set(clave, lista);
  }
  const resultado: Incumplimiento[] = [];
  for (const lista of porPersonaDia.values()) {
    const primera = lista[0];
    if (!primera || regla.params.diasExcepcion.includes(indice.diaDe(primera.fecha))) continue;
    const exclusivas = lista.filter((a) => regla.params.puestoIds.includes(a.puestoId));
    const otras = lista.filter((a) => !regla.params.puestoIds.includes(a.puestoId));
    if (exclusivas.length === 0 || otras.length === 0) continue;
    const nombres = (l: AsignacionPuesto[]) => [...new Set(l.map((a) => nombrePuestoTexto(a.puestoId, datos)))].join(' y ');
    resultado.push(
      incumplimientoGeneral(regla, {
        mensaje: `${etiquetaPersona(indice.persona(primera.personaId))} hace ${nombres(exclusivas)}, que es en exclusiva, y además ${nombres(otras)} ${cuando(primera.fecha)}`,
        fecha: primera.fecha,
        personaId: primera.personaId,
        asignacionIds: lista.map((a) => a.id),
      }),
    );
  }
  return resultado;
}

function comprobar(regla: ReglaGeneral<'exclusividadDiaria'>, ctx: ContextoEvaluacion, candidata: Asignacion): Comprobacion {
  const { indice, datos } = ctx;
  const sinEfecto: Comprobacion = { permitido: true, coste: 0, motivos: [] };
  if (candidata.tipo !== 'puesto' || !indice.fechas.includes(candidata.fecha)) return sinEfecto;
  if (regla.params.diasExcepcion.includes(indice.diaDe(candidata.fecha))) return sinEfecto;
  const previas = indice.dePersonaDia(candidata.personaId, candidata.fecha).filter((a): a is AsignacionPuesto => a.tipo === 'puesto');
  const incumple = (l: AsignacionPuesto[]) =>
    l.some((a) => regla.params.puestoIds.includes(a.puestoId)) && l.some((a) => !regla.params.puestoIds.includes(a.puestoId));
  const incumpleAntes = incumple(previas);
  const lista = [...previas, candidata];
  const incumpleDespues = incumple(lista);
  const nombres = (l: AsignacionPuesto[]) => [...new Set(l.map((a) => nombrePuestoTexto(a.puestoId, datos)))].join(' y ');
  const motivos = incumpleDespues
    ? [`${etiquetaPersona(indice.persona(candidata.personaId))} hace ${nombres(lista.filter((a) => regla.params.puestoIds.includes(a.puestoId)))}, que es en exclusiva, y además ${nombres(lista.filter((a) => !regla.params.puestoIds.includes(a.puestoId)))} ${cuando(candidata.fecha)}`]
    : [];
  return {
    permitido: !(regla.dura && incumpleDespues),
    coste: !regla.dura && incumpleDespues && !incumpleAntes ? regla.peso : 0,
    motivos,
  };
}

export const definicion: DefinicionReglaGeneral<'exclusividadDiaria'> = {
  ...metadatos,
  evaluar,
  comprobar,
};
