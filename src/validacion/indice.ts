/**
 * Índice precalculado de una semana (§10.1). Función pura: no toca DOM ni almacenamiento.
 * Las consultas usan mapas por persona y fecha y por clave de hueco.
 */
import type { IndiceSemana } from '../reglas/contrato';
import { semanaDelCiclo } from '../rotacion/ciclo';
import { seSolapan } from '../modelo/horas';
import { diaSemana, enRango, fechasSemana } from '../modelo/fechas';
import { horarioDe } from '../edicion/horario';
import type {
  Area,
  Asignacion,
  AsignacionPausa,
  AsignacionPuesto,
  ClaveHueco,
  DatosPlanificacion,
  DiaSemana,
  FechaISO,
  Franja,
  HorarioDia,
  Hueco,
  Id,
  Intervalo,
  Minutos,
  Persona,
  Puesto,
} from '../modelo/tipos';

const VACIO: readonly never[] = [];

/** Parte del índice que no depende de las asignaciones (se reutiliza en `conAsignacion`). */
interface Estatico {
  huecos: Hueco[];
  porClave: Map<ClaveHueco, Hueco>;
}

const estaticos = new WeakMap<IndiceSemana, Estatico>();

function clave(fecha: FechaISO, puestoId: Id, franjaId: Id, plaza: number): ClaveHueco {
  return `${fecha}|${puestoId}|${franjaId}|${plaza}`;
}

function construirEstatico(
  datos: DatosPlanificacion,
  fechas: readonly FechaISO[],
  horario: (puestoId: Id, fecha: FechaISO) => HorarioDia | null,
): Estatico {
  const huecos: Hueco[] = [];
  const porClave = new Map<ClaveHueco, Hueco>();
  for (const fecha of fechas) {
    const dia = diaSemana(fecha);
    for (const puesto of datos.puestos) {
      const h = horario(puesto.id, fecha);
      if (!h) continue;
      for (const franja of h.franjas) {
        const bloque = h.bloques.find((b) => b.franjaIds.includes(franja.id));
        for (let plaza = 0; plaza < puesto.plazas; plaza += 1) {
          const hueco: Hueco = {
            fecha,
            dia,
            puestoId: puesto.id,
            areaId: puesto.areaId,
            franjaId: franja.id,
            plaza,
            inicio: franja.inicio,
            fin: franja.fin,
            bloqueId: bloque ? bloque.id : null,
          };
          huecos.push(hueco);
          porClave.set(clave(fecha, puesto.id, franja.id, plaza), hueco);
        }
      }
    }
  }
  return { huecos, porClave };
}

