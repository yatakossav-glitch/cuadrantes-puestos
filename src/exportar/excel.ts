/** Exportación de cuadrantes a tablas de solo texto para pegar en Excel (§7). Funciones puras. */
import { NOMBRES_DIA_CORTO, enRango, fechasSemana } from '../modelo/fechas';
import { aHora, duracion, formatearIntervalo } from '../modelo/horas';
import type {
  Asignacion,
  AsignacionPausa,
  AsignacionPuesto,
  Config,
  DiaSemana,
  EstadoApp,
  FechaISO,
  Id,
  Intervalo,
  Persona,
  Puesto,
} from '../modelo/tipos';
import { horarioDe } from '../edicion/horario';

export interface OpcionesExportar {
  sinAlias: boolean;
}
/** filas[0] = cabecera; solo texto, sin iconos. */
export interface TablaExportada {
  titulo: string;
  filas: string[][];
}

/** 'EMP-07' o 'EMP-07 (alias)'. */
export function etiquetaExportada(p: Persona, o: OpcionesExportar): string {
  const alias = p.alias?.trim();
  return !o.sinAlias && alias ? `${p.codigo} (${alias})` : p.codigo;
}

// ───────────────────────── Utilidades ─────────────────────────

/** '2026-11-30' → '30/11'. */
function diaMes(fecha: FechaISO): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}
/** '2026-11-30' → '30/11/2026'. */
function fechaLarga(fecha: FechaISO): string {
  return `${diaMes(fecha)}/${fecha.slice(0, 4)}`;
}
function cabeceraDia(fecha: FechaISO, dia: number): string {
  return `${NOMBRES_DIA_CORTO[dia]} ${diaMes(fecha)}`;
}
/** 450 → '7:30'. */
function horasMinutos(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}
function porCodigo(a: Persona, b: Persona): number {
  return a.codigo.localeCompare(b.codigo, 'es', { numeric: true });
}
function claveIntervalo(i: Intervalo): string {
  return `${i.inicio}-${i.fin}`;
}

function asignacionesSemana(estado: EstadoApp, lunes: FechaISO): Asignacion[] {
  return estado.cuadrantes[lunes]?.asignaciones ?? [];
}

/** Intervalo de la franja: primero el horario de ese día; si no existe (fuera de horario), cualquier horario del puesto. */
function intervaloDeFranja(puesto: Puesto, dia: DiaSemana, franjaId: Id): Intervalo | null {
  const delDia = horarioDe(puesto, dia).franjas.find((f) => f.id === franjaId);
  if (delDia) return delDia;
  for (const h of [puesto.horario.general, ...Object.values(puesto.horario.porDia)]) {
    const f = h.franjas.find((x) => x.id === franjaId);
    if (f) return f;
  }
  return null;
}

interface PuestoResuelto {
  a: AsignacionPuesto;
  puesto: Puesto;
  dia: DiaSemana;
  intervalo: Intervalo;
}

function diaDe(fechas: FechaISO[], fecha: FechaISO): DiaSemana | null {
  const i = fechas.indexOf(fecha);
  return i < 0 ? null : (i as DiaSemana);
}

function resolverPuestos(estado: EstadoApp, lunes: FechaISO): PuestoResuelto[] {
  const fechas = fechasSemana(lunes);
  const resultado: PuestoResuelto[] = [];
  for (const a of asignacionesSemana(estado, lunes)) {
    if (a.tipo !== 'puesto') continue;
    const puesto = estado.puestos.find((p) => p.id === a.puestoId);
    const dia = diaDe(fechas, a.fecha);
    if (!puesto || dia === null) continue;
    const intervalo = intervaloDeFranja(puesto, dia, a.franjaId);
    if (intervalo) resultado.push({ a, puesto, dia, intervalo });
  }
  return resultado;
}

// ───────────────────────── Por área ─────────────────────────

interface Linea {
  etiqueta: string;
  franja: Intervalo;
  puesto: Puesto;
  plaza: number;
}

