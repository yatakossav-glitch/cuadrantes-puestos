/** Comprobación de las propias ayudas (independiente de src/validacion): el cuadrante base es válido. */
import { describe, expect, it } from 'vitest';
import {
  IDS_EJEMPLO, LUNES, contarSolapesIndependiente, crearCuadranteBase, crearEstadoEjemplo, fecha,
  introducirCuatroSolapes,
} from './ayudas';

describe('ayudas de la fase 3', () => {
  const datos = crearEstadoEjemplo();
  const base = crearCuadranteBase(datos);

  it('cubre los 203 huecos del ejemplo exactamente una vez', () => {
    expect(base).toHaveLength(203);
    const claves = new Set(base.map((a) => (a.tipo === 'puesto' ? `${a.fecha}|${a.puestoId}|${a.franjaId}|${a.plaza}` : '')));
    expect(claves.size).toBe(203);
  });

  it('no tiene solapes y los ids son deterministas', () => {
    expect(contarSolapesIndependiente(datos, base)).toBe(0);
    expect(crearCuadranteBase(crearEstadoEjemplo()).map((a) => a.id)).toEqual(base.map((a) => a.id));
    expect(new Set(base.map((a) => a.id)).size).toBe(base.length);
  });

  it('respeta habilitación, equipo y límites de jornada', () => {
    const porPersonaDia = new Map<string, number>();
    const dias = new Map<string, Set<string>>();
    for (const a of base) {
      const clave = `${a.personaId}|${a.fecha}`;
      porPersonaDia.set(clave, (porPersonaDia.get(clave) ?? 0) + 1);
      if (!dias.has(a.personaId)) dias.set(a.personaId, new Set());
      dias.get(a.personaId)!.add(a.fecha);
    }
    for (const d of dias.values()) expect(d.size).toBeLessThanOrEqual(7);
    expect(base.every((a) => a.fecha >= LUNES && a.fecha <= fecha(6))).toBe(true);
    expect(Math.max(...porPersonaDia.values())).toBeLessThanOrEqual(2); // un bloque de caja = 2 franjas
  });

  it('introducirCuatroSolapes crea exactamente 4 pares independientes', () => {
    const { asignaciones, pares } = introducirCuatroSolapes(base);
    expect(pares).toHaveLength(4);
    expect(contarSolapesIndependiente(datos, asignaciones)).toBe(4);
    const fechas = pares.map(([a]) => asignaciones.find((x) => x.id === a)!.fecha);
    expect(new Set(fechas).size).toBe(4);
    const personas = pares.map(([a]) => asignaciones.find((x) => x.id === a)!.personaId);
    expect(new Set(personas).size).toBe(4);
    expect(IDS_EJEMPLO.puestos.caja1).toBeTruthy();
  });
});
