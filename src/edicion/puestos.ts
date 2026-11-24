import { NOMBRES_DIA, enRango, esFechaISO } from '../modelo/fechas';
import { nuevoId } from '../modelo/ids';
import { DIAS_SEMANA } from '../modelo/tipos';
import type { DiaSemana, EstadoApp, Id, Puesto } from '../modelo/tipos';
import {
  cuenta,
  diaDeAsignacion,
  efectosAsignaciones,
  efectosReferencias,
  insertarDetras,
  intercambiarOrden,
  modificarAsignaciones,
  quitarAsignaciones,
  quitarReferencias,
} from './comun';
import { erroresHorario, horarioDe } from './horario';
import type { Impacto } from './tipos';

export function crearPuesto(estado: EstadoApp, areaId: Id, ids: () => Id = () => nuevoId('puesto')): Puesto {
  return {
    id: ids(),
    areaId,
    nombre: 'Puesto nuevo',
    plazas: 1,
    dias: [...DIAS_SEMANA],
    horario: { general: { franjas: [{ id: 'f-1', inicio: 600, fin: 1320 }], bloques: [] }, porDia: {} },
    requiereHabilitacion: false,
    activo: true,
    vigenteDesde: null,
    vigenteHasta: null,
    orden: estado.puestos.reduce((m, p) => Math.max(m, p.orden), 0) + 1,
  };
}

export function anadirPuesto(estado: EstadoApp, puesto: Puesto): EstadoApp {
  return { ...estado, puestos: [...estado.puestos, puesto] };
}

export function reemplazarPuesto(estado: EstadoApp, puesto: Puesto): EstadoApp {
  return { ...estado, puestos: estado.puestos.map((p) => (p.id === puesto.id ? puesto : p)) };
}

/** Copia «<nombre> (copia)» con el mismo horario y los mismos ids de franja, justo detrás. */
export function duplicarPuesto(estado: EstadoApp, id: Id, ids: () => Id = () => nuevoId('puesto')): EstadoApp {
  const original = estado.puestos.find((p) => p.id === id);
  if (!original) return estado;
  const copia: Puesto = {
    ...structuredClone(original),
    id: ids(),
    nombre: `${original.nombre} (copia)`,
    orden: original.orden + 1,
  };
  const desplazados = estado.puestos.map((p) => (p.orden > original.orden ? { ...p, orden: p.orden + 1 } : p));
  return { ...estado, puestos: insertarDetras(desplazados, id, copia) };
}

/** Intercambia el orden con el puesto vecino de su misma área. */
export function moverPuesto(estado: EstadoApp, id: Id, sentido: -1 | 1): EstadoApp {
  const puesto = estado.puestos.find((p) => p.id === id);
  if (!puesto) return estado;
  const grupo = estado.puestos.filter((p) => p.areaId === puesto.areaId).sort((a, b) => a.orden - b.orden);
  const cambios = intercambiarOrden(grupo, id, sentido);
  if (cambios.size === 0) return estado;
  return { ...estado, puestos: estado.puestos.map((p) => (cambios.has(p.id) ? { ...p, orden: cambios.get(p.id)! } : p)) };
}

export function erroresPuesto(estado: EstadoApp, puesto: Puesto): string[] {
  const errores: string[] = [];
  const nombre = puesto.nombre.trim();
  const etiqueta = nombre || 'El puesto';
  if (!nombre) {
    errores.push('Falta el nombre del puesto');
  } else if (
    estado.puestos.some((p) => p.id !== puesto.id && p.areaId === puesto.areaId && p.nombre.trim().toLowerCase() === nombre.toLowerCase())
  ) {
    errores.push(`Ya hay un puesto llamado «${nombre}» en esta área`);
  }
  if (!estado.areas.some((a) => a.id === puesto.areaId)) errores.push(`${etiqueta}: el área elegida ya no existe`);
  if (!Number.isInteger(puesto.plazas) || puesto.plazas < 1 || puesto.plazas > 20) {
    errores.push(`${etiqueta}: las plazas deben ser un número entero entre 1 y 20`);
  }
  if (puesto.dias.length === 0) errores.push(`${etiqueta}: debe abrir al menos un día de la semana`);
  const { vigenteDesde: desde, vigenteHasta: hasta } = puesto;
  if ((desde !== null && !esFechaISO(desde)) || (hasta !== null && !esFechaISO(hasta))) {
    errores.push(`${etiqueta}: la vigencia tiene una fecha no válida`);
  } else if (desde !== null && hasta !== null && hasta < desde) {
    errores.push('La fecha de fin de la vigencia es anterior a la de inicio.');
  }
  errores.push(...erroresHorario(puesto.horario.general, `${etiqueta} · horario general`));
  for (const dia of DIAS_SEMANA) {
    const h = puesto.horario.porDia[dia];
    if (!h) continue;
    errores.push(...erroresHorario(h, `${etiqueta} · ${NOMBRES_DIA[dia]}`));
    if (!puesto.dias.includes(dia)) {
      errores.push(`${etiqueta}: tiene un horario propio el ${NOMBRES_DIA[dia]}, pero no abre ese día`);
    }
  }
  return errores;
}

