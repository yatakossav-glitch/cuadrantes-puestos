/**
 * Validación de estructura y comprobaciones de coherencia del estado persistido.
 * Funciones puras, sin DOM ni almacenamiento.
 */
import { NOMBRES_DIA, diaSemana, diferenciaDias, esFechaISO } from '../modelo/fechas';
import type {
  EstadoApp,
  HorarioDia,
  IconoArea,
  Persona,
  Puesto,
  TipoReglaGeneral,
  TipoRestriccion,
} from '../modelo/tipos';

/**
 * Clave de comparación de códigos: solo letras y dígitos, en mayúsculas y sin ceros
 * a la izquierda en cada grupo numérico. 'EMP-07', 'emp 7' y 'EMP_007' → 'EMP7'.
 */
export function normalizarCodigo(codigo: string): string {
  return codigo
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/\d+/g, (g) => g.replace(/^0+(?=\d)/, ''));
}

export const TIPOS_REGLA_GENERAL = [
  'sinSolapes',
  'coberturaCompleta',
  'personaDisponible',
  'habilitacionRequerida',
  'maxMinutosDia',
  'descansoEntreJornadas',
  'noRepetirConsecutivas',
  'mismaPersonaBloque',
  'rotarEntreBloques',
  'exclusividadDiaria',
  'respetarEquipo',
  'maxDiasSemana',
  'maxFranjasSiSoloArea',
  'comidasEscalonadas',
  'repartoEquitativo',
] as const satisfies readonly TipoReglaGeneral[];

export const TIPOS_RESTRICCION = [
  'diasDisponibles',
  'diasNoDisponibles',
  'noAntesDe',
  'noDespuesDe',
  'maxMinutosDia',
  'minutosSemana',
  'maxDiasSemana',
  'soloFinesDeSemana',
  'noAsignarA',
  'pausaMinima',
] as const satisfies readonly TipoRestriccion[];

export const ICONOS_AREA = [
  'caja', 'paquete', 'bloques', 'libro', 'tienda', 'etiqueta', 'reloj', 'usuarios',
] as const satisfies readonly IconoArea[];

// ───────────────────────── Validación de estructura ─────────────────────────

type Obj = Record<string, unknown>;
const esObjeto = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const MAX_ERRORES = 5;

