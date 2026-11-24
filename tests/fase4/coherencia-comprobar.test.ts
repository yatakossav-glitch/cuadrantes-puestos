/**
 * Coherencia entre `comprobar` y `evaluar` (ARQUITECTURA §11 punto 1) para los 25 tipos.
 * Para cada tipo (activándolo solo a él, duro y luego blando con peso 3), sobre el cuadrante
 * completo de la fase 3 con defectos y 50 candidatas deterministas:
 *   permitido === !despues.some(i => i.dura && i.asignacionIds.includes(cand.id))
 *   coste     === max(0, penal(despues) − penal(antes))
 * Excepciones documentadas (no bloquean): coberturaCompleta (salvo candidata que no encaja),
 * mínimo de minutosSemana, pausaMinima, comidasEscalonadas criterio (a), repartoEquitativo.
 */
import { describe, expect, it } from 'vitest';
import { CATALOGO } from '../../src/reglas/catalogo';
import { crearIndice } from '../../src/validacion/indice';
import type { Comprobacion, ContextoEvaluacion, Incumplimiento } from '../../src/reglas/contrato';
import type {
  Asignacion,
  AsignacionPausa,
  AsignacionPuesto,
  EstadoApp,
  Persona,
  ReglaGeneral,
  RestriccionPersona,
  TipoReglaGeneral,
  TipoRestriccion,
} from '../../src/modelo/tipos';
import {
  DOM,
  IDS_EJEMPLO,
  JUE,
  LUNES,
  MIE,
  P,
  aMinutos,
  buscar,
  crearCuadranteBase,
  crearEstadoEjemplo,
  fecha,
  introducirCuatroSolapes,
  pausa,
  reglaDe,
  restriccionDe,
} from './ayudas';

const { pedidos, caja1, caja2, lego } = IDS_EJEMPLO.puestos;
const { caja: areaCaja, lego: areaLego } = IDS_EJEMPLO.areas;
const TODO = { areaIds: [], puestoIds: [] };

// ───────────────────────── Azar determinista propio ─────────────────────────

function azar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────── Estado con defectos ─────────────────────────

const datosBase: EstadoApp = (() => {
  const d = crearEstadoEjemplo();
  d.reglas = [];
  d.personas = d.personas.map((p) => ({ ...p, restricciones: [], objetivoCoberturaMinSemana: 600 }));
  d.personas.find((p) => p.id === P(29))!.activa = false;
  d.personas.find((p) => p.id === P(12))!.baja = fecha(JUE);
  d.incidencias = [
    { id: 'inc-1', tipo: 'ausencia', personaId: P(5), desde: fecha(MIE), hasta: fecha(MIE), tramo: null, nota: '' },
    { id: 'inc-2', tipo: 'ausencia', personaId: P(10), desde: fecha(JUE), hasta: fecha(JUE), tramo: { inicio: aMinutos('10:00'), fin: aMinutos('13:00') }, nota: '' },
  ];
  return d;
})();