interface Reajuste {
  estado: EstadoApp;
  /** Una frase por causa, con el número de asignaciones quitadas. */
  efectos: string[];
}

/**
 * Reajusta las asignaciones del puesto a su nueva definición: si la franja ya no existe pero ese día hay otra
 * con exactamente el mismo inicio y fin, la asignación se pasa a ella; si no, se quita.
 */
function reajustar(estado: EstadoApp, nuevo: Puesto): Reajuste {
  const antes = estado.puestos.find((p) => p.id === nuevo.id);
  const causas = new Map<string, number>();
  const quitar = (causa: string): null => {
    causas.set(causa, (causas.get(causa) ?? 0) + 1);
    return null;
  };
  const r = modificarAsignaciones(estado, (a) => {
    if (a.tipo !== 'puesto' || a.puestoId !== nuevo.id) return a;
    if ('fecha' in a && !enRango(a.fecha, nuevo.vigenteDesde, nuevo.vigenteHasta)) {
      return quitar('porque quedan fuera de las fechas en que existe el puesto');
    }
    const dia: DiaSemana = diaDeAsignacion(a);
    if (!nuevo.dias.includes(dia)) return quitar(`porque el puesto ya no abre el ${NOMBRES_DIA[dia]}`);
    if (a.plaza >= nuevo.plazas) return quitar(`de la plaza ${a.plaza + 1}, que deja de existir`);
    const franjas = horarioDe(nuevo, dia).franjas;
    if (franjas.some((f) => f.id === a.franjaId)) return a;
    const vieja = antes ? horarioDe(antes, dia).franjas.find((f) => f.id === a.franjaId) : undefined;
    const equivalente = vieja ? franjas.find((f) => f.inicio === vieja.inicio && f.fin === vieja.fin) : undefined;
    if (equivalente) return { ...a, franjaId: equivalente.id };
    return quitar(`del ${NOMBRES_DIA[dia]} porque su franja ya no existe`);
  });
  const efectos: string[] = [];
  for (const [causa, n] of causas) {
    const verbo = n === 1 ? 'Se quitará' : 'Se quitarán';
    const asig = cuenta(n, 'asignación', 'asignaciones');
    efectos.push(`${verbo} ${asig} ${causa}`);
  }
  return { estado: r.estado, efectos };
}

export function impactoCambioPuesto(estado: EstadoApp, nuevo: Puesto): Impacto {
  return { bloqueos: [], efectos: reajustar(estado, nuevo).efectos };
}

export function aplicarCambioPuesto(estado: EstadoApp, nuevo: Puesto): EstadoApp {
  return reemplazarPuesto(reajustar(estado, nuevo).estado, nuevo);
}

export function impactoBorrarPuesto(estado: EstadoApp, id: Id): Impacto {
  const efectos = efectosAsignaciones(quitarAsignaciones(estado, (a) => a.tipo === 'puesto' && a.puestoId === id));
  const cierres = estado.incidencias.filter((i) => i.tipo === 'puestoCerrado' && i.puestoId === id).length;
  if (cierres > 0) {
    efectos.push(`${cierres === 1 ? 'Se quitará' : 'Se quitarán'} ${cuenta(cierres, 'cierre del puesto', 'cierres del puesto')}`);
  }
  const ref = quitarReferencias(estado, { areaIds: new Set(), puestoIds: new Set([id]) });
  efectos.push(...efectosReferencias(ref));
  return { bloqueos: [], efectos };
}

export function borrarPuesto(estado: EstadoApp, id: Id): EstadoApp {
  const { estado: sinAsig } = quitarAsignaciones(estado, (a) => a.tipo === 'puesto' && a.puestoId === id);
  const { estado: limpio } = quitarReferencias(sinAsig, { areaIds: new Set(), puestoIds: new Set([id]) });
  return {
    ...limpio,
    puestos: limpio.puestos.filter((p) => p.id !== id),
    incidencias: limpio.incidencias.filter((i) => !(i.tipo === 'puestoCerrado' && i.puestoId === id)),
  };
}