class Comprobador {
  readonly errores: string[] = [];
  error(msg: string): void {
    if (this.errores.length < MAX_ERRORES) this.errores.push(msg);
  }
  objeto(v: unknown, ruta: string): v is Obj {
    if (!esObjeto(v)) {
      this.error(`${ruta} debe ser un objeto.`);
      return false;
    }
    return true;
  }
  lista(v: unknown, ruta: string): v is unknown[] {
    if (!Array.isArray(v)) {
      this.error(`Falta la lista «${ruta}» o no es una lista.`);
      return false;
    }
    return true;
  }
  texto(o: Obj, ruta: string, campo: string): void {
    if (typeof o[campo] !== 'string') this.error(`${ruta}: falta «${campo}» o no es un texto.`);
  }
  numero(o: Obj, ruta: string, campo: string): void {
    if (!esNumero(o[campo])) this.error(`${ruta}: falta «${campo}» o no es un número.`);
  }
  booleano(o: Obj, ruta: string, campo: string): void {
    if (typeof o[campo] !== 'boolean') this.error(`${ruta}: falta «${campo}» o no es verdadero/falso.`);
  }
  listaCampo(o: Obj, ruta: string, campo: string): unknown[] | null {
    const v = o[campo];
    if (!Array.isArray(v)) {
      this.error(`${ruta}: falta «${campo}» o no es una lista.`);
      return null;
    }
    return v;
  }
  /** Texto o null. */
  textoONulo(o: Obj, ruta: string, campo: string): void {
    if (o[campo] !== null && typeof o[campo] !== 'string') this.error(`${ruta}: «${campo}» debe ser un texto o estar vacío (null).`);
  }
  numeroONulo(o: Obj, ruta: string, campo: string): void {
    if (o[campo] !== null && !esNumero(o[campo])) this.error(`${ruta}: «${campo}» debe ser un número o estar vacío (null).`);
  }
  listaDeTextos(o: Obj, ruta: string, campo: string): void {
    const l = this.listaCampo(o, ruta, campo);
    if (l && !l.every((x) => typeof x === 'string')) this.error(`${ruta}: «${campo}» debe contener solo textos.`);
  }
  listaDeNumeros(o: Obj, ruta: string, campo: string): void {
    const l = this.listaCampo(o, ruta, campo);
    if (l && !l.every(esNumero)) this.error(`${ruta}: «${campo}» debe contener solo números.`);
  }
  intervalo(o: Obj, ruta: string): void {
    this.numero(o, ruta, 'inicio');
    this.numero(o, ruta, 'fin');
  }
  /** Fecha 'AAAA-MM-DD' real. */
  fecha(valor: unknown, ruta: string, campo: string): void {
    if (typeof valor === 'string' && !esFechaISO(valor)) {
      this.error(`${ruta}: «${campo}» no es una fecha válida (AAAA-MM-DD): «${valor}».`);
    }
  }
  fechaCampo(o: Obj, ruta: string, campo: string): void {
    this.fecha(o[campo], ruta, campo);
  }
  fechaONula(o: Obj, ruta: string, campo: string): void {
    this.fecha(o[campo], ruta, campo);
  }
  /** Campo obligatorio: fecha 'AAAA-MM-DD' real o null. */
  fechaObligatoriaONula(o: Obj, ruta: string, campo: string): void {
    if (o[campo] !== null && typeof o[campo] !== 'string') {
      this.error(`${ruta}: falta «${campo}» o no es una fecha (AAAA-MM-DD) ni está vacío (null).`);
      return;
    }
    this.fecha(o[campo], ruta, campo);
  }
  /** Día de la semana entero 0–6. */
  dias(valor: unknown, ruta: string, campo: string): void {
    const lista = Array.isArray(valor) ? valor : [valor];
    if (lista.some((d) => esNumero(d) && !(Number.isInteger(d) && d >= 0 && d <= 6))) {
      this.error(`${ruta}: «${campo}» contiene un día fuera de 0–6.`);
    }
  }
  /** Ids repetidos dentro de una lista de objetos. */
  idsUnicos(lista: readonly unknown[], ruta: string): void {
    const vistos = new Set<string>();
    for (const el of lista) {
      if (!esObjeto(el) || typeof el['id'] !== 'string') continue;
      if (vistos.has(el['id'])) this.error(`${ruta}: el id «${el['id']}» está repetido.`);
      vistos.add(el['id']);
    }
  }
  /** Recorre params buscando días (claves que empiezan por «dias»). */
  diasEnParams(v: unknown, ruta: string): void {
    if (Array.isArray(v)) v.forEach((x) => this.diasEnParams(x, ruta));
    else if (esObjeto(v)) {
      for (const [k, x] of Object.entries(v)) {
        if (k.startsWith('dias') && Array.isArray(x)) this.dias(x, `${ruta}.params`, k);
        else this.diasEnParams(x, ruta);
      }
    }
  }
  /** Recorre una lista de objetos con su ruta legible. */
  elementos(estado: Obj, coleccion: string, fn: (o: Obj, ruta: string) => void): void {
    const lista = estado[coleccion];
    if (!this.lista(lista, coleccion)) return;
    this.idsUnicos(lista, coleccion);
    lista.forEach((el, i) => {
      const ruta = `${coleccion}[${i + 1}]`;
      if (this.objeto(el, ruta)) fn(el, ruta);
    });
  }
}

function comprobarHorario(c: Comprobador, h: unknown, ruta: string): void {
  if (!c.objeto(h, ruta)) return;
  const franjas = c.listaCampo(h, ruta, 'franjas');
  if (franjas) c.idsUnicos(franjas, `${ruta}.franjas`);
  franjas?.forEach((f, i) => {
    const r = `${ruta}.franjas[${i + 1}]`;
    if (!c.objeto(f, r)) return;
    c.texto(f, r, 'id');
    c.intervalo(f, r);
  });
  const bloques = c.listaCampo(h, ruta, 'bloques');
  bloques?.forEach((b, i) => {
    const r = `${ruta}.bloques[${i + 1}]`;
    if (!c.objeto(b, r)) return;
    c.texto(b, r, 'id');
    c.texto(b, r, 'nombre');
    c.listaDeTextos(b, r, 'franjaIds');
  });
}

function comprobarAsignacion(c: Comprobador, a: Obj, ruta: string, conFecha: boolean): void {
  c.texto(a, ruta, 'id');
  if (conFecha) {
    c.texto(a, ruta, 'fecha');
    c.fechaCampo(a, ruta, 'fecha');
  } else {
    c.numero(a, ruta, 'dia');
    c.dias(a['dia'], ruta, 'dia');
  }
  c.texto(a, ruta, 'personaId');
  c.booleano(a, ruta, 'bloqueada');
  if (a.tipo === 'puesto') {
    c.texto(a, ruta, 'puestoId');
    c.texto(a, ruta, 'franjaId');
    c.numero(a, ruta, 'plaza');
  } else if (a.tipo === 'pausa') {
    c.intervalo(a, ruta);
  } else {
    c.error(`${ruta}: «tipo» debe ser «puesto» o «pausa».`);
  }
}