export function tablaPorArea(
  estado: EstadoApp,
  lunes: FechaISO,
  areaId: Id,
  disposicion: Config['exportacionArea'],
  o: OpcionesExportar,
): TablaExportada {
  const area = estado.areas.find((a) => a.id === areaId);
  const fechas = fechasSemana(lunes);
  const titulo = `${area?.nombre ?? 'Área'} · semana del ${fechaLarga(lunes)}`;
  const personas = new Map(estado.personas.map((p) => [p.id, p]));
  const etiquetaPersona = (id: Id): string => {
    const p = personas.get(id);
    return p ? etiquetaExportada(p, o) : '';
  };
  const puestos =
    area && area.activa
      ? estado.puestos.filter((p) => p.areaId === areaId && p.activo).sort((a, b) => a.orden - b.orden)
      : [];
  const asignaciones = asignacionesSemana(estado, lunes);

  // Líneas: puesto × plaza × franja (unión ordenada de las franjas de la semana).
  const lineas: Linea[] = [];
  for (const puesto of puestos) {
    const unicas = new Map<string, Intervalo>();
    puesto.dias.forEach((d) => {
      for (const f of horarioDe(puesto, d).franjas) unicas.set(claveIntervalo(f), { inicio: f.inicio, fin: f.fin });
    });
    const franjas = [...unicas.values()].sort((a, b) => a.inicio - b.inicio || a.fin - b.fin);
    for (let plaza = 0; plaza < puesto.plazas; plaza += 1) {
      const etiqueta = puesto.plazas > 1 ? `${puesto.nombre} · plaza ${plaza + 1}` : puesto.nombre;
      for (const franja of franjas) lineas.push({ etiqueta, franja, puesto, plaza });
    }
  }

  const celda = (l: Linea, indiceDia: number): string => {
    const dia = indiceDia as DiaSemana;
    if (!l.puesto.dias.includes(dia) || !enRango(fechas[indiceDia]!, l.puesto.vigenteDesde, l.puesto.vigenteHasta)) return '—';
    const franjaDia = horarioDe(l.puesto, dia).franjas.find((f) => claveIntervalo(f) === claveIntervalo(l.franja));
    if (!franjaDia) return '—';
    const a = asignaciones.find(
      (x): x is AsignacionPuesto =>
        x.tipo === 'puesto' &&
        x.fecha === fechas[indiceDia] &&
        x.puestoId === l.puesto.id &&
        x.franjaId === franjaDia.id &&
        x.plaza === l.plaza,
    );
    return a ? etiquetaPersona(a.personaId) : '';
  };

  // Comidas: pausas de quienes trabajan ese día en el área.
  const comidas = fechas.map((fecha) => {
    const enArea = new Set(
      asignaciones
        .filter((a): a is AsignacionPuesto => a.tipo === 'puesto' && a.fecha === fecha && puestos.some((p) => p.id === a.puestoId))
        .map((a) => a.personaId),
    );
    return asignaciones
      .filter((a): a is AsignacionPausa => a.tipo === 'pausa' && a.fecha === fecha && enArea.has(a.personaId))
      .sort((a, b) => a.inicio - b.inicio)
      .map((a) => `${etiquetaPersona(a.personaId)} ${formatearIntervalo(a)}`)
      .join('; ');
  });
  const hayComidas = comidas.some((c) => c !== '');

  const cabeceraDias = fechas.map((f, i) => cabeceraDia(f, i));
  let filas: string[][];
  if (disposicion === 'diasEnColumnas') {
    filas = [['Puesto', 'Franja', ...cabeceraDias]];
    for (const l of lineas) filas.push([l.etiqueta, formatearIntervalo(l.franja), ...fechas.map((_, i) => celda(l, i))]);
    if (hayComidas) filas.push(['Comidas', '', ...comidas]);
  } else {
    filas = [['Día', ...lineas.map((l) => `${l.etiqueta} ${formatearIntervalo(l.franja)}`), ...(hayComidas ? ['Comidas'] : [])]];
    fechas.forEach((_, i) => {
      filas.push([cabeceraDias[i]!, ...lineas.map((l) => celda(l, i)), ...(hayComidas ? [comidas[i]!] : [])]);
    });
  }
  return { titulo, filas };
}

// ───────────────────────── Por persona ─────────────────────────

export function tablaPorPersona(estado: EstadoApp, lunes: FechaISO, o: OpcionesExportar): TablaExportada {
  const fechas = fechasSemana(lunes);
  const titulo = `Por persona · semana del ${fechaLarga(lunes)}`;
  const puestos = resolverPuestos(estado, lunes);
  const pausas = asignacionesSemana(estado, lunes).filter((a) => a.tipo === 'pausa');
  const ids = new Set<Id>([...puestos.map((r) => r.a.personaId), ...pausas.map((p) => p.personaId)]);
  const personas = estado.personas.filter((p) => ids.has(p.id)).sort(porCodigo);

  const filas: string[][] = [['Persona', ...fechas.map((f, i) => cabeceraDia(f, i)), 'Horas']];
  for (const persona of personas) {
    let total = 0;
    const celdas = fechas.map((fecha) => {
      const propios = puestos
        .filter((r) => r.a.personaId === persona.id && r.a.fecha === fecha)
        .sort((a, b) => a.intervalo.inicio - b.intervalo.inicio);
      const elementos: { inicio: number; texto: string }[] = [];
      let actual: { puesto: Puesto; inicio: number; fin: number } | null = null;
      const cerrar = () => {
        if (actual)
          elementos.push({
            inicio: actual.inicio,
            texto: `${actual.puesto.nombre} ${formatearIntervalo({ inicio: actual.inicio, fin: actual.fin })}`,
          });
        actual = null;
      };
      for (const r of propios) {
        total += duracion(r.intervalo);
        if (actual && actual.puesto.id === r.puesto.id && actual.fin === r.intervalo.inicio) actual.fin = r.intervalo.fin;
        else {
          cerrar();
          actual = { puesto: r.puesto, inicio: r.intervalo.inicio, fin: r.intervalo.fin };
        }
      }
      cerrar();
      for (const p of pausas) {
        if (p.personaId === persona.id && p.fecha === fecha) elementos.push({ inicio: p.inicio, texto: `Comida ${formatearIntervalo(p)}` });
      }
      return elementos.sort((a, b) => a.inicio - b.inicio).map((e) => e.texto).join('; ');
    });
    filas.push([etiquetaExportada(persona, o), ...celdas, horasMinutos(total)]);
  }
  return { titulo, filas };
}

