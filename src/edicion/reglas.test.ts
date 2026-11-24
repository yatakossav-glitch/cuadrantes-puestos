import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../datos-ejemplo/ejemplo';
import { crearGeneradorIds } from '../modelo/ids';
import { anadirRegla, borrarRegla, cambiarEstadoRegla, duplicarRegla, reemplazarRegla, validarPendientes } from './reglas';

describe('reglas', () => {
  it('duplica justo detrás, validada y con sufijo', () => {
    const e = crearEstadoEjemplo();
    const copia = structuredClone(e);
    const n = duplicarRegla(e, 'regla-sin-solapes', crearGeneradorIds('regla'));
    expect(n.reglas[1]!.id).toBe('regla-1');
    expect(n.reglas[1]!.nombre).toBe('Sin solapes (copia)');
    expect(n.reglas[1]!.estado).toBe('validada');
    expect(n.reglas).toHaveLength(e.reglas.length + 1);
    expect(e).toEqual(copia);
  });
  it('la copia no comparte parámetros con la original', () => {
    const n = duplicarRegla(crearEstadoEjemplo(), 'regla-max-horas-dia', crearGeneradorIds('r'));
    expect(n.reglas[1]!.params).not.toBe(n.reglas[0]!.params);
  });
  it('añade, reemplaza y borra', () => {
    const e = crearEstadoEjemplo();
    const copia = structuredClone(e);
    const r = e.reglas[0]!;
    expect(anadirRegla(e, { ...r, id: 'x' }).reglas).toHaveLength(e.reglas.length + 1);
    expect(reemplazarRegla(e, { ...r, nombre: 'Otro' }).reglas[0]!.nombre).toBe('Otro');
    expect(borrarRegla(e, r.id).reglas.find((x) => x.id === r.id)).toBeUndefined();
    expect(e).toEqual(copia);
  });
  it('cambia el estado y valida pendientes', () => {
    const e = crearEstadoEjemplo();
    const copia = structuredClone(e);
    expect(cambiarEstadoRegla(e, 'regla-sin-solapes', 'descartada').reglas[0]!.estado).toBe('descartada');
    const n = cambiarEstadoRegla(e, 'regla-sin-solapes', 'descartada');
    expect(validarPendientes(n).reglas.map((r) => r.estado).filter((s) => s === 'pendiente')).toEqual([]);
    expect(validarPendientes(n).reglas[0]!.estado).toBe('descartada');
    expect(e).toEqual(copia);
  });
});
