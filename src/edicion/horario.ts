/** Edición pura del horario de un puesto (franjas y bloques). */
import { aHora, formatearIntervalo, intervaloValido, seSolapan } from '../modelo/horas';
import { NOMBRES_DIA } from '../modelo/fechas';
import type { Bloque, DiaSemana, Franja, HorarioDia, Id, Intervalo, Puesto } from '../modelo/tipos';

type Dia = DiaSemana | 'general';

export function horarioDe(puesto: Puesto, dia: DiaSemana): HorarioDia {
  return puesto.horario.porDia[dia] ?? puesto.horario.general;
}

function todosLosHorarios(puesto: Puesto): HorarioDia[] {
  return [puesto.horario.general, ...Object.values(puesto.horario.porDia)];
}

/** Siguiente id 'prefijo-<n>' que no esté en uso en ningún horario del puesto. */
function idLibre(prefijo: string, usados: Set<Id>): Id {
  let n = 1;
  while (usados.has(`${prefijo}-${n}`)) n += 1;
  const id = `${prefijo}-${n}`;
  usados.add(id);
  return id;
}

function idsUsados(puesto: Puesto, campo: 'franjas' | 'bloques'): Set<Id> {
  return new Set(todosLosHorarios(puesto).flatMap((h) => h[campo].map((x) => x.id)));
}

export function nuevoIdFranja(puesto: Puesto): Id {
  return idLibre('f', idsUsados(puesto, 'franjas'));
}

function nuevoIdBloque(puesto: Puesto): Id {
  return idLibre('b', idsUsados(puesto, 'bloques'));
}

function conHorario(puesto: Puesto, dia: Dia, h: HorarioDia): Puesto {
  if (dia === 'general') return { ...puesto, horario: { ...puesto.horario, general: h } };
  return { ...puesto, horario: { ...puesto.horario, porDia: { ...puesto.horario.porDia, [dia]: h } } };
}

function horarioEn(puesto: Puesto, dia: Dia): HorarioDia {
  if (dia === 'general') return puesto.horario.general;
  const h = puesto.horario.porDia[dia];
  if (!h) throw new Error('Ese día usa el horario de todos los días: personalízalo antes.');
  return h;
}

const porInicio = (a: Intervalo, b: Intervalo): number => a.inicio - b.inicio || a.fin - b.fin;

export function anadirFranja(puesto: Puesto, dia: Dia, intervalo: Intervalo): Puesto {
  const h = horarioEn(puesto, dia);
  const franja: Franja = { id: nuevoIdFranja(puesto), inicio: intervalo.inicio, fin: intervalo.fin };
  return conHorario(puesto, dia, { ...h, franjas: [...h.franjas, franja].sort(porInicio) });
}

export function actualizarFranja(puesto: Puesto, dia: Dia, franjaId: Id, intervalo: Intervalo): Puesto {
  const h = horarioEn(puesto, dia);
  const franjas = h.franjas
    .map((f) => (f.id === franjaId ? { ...f, inicio: intervalo.inicio, fin: intervalo.fin } : f))
    .sort(porInicio);
  return conHorario(puesto, dia, { ...h, franjas });
}

/** Quita la franja de su bloque; un bloque con menos de 2 franjas desaparece. */
export function borrarFranja(puesto: Puesto, dia: Dia, franjaId: Id): Puesto {
  const h = horarioEn(puesto, dia);
  const bloques = h.bloques
    .map((b) => ({ ...b, franjaIds: b.franjaIds.filter((x) => x !== franjaId) }))
    .filter((b) => b.franjaIds.length >= 2);
  return conHorario(puesto, dia, { franjas: h.franjas.filter((f) => f.id !== franjaId), bloques });
}

function esConsecutiva(franjas: readonly Franja[]): Franja | null {
  // Devuelve la primera franja que no empieza donde acaba la anterior.
  for (let i = 1; i < franjas.length; i += 1) {
    if (franjas[i]!.inicio !== franjas[i - 1]!.fin) return franjas[i]!;
  }
  return null;
}

/** null = pueden formar un bloque; si no, el motivo en español. */
export function puedenFormarBloque(horario: HorarioDia, franjaIds: Id[]): string | null {
  if (new Set(franjaIds).size !== franjaIds.length) return 'Hay una franja repetida en la selección';
  if (franjaIds.length < 2) return 'Un bloque necesita al menos 2 franjas';
  const franjas: Franja[] = [];
  for (const id of franjaIds) {
    const f = horario.franjas.find((x) => x.id === id);
    if (!f) return 'Alguna de las franjas elegidas ya no existe';
    franjas.push(f);
  }
  for (const f of franjas) {
    const b = horario.bloques.find((x) => x.franjaIds.includes(f.id));
    if (b) return `La franja ${formatearIntervalo(f)} ya está en el bloque «${b.nombre}»`;
  }
  franjas.sort(porInicio);
  const mala = esConsecutiva(franjas);
  if (mala) {
    return `Las franjas deben ser consecutivas: ${formatearIntervalo(mala)} no empieza donde acaba la anterior`;
  }
  return null;
}

