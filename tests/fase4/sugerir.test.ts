/** Sugerencias manuales (ARQUITECTURA §5.7, spec §4). */
import { describe, expect, it } from 'vitest';
import { motor } from '../../src/motor/motor';
import { crearIndice } from '../../src/validacion/indice';
import type { Asignacion } from '../../src/modelo/tipos';
import {
  IDS_EJEMPLO,
  JUE,
  LUNES,
  P,
  buscar,
  crearCuadranteBase,
  crearEstadoEjemplo,
  datosEjemplo,
  duras,
  fecha,
  resumir,
} from './ayudas';

const { caja1, caja2, lego } = IDS_EJEMPLO.puestos;

describe('sugerir', () => {
  const datos = crearEstadoEjemplo();
  const base = crearCuadranteBase(datos);
  // Dejamos vacío el bloque de tarde de Caja 1 del jueves (franjas 5 y 6, 15:45–19:00).
  const actuales: Asignacion[] = base.filter(
    (a) => !(a.fecha === fecha(JUE) && a.puestoId === caja1 && (a.franjaId === 'franja-caja-5' || a.franjaId === 'franja-caja-6')),
  );
  const hueco = crearIndice(datos, LUNES, actuales)
    .huecos()
    .find((h) => h.fecha === fecha(JUE) && h.puestoId === caja1 && h.franjaId === 'franja-caja-5')!;
  const candidatos = motor.sugerir(datos, LUNES, actuales, hueco);

  it('el hueco de prueba existe y está vacío', () => {
    expect(hueco).toBeDefined();
    expect(hueco.bloqueId).toBe('bloque-caja-t1');
  });

  it('devuelve a todas las personas activas, una sola vez cada una', () => {
    const activas = datos.personas.filter((p) => p.activa).map((p) => p.id).sort();
    expect(candidatos.map((c) => c.personaId).sort()).toEqual(activas);
  });

  it('no incluye a las personas inactivas', () => {
    const d = datosEjemplo((x) => {
      x.personas.find((p) => p.id === P(29))!.activa = false;
    });
    const r = motor.sugerir(d, LUNES, actuales, hueco);
    expect(r.map((c) => c.personaId)).not.toContain(P(29));
    expect(r).toHaveLength(28);
  });

  it('primero las permitidas, ordenadas por coste ascendente; después las no permitidas', () => {
    const permitidas = candidatos.filter((c) => c.permitido);
    const n = permitidas.length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(candidatos.length);
    expect(candidatos.slice(0, n).every((c) => c.permitido)).toBe(true);
    expect(candidatos.slice(n).every((c) => !c.permitido)).toBe(true);
    for (let i = 1; i < n; i++) expect(candidatos[i]!.coste).toBeGreaterThanOrEqual(candidatos[i - 1]!.coste);
    for (const c of candidatos) expect(c.coste).toBeGreaterThanOrEqual(0);
  });

  it('las no permitidas llevan motivos legibles', () => {
    for (const c of candidatos.filter((x) => !x.permitido)) {
      expect(c.motivos.length, `${c.personaId} sin motivo`).toBeGreaterThan(0);
      for (const m of c.motivos) expect(m.trim().length).toBeGreaterThan(5);
    }
  });

  it('quien no tiene habilitación para Caja (EMP-22 a EMP-24, solo Pedidos) no es permitido, con motivo', () => {
    for (const n of [22, 23, 24]) {
      const c = candidatos.find((x) => x.personaId === P(n))!;
      expect(c.permitido).toBe(false);
      expect(c.motivos.join(' ')).toMatch(/habilitad|habilitaci/i);
    }
  });

  it('quien ya está ocupada a esa hora no es permitida y el motivo habla del solape o del puesto ocupado', () => {
    // El jueves, la persona de Caja 2 en 15:45–19:00 está en el mismo tramo.
    const ocupada = buscar(base, fecha(JUE), caja2, 'franja-caja-5').personaId;
    const c = candidatos.find((x) => x.personaId === ocupada)!;
    expect(c.permitido).toBe(false);
    expect(c.motivos.length).toBeGreaterThan(0);
  });

  it('se tiene en cuenta el bloque entero: quien está ocupada solo en la segunda franja del bloque tampoco es permitida', () => {
    // LEGO 18:15–19:30 solapa con la franja 6 de Caja (17:20–19:00) pero no con la 5 (15:45–17:20).
    const enLego = buscar(base, fecha(JUE), lego, 'franja-lego-9').personaId;
    const c = candidatos.find((x) => x.personaId === enLego)!;
    expect(c.permitido).toBe(false);
  });

  it('coherencia con el validador: permitida = poner a esa persona en el bloque no crea incumplimientos duros', () => {
    const franjas = ['franja-caja-5', 'franja-caja-6'];
    for (const c of candidatos) {
      const nuevas: Asignacion[] = franjas.map((f) => ({
        id: `sug-${c.personaId}-${f}`,
        tipo: 'puesto',
        fecha: fecha(JUE),
        puestoId: caja1,
        franjaId: f,
        plaza: 0,
        personaId: c.personaId,
        bloqueada: false,
        origen: 'manual',
      }));
      const antes = duras(datos, actuales).filter((i) => i.tipo !== 'coberturaCompleta');
      const despues = duras(datos, [...actuales, ...nuevas]).filter((i) => i.tipo !== 'coberturaCompleta');
      const nuevosDuros = despues.filter((i) => i.asignacionIds.some((id) => id.startsWith('sug-')));
      if (c.permitido) {
        expect(nuevosDuros, `${c.personaId} permitida pero: ${resumir(nuevosDuros)}`).toHaveLength(0);
      } else {
        expect(nuevosDuros.length + (despues.length - antes.length), `${c.personaId} no permitida sin dura real`).toBeGreaterThan(0);
      }
    }
  });
});