/** Cuadrante completo de la fase 3 + defectos de todo tipo. */
function crearCuadranteConDefectos(): Asignacion[] {
  const base = crearCuadranteBase(crearEstadoEjemplo());
  let asigs: Asignacion[] = introducirCuatroSolapes(base).asignaciones;
  const rnd = azar(12345);
  const puestosAsig = asigs.filter((a): a is AsignacionPuesto => a.tipo === 'puesto');

  // 12 cambios de persona aleatorios (habilitación, equipo, bloques, descansos, ausencias…).
  for (let i = 0; i < 12; i++) {
    const objetivo = puestosAsig[Math.floor(rnd() * puestosAsig.length)]!;
    const persona = P(1 + Math.floor(rnd() * 29));
    asigs = asigs.map((a) => (a.id === objetivo.id ? { ...a, personaId: persona } : a));
  }
  // Mismo bloque roto a propósito: jueves, Caja 1, 10:00–13:00 (dos personas distintas).
  asigs = asigs.map((a) => (a.id === buscar(asigs, fecha(JUE), caja1, 'franja-caja-2').id ? { ...a, personaId: P(15) } : a));
  // Misma persona en LEGO en dos franjas consecutivas el viernes.
  const l1 = buscar(asigs, fecha(4), lego, 'franja-lego-3');
  asigs = asigs.map((a) => (a.id === buscar(asigs, fecha(4), lego, 'franja-lego-4').id ? { ...a, personaId: l1.personaId } : a));
  // Ausente (EMP-05) el miércoles trabajando.
  asigs = asigs.map((a) => (a.id === buscar(asigs, fecha(MIE), caja2, 'franja-caja-3').id ? { ...a, personaId: P(5) } : a));
  // Viernes: Caja 1 con la misma persona en los bloques 1 y 2 (para rotarEntreBloques).
  const c1 = buscar(asigs, fecha(4), caja1, 'franja-caja-1').personaId;
  const c2b1 = buscar(asigs, fecha(4), caja2, 'franja-caja-1').personaId;
  const fija = (puestoId: string, franjas: string[], personaId: string) => {
    asigs = asigs.map((a) =>
      a.tipo === 'puesto' && a.fecha === fecha(4) && a.puestoId === puestoId && franjas.includes(a.franjaId) ? { ...a, personaId } : a,
    );
  };
  fija(caja1, ['franja-caja-2', 'franja-caja-3', 'franja-caja-4'], c1);
  fija(caja2, ['franja-caja-2', 'franja-caja-3'], c2b1);
  // Viernes: bloque 2 de Caja 2 con la primera franja de la misma persona que el bloque 1 y la segunda
  // vacía (las candidatas dirigidas la completan repitiendo la pareja entera).
  asigs = asigs.filter((a) => !(a.tipo === 'puesto' && a.fecha === fecha(4) && a.puestoId === caja2 && a.franjaId === 'franja-caja-4'));
  // Cinco huecos vacíos.
  const vaciar = [
    buscar(asigs, fecha(0), caja1, 'franja-caja-8').id,
    buscar(asigs, fecha(1), lego, 'franja-lego-5').id,
    buscar(asigs, fecha(2), pedidos, 'franja-pedidos-t').id,
    buscar(asigs, fecha(5), caja2, 'franja-caja-4').id,
    buscar(asigs, fecha(6), lego, 'franja-lego-2').id,
  ];
  asigs = asigs.filter((a) => !vaciar.includes(a.id));
  // Defectos de cobertura: asignación a una franja que no existe, y plaza duplicada.
  asigs.push({
    id: 'defecto-franja-inexistente',
    tipo: 'puesto',
    fecha: fecha(2),
    puestoId: lego,
    franjaId: 'franja-no-existe',
    plaza: 0,
    personaId: P(26),
    bloqueada: false,
    origen: 'manual',
  });
  const dup = buscar(asigs, fecha(3), lego, 'franja-lego-7');
  asigs.push({ ...dup, id: 'defecto-plaza-duplicada', personaId: P(27) });
  // Domingo: una pausa correcta, una fuera de franja y una de quien no trabaja ese día.
  const trabajaDom = asigs.find((a): a is AsignacionPuesto => a.tipo === 'puesto' && a.fecha === fecha(DOM))!;
  asigs.push(pausa(DOM, trabajaDom.personaId, '14:00', '15:00'));
  asigs.push(pausa(DOM, P(9), '12:00', '13:00'));
  asigs.push(pausa(DOM, P(28), '15:00', '15:30'));
  return asigs;
}

/** Días trabajados por persona (asignaciones de puesto) en un cuadrante. */
function diasPorPersona(asigs: readonly Asignacion[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const a of asigs) {
    if (a.tipo !== 'puesto') continue;
    if (!m.has(a.personaId)) m.set(a.personaId, new Set());
    m.get(a.personaId)!.add(a.fecha);
  }
  return m;
}

