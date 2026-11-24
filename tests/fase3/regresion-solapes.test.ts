/** Test de regresión del §8: con 4 solapes introducidos, el validador detecta exactamente esos 4. */
import { describe, expect, it } from 'vitest';
import { crearCuadranteBase, crearEstadoEjemplo, introducirCuatroSolapes, introducirSolape, buscar, fecha, IDS_EJEMPLO, JUE } from './ayudas';
import { deTipo, validar } from './ayudas-validar';

describe('regresión de solapes (§8)', () => {
  const datos = crearEstadoEjemplo();
  const base = crearCuadranteBase(datos);

  it('sin solapes introducidos hay 0 incumplimientos de sinSolapes', () => {
    const r = validar(datos, base);
    expect(deTipo(r, 'sinSolapes')).toHaveLength(0);
  });

  it('el cuadrante base cubre todo: sin huecos ni personas no disponibles', () => {
    const r = validar(datos, base);
    expect(deTipo(r, 'coberturaCompleta')).toHaveLength(0);
    expect(deTipo(r, 'personaDisponible')).toHaveLength(0);
    expect(deTipo(r, 'habilitacionRequerida')).toHaveLength(0);
  });

  it('con 4 solapes introducidos detecta exactamente 4, y señalan las asignaciones correctas', () => {
    const { asignaciones, pares } = introducirCuatroSolapes(base);
    const solapes = deTipo(validar(datos, asignaciones), 'sinSolapes');
    expect(solapes).toHaveLength(4);

    const esperados = pares.map((p) => [...p].sort().join('+')).sort();
    const obtenidos = solapes.map((s) => [...s.asignacionIds].sort().join('+')).sort();
    expect(obtenidos).toEqual(esperados);

    for (const s of solapes) {
      expect(s.marca).toBe('solape');
      expect(s.dura).toBe(true);
      expect(s.origen).toBe('general');
      expect(s.personaId).not.toBeNull();
      expect(s.mensaje).toMatch(/EMP-\d\d/);
    }
  });

  it('cada solape cae en el día y la persona esperados', () => {
    const { asignaciones, pares } = introducirCuatroSolapes(base);
    const solapes = deTipo(validar(datos, asignaciones), 'sinSolapes');
    for (const [idA, idB] of pares) {
      const a = asignaciones.find((x) => x.id === idA)!;
      const s = solapes.find((x) => x.asignacionIds.includes(idA) && x.asignacionIds.includes(idB));
      expect(s).toBeDefined();
      expect(s!.fecha).toBe(a.fecha);
      expect(s!.personaId).toBe(a.personaId);
    }
    const dias = new Set(solapes.map((s) => s.fecha));
    expect(dias.size).toBe(4);
  });

  it('un único solape introducido se detecta como 1 (Caja 1 y Caja 2 a la vez)', () => {
    const a = buscar(base, fecha(JUE), IDS_EJEMPLO.puestos.caja1, 'franja-caja-3');
    const b = buscar(base, fecha(JUE), IDS_EJEMPLO.puestos.caja2, 'franja-caja-3');
    const solapes = deTipo(validar(datos, introducirSolape(base, a.id, b.id)), 'sinSolapes');
    expect(solapes).toHaveLength(1);
    expect(solapes[0]!.asignacionIds.sort()).toEqual([a.id, b.id].sort());
  });

  it('los solapes ponen el semáforo en rojo y el cuadrante limpio no tiene incumplimientos duros de solape', () => {
    const { asignaciones } = introducirCuatroSolapes(base);
    expect(validar(datos, asignaciones).semaforo).toBe('rojo');
  });
});