function construir(
  datos: DatosPlanificacion,
  lunes: FechaISO,
  entrada: readonly Asignacion[],
  previo?: Estatico,
): IndiceSemana {
  const fechas = fechasSemana(lunes);
  const conjuntoFechas = new Set<FechaISO>(fechas);
  const personas = new Map<Id, Persona>(datos.personas.map((p) => [p.id, p]));
  const puestos = new Map<Id, Puesto>(datos.puestos.map((p) => [p.id, p]));
  const areas = new Map<Id, Area>(datos.areas.map((a) => [a.id, a]));

  const cierres = new Map<Id, { desde: FechaISO; hasta: FechaISO }[]>();
  const ausencias = new Map<Id, { desde: FechaISO; hasta: FechaISO; tramo: Intervalo | null }[]>();
  for (const inc of datos.incidencias) {
    if (inc.tipo === 'puestoCerrado') {
      const l = cierres.get(inc.puestoId) ?? [];
      l.push({ desde: inc.desde, hasta: inc.hasta });
      cierres.set(inc.puestoId, l);
    } else {
      const l = ausencias.get(inc.personaId) ?? [];
      l.push({ desde: inc.desde, hasta: inc.hasta, tramo: inc.tramo });
      ausencias.set(inc.personaId, l);
    }
  }

  const horario = (puestoId: Id, fecha: FechaISO): HorarioDia | null => {
    const puesto = puestos.get(puestoId);
    if (!puesto || !puesto.activo) return null;
    const area = areas.get(puesto.areaId);
    if (!area || !area.activa) return null;
    if (!enRango(fecha, puesto.vigenteDesde, puesto.vigenteHasta)) return null;
    const dia = diaSemana(fecha);
    if (!puesto.dias.includes(dia)) return null;
    if ((cierres.get(puestoId) ?? VACIO).some((c) => enRango(fecha, c.desde, c.hasta))) return null;
    return horarioDe(puesto, dia);
  };

  const franja = (puestoId: Id, fecha: FechaISO, franjaId: Id): Franja | undefined => {
    const puesto = puestos.get(puestoId);
    if (!puesto) return undefined;
    return horarioDe(puesto, diaSemana(fecha)).franjas.find((f) => f.id === franjaId);
  };

  const intervalo = (a: Asignacion): Intervalo | undefined => {
    if (a.tipo === 'pausa') return { inicio: a.inicio, fin: a.fin };
    const f = franja(a.puestoId, a.fecha, a.franjaId);
    return f ? { inicio: f.inicio, fin: f.fin } : undefined;
  };

  const estatico = previo ?? construirEstatico(datos, fechas, horario);

  // Asignaciones de la semana, ordenadas por fecha e inicio.
  const lista = entrada
    .filter((a) => conjuntoFechas.has(a.fecha))
    .map((a) => ({ a, inicio: intervalo(a)?.inicio ?? 0 }))
    .sort((x, y) => (x.a.fecha === y.a.fecha ? x.inicio - y.inicio : x.a.fecha < y.a.fecha ? -1 : 1))
    .map((x) => x.a);

  const porHueco = new Map<ClaveHueco, AsignacionPuesto>();
  const porPersona = new Map<Id, Asignacion[]>();
  const porPersonaDia = new Map<string, Asignacion[]>();
  const pausas = new Map<string, AsignacionPausa[]>();
  const minDia = new Map<string, Minutos>();
  const minSemana = new Map<Id, Minutos>();
  const jornadas = new Map<string, Intervalo>();
  const dias = new Map<Id, Set<FechaISO>>();

  for (const a of lista) {
    const kd = `${a.personaId}|${a.fecha}`;
    (porPersona.get(a.personaId) ?? porPersona.set(a.personaId, []).get(a.personaId)!).push(a);
    (porPersonaDia.get(kd) ?? porPersonaDia.set(kd, []).get(kd)!).push(a);
    if (a.tipo === 'pausa') {
      (pausas.get(kd) ?? pausas.set(kd, []).get(kd)!).push(a);
      continue;
    }
    const k = clave(a.fecha, a.puestoId, a.franjaId, a.plaza);
    if (!porHueco.has(k)) porHueco.set(k, a);
    const iv = intervalo(a);
    // Un puesto cerrado, inactivo o que no abre ese día no cuenta horas (coberturaCompleta ya avisa).
    if (!iv || horario(a.puestoId, a.fecha) === null) continue;
    minDia.set(kd, (minDia.get(kd) ?? 0) + (iv.fin - iv.inicio));
    minSemana.set(a.personaId, (minSemana.get(a.personaId) ?? 0) + (iv.fin - iv.inicio));
    const j = jornadas.get(kd);
    jornadas.set(kd, j ? { inicio: Math.min(j.inicio, iv.inicio), fin: Math.max(j.fin, iv.fin) } : { ...iv });
    (dias.get(a.personaId) ?? dias.set(a.personaId, new Set()).get(a.personaId)!).add(a.fecha);
  }

  const diasOrdenados = new Map<Id, FechaISO[]>();
  for (const [id, set] of dias) diasOrdenados.set(id, [...set].sort());

  const indice: IndiceSemana = {
    lunes,
    fechas,
    diaDe: (fecha): DiaSemana => diaSemana(fecha),
    persona: (id) => personas.get(id),
    puesto: (id) => puestos.get(id),
    area: (id) => areas.get(id),
    horario,
    franja,
    intervalo,
    huecos: () => estatico.huecos,
    hueco: (c) => estatico.porClave.get(c),
    claveDe: (a) => clave(a.fecha, a.puestoId, a.franjaId, a.plaza),
    asignaciones: () => lista,
    enHueco: (c) => porHueco.get(c),
    dePersona: (id) => porPersona.get(id) ?? VACIO,
    dePersonaDia: (id, fecha) => porPersonaDia.get(`${id}|${fecha}`) ?? VACIO,
    pausasDe: (id, fecha) => pausas.get(`${id}|${fecha}`) ?? VACIO,
    minutosDia: (id, fecha) => minDia.get(`${id}|${fecha}`) ?? 0,
    minutosSemana: (id) => minSemana.get(id) ?? 0,
    jornada: (id, fecha) => {
      const j = jornadas.get(`${id}|${fecha}`);
      return j ? { ...j } : null;
    },
    diasTrabajados: (id) => diasOrdenados.get(id) ?? VACIO,
    ausente: (id, fecha, iv) =>
      (ausencias.get(id) ?? VACIO).some(
        (x) => enRango(fecha, x.desde, x.hasta) && (x.tramo === null || seSolapan(x.tramo, iv)),
      ),
    enPlantilla: (id, fecha) => {
      const p = personas.get(id);
      if (!p || !p.activa) return false;
      return (p.alta === null || p.alta <= fecha) && (p.baja === null || fecha < p.baja);
    },
    equipoEfectivo: (id, _fecha) => {
      const p = personas.get(id);
      if (!p) return 'A';
      if (p.patron.length === 0) return p.equipo;
      const ciclo = semanaDelCiclo(datos.rotacion, lunes).indice;
      return p.patron.find((x) => x.indiceCiclo === ciclo)?.equipo ?? p.equipo;
    },
  };
  estaticos.set(indice, estatico);
  return indice;
}

export function crearIndice(
  datos: DatosPlanificacion,
  lunes: FechaISO,
  asignaciones: readonly Asignacion[],
): IndiceSemana {
  return construir(datos, lunes, asignaciones);
}

/** Índice nuevo con `a` añadida (para comprobar una candidata). El original no cambia. */
export function conAsignacion(indice: IndiceSemana, datos: DatosPlanificacion, a: Asignacion): IndiceSemana {
  return construir(datos, indice.lunes, [...indice.asignaciones(), a], estaticos.get(indice));
}
