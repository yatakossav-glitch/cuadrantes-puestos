/**
 * Comidas escalonadas (ARQUITECTURA §5.4). Se colocan después de los puestos y nunca los desplazan:
 * si una comida no cabe, queda pendiente con su motivo. Función pura y determinista.
 */
import { conAsignacion, crearIndice } from '../validacion/indice';
import { validarSemana, type Catalogos } from '../validacion/validador';
import { personasActivas } from './construccion';
import { aHora, formatearDuracion, formatearIntervalo, seSolapan } from '../modelo/horas';
import { fechasSemana } from '../modelo/fechas';
import { cuando, etiquetaPersona } from '../reglas/util';
import type { IndiceSemana } from '../reglas/contrato';
import type {
  Asignacion,
  AsignacionPausa,
  DatosPlanificacion,
  FechaISO,
  FranjaComida,
  Id,
  Intervalo,
  Minutos,
  ReglaGeneral,
} from '../modelo/tipos';
import { asignacionesDeUnidad, idUnico, type Comprobador, type Unidad } from './unidades';

/** Paso con el que se prueban las horas de inicio de una comida dentro de su franja. */
const PASO_MINUTOS = 5;

export interface ComidaPendiente {
  personaId: Id;
  fecha: FechaISO;
  motivo: string;
}

export interface ResultadoComidas {
  /** Pausas nuevas (origen 'motor'). No incluye las que ya venían en `asignaciones`. */
  pausas: AsignacionPausa[];
  pendientes: ComidaPendiente[];
}

type ReglaComidas = ReglaGeneral<'comidasEscalonadas'>;

export function reglasDeComidas(datos: DatosPlanificacion): ReglaComidas[] {
  return datos.reglas.filter(
    (r): r is ReglaComidas => r.tipo === 'comidasEscalonadas' && r.activa && r.estado !== 'descartada',
  );
}

interface Opcion {
  franja: FranjaComida;
  pausa: Intervalo;
  ocupacion: number;
}

function pausaValida(p: AsignacionPausa, regla: ReglaComidas): boolean {
  const { duracionMin, franjas } = regla.params;
  return p.fin - p.inicio >= duracionMin && franjas.some((f) => f.inicio <= p.inicio && p.fin <= f.fin);
}

/** Intervalos de todo lo que la persona hace ese día (puestos y pausas). */
function ocupadoPor(indice: IndiceSemana, personaId: Id, fecha: FechaISO): Intervalo[] {
  const lista: Intervalo[] = [];
  for (const a of indice.dePersonaDia(personaId, fecha)) {
    const iv = indice.intervalo(a);
    if (iv) lista.push(iv);
  }
  return lista;
}

/** Ventanas posibles de comida (sin mirar la ocupación de las franjas) para una persona. */
function ventanas(regla: ReglaComidas, ocupado: Intervalo[]): { franja: FranjaComida; pausa: Intervalo }[] {
  const { duracionMin, franjas } = regla.params;
  const resultado: { franja: FranjaComida; pausa: Intervalo }[] = [];
  for (const franja of franjas) {
    for (let inicio = franja.inicio; inicio + duracionMin <= franja.fin; inicio += PASO_MINUTOS) {
      const pausa = { inicio, fin: inicio + duracionMin };
      if (!ocupado.some((o) => seSolapan(o, pausa))) resultado.push({ franja, pausa });
    }
  }
  return resultado;
}

function motivoPendiente(
  indice: IndiceSemana,
  regla: ReglaComidas,
  personaId: Id,
  fecha: FechaISO,
  posibles: readonly { franja: FranjaComida }[],
): string {
  const codigo = etiquetaPersona(indice.persona(personaId));
  const jornada = indice.jornada(personaId, fecha);
  const trabaja = jornada ? `trabaja ${formatearIntervalo(jornada)}` : 'trabaja';
  const dur = formatearDuracion(regla.params.duracionMin);
  const base = `${codigo} ${trabaja} ${cuando(fecha)} y necesita comer ${dur}`;
  if (posibles.length === 0) {
    return `${base}: todas las franjas de comida (${regla.params.franjas.map((f) => formatearIntervalo(f)).join(', ')}) se solapan con sus puestos`;
  }
  // Solo las franjas donde tendría libre; si siguen llenas es por el máximo de personas.
  const libres = [...new Set(posibles.map((v) => formatearIntervalo(v.franja)))];
  return `${base}: las franjas de comida donde tendría libre (${libres.join(', ')}) ya están completas`;
}