// ───────────────────────── Candidatas deterministas ─────────────────────────

interface Candidata {
  a: Asignacion;
  /** false = no encaja en el horario (solo para coberturaCompleta). */
  encaja: boolean;
}

/** Candidatas dirigidas para los tipos cuyo incumplimiento exige un montaje concreto. */
function candidatasDirigidas(tipo: string): Candidata[] {
  const res: Candidata[] = [];
  const nueva = (id: string, dia: number, puestoId: string, franjaId: string, personaId: string): Candidata => ({
    a: { id, tipo: 'puesto', fecha: fecha(dia as never), puestoId, franjaId, plaza: 0, personaId, bloqueada: false, origen: 'manual' },
    encaja: true,
  });
  if (tipo === 'general/rotarEntreBloques') {
    // Viernes: Caja 1 repite persona en los bloques 1 y 2 (defecto). Poner en Caja 2 (bloque 2) a quien
    // está en Caja 2 en el bloque 1 repite la pareja entera.
    const c2 = buscar(CUADRANTE, fecha(4), caja2, 'franja-caja-1').personaId;
    res.push(nueva('cand-rot-0', 4, caja2, 'franja-caja-4', c2));
    res.push(nueva('cand-rot-1', 4, caja2, 'franja-caja-4', P(1)));
    res.push(nueva('cand-rot-2', 4, caja2, 'franja-caja-4', P(9)));
  }
  if (tipo.endsWith('/maxDiasSemana')) {
    // Personas que ya trabajan exactamente MAX_DIAS días, en un día en que no trabajan.
    const dias = diasPorPersona(CUADRANTE);
    let n = 0;
    for (const [persona, set] of dias) {
      if (set.size !== MAX_DIAS || n >= 6) continue;
      const libre = [0, 1, 2, 3, 4, 5, 6].find((d) => !set.has(fecha(d as never)));
      if (libre === undefined) continue;
      res.push(nueva(`cand-dias-${n++}`, libre, lego, 'franja-lego-1', persona));
    }
  }
  return res;
}

