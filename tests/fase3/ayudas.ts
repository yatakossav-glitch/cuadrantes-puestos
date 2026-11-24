/**
 * Ayudas de los tests de la fase 3 (solo datos ficticios EMP-xx).
 * Este archivo NO importa nada de src/validacion ni de src/reglas: es independiente de la
 * implementación que se prueba.
 */
import { crearEstadoEjemplo, IDS_EJEMPLO } from '../../src/datos-ejemplo/ejemplo';
import { aMinutos } from '../../src/modelo/horas';
import { sumarDias } from '../../src/modelo/fechas';
import { DIAS_SEMANA } from '../../src/modelo/tipos';
import type {
  Asignacion,
  AsignacionPausa,
  AsignacionPuesto,
  Bloque,
  DiaSemana,
  EstadoApp,
  Equipo,
  FechaISO,
  Franja,
  Id,
  Incidencia,
  ParamsReglaGeneral,
  ParamsRestriccion,
  Persona,
  Puesto,
  ReglaGeneral,
  RestriccionPersona,
  TipoReglaGeneral,
  TipoRestriccion,
} from '../../src/modelo/tipos';

export { IDS_EJEMPLO, crearEstadoEjemplo, aMinutos };

/** Lunes de la semana de todos los tests. */
export const LUNES: FechaISO = '2026-11-23';

/** Fecha del día `dia` (0 = lunes) de la semana de prueba. */
export function fecha(dia: DiaSemana): FechaISO {
  return sumarDias(LUNES, dia);
}

export const LUN = 0, MAR = 1, MIE = 2, JUE = 3, VIE = 4, SAB = 5, DOM = 6;

// ───────────────────────── Cuadrante base sobre el ejemplo ─────────────────────────

export function idAsignacion(f: FechaISO, puestoId: Id, franjaId: Id, plaza: number): Id {
  return `asig-${f}-${puestoId}-${franjaId}-${plaza}`;
}

/** Franja de un puesto (horario general; el ejemplo no tiene horarios por día). */
function franjaDe(datos: EstadoApp, puestoId: Id, franjaId: Id): Franja {
  const puesto = datos.puestos.find((p) => p.id === puestoId);
  const franja = puesto?.horario.general.franjas.find((f) => f.id === franjaId);
  if (!franja) throw new Error(`Franja inexistente: ${puestoId}/${franjaId}`);
  return franja;
}

/**
 * Cuadrante de la semana de LUNES que cubre TODOS los huecos del ejemplo sin ningún solape.
 * Cada unidad (bloque de caja, franja de LEGO, turno de Pedidos) la hace una persona distinta
 * ese día (21 personas por día), de modo que nadie coincide consigo mismo. Se respetan equipo
 * y habilitación (quien trabaja más de 6 días en la semana sale con 7: el pool de tarde es justo) y se evita a quien tiene restricciones, para que sea también un cuadrante
 * «limpio» frente a las demás reglas. Ids deterministas.
 */