// ───────────────────────── Listado plano ─────────────────────────

export function tablaPlana(estado: EstadoApp, lunes: FechaISO, o: OpcionesExportar): TablaExportada {
  const fechas = fechasSemana(lunes);
  const titulo = `Listado completo · semana del ${fechaLarga(lunes)}`;
  const personas = new Map(estado.personas.map((p) => [p.id, p]));
  const etiqueta = (id: Id) => {
    const p = personas.get(id);
    return p ? etiquetaExportada(p, o) : '';
  };
  const areas = new Map(estado.areas.map((a) => [a.id, a]));

  interface Fila {
    fecha: FechaISO;
    ordenArea: number;
    ordenPuesto: number;
    inicio: number;
    plaza: number;
    celdas: string[];
  }
  const registros: Fila[] = [];
  for (const r of resolverPuestos(estado, lunes)) {
    const area = areas.get(r.puesto.areaId);
    registros.push({
      fecha: r.a.fecha,
      ordenArea: area?.orden ?? 0,
      ordenPuesto: r.puesto.orden,
      inicio: r.intervalo.inicio,
      plaza: r.a.plaza,
      celdas: [
        fechaLarga(r.a.fecha),
        NOMBRES_DIA_CORTO[r.dia],
        area?.nombre ?? '',
        r.puesto.nombre,
        String(r.a.plaza + 1),
        formatearIntervalo(r.intervalo),
        aHora(r.intervalo.inicio),
        aHora(r.intervalo.fin),
        String(duracion(r.intervalo)),
        etiqueta(r.a.personaId),
      ],
    });
  }
  for (const p of asignacionesSemana(estado, lunes)) {
    const dia = p.tipo === 'pausa' ? diaDe(fechas, p.fecha) : null;
    if (p.tipo !== 'pausa' || dia === null) continue;
    registros.push({
      fecha: p.fecha,
      ordenArea: Number.MAX_SAFE_INTEGER,
      ordenPuesto: 0,
      inicio: p.inicio,
      plaza: 0,
      celdas: [
        fechaLarga(p.fecha),
        NOMBRES_DIA_CORTO[dia],
        '',
        'Comida',
        '',
        formatearIntervalo(p),
        aHora(p.inicio),
        aHora(p.fin),
        String(duracion(p)),
        etiqueta(p.personaId),
      ],
    });
  }
  registros.sort(
    (a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      a.ordenArea - b.ordenArea ||
      a.ordenPuesto - b.ordenPuesto ||
      a.inicio - b.inicio ||
      a.plaza - b.plaza,
  );
  return {
    titulo,
    filas: [
      ['Fecha', 'Día', 'Área', 'Puesto', 'Plaza', 'Franja', 'Inicio', 'Fin', 'Minutos', 'Persona'],
      ...registros.map((r) => r.celdas),
    ],
  };
}

// ───────────────────────── Serialización ─────────────────────────

/** Neutraliza la inyección de fórmulas: si la celda empieza (tras espacios) por = + - @, lleva un apóstrofo delante. */
function neutralizarFormula(celda: string): string {
  return /^\s*[=+\-@]/.test(celda) ? `'${celda}` : celda;
}

/** Texto separado por tabuladores; tabuladores y saltos dentro de las celdas pasan a espacio. */
export function aTSV(t: TablaExportada): string {
  return t.filas.map((fila) => fila.map((c) => neutralizarFormula(c.replace(/[\t\r\n]+/g, ' '))).join('\t')).join('\n');
}

function escaparHTML(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Tabla HTML con bordes finos, sin colores ni iconos. */
export function aHTML(t: TablaExportada): string {
  const estilo = 'border:1px solid #000;padding:2px 4px';
  const filas = t.filas
    .map((fila, i) => {
      const etiqueta = i === 0 ? 'th' : 'td';
      return `<tr>${fila.map((c) => `<${etiqueta} style="${estilo}">${escaparHTML(neutralizarFormula(c))}</${etiqueta}>`).join('')}</tr>`;
    })
    .join('');
  return `<table style="border-collapse:collapse;border:1px solid #000"><tbody>${filas}</tbody></table>`;
}