/** Comprobación manual de que `datos` tiene la forma de un `EstadoApp`. */
export function validarEstructura(datos: unknown): { ok: true; estado: EstadoApp } | { ok: false; error: string } {
  const c = new Comprobador();
  if (!esObjeto(datos)) return { ok: false, error: 'Los datos no tienen el formato esperado: se esperaba un objeto.' };

  if (c.objeto(datos['config'], 'config')) {
    const cfg = datos['config'] as Obj;
    c.numero(cfg, 'config', 'corteMananaTarde');
    c.numero(cfg, 'config', 'semilla');
    c.numero(cfg, 'config', 'limiteMotorMs');
    if (cfg['exportacionArea'] !== 'diasEnColumnas' && cfg['exportacionArea'] !== 'franjasEnColumnas') {
      c.error('config: «exportacionArea» debe ser «diasEnColumnas» o «franjasEnColumnas».');
    }
  }

  c.elementos(datos, 'areas', (a, r) => {
    for (const k of ['id', 'nombre', 'color', 'icono']) c.texto(a, r, k);
    if (typeof a['icono'] === 'string' && !(ICONOS_AREA as readonly string[]).includes(a['icono'])) {
      c.error(`${r}: «icono» «${a['icono']}» no es un icono válido.`);
    }
    c.numero(a, r, 'planta');
    c.numero(a, r, 'orden');
    c.booleano(a, r, 'activa');
  });

  c.elementos(datos, 'puestos', (p, r) => {
    for (const k of ['id', 'areaId', 'nombre']) c.texto(p, r, k);
    c.numero(p, r, 'plazas');
    c.numero(p, r, 'orden');
    c.booleano(p, r, 'activo');
    c.booleano(p, r, 'requiereHabilitacion');
    c.fechaObligatoriaONula(p, r, 'vigenteDesde');
    c.fechaObligatoriaONula(p, r, 'vigenteHasta');
    c.listaDeNumeros(p, r, 'dias');
    c.dias(p['dias'], r, 'dias');
    if (c.objeto(p['horario'], `${r}.horario`)) {
      const h = p['horario'] as Obj;
      comprobarHorario(c, h['general'], `${r}.horario.general`);
      if (c.objeto(h['porDia'], `${r}.horario.porDia`)) {
        for (const [dia, hd] of Object.entries(h['porDia'] as Obj)) {
          if (!/^[0-6]$/.test(dia)) c.error(`${r}.horario.porDia: el día «${dia}» está fuera de 0–6.`);
          comprobarHorario(c, hd, `${r}.horario.porDia[${dia}]`);
        }
      }
    }
  });

  c.elementos(datos, 'personas', (p, r) => {
    c.texto(p, r, 'id');
    c.texto(p, r, 'codigo');
    c.textoONulo(p, r, 'alias');
    if (p['equipo'] !== 'M' && p['equipo'] !== 'T' && p['equipo'] !== 'A') c.error(`${r}: «equipo» debe ser M, T o A.`);
    c.listaDeTextos(p, r, 'habilitaciones');
    c.booleano(p, r, 'activa');
    c.textoONulo(p, r, 'alta');
    c.textoONulo(p, r, 'baja');
    c.fechaONula(p, r, 'alta');
    c.fechaONula(p, r, 'baja');
    c.numeroONulo(p, r, 'contratoMinSemana');
    c.numeroONulo(p, r, 'objetivoCoberturaMinSemana');
    c.listaCampo(p, r, 'patron')?.forEach((x, i) => {
      const rr = `${r}.patron[${i + 1}]`;
      if (c.objeto(x, rr)) c.dias(x['diasLibres'], rr, 'diasLibres');
    });
    c.listaCampo(p, r, 'restricciones')?.forEach((x, i) => {
      const rr = `${r}.restricciones[${i + 1}]`;
      if (!c.objeto(x, rr)) return;
      c.texto(x, rr, 'id');
      c.texto(x, rr, 'tipo');
      c.booleano(x, rr, 'activa');
      c.booleano(x, rr, 'dura');
      c.numero(x, rr, 'peso');
      if (typeof x['tipo'] === 'string' && !(TIPOS_RESTRICCION as readonly string[]).includes(x['tipo'])) {
        c.error(`${rr}: el tipo de restricción «${x['tipo']}» no existe.`);
      }
      if (c.objeto(x['params'], `${rr}.params`)) c.diasEnParams(x['params'], rr);
    });
  });

  c.elementos(datos, 'reglas', (g, r) => {
    for (const k of ['id', 'tipo', 'nombre']) c.texto(g, r, k);
    c.booleano(g, r, 'activa');
    c.booleano(g, r, 'dura');
    c.numero(g, r, 'peso');
    if (!['pendiente', 'validada', 'descartada'].includes(String(g['estado']))) c.error(`${r}: «estado» no es válido.`);
    if (typeof g['tipo'] === 'string' && !(TIPOS_REGLA_GENERAL as readonly string[]).includes(g['tipo'])) {
      c.error(`${r}: el tipo de regla «${g['tipo']}» no existe.`);
    }
    if (c.objeto(g['params'], `${r}.params`)) c.diasEnParams(g['params'], r);
  });

  if (c.objeto(datos['rotacion'], 'rotacion')) {
    const rot = datos['rotacion'] as Obj;
    c.numero(rot, 'rotacion', 'longitudCiclo');
    c.texto(rot, 'rotacion', 'lunesReferencia');
    c.fechaCampo(rot, 'rotacion', 'lunesReferencia');
    c.listaDeTextos(rot, 'rotacion', 'etiquetas');
  }

  c.elementos(datos, 'semanasTipo', (s, r) => {
    c.texto(s, r, 'id');
    c.texto(s, r, 'nombre');
    c.numero(s, r, 'indiceCiclo');
    const asigs = c.listaCampo(s, r, 'asignaciones');
    if (asigs) c.idsUnicos(asigs, `${r}.asignaciones`);
    asigs?.forEach((a, i) => {
      const rr = `${r}.asignaciones[${i + 1}]`;
      if (c.objeto(a, rr)) comprobarAsignacion(c, a, rr, false);
    });
  });

  c.elementos(datos, 'incidencias', (inc, r) => {
    c.texto(inc, r, 'id');
    c.texto(inc, r, 'desde');
    c.texto(inc, r, 'hasta');
    c.fechaCampo(inc, r, 'desde');
    c.fechaCampo(inc, r, 'hasta');
    if (inc['tipo'] === 'ausencia') {
      c.texto(inc, r, 'personaId');
      if (inc['tramo'] !== null && c.objeto(inc['tramo'], `${r}.tramo`)) c.intervalo(inc['tramo'] as Obj, `${r}.tramo`);
    } else if (inc['tipo'] === 'puestoCerrado') {
      c.texto(inc, r, 'puestoId');
    } else {
      c.error(`${r}: «tipo» debe ser «ausencia» o «puestoCerrado».`);
    }
  });

  if (c.objeto(datos['horarios'], 'horarios')) {
    for (const [lunes, h] of Object.entries(datos['horarios'] as Obj)) {
      const r = `horarios[${lunes}]`;
      c.fecha(lunes, 'horarios', 'clave');
      if (!c.objeto(h, r)) continue;
      c.texto(h, r, 'lunes');
      c.fechaCampo(h, r, 'lunes');
      c.textoONulo(h, r, 'actualizado');
      c.listaCampo(h, r, 'turnos')?.forEach((t, i) => {
        const rr = `${r}.turnos[${i + 1}]`;
        if (!c.objeto(t, rr)) return;
        c.texto(t, rr, 'personaId');
        c.texto(t, rr, 'fecha');
        c.fechaCampo(t, rr, 'fecha');
        c.listaCampo(t, rr, 'tramos')?.forEach((tr, j) => {
          const rt = `${rr}.tramos[${j + 1}]`;
          if (!c.objeto(tr, rt)) return;
          c.intervalo(tr, rt);
          if (esNumero(tr['inicio']) && esNumero(tr['fin']) && !(tr['inicio'] >= 0 && tr['fin'] <= 1440 && tr['inicio'] < tr['fin'])) {
            c.error(`${rt}: el tramo debe tener inicio anterior al fin y estar entre 00:00 y 24:00.`);
          }
        });
      });
    }
  }

  if (c.objeto(datos['cuadrantes'], 'cuadrantes')) {
    for (const [lunes, cu] of Object.entries(datos['cuadrantes'] as Obj)) {
      const r = `cuadrantes[${lunes}]`;
      if (!c.objeto(cu, r)) continue;
      c.texto(cu, r, 'lunes');
      c.fecha(lunes, 'cuadrantes', 'clave');
      c.fechaCampo(cu, r, 'lunes');
      c.objeto(cu['meta'], `${r}.meta`);
      c.listaCampo(cu, r, 'asignaciones')?.forEach((a, i) => {
        const rr = `${r}.asignaciones[${i + 1}]`;
        if (c.objeto(a, rr)) comprobarAsignacion(c, a, rr, true);
      });
    }
  }

  if (c.errores.length > 0) {
    return { ok: false, error: `Los datos no tienen el formato esperado. ${c.errores.join(' ')}` };
  }
  return { ok: true, estado: datos as unknown as EstadoApp };
}