export function crearCuadranteBase(datos: EstadoApp = crearEstadoEjemplo()): AsignacionPuesto[] {
  const resultado: AsignacionPuesto[] = [];
  const diasUsados = new Map<Id, number>();
  const corte = datos.config.corteMananaTarde;
  const areaDe = (puestoId: Id): Id => datos.puestos.find((p) => p.id === puestoId)!.areaId;

  const orden = [
    IDS_EJEMPLO.puestos.pedidos,
    IDS_EJEMPLO.puestos.caja1,
    IDS_EJEMPLO.puestos.caja2,
    IDS_EJEMPLO.puestos.lego,
  ];
  // Pedidos primero (más restrictivo), después caja, después LEGO.
  const puestos = orden.map((id) => datos.puestos.find((p) => p.id === id)!);

  for (const dia of DIAS_SEMANA) {
    const f = fecha(dia);
    const usadosHoy = new Set<Id>();

    for (const puesto of puestos) {
      const horario = puesto.horario.general;
      // Unidades: bloques completos y franjas sueltas, en orden horario.
      const enBloque = new Set(horario.bloques.flatMap((b) => b.franjaIds));
      const unidades: Franja[][] = [
        ...horario.bloques.map((b: Bloque) => b.franjaIds.map((id) => horario.franjas.find((x) => x.id === id)!)),
        ...horario.franjas.filter((x) => !enBloque.has(x.id)).map((x) => [x]),
      ].sort((a, b) => a[0]!.inicio - b[0]!.inicio);

      for (const unidad of unidades) {
        const turno: Equipo = unidad[0]!.inicio < corte ? 'M' : 'T';
        const candidatas = datos.personas
          .filter(
            (p) =>
              p.activa &&
              p.restricciones.length === 0 &&
              !usadosHoy.has(p.id) &&
              p.habilitaciones.includes(areaDe(puesto.id)) &&
              (p.equipo === 'A' || p.equipo === turno),
          )
          .sort(
            (a, b) =>
              (diasUsados.get(a.id) ?? 0) - (diasUsados.get(b.id) ?? 0) ||
              a.habilitaciones.length - b.habilitaciones.length ||
              a.codigo.localeCompare(b.codigo),
          );
        const elegida = candidatas[0];
        if (!elegida) throw new Error(`Sin candidata para ${puesto.id} ${f} ${unidad[0]!.id}`);
        usadosHoy.add(elegida.id);
        diasUsados.set(elegida.id, (diasUsados.get(elegida.id) ?? 0) + 1);
        for (const franja of unidad) {
          resultado.push({
            id: idAsignacion(f, puesto.id, franja.id, 0),
            tipo: 'puesto',
            fecha: f,
            puestoId: puesto.id,
            franjaId: franja.id,
            plaza: 0,
            personaId: elegida.id,
            bloqueada: false,
            origen: 'manual',
          });
        }
      }
    }
  }
  return resultado;
}

/** Asignación del cuadrante en ese hueco (lanza si no existe). */
export function buscar(asigs: readonly Asignacion[], f: FechaISO, puestoId: Id, franjaId: Id, plaza = 0): AsignacionPuesto {
  const a = asigs.find(
    (x): x is AsignacionPuesto => x.tipo === 'puesto' && x.fecha === f && x.puestoId === puestoId && x.franjaId === franjaId && x.plaza === plaza,
  );
  if (!a) throw new Error(`No hay asignación en ${f} ${puestoId} ${franjaId} plaza ${plaza}`);
  return a;
}

/** Copia del cuadrante con otra persona en la asignación `id`. */
export function conPersona(asigs: readonly Asignacion[], id: Id, personaId: Id): Asignacion[] {
  return asigs.map((a) => (a.id === id ? { ...a, personaId } : a));
}

/** Copia del cuadrante sin la asignación `id` (deja el hueco vacío). */
export function sinAsignacion(asigs: readonly Asignacion[], id: Id): Asignacion[] {
  return asigs.filter((a) => a.id !== id);
}

/** Introduce UN solape: la asignación B pasa a ser de la persona de la asignación A. */
export function introducirSolape(asigs: readonly Asignacion[], idA: Id, idB: Id): Asignacion[] {
  const a = asigs.find((x) => x.id === idA);
  if (!a) throw new Error(`No existe ${idA}`);
  return conPersona(asigs, idB, a.personaId);
}

export interface SolapesIntroducidos {
  asignaciones: Asignacion[];
  /** Pares [idA, idB] de asignaciones que ahora se solapan. */
  pares: [Id, Id][];
}

/**
 * Introduce exactamente 4 solapes independientes (días y personas distintos):
 *  1. lunes: LEGO 10:00–10:58 con Caja 1 10:00–11:30.
 *  2. martes: Pedidos (mañana) con LEGO 11:55–12:53.
 *  3. jueves: Caja 1 y Caja 2 a la vez en 13:00–14:30.
 *  4. domingo: Pedidos (tarde) con LEGO 17:00–18:15.
 */
