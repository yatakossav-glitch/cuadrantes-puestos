import { useEffect, useState } from 'preact/hooks';
import type { EstadoApp } from '../modelo/tipos';
import type { AlmacenApp } from './estado';

/** Se suscribe al almacén y fuerza el repintado en cada cambio. Devuelve el estado actual. */
export function usarAlmacen(almacen: AlmacenApp): EstadoApp {
  const [, repintar] = useState(0);
  useEffect(() => {
    const baja = almacen.suscribir(() => repintar((n) => n + 1));
    // Por si hubo un cambio entre el primer pintado y la suscripción.
    repintar((n) => n + 1);
    return baja;
  }, [almacen]);
  return almacen.obtener();
}