/**
 * Coloca las comidas que faltan. `asignaciones` son todas las de la semana (puestos y pausas ya existentes).
 * Con `soloFechas` se limita a esos días (para la reparación).
 */
export function colocarComidas(
  datos: DatosPlanificacion,
  comprobador: Comprobador,
  lunes: FechaISO,
  asignaciones: readonly Asignacion[],
  soloFechas?: readonly FechaISO[],
): ResultadoComidas {
  let indice = crearIndice(datos, lunes, asignaciones);
  const pausas: AsignacionPausa[] = [];
  const pendientes: ComidaPendiente[] = [];
  const marcadas = new Set<string>();
  const usados = new Set<Id>(asignaciones.map((a) => a.id));

  for (const regla of reglasDeComidas(datos)) {
    for (const fecha of fechasSemana(lunes)) {
      if (soloFechas && !soloFechas.includes(fecha)) continue;
      if (!regla.params.dias.includes(indice.diaDe(fecha))) continue;
      const { umbralJornadaMin } = regla.params;

      const personas = new Set<Id>();
      for (const a of indice.asignaciones()) if (a.fecha === fecha && a.tipo === 'puesto') personas.add(a.personaId);
      const necesitan: { id: Id; codigo: string; viables: number }[] = [];
      for (const id of personas) {
        const jornada = indice.jornada(id, fecha);
        if (!jornada || jornada.fin - jornada.inicio <= umbralJornadaMin) continue;
        if (indice.pausasDe(id, fecha).some((p) => pausaValida(p, regla))) continue;
        necesitan.push({
          id,
          codigo: etiquetaPersona(indice.persona(id)),
          viables: ventanas(regla, ocupadoPor(indice, id, fecha)).length,
        });
      }
      necesitan.sort((a, b) => a.viables - b.viables || (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0));

      for (const p of necesitan) {
        const ocupacion = (f: FranjaComida): number =>
          indice.asignaciones().filter((a) => a.fecha === fecha && a.tipo === 'pausa' && seSolapan(a, f)).length;
        const todas = ventanas(regla, ocupadoPor(indice, p.id, fecha));
        const opciones: Opcion[] = todas
          .map((v) => ({ franja: v.franja, pausa: v.pausa, ocupacion: ocupacion(v.franja) }))
          .filter((o) => o.ocupacion < o.franja.maxPersonas)
          .sort((a, b) => a.ocupacion - b.ocupacion || a.pausa.inicio - b.pausa.inicio);

        let colocada = false;
        for (const o of opciones) {
          const candidata: AsignacionPausa = {
            id: idUnico(`c|${p.id}|${fecha}`, usados),
            tipo: 'pausa',
            fecha,
            inicio: o.pausa.inicio,
            fin: o.pausa.fin,
            personaId: p.id,
            bloqueada: false,
            origen: 'motor',
          };
          if (!comprobador.asignacion(indice, candidata).permitido) continue;
          pausas.push(candidata);
          usados.add(candidata.id);
          indice = conAsignacion(indice, datos, candidata);
          colocada = true;
          break;
        }
        const clave = `${p.id}|${fecha}`;
        if (!colocada && !marcadas.has(clave)) {
          marcadas.add(clave);
          pendientes.push({ personaId: p.id, fecha, motivo: motivoPendiente(indice, regla, p.id, fecha, todas) });
        }
      }
    }
  }
  return { pausas, pendientes };
}

// ───────────────────────── Reparación ─────────────────────────

export interface EntradaReparacion {
  datos: DatosPlanificacion;
  comprobador: Comprobador;
  lunes: FechaISO;
  /** Asignaciones que no se mueven (incluye las pausas que ya existían). */
  fijas: readonly Asignacion[];
  unidades: readonly Unidad[];
  /** Persona de cada unidad (null = vacía). */
  personas: readonly (Id | null)[];
  /** Comidas colocadas y pendientes hasta ahora. */
  comidas: ResultadoComidas;
  reloj: () => number;
  inicio: number;
  limiteMs: number;
}

export interface ResultadoReparacion {
  personas: (Id | null)[];
  comidas: ResultadoComidas;
  cortadoPorTiempo: boolean;
}

