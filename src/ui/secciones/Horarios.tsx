/** Página «Horarios» (ARQUITECTURA §13.3 y §14): pegar el horario de la empresa, revisar, guardar varias semanas y editar. */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  cambiarTurno,
  crearPersonasDesdeCodigos,
  describirTurno,
  guardarHorarios,
  impactoGuardarHorarios,
  minutosDeTurno,
  ponerAliasDesdeNombres,
  quitarHorario,
} from '../../edicion/horarios';
import { horariosDesdeCalendario, letrasPorDefecto, leerCalendario, leerCelda } from '../../importar/horario';
import type { CeldaLeida, LecturaCalendario, TurnoConLetra } from '../../importar/horario';
import { NOMBRES_DIA, NOMBRES_DIA_CORTO, fechasSemana, formatearDiaFecha, formatearFecha, hoyISO, lunesDe, sumarDias } from '../../modelo/fechas';
import { duracion, formatearDuracion } from '../../modelo/horas';
import type { EstadoApp, FechaISO, HorarioSemana, Id, Intervalo } from '../../modelo/tipos';
import { Confirmacion } from '../componentes/Confirmacion';
import { CampoFecha, CampoHora, CampoTexto, Interruptor, ListaErrores } from '../componentes/campos';
import type { AlmacenApp } from '../estado';
import { usarAlmacen } from '../usarAlmacen';
import './Horarios.css';

export interface PropsHorarios {
  almacen: AlmacenApp;
  alIrASemana: (lunes: FechaISO) => void;
  /** Petición desde el Cuadrante: empezar a guardar desde esta semana (la que se estaba viendo) y llevar el foco al título. */
  peticion?: { lunes: FechaISO; nonce: number } | null;
}

const sumaMinutos = (tramos: readonly Intervalo[]) => tramos.reduce((s, t) => s + duracion(t), 0);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const porCodigo = (estado: EstadoApp, a: Id, b: Id) =>
  (estado.personas.find((p) => p.id === a)?.codigo ?? a).localeCompare(estado.personas.find((p) => p.id === b)?.codigo ?? b, 'es', { numeric: true });

// ───────────────────────── Turnos por letra ─────────────────────────

function EditorLetras({ letras, alCambiar }: { letras: TurnoConLetra[]; alCambiar: (l: TurnoConLetra[]) => void }) {
  const poner = (i: number, cambio: Partial<TurnoConLetra>) => alCambiar(letras.map((l, j) => (j === i ? { ...l, ...cambio } : l)));
  const ponerTramo = (i: number, k: number, cambio: Partial<Intervalo>) =>
    poner(i, { tramos: (letras[i]?.tramos ?? []).map((t, n) => (n === k ? { ...t, ...cambio } : t)) });
  return (
    <details class="hp-letras">
      <summary>Turnos por letra ({letras.map((l) => l.letra).join(', ') || 'ninguno'})</summary>
      <p class="ayuda">Si en Excel escribes solo una letra (por ejemplo M o T), se entiende como estas horas. Valen mientras no cierres esta sección.</p>
      {letras.map((l, i) => (
        <fieldset key={i} class="hp-letra">
          <legend>Turno {l.letra || i + 1}</legend>
          <CampoTexto id={`hp-letra-${i}`} etiqueta="Letra" valor={l.letra} maxLongitud={3} onCambio={(v) => poner(i, { letra: v.trim().toUpperCase() })} />
          <CampoTexto id={`hp-nombre-${i}`} etiqueta="Nombre" valor={l.nombre} onCambio={(v) => poner(i, { nombre: v })} />
          {l.tramos.map((t, k) => (
            <div key={k} class="hp-tramo">
              <CampoHora id={`hp-ini-${i}-${k}`} etiqueta="Desde" valor={t.inicio} onCambio={(v) => ponerTramo(i, k, { inicio: v })} />
              <CampoHora id={`hp-fin-${i}-${k}`} etiqueta="Hasta" valor={t.fin} onCambio={(v) => ponerTramo(i, k, { fin: v })} />
              {l.tramos.length > 1 && (
                <button type="button" class="boton" onClick={() => poner(i, { tramos: l.tramos.filter((_, n) => n !== k) })}>
                  Quitar tramo de {l.letra || 'este turno'}
                </button>
              )}
            </div>
          ))}
          <div class="fila">
            <button
              type="button"
              class="boton"
              onClick={() => {
                const ultimo = l.tramos[l.tramos.length - 1];
                const inicio = ultimo ? Math.min(ultimo.fin, 23 * 60) : 600;
                poner(i, { tramos: [...l.tramos, { inicio, fin: Math.min(inicio + 60, 24 * 60) }] });
              }}
            >
              Añadir tramo a {l.letra || 'este turno'}
            </button>
            <button type="button" class="boton" onClick={() => alCambiar(letras.filter((_, j) => j !== i))}>
              Quitar turno {l.letra || i + 1}
            </button>
          </div>
        </fieldset>
      ))}
      <div class="fila">
        <button type="button" class="boton" onClick={() => alCambiar([...letras, { letra: '', nombre: '', tramos: [{ inicio: 600, fin: 960 }] }])}>
          Añadir turno
        </button>
      </div>
    </details>
  );
}

