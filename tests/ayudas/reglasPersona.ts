/** Ayudas para los tests de las restricciones personales (no forma parte de la app). */
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../../src/datos-ejemplo/ejemplo';
import type { Asignacion, AsignacionPausa, AsignacionPuesto, ParamsRestriccion, RestriccionPersona, TipoRestriccion } from '../../src/modelo/tipos';
import { crearIndice } from '../../src/validacion/indice';
import type { ContextoEvaluacion } from '../../src/reglas/contrato';

export const LUNES = '2026-11-23';
export const JUEVES = '2026-11-26';
export const VIERNES = '2026-11-27';
export const SABADO = '2026-11-28';
export const CAJA1 = IDS_EJEMPLO.puestos.caja1;
export const CAJA2 = IDS_EJEMPLO.puestos.caja2;
export const PEDIDOS = IDS_EJEMPLO.puestos.pedidos;
export const AREA_CAJA = IDS_EJEMPLO.areas.caja;
/** Franjas de Caja: 1 10:00–11:30, 2 –13:00, 3 –14:30, 4 –15:45, 5 –17:20, 6 –19:00, 7 –20:40, 8 –22:00. */
export const franjaCaja = (n: number): string => `franja-caja-${n}`;

export function puesto(id: string, fecha: string, puestoId: string, franjaId: string, personaId: string, plaza = 0): AsignacionPuesto {
  return { id, tipo: 'puesto', fecha, puestoId, franjaId, plaza, personaId, bloqueada: false, origen: 'manual' };
}
export function pausa(id: string, fecha: string, personaId: string, inicio: number, fin: number): AsignacionPausa {
  return { id, tipo: 'pausa', fecha, personaId, inicio, fin, bloqueada: false, origen: 'manual' };
}

export function contexto(asignaciones: Asignacion[] = []): ContextoEvaluacion {
  const datos = crearEstadoEjemplo();
  return { datos, indice: crearIndice(datos, LUNES, asignaciones) };
}

export function restriccion<T extends TipoRestriccion>(
  tipo: T,
  params: ParamsRestriccion[T],
  dura = true,
  peso = 3,
): RestriccionPersona<T> {
  return { id: `restr-${tipo}`, tipo, params, dura, peso, activa: true, nota: '' } as RestriccionPersona<T>;
}

export function persona(ctx: ContextoEvaluacion, id: string) {
  const p = ctx.indice.persona(id);
  if (!p) throw new Error(`Falta ${id}`);
  return p;
}

// ───────────────────────── Coherencia de `comprobar` con `evaluar` (K3) ─────────────────────────

import { expect } from 'vitest';
import type { DefinicionRestriccion, Incumplimiento } from '../../src/reglas/contrato';

/** Generador determinista (mulberry32). */
function azar(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` asignaciones deterministas (puestos en huecos al azar y alguna pausa) de las personas dadas. */
export function asignacionesAleatorias(n: number, semilla: number, personas: string[], prefijo: string): Asignacion[] {
  const rnd = azar(semilla);
  const indice = contexto().indice;
  const huecos = indice.huecos();
  const res: Asignacion[] = [];
  for (let k = 0; k < n; k += 1) {
    const personaId = personas[Math.floor(rnd() * personas.length)] ?? 'per-05';
    if (rnd() < 0.12) {
      const fecha = indice.fechas[Math.floor(rnd() * 7)] ?? LUNES;
      const inicio = 600 + 15 * Math.floor(rnd() * 40);
      res.push(pausa(`${prefijo}${k}`, fecha, personaId, inicio, inicio + 15 * (1 + Math.floor(rnd() * 4))));
      continue;
    }
    const h = huecos[Math.floor(rnd() * huecos.length)];
    if (h) res.push(puesto(`${prefijo}${k}`, h.fecha, h.puestoId, h.franjaId, personaId, h.plaza));
  }
  return res;
}

const suma = (l: Incumplimiento[]): number => l.reduce((s, i) => s + i.penalizacion, 0);

export interface OpcionesCoherencia<T extends TipoRestriccion> {
  definicion: DefinicionRestriccion<T>;
  params: ParamsRestriccion[T];
  /** Incumplimientos duros que bloquean (por defecto todos; el mínimo de horas y la pausa no bloquean). */
  bloquea?: (i: Incumplimiento) => boolean;
  /** Si la restricción nunca bloquea (pausaMinima). */
  nuncaBloquea?: boolean;
}

/**
 * Compara `comprobar` con el oráculo (evaluar antes y después de añadir la candidata)
 * en varios estados y al menos 40 candidatas, como dura y como blanda (peso 3).
 */
export function verificarCoherencia<T extends TipoRestriccion>(op: OpcionesCoherencia<T>): void {
  let comprobadas = 0;
  let bloqueadas = 0;
  let conCoste = 0;
  for (const dura of [true, false]) {
    const r = restriccion(op.definicion.tipo, op.params, dura, 3);
    for (let estado = 0; estado < 6; estado += 1) {
      const base = asignacionesAleatorias(6 + estado * 3, 100 + estado, ['per-05', 'per-05', 'per-05', 'per-06'], 'b');
      const ctx = contexto(base);
      const p = persona(ctx, 'per-05');
      const antes = op.definicion.evaluar(r, p, ctx);
      const candidatas = asignacionesAleatorias(8, 900 + estado, ['per-05', 'per-05', 'per-05', 'per-06'], 'c');
      for (const c of candidatas) {
        const despues = op.definicion.evaluar(r, p, { datos: ctx.datos, indice: crearIndice(ctx.datos, LUNES, [...base, c]) });
        const real = op.definicion.comprobar(r, p, ctx, c);
        const bloquea = op.nuncaBloquea
          ? false
          : c.personaId === p.id && despues.some((i) => i.dura && (op.bloquea?.(i) ?? true) && i.asignacionIds.includes(c.id));
        const coste = c.personaId === p.id ? Math.max(0, suma(despues) - suma(antes)) : 0;
        expect(real.permitido, `permitido de ${c.id}`).toBe(!bloquea);
        expect(real.coste, `coste de ${c.id}`).toBe(coste);
        comprobadas += 1;
        if (bloquea) bloqueadas += 1;
        if (coste > 0) conCoste += 1;
      }
    }
  }
  expect(comprobadas).toBeGreaterThanOrEqual(60);
  // El generador debe ejercitar de verdad la regla; si no, el test no prueba nada.
  expect(bloqueadas + conCoste).toBeGreaterThan(0);
}

/** 2000 comprobaciones con ~150 asignaciones en menos de 1 s. */
export function verificarVelocidad<T extends TipoRestriccion>(definicion: DefinicionRestriccion<T>, params: ParamsRestriccion[T]): void {
  const base = asignacionesAleatorias(150, 7, ['per-05', 'per-06', 'per-07', 'per-08', 'per-05'], 'v');
  const ctx = contexto(base);
  const p = persona(ctx, 'per-05');
  const r = restriccion(definicion.tipo, params, false, 3);
  const candidatas = asignacionesAleatorias(2000, 8, ['per-05'], 'w');
  const t0 = performance.now();
  for (const c of candidatas) definicion.comprobar(r, p, ctx, c);
  expect(performance.now() - t0).toBeLessThan(1000);
}