/**
 * Para cada comida pendiente intenta liberar una ventana moviendo una unidad de esa persona ese día
 * a otra persona permitida. Solo acepta el cambio si ese día quedan menos comidas pendientes.
 */
export function repararComidas(entrada: EntradaReparacion): ResultadoReparacion {
  const { datos, comprobador, lunes, fijas, unidades, reloj, inicio, limiteMs } = entrada;
  let personas: (Id | null)[] = [...entrada.personas];
  let pausas = [...entrada.comidas.pausas];
  let pendientes = [...entrada.comidas.pendientes];
  let cortadoPorTiempo = false;
  const candidatas = personasActivas(datos);

  const listaPuestos = (ps: readonly (Id | null)[], saltar = -1): Asignacion[] => {
    const lista: Asignacion[] = [];
    unidades.forEach((u, i) => {
      const p = ps[i];
      if (p != null && i !== saltar) lista.push(...asignacionesDeUnidad(u, p));
    });
    return lista;
  };

  for (const pendiente of [...entrada.comidas.pendientes]) {
    if (!pendientes.some((x) => x.personaId === pendiente.personaId && x.fecha === pendiente.fecha)) continue;
    const suyas = unidades
      .map((u, i) => ({ u, i }))
      .filter(({ u, i }) => personas[i] === pendiente.personaId && u.fecha === pendiente.fecha)
      .sort((a, b) => a.u.inicio - b.u.inicio);
    const antes = pendientes.filter((x) => x.fecha === pendiente.fecha).length;
    let resuelto = false;

    for (const { u, i } of suyas) {
      if (resuelto) break;
      const base = crearIndice(datos, lunes, [...fijas, ...listaPuestos(personas, i), ...pausas.filter((x) => x.fecha !== pendiente.fecha)]);
      for (const q of candidatas) {
        if (q.id === pendiente.personaId) continue;
        if (reloj() - inicio >= limiteMs) {
          cortadoPorTiempo = true;
          break;
        }
        if (!comprobador.unidad(base, u, q.id).permitido) continue;
        const nuevas = [...personas];
        nuevas[i] = q.id;
        const resto = pausas.filter((x) => x.fecha !== pendiente.fecha);
        const intento = colocarComidas(datos, comprobador, lunes, [...fijas, ...listaPuestos(nuevas), ...resto], [pendiente.fecha]);
        if (intento.pendientes.length < antes) {
          personas = nuevas;
          pausas = [...resto, ...intento.pausas];
          pendientes = [...pendientes.filter((x) => x.fecha !== pendiente.fecha), ...intento.pendientes];
          resuelto = true;
          break;
        }
      }
      if (cortadoPorTiempo) break;
    }
    if (cortadoPorTiempo) break;
  }
  pendientes.sort((a, b) => (a.fecha === b.fecha ? (a.personaId < b.personaId ? -1 : 1) : a.fecha < b.fecha ? -1 : 1));
  return { personas, comidas: { pausas, pendientes }, cortadoPorTiempo };
}

// ───────────────────────── Pausa mínima personal (restricción dura) ─────────────────────────

export interface EntradaPausasMinimas extends EntradaReparacion {
  catalogos: Catalogos;
}

interface FaltaPausa {
  personaId: Id;
  fecha: FechaISO;
  pausaMin: Minutos;
}

/** Personas y días con una restricción `pausaMinima` dura incumplida. */
export function pausasMinimasFaltantes(
  datos: DatosPlanificacion,
  catalogos: Catalogos,
  lunes: FechaISO,
  asignaciones: readonly Asignacion[],
): FaltaPausa[] {
  const r = validarSemana(datos, lunes, asignaciones, catalogos);
  const faltas: FaltaPausa[] = [];
  for (const i of r.incumplimientos) {
    if (!i.dura || i.origen !== 'persona' || i.tipo !== 'pausaMinima' || i.personaId === null || i.fecha === null) continue;
    const persona = datos.personas.find((p) => p.id === i.personaId);
    const restr = persona?.restricciones.find((x) => x.id === i.reglaId);
    if (!restr || restr.tipo !== 'pausaMinima') continue;
    faltas.push({ personaId: i.personaId, fecha: i.fecha, pausaMin: restr.params.pausaMin });
  }
  return faltas;
}

/**
 * Intenta abrir el hueco que exige `pausaMinima` moviendo una unidad de esa persona ese día a otra persona
 * permitida. Lo que no se consigue se añade a `comidas.pendientes` con un motivo legible.
 */