function crearCandidatas(tipo: string, conPausas: number, conNoEncaja: boolean): Candidata[] {
  let semilla = 7;
  for (const c of tipo) semilla = (semilla * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = azar(semilla);
  const puestos = crearEstadoEjemplo().puestos;
  const res: Candidata[] = [];
  const total = 50;
  for (let i = 0; i < total; i++) {
    const persona = P(1 + Math.floor(rnd() * 29));
    if (rnd() < conPausas) {
      const dia = rnd() < 0.7 ? DOM : Math.floor(rnd() * 7);
      const ini = [aMinutos('12:00'), aMinutos('14:00'), aMinutos('15:00'), aMinutos('16:00'), aMinutos('14:30')][Math.floor(rnd() * 5)]!;
      const dur = rnd() < 0.8 ? 60 : 30;
      res.push({
        a: { id: `cand-${i}`, tipo: 'pausa', fecha: fecha(dia as never), personaId: persona, inicio: ini, fin: ini + dur, bloqueada: false, origen: 'manual' },
        encaja: true,
      });
    } else {
      const puesto = puestos[Math.floor(rnd() * puestos.length)]!;
      const franjas = puesto.horario.general.franjas;
      const franja = franjas[Math.floor(rnd() * franjas.length)]!;
      const dia = Math.floor(rnd() * 7);
      res.push({
        a: { id: `cand-${i}`, tipo: 'puesto', fecha: fecha(dia as never), puestoId: puesto.id, franjaId: franja.id, plaza: 0, personaId: persona, bloqueada: false, origen: 'manual' },
        encaja: true,
      });
    }
  }
  const dirigidas = candidatasDirigidas(tipo);
  res.splice(res.length - dirigidas.length, dirigidas.length, ...dirigidas);
  if (conNoEncaja) {
    for (let i = 0; i < 4; i++) {
      res.push({
        a: { id: `cand-noencaja-${i}`, tipo: 'puesto', fecha: fecha((i + 1) as never), puestoId: lego, franjaId: 'franja-no-existe', plaza: 0, personaId: P(2 + i), bloqueada: false, origen: 'manual' },
        encaja: false,
      });
    }
  }
  return res;
}

// ───────────────────────── Casos (25 tipos, + variante mínimo) ─────────────────────────

interface OpReg { dura: boolean; peso?: number }

interface Caso {
  nombre: string;
  origen: 'general' | 'persona';
  tipo: TipoReglaGeneral | TipoRestriccion;
  crearGeneral?: (op: OpReg) => ReglaGeneral;
  crearPersona?: (op: OpReg) => RestriccionPersona;
  /** Proporción de candidatas que son pausas. */
  pausas: number;
  /** Excepciones de §11 punto 1 */
  nuncaBloquea?: boolean;
  /** El coste esperado es siempre 0 (solo mínimo de minutosSemana). */
  sinCoste?: boolean;
  /** Solo las candidatas de puesto nunca bloquean (comidas, criterio a). */
  puestoNuncaBloquea?: boolean;
  /** coberturaCompleta: las que no encajan se comprueban con la fórmula; las demás nunca bloquean. */
  cobertura?: boolean;
  /** Tipo de dureza admitido */
  dureza: 'ambas' | 'soloDura' | 'soloBlanda';
}

/** Número de días de trabajo más frecuente entre quienes trabajan en el cuadrante de partida (mínimo 2). */
const MAX_DIAS: number = (() => {
  const cuenta = new Map<number, number>();
  for (const set of diasPorPersona(crearCuadranteConDefectos()).values()) cuenta.set(set.size, (cuenta.get(set.size) ?? 0) + 1);
  const mejor = [...cuenta.entries()].filter(([d]) => d >= 2).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return mejor ? mejor[0] : 3;
})();

const opts = (o: OpReg) => ({ dura: o.dura, peso: o.peso });

const GENERALES: Record<TipoReglaGeneral, Omit<Caso, 'nombre' | 'origen' | 'tipo' | 'dureza'> & { gen: (o: OpReg) => ReglaGeneral }> = {
  sinSolapes: { pausas: 0.2, gen: (o) => reglaDe('sinSolapes', {}, opts(o)) },
  coberturaCompleta: { pausas: 0.1, cobertura: true, gen: (o) => reglaDe('coberturaCompleta', {}, opts(o)) },
  personaDisponible: { pausas: 0.2, gen: (o) => reglaDe('personaDisponible', {}, opts(o)) },
  habilitacionRequerida: { pausas: 0.1, gen: (o) => reglaDe('habilitacionRequerida', {}, opts(o)) },
  maxMinutosDia: { pausas: 0.1, gen: (o) => reglaDe('maxMinutosDia', { maxMin: 240, excepciones: [{ areaId: IDS_EJEMPLO.areas.pedidos, maxMin: null }] }, opts(o)) },
  descansoEntreJornadas: { pausas: 0.1, gen: (o) => reglaDe('descansoEntreJornadas', { minMin: 780 }, opts(o)) },
  noRepetirConsecutivas: { pausas: 0.1, gen: (o) => reglaDe('noRepetirConsecutivas', { ambito: TODO }, opts(o)) },
  mismaPersonaBloque: { pausas: 0.1, gen: (o) => reglaDe('mismaPersonaBloque', { ambito: TODO }, opts(o)) },
  rotarEntreBloques: { pausas: 0.1, gen: (o) => reglaDe('rotarEntreBloques', { ambito: TODO }, opts(o)) },
  exclusividadDiaria: { pausas: 0.1, gen: (o) => reglaDe('exclusividadDiaria', { puestoIds: [pedidos], diasExcepcion: [DOM] }, opts(o)) },
  respetarEquipo: { pausas: 0.1, gen: (o) => reglaDe('respetarEquipo', { maxDiasContrarioSemana: 1, diasPermitidos: [DOM] }, opts(o)) },
  maxDiasSemana: { pausas: 0.1, gen: (o) => reglaDe('maxDiasSemana', { max: MAX_DIAS }, opts(o)) },
  maxFranjasSiSoloArea: { pausas: 0.1, gen: (o) => reglaDe('maxFranjasSiSoloArea', { areaId: areaLego, maxFranjas: 1 }, opts(o)) },
  comidasEscalonadas: {
    pausas: 0.5,
    puestoNuncaBloquea: true,
    gen: (o) =>
      reglaDe(
        'comidasEscalonadas',
        {
          dias: [DOM],
          umbralJornadaMin: 240,
          duracionMin: 60,
          franjas: [
            { inicio: aMinutos('14:00'), fin: aMinutos('15:00'), maxPersonas: 1 },
            { inicio: aMinutos('15:00'), fin: aMinutos('16:00'), maxPersonas: 2 },
            { inicio: aMinutos('16:00'), fin: aMinutos('17:00'), maxPersonas: 1 },
          ],
        },
        opts(o),
      ),
  },
  repartoEquitativo: { pausas: 0.1, nuncaBloquea: true, gen: (o) => reglaDe('repartoEquitativo', {}, opts(o)) },
};

const PERSONALES: Record<TipoRestriccion, Omit<Caso, 'nombre' | 'origen' | 'tipo' | 'dureza'> & { per: (o: OpReg) => RestriccionPersona }> = {
  diasDisponibles: { pausas: 0.1, per: (o) => restriccionDe('diasDisponibles', { dias: [0, 1, 2, 3, 4] }, opts(o)) },
  diasNoDisponibles: { pausas: 0.1, per: (o) => restriccionDe('diasNoDisponibles', { dias: [4, 5] }, opts(o)) },
  noAntesDe: { pausas: 0.1, per: (o) => restriccionDe('noAntesDe', { hora: aMinutos('11:00'), dias: [] }, opts(o)) },
  noDespuesDe: { pausas: 0.1, per: (o) => restriccionDe('noDespuesDe', { hora: aMinutos('20:00'), dias: [] }, opts(o)) },
  maxMinutosDia: { pausas: 0.1, per: (o) => restriccionDe('maxMinutosDia', { maxMin: 150 }, opts(o)) },
  minutosSemana: { pausas: 0.1, per: (o) => restriccionDe('minutosSemana', { minMin: null, maxMin: 300 }, opts(o)) },
  maxDiasSemana: { pausas: 0.1, per: (o) => restriccionDe('maxDiasSemana', { max: MAX_DIAS }, opts(o)) },
  soloFinesDeSemana: { pausas: 0.1, per: (o) => restriccionDe('soloFinesDeSemana', {}, opts(o)) },
  noAsignarA: { pausas: 0.1, per: (o) => restriccionDe('noAsignarA', { ambito: { areaIds: [areaLego, areaCaja], puestoIds: [] } }, opts(o)) },
  pausaMinima: { pausas: 0.3, nuncaBloquea: true, per: (o) => restriccionDe('pausaMinima', { siJornadaSuperaMin: 240, pausaMin: 30 }, opts(o)) },
};

const CASOS: Caso[] = [
  ...(Object.keys(GENERALES) as TipoReglaGeneral[]).map((t): Caso => {
    const { gen, ...resto } = GENERALES[t];
    return { ...resto, nombre: `general/${t}`, origen: 'general', tipo: t, crearGeneral: gen, dureza: CATALOGO.general[t].dureza };
  }),
  ...(Object.keys(PERSONALES) as TipoRestriccion[]).map((t): Caso => {
    const { per, ...resto } = PERSONALES[t];
    return { ...resto, nombre: `persona/${t}`, origen: 'persona', tipo: t, crearPersona: per, dureza: CATALOGO.restricciones[t].dureza };
  }),
  // Variante: solo el mínimo de minutosSemana (excepción documentada: nunca bloquea).
  {
    nombre: 'persona/minutosSemana (solo mínimo)',
    origen: 'persona',
    tipo: 'minutosSemana',
    pausas: 0.1,
    nuncaBloquea: true,
    sinCoste: true,
    crearPersona: (o) => restriccionDe('minutosSemana', { minMin: 900, maxMin: null }, opts(o)),
    dureza: CATALOGO.restricciones.minutosSemana.dureza,
  },
];

// ───────────────────────── Evaluación ─────────────────────────

type DefG = {
  evaluar(r: ReglaGeneral, c: ContextoEvaluacion): Incumplimiento[];
  comprobar(r: ReglaGeneral, c: ContextoEvaluacion, a: Asignacion): Comprobacion;
};
type DefP = {
  evaluar(r: RestriccionPersona, p: Persona, c: ContextoEvaluacion): Incumplimiento[];
  comprobar(r: RestriccionPersona, p: Persona, c: ContextoEvaluacion, a: Asignacion): Comprobacion;
};

function claveHueco(a: AsignacionPuesto): string {
  return `${a.fecha}|${a.puestoId}|${a.franjaId}|${a.plaza}`;
}

function prepararDatos(caso: Caso, op: OpReg): { datos: EstadoApp; regla?: ReglaGeneral; restr?: RestriccionPersona } {
  if (caso.origen === 'general') {
    const regla = caso.crearGeneral!(op);
    return { datos: { ...datosBase, reglas: [regla] }, regla };
  }
  const restr = caso.crearPersona!(op);
  return {
    datos: { ...datosBase, reglas: [], personas: datosBase.personas.map((p) => ({ ...p, restricciones: [restr] })) },
    restr,
  };
}

function evaluarTodo(caso: Caso, datos: EstadoApp, regla: ReglaGeneral | undefined, restr: RestriccionPersona | undefined, asigs: Asignacion[]): Incumplimiento[] {
  const ctx: ContextoEvaluacion = { datos, indice: crearIndice(datos, LUNES, asigs) };
  if (caso.origen === 'general') return (CATALOGO.general[caso.tipo as TipoReglaGeneral] as unknown as DefG).evaluar(regla!, ctx);
  const def = CATALOGO.restricciones[caso.tipo as TipoRestriccion] as unknown as DefP;
  return datos.personas.flatMap((p) => def.evaluar(restr!, p, ctx));
}

const penal = (incs: Incumplimiento[]): number => incs.reduce((s, i) => s + i.penalizacion, 0);

const CUADRANTE = crearCuadranteConDefectos();

function comprobarCaso(caso: Caso, op: OpReg): string[] {
  const { datos, regla, restr } = prepararDatos(caso, op);
  const candidatas = crearCandidatas(caso.nombre, caso.pausas, !!caso.cobertura);
  const fallos: string[] = [];
  let permitidas = 0;
  let bloqueadas = 0;
  let conCoste = 0;

  for (const { a: cand, encaja } of candidatas) {
    // La candidata ocupa su hueco: se quita antes lo que hubiera allí (como hace el motor).
    const antesAsigs =
      cand.tipo === 'puesto'
        ? CUADRANTE.filter((x) => !(x.tipo === 'puesto' && claveHueco(x) === claveHueco(cand)))
        : CUADRANTE;
    const despuesAsigs = [...antesAsigs, cand];
    const antes = evaluarTodo(caso, datos, regla, restr, antesAsigs);
    const despues = evaluarTodo(caso, datos, regla, restr, despuesAsigs);
    const ctx: ContextoEvaluacion = { datos, indice: crearIndice(datos, LUNES, antesAsigs) };
    const persona = datos.personas.find((p) => p.id === cand.personaId)!;
    const r: Comprobacion =
      caso.origen === 'general'
        ? (CATALOGO.general[caso.tipo as TipoReglaGeneral] as unknown as DefG).comprobar(regla!, ctx, cand)
        : (CATALOGO.restricciones[caso.tipo as TipoRestriccion] as unknown as DefP).comprobar(restr!, persona, ctx, cand);

    const esperadoFormula = !despues.some((i) => i.dura && i.asignacionIds.includes(cand.id));
    let esperadoPermitido = esperadoFormula;
    if (caso.nuncaBloquea) esperadoPermitido = true;
    if (caso.puestoNuncaBloquea && cand.tipo === 'puesto') esperadoPermitido = true;
    if (caso.cobertura && encaja) esperadoPermitido = true;
    const esperadoCoste = Math.max(0, penal(despues) - penal(antes));

    const desc = `${cand.id} ${persona.codigo} ${cand.fecha} ${cand.tipo === 'puesto' ? `${cand.puestoId}/${cand.franjaId}` : `pausa ${cand.inicio}-${cand.fin}`}`;
    if (r.permitido !== esperadoPermitido) {
      fallos.push(`permitido=${r.permitido}, esperado ${esperadoPermitido} en ${desc} [${despues.filter((i) => i.asignacionIds.includes(cand.id)).map((i) => i.mensaje).slice(0, 2).join(' / ')}]`);
    }
    const compararCoste = !(caso.cobertura && !encaja);
    if (compararCoste && Math.abs(r.coste - esperadoCoste) > 1e-9) {
      fallos.push(`coste=${r.coste}, esperado ${esperadoCoste} en ${desc}`);
    }
    if (op.dura && r.coste !== 0) fallos.push(`coste ${r.coste} con regla dura en ${desc}`);
    if (r.permitido) permitidas++; else bloqueadas++;
    if (esperadoCoste > 0) conCoste++;
    expect(Array.isArray(r.motivos)).toBe(true);
  }
  // Salvaguarda de que el montaje ejercita ambos lados (si no, el test no demuestra nada).
  if (!caso.nuncaBloquea && op.dura && caso.tipo !== 'coberturaCompleta' && caso.tipo !== 'repartoEquitativo' && bloqueadas === 0) {
    fallos.push(`MONTAJE: ninguna de las ${candidatas.length} candidatas resultó bloqueada (el caso no discrimina)`);
  }
  if (!op.dura && caso.tipo !== 'coberturaCompleta' && !caso.sinCoste && conCoste === 0) {
    fallos.push(`MONTAJE: ninguna candidata tuvo coste esperado > 0 (el caso no discrimina)`);
  }
  void permitidas;
  return fallos;
}

describe('coherencia entre comprobar y evaluar (50 candidatas por tipo)', () => {
  it('el cuadrante de partida tiene los defectos buscados (sanidad)', () => {
    expect(CUADRANTE.length).toBeGreaterThan(190);
    expect(CASOS.length).toBe(26);
    expect(new Set(CASOS.map((c) => c.nombre.replace(' (solo mínimo)', ''))).size).toBe(25);
  });

  for (const caso of CASOS) {
    describe(caso.nombre, () => {
      if (caso.dureza !== 'soloBlanda') {
        it('como regla dura', () => {
          const fallos = comprobarCaso(caso, { dura: true });
          expect(fallos, fallos.slice(0, 5).join('\n')).toHaveLength(0);
        });
      }
      if (caso.dureza !== 'soloDura') {
        it('como regla blanda (peso 3)', () => {
          const fallos = comprobarCaso(caso, { dura: false, peso: 3 });
          expect(fallos, fallos.slice(0, 5).join('\n')).toHaveLength(0);
        });
      }
    });
  }
});
