import type { Config, EstadoApp } from '../modelo/tipos';

export function actualizarConfig(estado: EstadoApp, cambios: Partial<Config>): EstadoApp {
  return { ...estado, config: { ...estado.config, ...cambios } };
}

export function erroresConfig(config: Config): string[] {
  const errores: string[] = [];
  const c = config.corteMananaTarde;
  if (!Number.isInteger(c) || c < 60 || c > 23 * 60) {
    errores.push('El corte entre mañana y tarde debe estar entre las 01:00 y las 23:00');
  }
  if (config.exportacionArea !== 'diasEnColumnas' && config.exportacionArea !== 'franjasEnColumnas') {
    errores.push('La disposición de la exportación por área no es válida');
  }
  if (!Number.isInteger(config.semilla) || config.semilla < 0) {
    errores.push('La semilla debe ser un número entero, 0 o mayor');
  }
  if (!Number.isInteger(config.limiteMotorMs) || config.limiteMotorMs < 500 || config.limiteMotorMs > 120000) {
    errores.push('El tiempo máximo de cálculo debe estar entre 500 ms y 120000 ms');
  }
  return errores;
}