// ───────────────────────── Coherencia ─────────────────────────

const etiquetaHorario = (dia: string): string => (dia === 'general' ? 'horario general' : (NOMBRES_DIA[Number(dia)] ?? dia));

function horarios(p: Puesto): { dia: string; h: HorarioDia }[] {
  const lista = [{ dia: 'general', h: p.horario.general }];
  for (const [dia, h] of Object.entries(p.horario.porDia)) if (h) lista.push({ dia, h });
  return lista;
}

/** Horario efectivo de un puesto un día: el específico si existe, si no el general. */
function horarioEfectivo(p: Puesto, dia: number): HorarioDia {
  return (p.horario.porDia as Record<number, HorarioDia | undefined>)[dia] ?? p.horario.general;
}

/** Referencias a áreas y puestos dentro de unos params (claves areaIds, puestoIds, areaId). */
function referenciasEnParams(v: unknown, areas: string[] = [], puestos: string[] = []): { areas: string[]; puestos: string[] } {
  if (Array.isArray(v)) v.forEach((x) => referenciasEnParams(x, areas, puestos));
  else if (esObjeto(v)) {
    for (const [k, x] of Object.entries(v)) {
      if (k === 'areaIds' && Array.isArray(x)) areas.push(...x.filter((y): y is string => typeof y === 'string'));
      else if (k === 'puestoIds' && Array.isArray(x)) puestos.push(...x.filter((y): y is string => typeof y === 'string'));
      else if (k === 'areaId' && typeof x === 'string') areas.push(x);
      else referenciasEnParams(x, areas, puestos);
    }
  }
  return { areas, puestos };
}

