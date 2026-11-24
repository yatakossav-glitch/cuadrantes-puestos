import { describe, expect, it } from 'vitest';
import { motor } from '../../src/motor/motor';
import { guardarSemanaTipo } from '../../src/edicion/rotacion';
import type { Asignacion, AsignacionPuesto, Incidencia } from '../../src/modelo/tipos';
import { LUNES, claveAsig, crearEstadoEjemplo, conCuadrante, contadorIds, fecha, duras, resumir, peticion, personasPorHueco } from './fase5-motor-ayudas';

describe('motor modo semanaTipo con una ausencia de un día', () => {
  const MIERCOLES = 2 as const;
  // Semana completa y limpia (sin incumplimientos duros) obtenida desde cero; sirve de semana tipo.
  const generada = motor.generar(peticion(crearEstadoEjemplo(), 'desdeCero')).asignaciones;
  const base: Asignacion[] = generada.map((a) => ({ ...a, origen: 'manual' as const }));
  const estadoBase = guardarSemanaTipo(conCuadrante(crearEstadoEjemplo(), LUNES, base), LUNES, 0, 'A', contadorIds());
  const ausente = base.find((a) => a.tipo === 'puesto' && a.fecha === fecha(MIERCOLES))!.personaId;
  const ausencia: Incidencia = { id: 'inc-1', tipo: 'ausencia', personaId: ausente, desde: fecha(MIERCOLES), hasta: fecha(MIERCOLES), tramo: null, nota: '' };
  const datos = { ...estadoBase, incidencias: [ausencia] };

  const r = motor.generar(peticion(datos, 'semanaTipo'));
  const antes = personasPorHueco(base);
  const despues = personasPorHueco(r.asignaciones);
  const puestos = (r.asignaciones.filter((a) => a.tipo === 'puesto') as AsignacionPuesto[]);

  it('la semana tipo de partida no tiene incumplimientos duros', () => {
    const d = duras(crearEstadoEjemplo(), base);
    expect(d.length, resumir(d)).toBe(0);
  });
  it('la persona ausente no aparece ese día', () => {
    expect(r.asignaciones.filter((a) => a.fecha === fecha(MIERCOLES) && a.personaId === ausente)).toEqual([]);
  });
  it('los huecos de la ausente ese día se vuelven a cubrir o se explican', () => {
    const suyos = (base.filter((a) => a.tipo === 'puesto' && a.fecha === fecha(MIERCOLES) && a.personaId === ausente) as AsignacionPuesto[]);
    expect(suyos.length).toBeGreaterThan(0);
    for (const a of suyos) {
      const k = claveAsig(a);
      const cubierto = despues.has(k) && despues.get(k) !== ausente;
      const explicado = r.sinCubrir.some((e) => `${e.hueco.fecha}|${e.hueco.puestoId}|${e.hueco.franjaId}|${e.hueco.plaza}` === k);
      expect(cubierto || explicado, k).toBe(true);
    }
  });
  it('el resto del cuadrante queda exactamente igual', () => {
    for (const [k, persona] of antes) {
      if (persona === ausente && k.startsWith(fecha(MIERCOLES))) continue;
      expect(despues.get(k), k).toBe(persona);
    }
  });
  it('no aparece ninguna asignación nueva fuera de los huecos de la ausente', () => {
    for (const a of puestos) {
      const k = claveAsig(a);
      if (!antes.has(k)) {
        expect(a.fecha).toBe(fecha(MIERCOLES));
      }
    }
  });
  it('determinista: misma entrada, mismo resultado', () => {
    const r2 = motor.generar(peticion(datos, 'semanaTipo'));
    expect(r2.asignaciones.map((a) => a.id + a.personaId)).toEqual(r.asignaciones.map((a) => a.id + a.personaId));
  });
  it('sin incidencias, la semana tipo se reproduce tal cual', () => {
    const limpio = motor.generar(peticion({ ...estadoBase, incidencias: [] }, 'semanaTipo'));
    const m = personasPorHueco(limpio.asignaciones);
    for (const [k, persona] of antes) expect(m.get(k), k).toBe(persona);
  });
});
