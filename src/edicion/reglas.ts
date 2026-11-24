import { nuevoId } from '../modelo/ids';
import type { EstadoApp, EstadoValidacion, Id, ReglaGeneral } from '../modelo/tipos';
import { insertarDetras } from './comun';

export { ambitoVaciado } from './comun';

export function anadirRegla(estado: EstadoApp, regla: ReglaGeneral): EstadoApp {
  return { ...estado, reglas: [...estado.reglas, regla] };
}

export function reemplazarRegla(estado: EstadoApp, regla: ReglaGeneral): EstadoApp {
  return { ...estado, reglas: estado.reglas.map((r) => (r.id === regla.id ? regla : r)) };
}

export function borrarRegla(estado: EstadoApp, id: Id): EstadoApp {
  return { ...estado, reglas: estado.reglas.filter((r) => r.id !== id) };
}

/** Copia «<nombre> (copia)», en estado «validada», justo detrás de la original. */
export function duplicarRegla(estado: EstadoApp, id: Id, ids: () => Id = () => nuevoId('regla')): EstadoApp {
  const original = estado.reglas.find((r) => r.id === id);
  if (!original) return estado;
  const copia: ReglaGeneral = {
    ...structuredClone(original),
    id: ids(),
    nombre: `${original.nombre} (copia)`,
    estado: 'validada',
  };
  return { ...estado, reglas: insertarDetras(estado.reglas, id, copia) };
}

export function cambiarEstadoRegla(estado: EstadoApp, id: Id, nuevo: EstadoValidacion): EstadoApp {
  return { ...estado, reglas: estado.reglas.map((r) => (r.id === id ? { ...r, estado: nuevo } : r)) };
}

export function validarPendientes(estado: EstadoApp): EstadoApp {
  return {
    ...estado,
    reglas: estado.reglas.map((r) => (r.estado === 'pendiente' ? { ...r, estado: 'validada' as const } : r)),
  };
}