// ───────────────────────── Rejilla de edición ─────────────────────────

/** Identifica cada objeto de horario guardado: si cambia (guardar, deshacer, rehacer), la rejilla se reinicia. */
const versiones = new WeakMap<HorarioSemana, number>();
let siguienteVersion = 0;
function versionDe(h: HorarioSemana): number {
  let v = versiones.get(h);
  if (v === undefined) {
    siguienteVersion += 1;
    v = siguienteVersion;
    versiones.set(h, v);
  }
  return v;
}

function textoInicial(tramos: readonly Intervalo[]): string {
  return tramos.length === 0 ? 'L' : describirTurno([...tramos]);
}

function EditorSemana({
  almacen, estado, horario, letras, alTerminar, alCambiarPendiente,
}: {
  almacen: AlmacenApp;
  estado: EstadoApp;
  horario: HorarioSemana;
  letras: TurnoConLetra[];
  alTerminar: (mensaje: string | null) => void;
  /** Avisa al padre de si hay cambios sin guardar en la rejilla. */
  alCambiarPendiente: (hay: boolean) => void;
}) {
  const fechas = fechasSemana(horario.lunes);
  const personas = [...new Set(horario.turnos.map((t) => t.personaId))].sort((a, b) => porCodigo(estado, a, b));
  const original = (p: Id, f: FechaISO) => horario.turnos.find((t) => t.personaId === p && t.fecha === f);
  const [textos, setTextos] = useState<Record<string, string>>(() => {
    const r: Record<string, string> = {};
    for (const p of personas) for (const f of fechas) r[`${p}|${f}`] = textoInicial(original(p, f)?.tramos ?? []);
    return r;
  });
  const leidas = useMemo(() => {
    const r: Record<string, CeldaLeida> = {};
    for (const [k, t] of Object.entries(textos)) r[k] = leerCelda(t, letras);
    return r;
  }, [textos, letras]);
  const cambios = Object.keys(textos).filter((k) => textos[k] !== textoInicial(original(...(k.split('|') as [Id, FechaISO]))?.tramos ?? []));
  const hayCambios = cambios.length > 0;
  useEffect(() => {
    alCambiarPendiente(hayCambios);
    return () => alCambiarPendiente(false);
  }, [hayCambios]);
  const hayError = Object.values(leidas).some((c) => c.error !== null);

  function guardar() {
    const ahora = new Date().toISOString();
    almacen.aplicar(`Editar el horario de la semana del ${formatearFecha(horario.lunes)}`, (e) => {
      let r = e;
      for (const k of cambios) {
        const [p, f] = k.split('|') as [Id, FechaISO];
        const c = leidas[k];
        if (c && c.error === null) r = cambiarTurno(r, horario.lunes, p, f, c.libre ? [] : c.tramos, ahora);
      }
      return r;
    });
    alTerminar('Cambios del horario guardados.');
  }

  return (
    <div class="hp-editor">
      <p class="ayuda">Escribe en cada casilla un horario como 10:00-15:45, 10-14 y 17-21, M, T o L (libra).</p>
      <div class="hp-caja">
        <table class="hp-tabla">
          <caption class="hp-oculto">Horario de la semana del {formatearFecha(horario.lunes)}</caption>
          <thead>
            <tr>
              <th scope="col">Persona</th>
              {fechas.map((f, n) => (
                <th key={f} scope="col">{NOMBRES_DIA_CORTO[n]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {personas.map((p) => {
              const codigo = estado.personas.find((x) => x.id === p)?.codigo ?? p;
              return (
                <tr key={p}>
                  <th scope="row">{codigo}</th>
                  {fechas.map((f, n) => {
                    const k = `${p}|${f}`;
                    const error = leidas[k]?.error ?? null;
                    const id = `hp-celda-${p}-${n}`;
                    return (
                      <td key={f}>
                        <input
                          id={id}
                          type="text"
                          autoComplete="off"
                          aria-label={`${codigo}, ${NOMBRES_DIA[n]}`}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? `${id}-error` : undefined}
                          value={textos[k] ?? ''}
                          onInput={(e) => setTextos({ ...textos, [k]: e.currentTarget.value })}
                        />
                        {error && (
                          <small class="error-campo" id={`${id}-error`}>
                            {error}
                          </small>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div class="fila">
        <button type="button" class="boton primario" disabled={hayError || cambios.length === 0} onClick={guardar}>
          Guardar cambios
        </button>
        <button type="button" class="boton" onClick={() => alTerminar(null)}>
          Descartar cambios
        </button>
      </div>
      {hayError && <p class="ayuda">Corrige las casillas con error para poder guardar.</p>}
    </div>
  );
}

// ───────────────────────── Vista previa de una semana ─────────────────────────

function textoCelda(c: CeldaLeida | undefined, cerrado: boolean): string {
  if (cerrado) return 'Cerrado';
  if (c === undefined) return 'Sin dato';
  if (c.error) return `Error: ${c.error}`;
  if (c.libre) return c.codigo ? `No trabaja (${c.codigo})` : 'No trabaja';
  return describirTurno(c.tramos);
}

function VistaSemana({ lectura, lunes }: { lectura: LecturaCalendario; lunes: FechaISO }) {
  const fechas = fechasSemana(lunes);
  const cerrados = new Set(lectura.diasCerrados);
  return (
    <div class="hp-caja">
      <table class="hp-tabla">
        <caption class="hp-oculto">Horario entendido de la semana del {formatearFecha(lunes)}</caption>
        <thead>
          <tr>
            <th scope="col">Persona</th>
            {fechas.map((f, n) => (
              <th key={f} scope="col">
                {NOMBRES_DIA_CORTO[n]} {f.slice(8, 10)}/{f.slice(5, 7)}
              </th>
            ))}
            <th scope="col">Horas</th>
          </tr>
        </thead>
        <tbody>
          {lectura.filas.map((fila, i) => (
            <tr key={i}>
              <th scope="row">
                {fila.codigo}
                {fila.nombre && <small> {fila.nombre}</small>}
                {fila.personaId === null && <small> (nueva)</small>}
              </th>
              {fechas.map((f) => {
                const c = fila.dias.get(f);
                const cerrado = cerrados.has(f);
                return (
                  <td key={f} class={c?.error ? 'hp-error' : cerrado ? 'hp-cerrado' : c?.libre ? 'hp-libre' : ''}>
                    {textoCelda(c, cerrado)}
                  </td>
                );
              })}
              <td>{formatearDuracion(fechas.reduce((s, f) => s + (fila.dias.get(f)?.error ? 0 : sumaMinutos(fila.dias.get(f)?.tramos ?? [])), 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────── Componente principal ─────────────────────────

interface Leido {
  texto: string;
  /** Primer día indicado por la usuaria; null = lo propone la lectura. */
  primerDia: FechaISO | null;
  letras: TurnoConLetra[];
}

const lista = (xs: readonly string[], max = 6) => (xs.length > max ? `${xs.slice(0, max).join(', ')} y ${xs.length - max} más` : xs.join(', '));

export function Horarios({ almacen, alIrASemana, peticion = null }: PropsHorarios) {
  const estado = usarAlmacen(almacen);
  const area = useRef<HTMLTextAreaElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const [hayTexto, setHayTexto] = useState(false);
  const [letras, setLetras] = useState<TurnoConLetra[]>(() => letrasPorDefecto(almacen.obtener()));
  const [leido, setLeido] = useState<Leido | null>(null);
  const [desdePedido, setDesdePedido] = useState<FechaISO | null>(null);
  const [desdeElegido, setDesdeElegido] = useState<FechaISO | null>(null);
  const [hastaElegido, setHastaElegido] = useState<FechaISO | null>(null);
  const [semanaVista, setSemanaVista] = useState<FechaISO | null>(null);
  const [conAlias, setConAlias] = useState(true);
  const [sinHabilitar, setSinHabilitar] = useState<ReadonlySet<Id>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [guardado, setGuardado] = useState<{ primera: FechaISO; semanas: number } | null>(null);
  const [editando, setEditando] = useState<FechaISO | null>(null);
  const [quitando, setQuitando] = useState<FechaISO | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const [cambiandoEdicion, setCambiandoEdicion] = useState<FechaISO | null>(null);
  const nonceAtendido = useRef<number | null>(null);

  useEffect(() => {
    if (!peticion || peticion.nonce === nonceAtendido.current) return;
    nonceAtendido.current = peticion.nonce;
    setDesdePedido(lunesDe(peticion.lunes));
    setDesdeElegido(null);
    setConfirmando(false);
    setGuardado(null);
    titulo.current?.scrollIntoView?.({ block: 'start' });
    titulo.current?.focus();
  }, [peticion]);

  // Solo se relee al pulsar «Leer horario», al cambiar el primer día o si cambian las personas (crear personas).
  const lectura = useMemo(() => (leido ? leerCalendario(leido.texto, estado, leido.letras, { primerDia: leido.primerDia }) : null), [leido, estado]);

  const hoyLunes = lunesDe(hoyISO());
  const semanas = lectura?.semanas ?? [];
  const desdePorDefecto = desdePedido ?? semanas.find((s) => s >= hoyLunes) ?? semanas[0] ?? hoyLunes;
  const desde = desdeElegido ?? desdePorDefecto;
  const hasta = hastaElegido ?? semanas[semanas.length - 1] ?? desde;
  const horarios = useMemo<HorarioSemana[]>(
    () => (lectura ? horariosDesdeCalendario(lectura, desde, hasta, new Date().toISOString()) : []),
    [lectura, desde, hasta],
  );
  const vista = semanaVista !== null && horarios.some((h) => h.lunes === semanaVista) ? semanaVista : (horarios[0]?.lunes ?? null);

  const erroresEnRango = useMemo(() => {
    if (!lectura) return [];
    const elegidas = new Set(horarios.flatMap((h) => fechasSemana(h.lunes)));
    const malas = lectura.celdasConError.filter((c) => elegidas.has(c.fecha));
    const textos = malas.slice(0, 10).map((c) => `${c.codigo} el ${formatearDiaFecha(c.fecha)}: ${c.mensaje}`);
    if (malas.length > 10) textos.push(`y ${malas.length - 10} casillas más con errores`);
    return textos;
  }, [lectura, horarios]);

  const areasActivas = estado.areas.filter((a) => a.activa);
  const nuevas = lectura?.codigosDesconocidos ?? [];
  const nombres = useMemo(() => {
    const r = new Map<string, string>();
    for (const f of lectura?.filas ?? []) if (f.nombre) r.set(f.codigo, f.nombre);
    return r;
  }, [lectura]);
  const existentesSinAlias = (lectura?.filas ?? []).filter(
    (f) => f.nombre && f.personaId !== null && !estado.personas.find((p) => p.id === f.personaId)?.alias,
  ).length;
  const hayNombres = nuevas.some((n) => n.nombre) || existentesSinAlias > 0;

  function leer(primerDia: FechaISO | null) {
    setLeido({ texto: area.current?.value ?? '', primerDia, letras });
    setDesdeElegido(null);
    setHastaElegido(null);
    setSemanaVista(null);
    setConfirmando(false);
    setGuardado(null);
    setMensaje(null);
  }

  function crearPersonas() {
    const aliasPorCodigo = conAlias ? new Map(nuevas.filter((n) => n.nombre).map((n) => [n.codigo, n.nombre as string])) : undefined;
    const habilitaciones = areasActivas.filter((a) => !sinHabilitar.has(a.id)).map((a) => a.id);
    almacen.aplicar('Crear personas del horario', (e) =>
      crearPersonasDesdeCodigos(e, nuevas.map((n) => n.codigo), undefined, { alias: aliasPorCodigo, habilitaciones }),
    );
  }

  function guardar() {
    if (horarios.length === 0) return;
    const aGuardar = horarios;
    almacen.aplicar(`Guardar el horario de ${plural(aGuardar.length, 'semana', 'semanas')}`, (e) => {
      const r = guardarHorarios(e, aGuardar);
      return conAlias ? ponerAliasDesdeNombres(r, nombres) : r;
    });
    setConfirmando(false);
    setGuardado({ primera: aGuardar[0]!.lunes, semanas: aGuardar.length });
    setLeido(null);
    if (area.current) area.current.value = '';
    setHayTexto(false);
  }

  const semanasGuardadas = Object.keys(estado.horarios).sort();
  const impacto = confirmando && horarios.length > 0 ? impactoGuardarHorarios(estado, horarios) : null;
  const bloqueado = !lectura || lectura.errores.length > 0 || erroresEnRango.length > 0 || horarios.length === 0;
  const textoSemanas = plural(horarios.length, 'semana', 'semanas');
  const primerDiaCampo = leido?.primerDia ?? lectura?.primerDia ?? null;
  const conCabeceraDeFechas = lectura?.columnas.includes('cabecera') ?? false;

  /** Cierra la rejilla abierta o abre la de la semana `s` (sin preguntar: la confirmación va antes). */
  function cambiarEdicion(s: FechaISO) {
    setEditando(editando === s ? null : s);
    setCambiandoEdicion(null);
    setPendiente(false);
    setMensaje(null);
  }

  return (
    <div class="hp">
      <h2 id="titulo-horarios" ref={titulo} tabIndex={-1}>Horarios</h2>
      <p class="ayuda">Con el horario de la plantilla, el cuadrante solo reparte a cada persona dentro de su turno.</p>

      <h3>1. Pega el horario</h3>
      <label class="campo">
        <span>Pega aquí el horario copiado de Excel</span>
        <textarea
          ref={area}
          rows={6}
          wrap="off"
          onInput={(e) => setHayTexto(e.currentTarget.value.trim() !== '')}
          aria-describedby="hp-ayuda-pegar"
        />
      </label>
      <p class="ayuda" id="hp-ayuda-pegar">
        Copia en Excel todas las filas de las personas, con su número y nombre y todos los días, y pégalas aquí. Valen horas como 15:20 22:10, turnos
        partidos (08:30 14:00 17:00 21:00) y códigos como L o V (ese día no trabaja).
      </p>

      <EditorLetras letras={letras} alCambiar={setLetras} />

      <div class="fila">
        <button type="button" class="boton primario" disabled={!hayTexto} onClick={() => leer(leido?.primerDia ?? null)}>
          Leer horario
        </button>
      </div>

      {lectura && (
        <div class="hp-previa">
          <h3>2. Lo que se ha detectado</h3>
          <ListaErrores errores={lectura.errores} titulo="Hay que corregir antes de guardar:" />
          {lectura.filas.length > 0 && (
            <p aria-live="polite">
              <strong>
                {plural(lectura.filas.length, 'persona', 'personas')} · {plural(
                  lectura.primerDia && lectura.ultimoDia ? Math.round((Date.parse(lectura.ultimoDia) - Date.parse(lectura.primerDia)) / 86400000) + 1 : 0,
                  'día',
                  'días',
                )}
                {lectura.primerDia && lectura.ultimoDia ? `, del ${formatearFecha(lectura.primerDia)} al ${formatearFecha(lectura.ultimoDia)}` : ''} ·{' '}
                {plural(lectura.semanas.length, 'semana completa', 'semanas completas')}
              </strong>
            </p>
          )}
          <p class="ayuda">{lectura.columnas}</p>
          {!conCabeceraDeFechas && (lectura.filas.length > 0 || lectura.errores.includes('Indica el primer día de la tabla')) && (
            <CampoFecha
              id="hp-primer-dia"
              etiqueta="Primer día de la tabla"
              ayuda="El día de la primera columna de horas; se vuelve a leer al cambiarlo."
              valor={primerDiaCampo}
              onCambio={(v) => leer(v)}
            />
          )}

          {lectura.filas.length > 0 && (
            <>
              <h3>3. Semanas a guardar</h3>
              <div class="hp-semana" role="group" aria-label="Semanas a guardar">
                <CampoFecha id="hp-desde" etiqueta="Desde la semana del" valor={desde} onCambio={(v) => v && setDesdeElegido(lunesDe(v))} />
                <CampoFecha id="hp-hasta" etiqueta="hasta la semana del" valor={hasta} onCambio={(v) => v && setHastaElegido(lunesDe(v))} />
              </div>
              <p aria-live="polite">
                <strong>{horarios.length === 0 ? 'Ninguna semana completa en ese rango.' : `Se guardarán ${textoSemanas}.`}</strong>
              </p>

              {vista && (
                <>
                  <h3>4. Vista previa</h3>
                  <label class="campo">
                    <span>Semana que quieres revisar</span>
                    <select value={vista} onChange={(e) => setSemanaVista(e.currentTarget.value)}>
                      {horarios.map((h) => (
                        <option key={h.lunes} value={h.lunes}>
                          Semana del {formatearFecha(h.lunes)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <VistaSemana lectura={lectura} lunes={vista} />
                </>
              )}

              <h3>5. Avisos</h3>
              {lectura.avisos.length > 0 ? (
                <div class="mensaje aviso" role="status">
                  <ul>
                    {lectura.avisos.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p class="ayuda">Sin avisos.</p>
              )}
              <ListaErrores errores={erroresEnRango} titulo="Hay horas mal escritas en las semanas a guardar:" />

              {(nuevas.length > 0 || hayNombres) && (
                <>
                  <h3>6. Personas</h3>
                  {nuevas.length > 0 && (
                    <p>
                      Se crearán {plural(nuevas.length, 'persona', 'personas')}:{' '}
                      {lista(nuevas.map((n) => (n.nombre ? `${n.codigo} (${n.nombre})` : n.codigo)))}
                    </p>
                  )}
                  {hayNombres && (
                    <>
                      <Interruptor id="hp-alias" etiqueta="Guardar el nombre como alias (solo en este navegador)" valor={conAlias} onCambio={setConAlias} />
                      {existentesSinAlias > 0 && (
                        <p class="ayuda">
                          También se pondrá a {plural(existentesSinAlias, 'persona que ya existe y no tiene alias', 'personas que ya existen y no tienen alias')}, al guardar el horario.
                        </p>
                      )}
                    </>
                  )}
                  {nuevas.length > 0 && (
                    <>
                      <fieldset class="hp-letra">
                        <legend>Habilitar a las personas nuevas en</legend>
                        {areasActivas.map((a) => (
                          <Interruptor
                            key={a.id}
                            id={`hp-area-${a.id}`}
                            etiqueta={a.nombre}
                            valor={!sinHabilitar.has(a.id)}
                            onCambio={(v) => {
                              const nuevo = new Set(sinHabilitar);
                              if (v) nuevo.delete(a.id);
                              else nuevo.add(a.id);
                              setSinHabilitar(nuevo);
                            }}
                          />
                        ))}
                      </fieldset>
                      <div class="fila">
                        <button type="button" class="boton" onClick={crearPersonas}>
                          {nuevas.length === 1 ? 'Crear la persona' : `Crear las ${nuevas.length} personas`}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              <h3>7. Guardar</h3>
              <div class="fila">
                <button type="button" class="boton primario" disabled={bloqueado} onClick={() => setConfirmando(true)}>
                  Guardar el horario de {textoSemanas}
                </button>
              </div>
              {impacto && (
                <Confirmacion
                  id="hp-conf-guardar"
                  titulo="Guardar horario"
                  texto={`Se guardará el horario de ${textoSemanas}, de la del ${formatearFecha(horarios[0]!.lunes)} a la del ${formatearFecha(horarios[horarios.length - 1]!.lunes)}.`}
                  lista={impacto.efectos}
                  textoConfirmar="Sí, guardar horario"
                  alConfirmar={guardar}
                  alCancelar={() => setConfirmando(false)}
                />
              )}
            </>
          )}
        </div>
      )}

      {guardado && (
        <div class="mensaje ok" role="status">
          Horario de {plural(guardado.semanas, 'semana guardado', 'semanas guardado')}.{' '}
          <button type="button" class="boton" onClick={() => alIrASemana(guardado.primera)}>
            Ir a la semana del {formatearFecha(guardado.primera)}
          </button>
        </div>
      )}
      {mensaje && (
        <div class="mensaje ok" role="status">
          {mensaje}
        </div>
      )}

      <h3>Semanas con horario</h3>
      {semanasGuardadas.length === 0 ? (
        <p class="vacio">Todavía no hay ningún horario guardado.</p>
      ) : (
        <ul class="hp-semanas">
          {semanasGuardadas.map((s) => {
            const h = estado.horarios[s];
            if (!h) return null;
            const ids = [...new Set(h.turnos.map((t) => t.personaId))];
            const total = ids.reduce((x, id) => x + minutosDeTurno(h, id), 0);
            return (
              <li key={s}>
                <div class="hp-semana-fila">
                  <span>
                    <strong>Semana del {formatearFecha(s)}</strong> · {plural(ids.length, 'persona', 'personas')} · {formatearDuracion(total)} en total
                  </span>
                  <span class="fila">
                    <button
                      type="button"
                      class="boton"
                      aria-expanded={editando === s}
                      aria-label={`${editando === s ? 'Cerrar' : 'Ver y editar'} el horario de la semana del ${formatearFecha(s)}`}
                      onClick={() => {
                        if (editando !== null && pendiente) setCambiandoEdicion(s);
                        else cambiarEdicion(s);
                      }}
                    >
                      {editando === s ? 'Cerrar' : 'Ver y editar'}
                    </button>
                    <button type="button" class="boton peligro" aria-label={`Quitar el horario de la semana del ${formatearFecha(s)}`} onClick={() => setQuitando(s)}>
                      Quitar
                    </button>
                  </span>
                </div>
                {cambiandoEdicion === s && (
                  <Confirmacion
                    id={`hp-conf-descartar-${s}`}
                    titulo="Cambios sin guardar"
                    texto="Hay cambios sin guardar en la rejilla del horario. Si continúas, se descartarán."
                    textoConfirmar="Sí, descartar cambios"
                    alConfirmar={() => cambiarEdicion(s)}
                    alCancelar={() => setCambiandoEdicion(null)}
                  />
                )}
                {quitando === s && (
                  <Confirmacion
                    id={`hp-conf-quitar-${s}`}
                    titulo="Quitar horario"
                    texto={`Se quitará el horario de la semana del ${formatearFecha(s)}; esa semana volverá a no tener limitación de turnos. Se puede deshacer.`}
                    textoConfirmar="Sí, quitar horario"
                    alConfirmar={() => {
                      almacen.aplicar(`Quitar el horario de la semana del ${formatearFecha(s)}`, (e) => quitarHorario(e, s));
                      setQuitando(null);
                      if (editando === s) setEditando(null);
                    }}
                    alCancelar={() => setQuitando(null)}
                  />
                )}
                {editando === s && (
                  <EditorSemana
                    key={`${s}-${versionDe(h)}`}
                    almacen={almacen}
                    estado={estado}
                    horario={h}
                    letras={letras}
                    alCambiarPendiente={setPendiente}
                    alTerminar={(m) => {
                      setEditando(null);
                      setPendiente(false);
                      setMensaje(m);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
