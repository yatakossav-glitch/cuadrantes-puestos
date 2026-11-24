/** Caja negra: edición de personas. ARQUITECTURA.md §9.2. */
import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo, crearEstadoVacio } from '../../src/datos-ejemplo/ejemplo';
import { crearGeneradorIds } from '../../src/modelo/ids';
import type { Persona, RestriccionPersona } from '../../src/modelo/tipos';
import {
  anadirPersona, anadirRestriccion, borrarPersona, borrarRestriccion, crearPersona, duplicarPersona,
  erroresPersona, impactoBorrarPersona, reemplazarPersona, reemplazarRestriccion, siguienteCodigo,
} from '../../src/edicion/personas';
import { congelar, copiar, estadoConDatos, idsAsignaciones, idsAsignacionesTipo } from './ayudas';

function persona(estado = crearEstadoEjemplo(), cambios: Partial<Persona> = {}): Persona {
  return { ...copiar(estado.personas[0]!), id: 'per-nueva', codigo: 'EMP-30', ...cambios };
}

describe('siguienteCodigo y crearPersona', () => {
  it('con el ejemplo da EMP-30', () => {
    expect(siguienteCodigo(crearEstadoEjemplo())).toBe('EMP-30');
  });
  it('sin personas da EMP-01', () => {
    expect(siguienteCodigo(crearEstadoVacio())).toBe('EMP-01');
  });
  it('es máximo numérico + 1, no cuenta huecos', () => {
    const e = crearEstadoEjemplo();
    e.personas = e.personas.filter((p) => p.codigo === 'EMP-05' || p.codigo === 'EMP-12');
    expect(siguienteCodigo(e)).toBe('EMP-13');
  });
  it('pasa de dos cifras sin romperse', () => {
    const e = crearEstadoEjemplo();
    e.personas[0]!.codigo = 'EMP-99';
    expect(siguienteCodigo(e)).toBe('EMP-100');
  });
  it('crearPersona: código siguiente, equipo M, activa, resto vacío', () => {
    const e = crearEstadoEjemplo();
    const p = crearPersona(e, crearGeneradorIds('per-t'));
    expect(p.id).toBe('per-t-1');
    expect(p.codigo).toBe('EMP-30');
    expect(p.equipo).toBe('M');
    expect(p.activa).toBe(true);
    expect(p.alias).toBeNull();
    expect(p.habilitaciones).toEqual([]);
    expect(p.restricciones).toEqual([]);
    expect(e.personas).toHaveLength(29);
  });
  it('anadirPersona la añade al final y no muta', () => {
    const e = congelar(crearEstadoEjemplo());
    const p = crearPersona(e, crearGeneradorIds('per-t'));
    const e2 = anadirPersona(e, p);
    expect(e2.personas).toHaveLength(30);
    expect(e2.personas.at(-1)!.codigo).toBe('EMP-30');
    expect(siguienteCodigo(e2)).toBe('EMP-31');
  });
});

describe('erroresPersona', () => {
  it('una persona correcta del ejemplo no da errores', () => {
    const e = crearEstadoEjemplo();
    for (const p of e.personas) expect(erroresPersona(e, p)).toEqual([]);
  });
  it('código casi duplicado «emp 7» frente a EMP-07 da error que nombra ambos', () => {
    const e = crearEstadoEjemplo();
    const errores = erroresPersona(e, persona(e, { codigo: 'emp 7' }));
    expect(errores.length).toBeGreaterThan(0);
    expect(errores.join(' ')).toContain('EMP-07');
  });
  it('código idéntico a otro (con id distinto) da error', () => {
    const e = crearEstadoEjemplo();
    expect(erroresPersona(e, persona(e, { codigo: 'EMP-07' })).length).toBeGreaterThan(0);
  });
  it('código vacío da error', () => {
    const e = crearEstadoEjemplo();
    expect(erroresPersona(e, persona(e, { codigo: '' })).length).toBeGreaterThan(0);
  });
  it('alta posterior a baja da error', () => {
    const e = crearEstadoEjemplo();
    expect(erroresPersona(e, persona(e, { alta: '2026-12-01', baja: '2026-11-01' })).length).toBeGreaterThan(0);
  });
  it('alta anterior a baja, o solo una de las dos, no da error', () => {
    const e = crearEstadoEjemplo();
    expect(erroresPersona(e, persona(e, { alta: '2026-11-01', baja: '2026-12-01' }))).toEqual([]);
    expect(erroresPersona(e, persona(e, { alta: '2026-11-01', baja: null }))).toEqual([]);
  });
  it('fecha no válida da error', () => {
    const e = crearEstadoEjemplo();
    expect(erroresPersona(e, persona(e, { alta: '2026-13-45' })).length).toBeGreaterThan(0);
  });
  it('habilitación a un área inexistente da error', () => {
    const e = crearEstadoEjemplo();
    expect(erroresPersona(e, persona(e, { habilitaciones: ['area-fantasma'] })).length).toBeGreaterThan(0);
  });
  it('horas negativas o excesivas dan error; límite de 168 h no', () => {
    const e = crearEstadoEjemplo();
    expect(erroresPersona(e, persona(e, { contratoMinSemana: -1 })).length).toBeGreaterThan(0);
    expect(erroresPersona(e, persona(e, { objetivoCoberturaMinSemana: 7 * 24 * 60 + 1 })).length).toBeGreaterThan(0);
    expect(erroresPersona(e, persona(e, { contratoMinSemana: 7 * 24 * 60 }))).toEqual([]);
  });
  it('alias de más de 40 caracteres da error; de 40 no', () => {
    const e = crearEstadoEjemplo();
    expect(erroresPersona(e, persona(e, { alias: 'x'.repeat(41) })).length).toBeGreaterThan(0);
    expect(erroresPersona(e, persona(e, { alias: 'x'.repeat(40) }))).toEqual([]);
  });
});