export function crearBloque(puesto: Puesto, dia: Dia, franjaIds: Id[], nombre?: string): Puesto {
  const h = horarioEn(puesto, dia);
  const motivo = puedenFormarBloque(h, franjaIds);
  if (motivo) throw new Error(motivo);
  const franjas = franjaIds.map((id) => h.franjas.find((f) => f.id === id)!).sort(porInicio);
  const bloque: Bloque = {
    id: nuevoIdBloque(puesto),
    nombre: nombre?.trim() || `${aHora(franjas[0]!.inicio)}–${aHora(franjas[franjas.length - 1]!.fin)}`,
    franjaIds: franjas.map((f) => f.id),
  };
  return conHorario(puesto, dia, { ...h, bloques: [...h.bloques, bloque] });
}

export function deshacerBloque(puesto: Puesto, dia: Dia, bloqueId: Id): Puesto {
  const h = horarioEn(puesto, dia);
  return conHorario(puesto, dia, { ...h, bloques: h.bloques.filter((b) => b.id !== bloqueId) });
}

/** Copia el horario general a `porDia[dia]` con ids de franja y bloque nuevos. */
export function personalizarDia(puesto: Puesto, dia: DiaSemana): Puesto {
  const usadasF = idsUsados(puesto, 'franjas');
  const usadosB = idsUsados(puesto, 'bloques');
  const mapa = new Map<Id, Id>();
  const franjas = puesto.horario.general.franjas.map((f) => {
    const id = idLibre('f', usadasF);
    mapa.set(f.id, id);
    return { ...f, id };
  });
  const bloques = puesto.horario.general.bloques.map((b) => ({
    ...b,
    id: idLibre('b', usadosB),
    franjaIds: b.franjaIds.map((x) => mapa.get(x) ?? x),
  }));
  return conHorario(puesto, dia, { franjas, bloques });
}

export function quitarPersonalizacion(puesto: Puesto, dia: DiaSemana): Puesto {
  const { [dia]: _quitado, ...resto } = puesto.horario.porDia;
  return { ...puesto, horario: { ...puesto.horario, porDia: resto } };
}

/** Errores de un horario; `etiqueta` es p. ej. «Caja 1 · lunes». */
export function erroresHorario(horario: HorarioDia, etiqueta: string): string[] {
  const errores: string[] = [];
  if (horario.franjas.length === 0) {
    errores.push(`${etiqueta}: no tiene ninguna franja`);
    return errores;
  }
  const validas: Franja[] = [];
  for (const f of horario.franjas) {
    if (intervaloValido(f)) validas.push(f);
    else errores.push(`${etiqueta}: la franja ${formatearIntervalo(f)} debe acabar después de empezar y estar entre 00:00 y 24:00`);
  }
  const ordenadas = [...validas].sort(porInicio);
  for (let i = 0; i < ordenadas.length; i += 1) {
    for (let j = i + 1; j < ordenadas.length; j += 1) {
      if (seSolapan(ordenadas[i]!, ordenadas[j]!)) {
        errores.push(`${etiqueta}: las franjas ${formatearIntervalo(ordenadas[i]!)} y ${formatearIntervalo(ordenadas[j]!)} se solapan`);
      }
    }
  }
  const enBloque = new Map<Id, string>();
  for (const b of horario.bloques) {
    if (b.franjaIds.length < 2) {
      errores.push(`${etiqueta}: el bloque «${b.nombre}» necesita al menos 2 franjas`);
    }
    const miembros: Franja[] = [];
    for (const id of b.franjaIds) {
      const f = horario.franjas.find((x) => x.id === id);
      if (!f) {
        errores.push(`${etiqueta}: el bloque «${b.nombre}» incluye una franja que no existe`);
        continue;
      }
      miembros.push(f);
      const previo = enBloque.get(id);
      if (previo !== undefined) {
        errores.push(`${etiqueta}: la franja ${formatearIntervalo(f)} está en dos bloques («${previo}» y «${b.nombre}»)`);
      } else {
        enBloque.set(id, b.nombre);
      }
    }
    const mala = esConsecutiva([...miembros].sort(porInicio));
    if (mala) errores.push(`${etiqueta}: las franjas del bloque «${b.nombre}» no son consecutivas (${formatearIntervalo(mala)})`);
  }
  return errores;
}

/** Nombre de día para etiquetas de horario. */
export function etiquetaDia(dia: Dia): string {
  return dia === 'general' ? 'Todos los días' : NOMBRES_DIA[dia];
}
