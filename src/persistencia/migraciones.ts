/**
 * Migraciones del esquema persistido. Funciones puras sobre JSON sin tipar.
 */
import { MIGRACIONES, VERSION_ESQUEMA, type Migracion } from '../modelo/esquema';

export type ResultadoMigracion = { ok: true; datos: unknown } | { ok: false; error: string };

/**
 * Aplica en cadena las migraciones desde `versionOrigen` hasta `versionDestino` (por defecto, la actual).
 * Rechaza versiones inválidas, anteriores a 1 o más modernas que la app.
 * `migraciones` y `versionDestino` son inyectables para las pruebas. La cadena debe llegar exactamente al destino.
 */
export function migrar(
  datos: unknown,
  versionOrigen: number,
  migraciones: readonly Migracion[] = MIGRACIONES,
  versionDestino: number = VERSION_ESQUEMA,
): ResultadoMigracion {
  if (typeof versionOrigen !== 'number' || !Number.isInteger(versionOrigen)) {
    return { ok: false, error: 'La versión de los datos no es válida.' };
  }
  if (versionOrigen < 1) {
    return { ok: false, error: `La versión de los datos (${versionOrigen}) no es válida.` };
  }
  const destino = versionDestino;
  if (versionOrigen > destino) {
    return {
      ok: false,
      error: `Los datos son de una versión más moderna (${versionOrigen}) que la de esta aplicación (${destino}). Actualiza la aplicación.`,
    };
  }
  let actual = datos;
  for (let v = versionOrigen; v < destino; v++) {
    const paso = migraciones.find((m) => m.desde === v);
    if (!paso) {
      return { ok: false, error: `Falta la migración de la versión ${v} a la ${v + 1}.` };
    }
    try {
      actual = paso.migrar(actual);
    } catch {
      return { ok: false, error: `Falló la migración de la versión ${v} a la ${v + 1}.` };
    }
  }
  return { ok: true, datos: actual };
}