export function introducirCuatroSolapes(base: readonly Asignacion[]): SolapesIntroducidos {
  const { pedidos, caja1, caja2, lego } = IDS_EJEMPLO.puestos;
  const pares: [Id, Id][] = [
    [buscar(base, fecha(LUN), lego, 'franja-lego-1').id, buscar(base, fecha(LUN), caja1, 'franja-caja-1').id],
    [buscar(base, fecha(MAR), pedidos, 'franja-pedidos-m').id, buscar(base, fecha(MAR), lego, 'franja-lego-3').id],
    [buscar(base, fecha(JUE), caja1, 'franja-caja-3').id, buscar(base, fecha(JUE), caja2, 'franja-caja-3').id],
    [buscar(base, fecha(DOM), pedidos, 'franja-pedidos-t').id, buscar(base, fecha(DOM), lego, 'franja-lego-8').id],
  ];
  let asignaciones: Asignacion[] = [...base];
  for (const [a, b] of pares) asignaciones = introducirSolape(asignaciones, a, b);
  return { asignaciones, pares };
}

/** Cuenta pares solapados con una implementación propia e independiente (para validar las ayudas). */
export function contarSolapesIndependiente(datos: EstadoApp, asigs: readonly Asignacion[]): number {
  const intervalo = (a: Asignacion): { inicio: number; fin: number } =>
    a.tipo === 'pausa' ? { inicio: a.inicio, fin: a.fin } : franjaDe(datos, a.puestoId, a.franjaId);
  let n = 0;
  for (let i = 0; i < asigs.length; i++) {
    for (let j = i + 1; j < asigs.length; j++) {
      const a = asigs[i]!, b = asigs[j]!;
      if (a.personaId !== b.personaId || a.fecha !== b.fecha) continue;
      const x = intervalo(a), y = intervalo(b);
      if (x.inicio < y.fin && y.inicio < x.fin) n++;
    }
  }
  return n;
}

// ───────────────────────── Estados mínimos para aislar una regla ─────────────────────────

/** Franjas contiguas a partir de horas «HH:MM» (n+1 horas → n franjas con ids `<prefijo>1`…). */
export function franjasSeguidas(prefijo: string, horas: string[]): Franja[] {
  const m = horas.map(aMinutos);
  return m.slice(0, -1).map((inicio, i) => ({ id: `${prefijo}${i + 1}`, inicio, fin: m[i + 1]! }));
}

/** Franja suelta con ids y horas explícitos. */
export function franja(id: Id, ini: string, fin: string): Franja {
  return { id, inicio: aMinutos(ini), fin: aMinutos(fin) };
}

export interface OpcionesPuestoMini {
  nombre?: string;
  plazas?: number;
  bloques?: Bloque[];
  requiereHabilitacion?: boolean;
  activo?: boolean;
  dias?: DiaSemana[];
  orden?: number;
  vigenteDesde?: FechaISO | null;
  vigenteHasta?: FechaISO | null;
}

export function puestoMini(id: Id, areaId: Id, franjas: Franja[], op: OpcionesPuestoMini = {}): Puesto {
  return {
    id,
    areaId,
    nombre: op.nombre ?? `Puesto ${id}`,
    plazas: op.plazas ?? 1,
    dias: op.dias ?? [0, 1, 2, 3, 4, 5, 6],
    horario: { general: { franjas, bloques: op.bloques ?? [] }, porDia: {} },
    requiereHabilitacion: op.requiereHabilitacion ?? false,
    activo: op.activo ?? true,
    vigenteDesde: op.vigenteDesde ?? null,
    vigenteHasta: op.vigenteHasta ?? null,
    orden: op.orden ?? 1,
  };
}

export function bloque(id: Id, franjaIds: Id[]): Bloque {
  return { id, nombre: id, franjaIds };
}

/** Id de la persona EMP-NN en los estados mínimos. */
export function P(n: number): Id {
  return `per-${String(n).padStart(2, '0')}`;
}

export function personaMini(n: number, op: Partial<Persona> = {}): Persona {
  const num = String(n).padStart(2, '0');
  return {
    id: `per-${num}`,
    codigo: `EMP-${num}`,
    alias: null,
    equipo: 'A',
    habilitaciones: ['a1', 'a2'],
    activa: true,
    alta: null,
    baja: null,
    contratoMinSemana: null,
    objetivoCoberturaMinSemana: null,
    restricciones: [],
    patron: [],
    ...op,
  };
}