export function repararPausasMinimas(entrada: EntradaPausasMinimas): ResultadoReparacion {
  const { datos, catalogos, comprobador, lunes, fijas, unidades, reloj, inicio, limiteMs } = entrada;
  let personas: (Id | null)[] = [...entrada.personas];
  let pausas = [...entrada.comidas.pausas];
  let pendientes = [...entrada.comidas.pendientes];
  let cortadoPorTiempo = false;
  const candidatas = personasActivas(datos);
  const intentadas = new Set<string>();

  const puestos = (ps: readonly (Id | null)[]): Asignacion[] => {
    const lista: Asignacion[] = [];
    unidades.forEach((u, i) => {
      const p = ps[i];
      if (p != null) lista.push(...asignacionesDeUnidad(u, p));
    });
    return lista;
  };
  const todas = (ps: readonly (Id | null)[], pa: readonly AsignacionPausa[]): Asignacion[] => [...fijas, ...puestos(ps), ...pa];
  const faltasDelDia = (ps: readonly (Id | null)[], pa: readonly AsignacionPausa[], fecha: FechaISO): number =>
    pausasMinimasFaltantes(datos, catalogos, lunes, todas(ps, pa)).filter((f) => f.fecha === fecha).length;

  for (let vuelta = 0; vuelta < 50 && !cortadoPorTiempo; vuelta += 1) {
    const falta = pausasMinimasFaltantes(datos, catalogos, lunes, todas(personas, pausas)).find(
      (f) => !intentadas.has(`${f.personaId}|${f.fecha}`),
    );
    if (!falta) break;
    intentadas.add(`${falta.personaId}|${falta.fecha}`);
    const antes = faltasDelDia(personas, pausas, falta.fecha);
    const pendientesAntes = pendientes.filter((x) => x.fecha === falta.fecha).length;
    const suyas = unidades
      .map((u, i) => ({ u, i }))
      .filter(({ u, i }) => personas[i] === falta.personaId && u.fecha === falta.fecha)
      .sort((a, b) => a.u.inicio - b.u.inicio);
    let resuelta = false;
    for (const { u, i } of suyas) {
      if (resuelta || cortadoPorTiempo) break;
      const resto = pausas.filter((x) => x.fecha !== falta.fecha);
      const base = crearIndice(datos, lunes, [...fijas, ...puestos(personas.map((p, k) => (k === i ? null : p))), ...resto]);
      for (const q of candidatas) {
        if (q.id === falta.personaId) continue;
        if (reloj() - inicio >= limiteMs) {
          cortadoPorTiempo = true;
          break;
        }
        if (!comprobador.unidad(base, u, q.id).permitido) continue;
        const nuevas = [...personas];
        nuevas[i] = q.id;
        const intento = colocarComidas(datos, comprobador, lunes, [...fijas, ...puestos(nuevas), ...resto], [falta.fecha]);
        const pausasNuevas = [...resto, ...intento.pausas];
        if (intento.pendientes.length > pendientesAntes) continue;
        if (faltasDelDia(nuevas, pausasNuevas, falta.fecha) < antes) {
          personas = nuevas;
          pausas = pausasNuevas;
          pendientes = [...pendientes.filter((x) => x.fecha !== falta.fecha), ...intento.pendientes];
          resuelta = true;
          break;
        }
      }
    }
  }

  // Lo que sigue sin pausa se comunica como comida pendiente.
  const indice = crearIndice(datos, lunes, todas(personas, pausas));
  for (const f of pausasMinimasFaltantes(datos, catalogos, lunes, todas(personas, pausas))) {
    if (pendientes.some((x) => x.personaId === f.personaId && x.fecha === f.fecha)) continue;
    const j = indice.jornada(f.personaId, f.fecha);
    const codigo = etiquetaPersona(indice.persona(f.personaId));
    pendientes.push({
      personaId: f.personaId,
      fecha: f.fecha,
      motivo: `${codigo} trabaja${j ? ` de ${aHora(j.inicio)} a ${aHora(j.fin)}` : ''} sin una pausa de ${formatearDuracion(f.pausaMin)}`,
    });
  }
  pendientes.sort((a, b) => (a.fecha === b.fecha ? (a.personaId < b.personaId ? -1 : 1) : a.fecha < b.fecha ? -1 : 1));
  return { personas, comidas: { pausas, pendientes }, cortadoPorTiempo };
}
