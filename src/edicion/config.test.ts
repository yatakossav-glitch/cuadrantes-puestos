import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../datos-ejemplo/ejemplo';
import { actualizarConfig, erroresConfig } from './config';

describe('config', () => {
  it('actualiza sin mutar', () => {
    const e = crearEstadoEjemplo();
    const copia = structuredClone(e);
    const n = actualizarConfig(e, { semilla: 7 });
    expect(n.config.semilla).toBe(7);
    expect(n.config.corteMananaTarde).toBe(945);
    expect(e).toEqual(copia);
  });
  it('sin errores con la configuración de ejemplo', () => {
    expect(erroresConfig(crearEstadoEjemplo().config)).toEqual([]);
  });
  it('detecta valores no válidos', () => {
    const c = crearEstadoEjemplo().config;
    expect(erroresConfig({ ...c, corteMananaTarde: 0 })).toHaveLength(1);
    expect(erroresConfig({ ...c, semilla: 1.5 })).toHaveLength(1);
    expect(erroresConfig({ ...c, limiteMotorMs: 10 })).toHaveLength(1);
    expect(erroresConfig({ ...c, exportacionArea: 'x' as never })).toHaveLength(1);
  });
});
