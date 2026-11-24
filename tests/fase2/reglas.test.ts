/** Caja negra: edición de reglas generales. ARQUITECTURA.md §9.2. */
import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../../src/datos-ejemplo/ejemplo';
import { crearGeneradorIds } from '../../src/modelo/ids';
import {
  anadirRegla, borrarRegla, cambiarEstadoRegla, duplicarRegla, reemplazarRegla, validarPendientes,
} from '../../src/edicion/reglas';
import { crearReglaGeneral } from '../../src/reglas/metadatos-general';
import { congelar } from './ayudas';

describe('validarPendientes', () => {
  it('deja todas las reglas del ejemplo en validada', () => {
    const e = congelar(crearEstadoEjemplo());
    expect(e.reglas.every((r) => r.estado === 'pendiente')).toBe(true);
    const e2 = validarPendientes(e);
    expect(e2.reglas).toHaveLength(15);
    expect(e2.reglas.every((r) => r.estado === 'validada')).toBe(true);
    expect(e2.reglas.map((r) => r.id)).toEqual(e.reglas.map((r) => r.id));
  });
  it('no cambia las descartadas ni el resto de campos', () => {
    const e = crearEstadoEjemplo();
    e.reglas[2]!.estado = 'descartada';
    e.reglas[3]!.estado = 'validada';
    const e2 = validarPendientes(congelar(e));
    expect(e2.reglas[2]!.estado).toBe('descartada');
    expect(e2.reglas[3]!.estado).toBe('validada');
    expect(e2.reglas.map((r) => [r.activa, r.dura, r.peso])).toEqual(e.reglas.map((r) => [r.activa, r.dura, r.peso]));
    expect(e2.reglas.find((r) => r.id === 'regla-descanso')!.activa).toBe(false);
  });
});

describe('duplicarRegla', () => {
  it('añade «(copia)» justo detrás, en estado validada y con id nuevo', () => {
    const e = congelar(crearEstadoEjemplo());
    const e2 = duplicarRegla(e, 'regla-max-dias', crearGeneradorIds('regla-t'));
    expect(e2.reglas).toHaveLength(16);
    const i = e2.reglas.findIndex((r) => r.id === 'regla-max-dias');
    const copia = e2.reglas[i + 1]!;
    expect(copia.nombre).toBe('Máximo 6 días (copia)');
    expect(copia.estado).toBe('validada');
    expect(copia.id).not.toBe('regla-max-dias');
    expect(copia.params).toEqual(e.reglas[i]!.params);
    expect(e2.reglas[i]!.estado).toBe('pendiente');
    expect(new Set(e2.reglas.map((r) => r.id)).size).toBe(16);
  });
  it('la copia no comparte parámetros con el original', () => {
    const e2 = duplicarRegla(crearEstadoEjemplo(), 'regla-comidas-domingo', crearGeneradorIds('r'));
    const i = e2.reglas.findIndex((r) => r.id === 'regla-comidas-domingo');
    const [orig, copia] = [e2.reglas[i]!, e2.reglas[i + 1]!];
    expect(copia.params).not.toBe(orig.params);
    (copia.params as { dias: number[] }).dias.push(0);
    expect((orig.params as { dias: number[] }).dias).toEqual([6]);
  });
});

describe('añadir, reemplazar, borrar y cambiar estado', () => {
  it('anadirRegla pone la regla al final', () => {
    const e = congelar(crearEstadoEjemplo());
    const r = crearReglaGeneral('sinSolapes', e, 'regla-nueva');
    const e2 = anadirRegla(e, r);
    expect(e2.reglas.at(-1)!.id).toBe('regla-nueva');
    expect(e.reglas).toHaveLength(15);
  });
  it('reemplazarRegla cambia por id sin mover el orden', () => {
    const e = congelar(crearEstadoEjemplo());
    const e2 = reemplazarRegla(e, { ...e.reglas[4]!, activa: false } as typeof e.reglas[number]);
    expect(e2.reglas[4]!.activa).toBe(false);
    expect(e2.reglas.map((r) => r.id)).toEqual(e.reglas.map((r) => r.id));
  });
  it('borrarRegla la quita', () => {
    const e = congelar(crearEstadoEjemplo());
    const e2 = borrarRegla(e, 'regla-max-dias');
    expect(e2.reglas.map((r) => r.id)).not.toContain('regla-max-dias');
    expect(e2.reglas).toHaveLength(14);
  });
  it('cambiarEstadoRegla cambia solo esa regla', () => {
    const e = congelar(crearEstadoEjemplo());
    const e2 = cambiarEstadoRegla(e, 'regla-max-dias', 'descartada');
    expect(e2.reglas.filter((r) => r.estado === 'descartada').map((r) => r.id)).toEqual(['regla-max-dias']);
  });
});