/** Puesto por defecto de los estados mínimos: «p1» del área a1 con seis franjas de 1 h de 10:00 a 16:00 (f1…f6). */
export function puestoP1(op: OpcionesPuestoMini = {}): Puesto {
  return puestoMini('p1', 'a1', franjasSeguidas('f', ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']), op);
}

export interface OpcionesDatosMini {
  puestos?: Puesto[];
  personas?: Persona[];
  reglas?: ReglaGeneral[];
  incidencias?: Incidencia[];
}

/** Estado mínimo: áreas a1 y a2 (planta 3), por defecto un puesto p1 y personas EMP-01…EMP-06 (equipo A, habilitadas en a1 y a2), sin reglas. */
export function datosMini(op: OpcionesDatosMini = {}): EstadoApp {
  const base = crearEstadoEjemplo();
  return {
    ...base,
    areas: [
      { id: 'a1', nombre: 'Área uno', planta: 3, color: '#2f6fb0', icono: 'caja', activa: true, orden: 1 },
      { id: 'a2', nombre: 'Área dos', planta: 3, color: '#2e8b57', icono: 'bloques', activa: true, orden: 2 },
    ],
    puestos: op.puestos ?? [puestoP1()],
    personas: op.personas ?? [1, 2, 3, 4, 5, 6].map((n) => personaMini(n)),
    reglas: op.reglas ?? [],
    incidencias: op.incidencias ?? [],
    semanasTipo: [],
    cuadrantes: {},
  };
}

export function asig(dia: DiaSemana, puestoId: Id, franjaId: Id, personaId: Id, plaza = 0, extra: Partial<AsignacionPuesto> = {}): AsignacionPuesto {
  const f = fecha(dia);
  return {
    id: idAsignacion(f, puestoId, franjaId, plaza) + `-${personaId}`,
    tipo: 'puesto',
    fecha: f,
    puestoId,
    franjaId,
    plaza,
    personaId,
    bloqueada: false,
    origen: 'manual',
    ...extra,
  };
}

export function pausa(dia: DiaSemana, personaId: Id, ini: string, fin: string, extra: Partial<AsignacionPausa> = {}): AsignacionPausa {
  const f = fecha(dia);
  return {
    id: `pausa-${f}-${personaId}-${ini}`,
    tipo: 'pausa',
    fecha: f,
    personaId,
    inicio: aMinutos(ini),
    fin: aMinutos(fin),
    bloqueada: false,
    origen: 'manual',
    ...extra,
  };
}

interface OpcionesRegla {
  dura?: boolean;
  peso?: number;
  activa?: boolean;
  estado?: ReglaGeneral['estado'];
  id?: Id;
}

export function reglaDe<T extends TipoReglaGeneral>(tipo: T, params: ParamsReglaGeneral[T], op: OpcionesRegla = {}): ReglaGeneral {
  const dura = op.dura ?? true;
  return {
    id: op.id ?? `regla-${tipo}`,
    tipo,
    params,
    dura,
    peso: dura ? 0 : op.peso ?? 5,
    activa: op.activa ?? true,
    estado: op.estado ?? 'validada',
    nombre: tipo,
    nota: '',
  } as unknown as ReglaGeneral;
}

export function restriccionDe<T extends TipoRestriccion>(tipo: T, params: ParamsRestriccion[T], op: OpcionesRegla = {}): RestriccionPersona {
  const dura = op.dura ?? true;
  return {
    id: op.id ?? `restr-${tipo}`,
    tipo,
    params,
    dura,
    peso: dura ? 0 : op.peso ?? 5,
    activa: op.activa ?? true,
    nota: '',
  } as unknown as RestriccionPersona;
}

/** Estado mínimo con las reglas dadas. */
export function conReglas(datos: EstadoApp, ...reglas: ReglaGeneral[]): EstadoApp {
  return { ...datos, reglas };
}

/** Estado mínimo con la restricción puesta a la persona `n` y sin reglas generales. */
export function conRestriccion(datos: EstadoApp, n: number, r: RestriccionPersona): EstadoApp {
  return {
    ...datos,
    reglas: [],
    personas: datos.personas.map((p) => (p.id === P(n) ? { ...p, restricciones: [r] } : p)),
  };
}
