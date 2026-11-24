import { describe, expect, it } from 'vitest';
import { aMinutos } from '../modelo/horas';
import { crearEstadoEjemplo, crearEstadoVacio, IDS_EJEMPLO } from './ejemplo';

const horario = (puestoId: string) => {
  const p = crearEstadoEjemplo().puestos.find((x) => x.id === puestoId)!;
  return p.horario.general;
};
const perfil = (areas: string[]) =>
  crearEstadoEjemplo().personas.filter(
    (p) => p.habilitaciones.length === areas.length && areas.every((a) => p.habilitaciones.includes(a)),
  ).length;

describe('datos de ejemplo', () => {
  it('tiene 29 personas con códigos únicos EMP-01..29', () => {
    const { personas } = crearEstadoEjemplo();
    expect(personas).toHaveLength(29);
    const esperados = Array.from({ length: 29 }, (_, i) => `EMP-${String(i + 1).padStart(2, '0')}`);
    expect(personas.map((p) => p.codigo)).toEqual(esperados);
    expect(new Set(personas.map((p) => p.id)).size).toBe(29);
    expect(personas.every((p) => p.alias === null && p.activa)).toBe(true);
    expect(personas.filter((p) => p.equipo === 'A')).toHaveLength(2);
  });

  it('reparte los perfiles de habilitación', () => {
    const { pedidos, caja, lego } = IDS_EJEMPLO.areas;
    expect(perfil([pedidos, caja, lego])).toBe(6);
    expect(perfil([caja, lego])).toBe(10);
    expect(perfil([pedidos, caja])).toBe(3);
    expect(perfil([pedidos, lego])).toBe(2);
    expect(perfil([pedidos])).toBe(3);
    expect(perfil([lego])).toBe(5);
  });

  it('tiene tres restricciones de muestra con nota vacía', () => {
    const rs = crearEstadoEjemplo().personas.flatMap((p) => p.restricciones);
    expect(rs.map((r) => r.tipo).sort()).toEqual(['diasNoDisponibles', 'noDespuesDe', 'soloFinesDeSemana']);
    expect(rs.every((r) => r.nota === '')).toBe(true);
  });

  it('tiene 4 puestos activos en la planta 3', () => {
    const e = crearEstadoEjemplo();
    expect(e.puestos).toHaveLength(4);
    for (const p of e.puestos) {
      expect(p.activo).toBe(true);
      expect(e.areas.find((a) => a.id === p.areaId)!.planta).toBe(3);
      expect(p.dias).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(p.plazas).toBe(1);
    }
  });

  it('Librería está inactiva y sin puestos', () => {
    const e = crearEstadoEjemplo();
    const lib = e.areas.find((a) => a.id === IDS_EJEMPLO.areas.libreria)!;
    expect(lib.activa).toBe(false);
    expect(lib.planta).toBe(4);
    expect(e.puestos.some((p) => p.areaId === lib.id)).toBe(false);
  });

  it('Pedidos tiene dos franjas y ningún bloque', () => {
    const h = horario(IDS_EJEMPLO.puestos.pedidos);
    expect(h.franjas.map((f) => [f.inicio, f.fin])).toEqual([
      [aMinutos('10:00'), aMinutos('15:45')],
      [aMinutos('15:45'), aMinutos('22:00')],
    ]);
    expect(h.bloques).toEqual([]);
  });

  it('Caja 1 y Caja 2 tienen el horario exacto y franjas contiguas', () => {
    const esperado = ['10:00', '11:30', '13:00', '14:30', '15:45', '17:20', '19:00', '20:40', '22:00'].map(aMinutos);
    for (const id of [IDS_EJEMPLO.puestos.caja1, IDS_EJEMPLO.puestos.caja2]) {
      const { franjas } = horario(id);
      expect(franjas).toHaveLength(8);
      expect([franjas[0]!.inicio, ...franjas.map((f) => f.fin)]).toEqual(esperado);
      franjas.slice(1).forEach((f, i) => expect(f.inicio).toBe(franjas[i]!.fin));
    }
  });

  it('cada franja de Caja está en exactamente un bloque', () => {
    for (const id of [IDS_EJEMPLO.puestos.caja1, IDS_EJEMPLO.puestos.caja2]) {
      const { franjas, bloques } = horario(id);
      expect(bloques).toHaveLength(4);
      const todas = bloques.flatMap((b) => b.franjaIds);
      expect(todas).toHaveLength(8);
      for (const f of franjas) expect(todas.filter((x) => x === f.id)).toHaveLength(1);
      bloques.forEach((b) => expect(b.franjaIds).toHaveLength(2));
      const limites = bloques.map((b) => {
        const fs = franjas.filter((f) => b.franjaIds.includes(f.id));
        return [fs[0]!.inicio, fs[fs.length - 1]!.fin];
      });
      expect(limites).toEqual(
        [['10:00', '13:00'], ['13:00', '15:45'], ['15:45', '19:00'], ['19:00', '22:00']].map(([a, b]) => [aMinutos(a!), aMinutos(b!)]),
      );
    }
  });

  it('LEGO cubre de 10:00 a 22:00 sin huecos, con las 11 franjas exactas', () => {
    const { franjas, bloques } = horario(IDS_EJEMPLO.puestos.lego);
    const esperado = ['10:00', '10:58', '11:55', '12:53', '13:50', '14:48', '15:45', '17:00', '18:15', '19:30', '20:45', '22:00'].map(aMinutos);
    expect(franjas).toHaveLength(11);
    expect([franjas[0]!.inicio, ...franjas.map((f) => f.fin)]).toEqual(esperado);
    franjas.slice(1).forEach((f, i) => expect(f.inicio).toBe(franjas[i]!.fin));
    expect(franjas[0]!.inicio).toBe(aMinutos('10:00'));
    expect(franjas[10]!.fin).toBe(aMinutos('22:00'));
    expect(bloques).toEqual([]);
  });

  it('todas las reglas están pendientes, con nombre y nota vacía', () => {
    const { reglas } = crearEstadoEjemplo();
    expect(reglas).toHaveLength(15);
    expect(new Set(reglas.map((r) => r.id)).size).toBe(15);
    for (const r of reglas) {
      expect(r.estado).toBe('pendiente');
      expect(r.nombre.length).toBeGreaterThan(0);
      expect(r.nota).toBe('');
    }
  });

  it('descansoEntreJornadas está inactiva y las demás activas', () => {
    const { reglas } = crearEstadoEjemplo();
    const descanso = reglas.find((r) => r.tipo === 'descansoEntreJornadas')!;
    expect(descanso.activa).toBe(false);
    expect(reglas.filter((r) => r.tipo !== 'descansoEntreJornadas').every((r) => r.activa)).toBe(true);
  });

  it('config y rotación por defecto', () => {
    const e = crearEstadoEjemplo();
    expect(e.config).toEqual({ corteMananaTarde: 945, exportacionArea: 'diasEnColumnas', semilla: 1, limiteMotorMs: 3000 });
    expect(e.rotacion).toEqual({ longitudCiclo: 2, lunesReferencia: '2026-11-23', etiquetas: ['A', 'B'] });
    expect(e.semanasTipo).toEqual([]);
    expect(e.incidencias).toEqual([]);
    expect(e.cuadrantes).toEqual({});
  });

  it('crearEstadoVacio no tiene datos', () => {
    const v = crearEstadoVacio();
    expect(v.areas).toEqual([]);
    expect(v.puestos).toEqual([]);
    expect(v.personas).toEqual([]);
    expect(v.reglas).toEqual([]);
    expect(v.config.corteMananaTarde).toBe(945);
  });

  it('cada llamada devuelve una copia independiente', () => {
    const a = crearEstadoEjemplo();
    a.personas[0]!.codigo = 'X';
    a.puestos[1]!.horario.general.franjas[0]!.fin = 1;
    a.reglas[0]!.nombre = 'X';
    a.areas[0]!.nombre = 'X';
    a.config.semilla = 99;
    const b = crearEstadoEjemplo();
    expect(b).toEqual(crearEstadoEjemplo());
    expect(b.personas[0]!.codigo).toBe('EMP-01');
    expect(b.puestos[1]!.horario.general.franjas[0]!.fin).toBe(aMinutos('11:30'));
    expect(b.puestos[2]!.horario.general.franjas[0]!.fin).toBe(aMinutos('11:30'));
    expect(b.config.semilla).toBe(1);
  });

  it('Caja 1 y Caja 2 no comparten objetos', () => {
    const e = crearEstadoEjemplo();
    expect(e.puestos[1]!.horario.general.franjas).not.toBe(e.puestos[2]!.horario.general.franjas);
    expect(e.puestos[1]!.dias).not.toBe(e.puestos[2]!.dias);
  });
});