/** Avisos legibles (no bloqueantes) sobre duplicados, referencias huérfanas y franjas mal formadas. */
export function comprobarCoherencia(estado: EstadoApp): string[] {
  const avisos: string[] = [];
  const areaIds = new Set(estado.areas.map((a) => a.id));
  const puestoPorId = new Map(estado.puestos.map((p) => [p.id, p] as const));
  const personaPorId = new Map<string, Persona>(estado.personas.map((p) => [p.id, p] as const));
  const nombrePersona = (id: string): string => personaPorId.get(id)?.codigo ?? id;
  const nombrePuesto = (id: string): string => puestoPorId.get(id)?.nombre ?? id;

  // Códigos duplicados o casi duplicados.
  const grupos = new Map<string, string[]>();
  for (const p of estado.personas) {
    const k = normalizarCodigo(p.codigo);
    grupos.set(k, [...(grupos.get(k) ?? []), p.codigo]);
  }
  for (const codigos of grupos.values()) {
    if (codigos.length < 2) continue;
    const iguales = new Set(codigos).size === 1;
    avisos.push(
      iguales
        ? `El código ${codigos[0]} está repetido ${codigos.length} veces.`
        : `Códigos casi iguales, probablemente la misma persona: ${codigos.join(', ')}.`,
    );
  }

  // Referencias huérfanas.
  for (const p of estado.puestos) {
    if (!areaIds.has(p.areaId)) avisos.push(`El puesto «${p.nombre}» pertenece a un área que no existe.`);
  }
  for (const per of estado.personas) {
    for (const h of per.habilitaciones) {
      if (!areaIds.has(h) && !puestoPorId.has(h)) avisos.push(`${per.codigo} tiene una habilitación para un área o puesto que no existe.`);
    }
  }
  const comprobarRefs = (params: unknown, donde: string): void => {
    const refs = referenciasEnParams(params);
    if (refs.areas.some((id) => !areaIds.has(id))) avisos.push(`${donde} se refiere a un área que no existe.`);
    if (refs.puestos.some((id) => !puestoPorId.has(id))) avisos.push(`${donde} se refiere a un puesto que no existe.`);
  };
  for (const regla of estado.reglas) comprobarRefs(regla.params, `La regla «${regla.nombre}»`);
  for (const per of estado.personas) {
    for (const r of per.restricciones) comprobarRefs(r.params, `Una restricción de ${per.codigo} (${r.tipo})`);
  }
  for (const p of estado.puestos) {
    for (const { dia, h } of horarios(p)) {
      const franjas = new Set(h.franjas.map((f) => f.id));
      const donde = etiquetaHorario(dia);
      for (const b of h.bloques) {
        if (b.franjaIds.some((id) => !franjas.has(id))) {
          avisos.push(`El bloque «${b.nombre}» de «${p.nombre}» (${donde}) incluye franjas que no existen.`);
        }
      }
      // Franjas mal formadas y solapadas dentro del mismo puesto y horario.
      for (const f of h.franjas) {
        if (f.fin <= f.inicio) avisos.push(`Una franja de «${p.nombre}» (${donde}) termina antes de empezar o dura cero minutos.`);
      }
      const orden = h.franjas.filter((f) => f.fin > f.inicio).sort((a, b) => a.inicio - b.inicio);
      for (let i = 1; i < orden.length; i++) {
        if (orden[i]!.inicio < orden[i - 1]!.fin) avisos.push(`Dos franjas de «${p.nombre}» (${donde}) se solapan.`);
      }
    }
  }
  const comprobarAsig = (
    a: { tipo: string; personaId: string; puestoId?: string; franjaId?: string },
    dia: number | null,
    donde: string,
  ): void => {
    if (!personaPorId.has(a.personaId)) avisos.push(`${donde}: asignación de una persona que no existe.`);
    if (a.tipo !== 'puesto') return;
    const p = a.puestoId ? puestoPorId.get(a.puestoId) : undefined;
    if (!p) avisos.push(`${donde}: asignación a un puesto que no existe (${nombrePersona(a.personaId)}).`);
    else if (a.franjaId && dia !== null) {
      if (!horarioEfectivo(p, dia).franjas.some((f) => f.id === a.franjaId)) {
        avisos.push(`${donde}: asignación de ${nombrePersona(a.personaId)} a una franja que no existe en «${p.nombre}» el ${NOMBRES_DIA[dia]}.`);
      }
    }
  };
  for (const [lunes, cu] of Object.entries(estado.cuadrantes)) {
    for (const a of cu.asignaciones) {
      comprobarAsig(a, esFechaISO(a.fecha) ? diaSemana(a.fecha) : null, `Semana del ${lunes}`);
    }
  }
  for (const s of estado.semanasTipo) {
    for (const a of s.asignaciones) comprobarAsig(a, a.dia, `Semana tipo «${s.nombre}»`);
  }
  for (const inc of estado.incidencias) {
    if (inc.tipo === 'ausencia' && !personaPorId.has(inc.personaId)) {
      avisos.push(`Una ausencia (${inc.desde}) es de una persona que no existe.`);
    }
    if (inc.tipo === 'puestoCerrado' && !puestoPorId.has(inc.puestoId)) {
      avisos.push(`Un cierre de puesto (${inc.desde}) es de un puesto que no existe (${nombrePuesto(inc.puestoId)}).`);
    }
  }
  for (const [lunes, h] of Object.entries(estado.horarios)) {
    const semana = `Horario de la semana del ${lunes}`;
    if (!esFechaISO(lunes) || diaSemana(lunes) !== 0) avisos.push(`${semana}: la clave no es un lunes.`);
    else if (h.lunes !== lunes) avisos.push(`${semana}: su lunes interno (${h.lunes}) no coincide con la clave.`);
    const noExisten = new Set<string>();
    let fuera = 0;
    for (const t of h.turnos) {
      if (!personaPorId.has(t.personaId)) noExisten.add(t.personaId);
      if (!esFechaISO(t.fecha) || !esFechaISO(lunes) || diferenciaDias(lunes, t.fecha) < 0 || diferenciaDias(lunes, t.fecha) > 6) fuera += 1;
    }
    if (noExisten.size > 0) avisos.push(`${semana}: tiene turnos de ${noExisten.size === 1 ? 'una persona' : `${noExisten.size} personas`} que no existe${noExisten.size === 1 ? '' : 'n'}.`);
    if (fuera > 0) avisos.push(`${semana}: ${fuera === 1 ? 'un turno tiene' : `${fuera} turnos tienen`} una fecha fuera de esa semana.`);
  }
  return avisos;
}
