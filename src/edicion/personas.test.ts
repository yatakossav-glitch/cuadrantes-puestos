import { describe, expect, it } from 'vitest';
import { crearEstadoEjemplo } from '../datos-ejemplo/ejemplo';
import { crearGeneradorIds } from '../modelo/ids';
import type { RestriccionPersona } from '../modelo/tipos';
import { estadoConAsignaciones } from '../../tests/ayudas/datosPrueba';
import {
  anadirPersona, anadirRestriccion, borrarPersona, borrarRestriccion, crearPersona, duplicarPersona,
  erroresPersona, impactoBorrarPersona, reemplazarPersona, reemplazarRestriccion, siguienteCodigo,
} from './personas';

describe('personas', () => {
  it('siguienteCodigo y crearPersona', () => {
    const e = crearEstadoEjemplo();
    expect(siguienteCodigo(e)).toBe('EMP-30');
    expect(siguienteCodigo({ ...e, personas: [] })).toBe('EMP-01');
    const p = crearPersona(e, crearGeneradorIds('per'));
    expect(p).toMatchObject({ id: 'per-1', codigo: 'EMP-30', equipo: 'M', activa: true, alias: null, habilitaciones: [], restricciones: [] });
  });
  it('añade y reemplaza sin mutar', () => {
    const e = crearEstadoEjemplo();
    const copia = structuredClone(e);
    const p = crearPersona(e, crearGeneradorIds('per'));
    const n = anadirPersona(e, p);
    expect(n.personas.at(-1)).toBe(p);
    expect(reemplazarPersona(n, { ...p, equipo: 'T' }).personas.at(-1)!.equipo).toBe('T');
    expect(e).toEqual(copia);
  });
  it('duplica con código nuevo, sin alias y restricciones con ids nuevos, justo detrás', () => {
    const e = crearEstadoEjemplo();
    e.personas[2]!.alias = 'Alias';
    const copia = structuredClone(e);
    const n = duplicarPersona(e, 'per-03', crearGeneradorIds('nuevo'));
    const d = n.personas[3]!;
    expect(d).toMatchObject({ id: 'nuevo-1', codigo: 'EMP-30', alias: null });
    expect(d.restricciones[0]).toMatchObject({ id: expect.stringMatching(/^restr-/), tipo: 'diasNoDisponibles' });
    expect(n.personas[2]!.restricciones[0]!.id).toBe('restr-no-viernes');
    expect(n.personas).toHaveLength(30);
    expect(e).toEqual(copia);
  });
  it('las restricciones duplicadas usan el prefijo restr', () => {
    const e = crearEstadoEjemplo();
    const d = duplicarPersona(e, 'per-03', crearGeneradorIds('nuevo')).personas[3]!;
    expect(d.id).toBe('nuevo-1');
    expect(d.restricciones[0]!.id).toMatch(/^restr-/);
    expect(d.restricciones[0]!.id).not.toBe(e.personas[2]!.restricciones[0]!.id);
  });
  it('erroresPersona', () => {
    const e = crearEstadoEjemplo();
    const base = e.personas[6]!;
    expect(erroresPersona(e, base)).toEqual([]);
    expect(erroresPersona(e, { ...base, codigo: ' ' })).toEqual(['Falta el código de la persona']);
    expect(erroresPersona(e, { ...base, codigo: 'EMP-7' })).toEqual([]); // es ella misma
    expect(erroresPersona(e, { ...base, id: 'otra', codigo: 'EMP-7' })).toEqual(['El código EMP-7 coincide con EMP-07']);
    expect(erroresPersona(e, { ...base, id: 'otra' })).toEqual(['El código EMP-07 ya lo tiene otra persona']);
    expect(erroresPersona(e, { ...base, alta: '2026-02-30' })[0]).toMatch(/EMP-07: la fecha de alta no es válida/);
    expect(erroresPersona(e, { ...base, alta: '2026-05-01', baja: '2026-04-01' })[0]).toMatch(/alta no es anterior a la de baja/);
    expect(erroresPersona(e, { ...base, alta: '2026-04-01', baja: '2026-04-01' })).toHaveLength(1);
    expect(erroresPersona(e, { ...base, habilitaciones: ['area-fantasma'] })[0]).toMatch(/ya no existe/);
    expect(erroresPersona(e, { ...base, contratoMinSemana: -1, objetivoCoberturaMinSemana: 7 * 24 * 60 + 1 })).toHaveLength(2);
    expect(erroresPersona(e, { ...base, alias: 'x'.repeat(41) })[0]).toMatch(/40 caracteres/);
  });
  it('impacto y borrado en cascada', () => {
    const e = estadoConAsignaciones();
    const copia = structuredClone(e);
    const imp = impactoBorrarPersona(e, 'per-01');
    expect(imp.bloqueos).toEqual([]);
    expect(imp.efectos).toEqual([
      'Se quitarán 4 asignaciones en 2 semanas',
      'Se quitará 1 asignación de 1 semana tipo',
      'Se quitará 1 incidencia',
    ]);
    const n = borrarPersona(e, 'per-01');
    expect(n.personas.find((p) => p.id === 'per-01')).toBeUndefined();
    expect(n.cuadrantes['2026-11-23']!.asignaciones.map((a) => a.id)).toEqual(['a2']);
    expect(n.cuadrantes['2026-11-30']!.asignaciones.map((a) => a.id)).toEqual(['a5']);
    expect(n.semanasTipo[0]!.asignaciones.map((a) => a.id)).toEqual(['t2']);
    expect(n.incidencias.map((i) => i.id)).toEqual(['i2', 'i3']);
    expect(e).toEqual(copia);
  });
  it('borrar una persona quita también sus turnos del horario y el impacto los cuenta', () => {
    const e = estadoConAsignaciones();
    e.horarios = {
      '2026-11-23': {
        lunes: '2026-11-23',
        actualizado: null,
        turnos: [
          { personaId: 'per-20', fecha: '2026-11-23', tramos: [{ inicio: 600, fin: 945 }] },
          { personaId: 'per-20', fecha: '2026-11-24', tramos: [] },
          { personaId: 'per-21', fecha: '2026-11-23', tramos: [] },
        ],
      },
      '2026-11-30': { lunes: '2026-11-30', actualizado: null, turnos: [{ personaId: 'per-20', fecha: '2026-11-30', tramos: [] }] },
    };
    expect(impactoBorrarPersona(e, 'per-20').efectos).toEqual(['Se quitarán 3 turnos del horario de la plantilla']);
    expect(impactoBorrarPersona(e, 'per-21').efectos).toEqual(['Se quitará 1 turno del horario de la plantilla']);
    const n = borrarPersona(e, 'per-20');
    expect(n.horarios['2026-11-23']!.turnos.map((t) => t.personaId)).toEqual(['per-21']);
    expect(n.horarios['2026-11-30']!.turnos).toEqual([]);
    expect(e.horarios['2026-11-23']!.turnos).toHaveLength(3);
  });
  it('impacto en singular', () => {
    const e = estadoConAsignaciones();
    expect(impactoBorrarPersona(e, 'per-03').efectos).toEqual(['Se quitará 1 asignación en 1 semana']);
    expect(impactoBorrarPersona(e, 'per-20').efectos).toEqual([]);
  });
  it('restricciones: añadir, reemplazar y borrar', () => {
    const e = crearEstadoEjemplo();
    const copia = structuredClone(e);
    const r: RestriccionPersona = { id: 'r-1', tipo: 'maxDiasSemana', params: { max: 4 }, dura: true, peso: 0, activa: true, nota: '' };
    const a = anadirRestriccion(e, 'per-01', r);
    expect(a.personas[0]!.restricciones).toEqual([r]);
    const b = reemplazarRestriccion(a, 'per-01', { ...r, params: { max: 5 } });
    expect(b.personas[0]!.restricciones[0]!.params).toEqual({ max: 5 });
    expect(borrarRestriccion(b, 'per-01', 'r-1').personas[0]!.restricciones).toEqual([]);
    expect(borrarRestriccion(e, 'per-03', 'restr-no-viernes').personas[2]!.restricciones).toEqual([]);
    expect(e).toEqual(copia);
  });
});
