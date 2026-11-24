import { nuevoId } from '../modelo/ids';
import type { Area, EstadoApp, Id } from '../modelo/tipos';
import { ICONOS_AREA } from '../persistencia/coherencia';
import {
  efectosReferencias,
  intercambiarOrden,
  quitarReferencias,
} from './comun';
import type { Impacto } from './tipos';

/** Colores de acento sobrios para las áreas. */
export const PALETA_AREAS: readonly string[] = [
  '#2f6fb0', '#2e8b57', '#c9892b', '#8a5cb5', '#b5495b', '#2a8a96', '#7a8a2e', '#6b7280',
];

const porPresentacion = (a: Area, b: Area): number => a.planta - b.planta || a.orden - b.orden;

export function crearArea(estado: EstadoApp, ids: () => Id = () => nuevoId('area')): Area {
  const ordenadas = [...estado.areas].sort(porPresentacion);
  const ultima = ordenadas[ordenadas.length - 1];
  const usados = new Set(estado.areas.map((a) => a.color.toLowerCase()));
  const color = PALETA_AREAS.find((c) => !usados.has(c)) ?? PALETA_AREAS[estado.areas.length % PALETA_AREAS.length]!;
  return {
    id: ids(),
    nombre: 'Área nueva',
    planta: ultima?.planta ?? 3,
    color,
    icono: 'tienda',
    activa: true,
    orden: estado.areas.reduce((m, a) => Math.max(m, a.orden), 0) + 1,
  };
}

export function anadirArea(estado: EstadoApp, area: Area): EstadoApp {
  return { ...estado, areas: [...estado.areas, area] };
}

export function reemplazarArea(estado: EstadoApp, area: Area): EstadoApp {
  return { ...estado, areas: estado.areas.map((a) => (a.id === area.id ? area : a)) };
}

/** Intercambia el orden con la vecina de la misma planta; si no hay vecina, no cambia nada. */
export function moverArea(estado: EstadoApp, id: Id, sentido: -1 | 1): EstadoApp {
  const area = estado.areas.find((a) => a.id === id);
  if (!area) return estado;
  const grupo = estado.areas.filter((a) => a.planta === area.planta).sort(porPresentacion);
  const cambios = intercambiarOrden(grupo, id, sentido);
  if (cambios.size === 0) return estado;
  return { ...estado, areas: estado.areas.map((a) => (cambios.has(a.id) ? { ...a, orden: cambios.get(a.id)! } : a)) };
}

export function erroresArea(estado: EstadoApp, area: Area): string[] {
  const errores: string[] = [];
  const nombre = area.nombre.trim();
  if (!nombre) {
    errores.push('Falta el nombre del área');
  } else if (
    estado.areas.some((a) => a.id !== area.id && a.planta === area.planta && a.nombre.trim().toLowerCase() === nombre.toLowerCase())
  ) {
    errores.push(`Ya hay un área llamada «${nombre}» en la planta ${area.planta}`);
  }
  if (!Number.isInteger(area.planta) || area.planta < 0 || area.planta > 99) {
    errores.push('La planta debe ser un número entero entre 0 y 99');
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(area.color)) errores.push('El color debe tener el formato #rrggbb');
  if (!(ICONOS_AREA as readonly string[]).includes(area.icono)) errores.push('El icono elegido no es válido');
  return errores;
}

export function impactoBorrarArea(estado: EstadoApp, id: Id): Impacto {
  const bloqueos: string[] = [];
  const puestos = estado.puestos.filter((p) => p.areaId === id).length;
  if (puestos > 0) {
    bloqueos.push(
      puestos === 1
        ? 'Tiene 1 puesto: bórralo o muévelo a otra área antes'
        : `Tiene ${puestos} puestos: bórralos o muévelos a otra área antes`,
    );
  }
  for (const r of estado.reglas) {
    if (r.tipo === 'maxFranjasSiSoloArea' && r.params.areaId === id) {
      bloqueos.push(`La regla «${r.nombre}» exige esta área: cámbiala o bórrala antes`);
    }
  }
  const ref = quitarReferencias(estado, { areaIds: new Set([id]), puestoIds: new Set() });
  return { bloqueos, efectos: efectosReferencias(ref) };
}

/** Quita el área y su id de habilitaciones, ámbitos (reglas y restricciones) y excepciones de maxMinutosDia. */
export function borrarArea(estado: EstadoApp, id: Id): EstadoApp {
  const { estado: limpio } = quitarReferencias(estado, { areaIds: new Set([id]), puestoIds: new Set() });
  return { ...limpio, areas: limpio.areas.filter((a) => a.id !== id) };
}