describe('borrar persona', () => {
  it('el impacto anuncia las asignaciones e incidencias y no bloquea', () => {
    const e = estadoConDatos();
    const imp = impactoBorrarPersona(e, 'per-05');
    expect(imp.bloqueos).toEqual([]);
    expect(imp.efectos.length).toBeGreaterThan(0);
    expect(imp.efectos.join(' ')).toMatch(/asignaci/i);
  });
  it('una persona sin nada asignado no tiene efectos de asignaciones', () => {
    const imp = impactoBorrarPersona(estadoConDatos(), 'per-29');
    expect(imp.bloqueos).toEqual([]);
    expect(imp.efectos.join(' ')).not.toMatch(/asignaci/i);
  });
  it('quita la persona, sus asignaciones (cuadrantes, pausas y semanas tipo) e incidencias', () => {
    const e = congelar(estadoConDatos());
    const e2 = borrarPersona(e, 'per-05');
    expect(e2.personas.find((p) => p.id === 'per-05')).toBeUndefined();
    expect(e2.personas).toHaveLength(28);
    expect(idsAsignaciones(e2).sort()).toEqual(['a4', 'a5', 'a6']);
    expect(idsAsignacionesTipo(e2).sort()).toEqual(['t2', 't3']);
    expect(e2.incidencias.map((i) => i.id).sort()).toEqual(['i2', 'i3']);
  });
  it('respeta los candados de otras personas', () => {
    const e2 = borrarPersona(estadoConDatos(), 'per-05');
    const a6 = e2.cuadrantes['2026-11-23']!.asignaciones.find((a) => a.id === 'a6');
    expect(a6?.bloqueada).toBe(true);
  });
  it('no muta la entrada', () => {
    const e = estadoConDatos();
    const antes = JSON.stringify(e);
    borrarPersona(e, 'per-05');
    impactoBorrarPersona(e, 'per-05');
    expect(JSON.stringify(e)).toBe(antes);
  });
});

describe('duplicar persona', () => {
  it('copia con código nuevo, alias null, ids de restricción nuevos, justo detrás', () => {
    const e = crearEstadoEjemplo();
    e.personas.find((p) => p.id === 'per-03')!.alias = 'Alias local';
    const antes = JSON.stringify(e);
    const e2 = duplicarPersona(congelar(e), 'per-03', crearGeneradorIds('x'));
    expect(JSON.stringify(e)).toBe(antes);
    expect(e2.personas).toHaveLength(30);
    const i = e2.personas.findIndex((p) => p.id === 'per-03');
    const copia = e2.personas[i + 1]!;
    const orig = e2.personas[i]!;
    expect(orig.alias).toBe('Alias local');
    expect(copia.id).not.toBe(orig.id);
    expect(copia.codigo).toBe('EMP-30');
    expect(copia.alias).toBeNull();
    expect(copia.equipo).toBe(orig.equipo);
    expect(copia.habilitaciones).toEqual(orig.habilitaciones);
    expect(copia.restricciones).toHaveLength(1);
    expect(copia.restricciones[0]!.id).not.toBe(orig.restricciones[0]!.id);
    expect(copia.restricciones[0]!.params).toEqual(orig.restricciones[0]!.params);
    expect(new Set(e2.personas.map((p) => p.id)).size).toBe(30);
  });
  it('la copia no comparte referencias con el original', () => {
    const e2 = duplicarPersona(crearEstadoEjemplo(), 'per-01', crearGeneradorIds('x'));
    const [orig, copia] = [e2.personas[0]!, e2.personas[1]!];
    copia.habilitaciones.push('area-zzz');
    expect(orig.habilitaciones).not.toContain('area-zzz');
  });
});

describe('reemplazar y restricciones', () => {
  const nueva: RestriccionPersona = {
    id: 'restr-nueva', tipo: 'maxDiasSemana', params: { max: 4 }, dura: true, peso: 0, activa: true, nota: '',
  };
  it('reemplazarPersona cambia por id sin mover el orden', () => {
    const e = congelar(crearEstadoEjemplo());
    const e2 = reemplazarPersona(e, { ...e.personas[4]!, equipo: 'A' });
    expect(e2.personas[4]!.equipo).toBe('A');
    expect(e2.personas.map((p) => p.id)).toEqual(e.personas.map((p) => p.id));
  });
  it('anadir, reemplazar y borrar restricción', () => {
    const e = congelar(crearEstadoEjemplo());
    const e2 = anadirRestriccion(e, 'per-01', nueva);
    expect(e2.personas[0]!.restricciones.map((r) => r.id)).toEqual(['restr-nueva']);
    const e3 = reemplazarRestriccion(e2, 'per-01', { ...nueva, params: { max: 3 } });
    expect(e3.personas[0]!.restricciones[0]!.params).toEqual({ max: 3 });
    const e4 = borrarRestriccion(e3, 'per-01', 'restr-nueva');
    expect(e4.personas[0]!.restricciones).toEqual([]);
    expect(e.personas[0]!.restricciones).toEqual([]);
  });
});
