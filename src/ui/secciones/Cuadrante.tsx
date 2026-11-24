/** Sección Cuadrante (ARQUITECTURA §10.3): rejilla semanal por área, vista por persona y edición a mano. */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AlmacenApp } from '../estado';
import { usarAlmacen } from '../usarAlmacen';
import { diaSemana, enRango, fechasSemana, formatearDiaFecha, formatearFecha, hoyISO, lunesDe, sumarDias } from '../../modelo/fechas';
import { aHora, formatearDuracion, formatearIntervalo } from '../../modelo/horas';
import type {
  Area,
  Asignacion,
  AsignacionPausa,
  AsignacionPuesto,
  ClaveHueco,
  DiaSemana,
  EstadoApp,
  FechaISO,
  Franja,
  Hueco,
  Id,
  Minutos,
  Persona,
  Puesto,
} from '../../modelo/tipos';
import type { MarcaCelda, ResultadoValidacion } from '../../reglas/contrato';
import {
  anadirPausa,
  asignar,
  bloquear,
  claveDeAsignacion,
  claveHueco,
  franjasAfectadas,
  leerClaveHueco,
  motivoFueraDeHorario,
  motivoNoDisponible,
  quitar,
  quitarPausa,
  semanaDelCiclo,
  vaciarSemana,
  type HuecoEditable,
} from '../../edicion/cuadrante';
import { horarioDe } from '../../edicion/horario';
import { crearIndice } from '../../validacion/indice';
import { IconoSemaforo } from './PanelValidacion';
import { Generar } from './Generar';
import { CopiarExcel } from '../componentes/CopiarExcel';
import { motor as motorReal } from '../../motor/motor';
import type { Candidato, Motor } from '../../motor/contrato';
import type { EjecutorMotor } from '../usarMotor';
import { Confirmacion } from '../componentes/Confirmacion';
import { CampoHora } from '../componentes/campos';
import { IconoAusencia, IconoAviso, IconoCandado, IconoComida, IconoDeArea } from '../iconos';
import './Cuadrante.css';

export interface FocoCuadrante {
  asignacionId?: Id;
  hueco?: ClaveHueco;
  nonce: number;
}

export interface PropsCuadrante {
  almacen: AlmacenApp;
  resultado: ResultadoValidacion | null;
  foco?: FocoCuadrante | null;
  alCambiarSemana?: (lunes: FechaISO) => void;
  /** Motor para las sugerencias del editor de celda (inyectable en tests). */
  motor?: Pick<Motor, 'sugerir'>;
  /** Ejecutor de «Generar semana» (inyectable en tests). */
  ejecutar?: EjecutorMotor;
  /** Petición externa de ir a una semana y, si `recubrir`, lanzar «Completar huecos». */
  peticion?: { lunes: FechaISO; recubrir: boolean; nonce: number } | null;
}

const PX_POR_MINUTO = 1.5;
const ANCHO_ETIQUETA = 124;
const MARCAS_POR_PRIORIDAD: MarcaCelda[] = ['solape', 'noDisponible', 'comidaSinTurno', 'aviso', 'hueco'];
const TEXTO_MARCA: Record<MarcaCelda, string> = {
  solape: 'Solape',
  noDisponible: 'No disponible',
  comidaSinTurno: 'Comida sin turno',
  aviso: 'Aviso',
  hueco: 'Sin cubrir',
};

type Vista = Id | 'persona';

interface Pendiente {
  clave?: ClaveHueco;
  pausaId?: Id;
  /** Asignación fuera del horario (se enfoca en el bloque de «Asignaciones fuera del horario»). */
  fueraId?: Id;
}

interface FueraDeHorario {
  asignacion: AsignacionPuesto;
  motivo: string;
}

function textoSemaforoCompacto(r: ResultadoValidacion): string {
  const obligatorios = r.incumplimientos.filter((i) => i.dura).length;
  const preferencias = r.incumplimientos.length - obligatorios;
  if (r.semaforo === 'verde') return 'Todo correcto';
  if (r.semaforo === 'ambar') return `Solo preferencias sin cumplir (${preferencias})`;
  return `${obligatorios} ${obligatorios === 1 ? 'incumplimiento obligatorio' : 'incumplimientos obligatorios'}`;
}

// ───────────────────────── Utilidades ─────────────────────────

function nombreCelda(puesto: Puesto, plaza: number): string {
  return puesto.plazas > 1 ? `${puesto.nombre} plaza ${plaza + 1}` : puesto.nombre;
}

function franjaDe(estado: EstadoApp, a: AsignacionPuesto): Franja | undefined {
  const puesto = estado.puestos.find((p) => p.id === a.puestoId);
  return puesto ? horarioDe(puesto, diaSemana(a.fecha)).franjas.find((f) => f.id === a.franjaId) : undefined;
}

function tramoDe(franjas: readonly Franja[]): string {
  return formatearIntervalo({
    inicio: Math.min(...franjas.map((f) => f.inicio)),
    fin: Math.max(...franjas.map((f) => f.fin)),
  });
}

function ordenarMarcas(marcas: Iterable<MarcaCelda>): MarcaCelda[] {
  const conjunto = new Set(marcas);
  return MARCAS_POR_PRIORIDAD.filter((m) => conjunto.has(m));
}

function agrupar<K>(resultado: ResultadoValidacion | null, claves: (i: ResultadoValidacion['incumplimientos'][number]) => K[]) {
  const mapa = new Map<K, MarcaCelda[]>();
  for (const inc of resultado?.incumplimientos ?? []) {
    for (const k of claves(inc)) mapa.set(k, [...(mapa.get(k) ?? []), inc.marca]);
  }
  return mapa;
}

function IconoMarca({ marca }: { marca: MarcaCelda }) {
  if (marca === 'noDisponible') return <IconoAusencia tamano={12} />;
  if (marca === 'comidaSinTurno') return <IconoComida tamano={12} />;
  return <IconoAviso tamano={12} />;
}

function Marcas({ marcas }: { marcas: MarcaCelda[] }) {
  return (
    <>
      {marcas.map((m) => (
        <span key={m} class={`cq-marca cq-m-${m}`}>
          <IconoMarca marca={m} />
          {TEXTO_MARCA[m]}
        </span>
      ))}
    </>
  );
}

function puestoCerrado(estado: EstadoApp, puestoId: Id, fecha: FechaISO): boolean {
  return estado.incidencias.some((i) => i.tipo === 'puestoCerrado' && i.puestoId === puestoId && fecha >= i.desde && fecha <= i.hasta);
}

// ───────────────────────── Componente principal ─────────────────────────

export function Cuadrante({ almacen, resultado, foco, alCambiarSemana, motor = motorReal, ejecutar, peticion = null }: PropsCuadrante) {
  const estado = usarAlmacen(almacen);
  const raiz = useRef<HTMLDivElement>(null);
  const [lunes, setLunes] = useState<FechaISO>(() => lunesDe(hoyISO()));
  const [pestana, setPestana] = useState<Vista>('');
  const [editando, setEditando] = useState<HuecoEditable | null>(null);
  const [todoElBloque, setTodoElBloque] = useState(true);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [vaciando, setVaciando] = useState(false);
  const [respetarCandados, setRespetarCandados] = useState(true);
  const [personaVista, setPersonaVista] = useState<Id>('');
  const [formPausa, setFormPausa] = useState<FechaISO | null>(null);
  const celdaEditada = useRef<HTMLElement | null>(null);
  const [arranque, setArranque] = useState<{ modo: 'completarHuecos'; nonce: number } | null>(null);

  const alCambiarRef = useRef(alCambiarSemana);
  alCambiarRef.current = alCambiarSemana;
  useEffect(() => {
    alCambiarRef.current?.(lunes);
  }, [lunes]);

  const areas = useMemo(
    () => estado.areas.filter((a) => a.activa).sort((a, b) => a.planta - b.planta || a.orden - b.orden),
    [estado.areas],
  );
  const vista: Vista = pestana === 'persona' || areas.some((a) => a.id === pestana) ? pestana : (areas[0]?.id ?? 'persona');
  const area = areas.find((a) => a.id === vista) ?? null;

  const cuadrante = estado.cuadrantes[lunes];
  const asignaciones = cuadrante?.asignaciones ?? [];
  const porClave = useMemo(() => {
    const m = new Map<ClaveHueco, AsignacionPuesto>();
    for (const a of asignaciones) if (a.tipo === 'puesto' && !m.has(claveDeAsignacion(a))) m.set(claveDeAsignacion(a), a);
    return m;
  }, [asignaciones]);
  const marcasAsignacion = useMemo(() => agrupar(resultado, (i) => i.asignacionIds), [resultado]);
  const marcasHueco = useMemo(() => agrupar(resultado, (i) => i.huecos), [resultado]);
  const fuera = useMemo<FueraDeHorario[]>(() => {
    const lista: FueraDeHorario[] = [];
    for (const a of asignaciones) {
      if (a.tipo !== 'puesto') continue;
      const motivo = motivoFueraDeHorario(estado, a);
      if (motivo !== null) lista.push({ asignacion: a, motivo });
    }
    return lista;
  }, [asignaciones, estado]);
  const personas = useMemo(() => new Map(estado.personas.map((p) => [p.id, p])), [estado.personas]);
  const codigo = (id: Id): string => personas.get(id)?.codigo ?? 'persona desconocida';

  // Foco solicitado desde fuera (panel de validación).
  const nonce = foco?.nonce;
  useEffect(() => {
    if (!foco) return;
    let fecha: FechaISO | null = null;
    let puestoId: Id | null = null;
    const nuevo: Pendiente = {};
    if (foco.hueco) {
      const h = leerClaveHueco(foco.hueco);
      if (h) {
        fecha = h.fecha;
        puestoId = h.puestoId;
        nuevo.clave = foco.hueco;
      }
    } else if (foco.asignacionId) {
      const a = (estado.cuadrantes[lunes]?.asignaciones ?? []).find((x) => x.id === foco.asignacionId);
      if (a?.tipo === 'puesto' && motivoFueraDeHorario(estado, a) !== null) {
        fecha = a.fecha;
        nuevo.fueraId = a.id;
      } else if (a?.tipo === 'puesto') {
        fecha = a.fecha;
        puestoId = a.puestoId;
        nuevo.clave = claveDeAsignacion(a);
      } else if (a) {
        fecha = a.fecha;
        nuevo.pausaId = a.id;
      }
    }
    if (!fecha || (!nuevo.clave && !nuevo.pausaId && !nuevo.fueraId)) return;
    setLunes(lunesDe(fecha));
    const areaId = puestoId ? estado.puestos.find((p) => p.id === puestoId)?.areaId : undefined;
    if (areaId) setPestana(areaId);
    else if (vista === 'persona' && !nuevo.fueraId) setPestana(areas[0]?.id ?? 'persona');
    setPendiente(nuevo);
  }, [nonce]);

  useEffect(() => {
    if (!pendiente) return;
    const el = [...(raiz.current?.querySelectorAll<HTMLElement>('[data-clave],[data-pausa],[data-fuera]') ?? [])].find((e) =>
      pendiente.clave
        ? e.dataset.clave === pendiente.clave
        : pendiente.fueraId
          ? e.dataset.fuera === pendiente.fueraId
          : e.dataset.pausa === pendiente.pausaId,
    );
    if (el) {
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', inline: 'center' });
      el.focus();
    }
    setPendiente(null);
  }, [pendiente, vista, lunes]);

  useEffect(() => {
    if (!peticion) return;
    irASemana(peticion.lunes);
    if (peticion.recubrir) setArranque({ modo: 'completarHuecos', nonce: peticion.nonce });
  }, [peticion?.nonce]);

  function irASemana(nuevo: FechaISO) {
    setLunes(nuevo);
    setEditando(null);
    setFormPausa(null);
    setVaciando(false);
  }

  function abrirEditor(h: HuecoEditable, el: HTMLElement) {
    celdaEditada.current = el;
    setTodoElBloque(true);
    setFormPausa(null);
    setEditando(h);
  }

  function cerrarEditor() {
    setEditando(null);
    const el = celdaEditada.current;
    if (el?.isConnected) el.focus();
  }

  function aplicarVaciado() {
    const texto = `Vaciar la semana del ${formatearFecha(lunes)}${respetarCandados ? ' (respetando candados)' : ''}`;
    almacen.aplicar(texto, (e) => vaciarSemana(e, lunes, { respetarCandados }));
    setVaciando(false);
    setEditando(null);
  }

  const ciclo = estado.rotacion.longitudCiclo > 1 ? semanaDelCiclo(estado.rotacion, lunes) : null;
  const esEstaSemana = lunes === lunesDe(hoyISO());

  function teclaPestana(e: KeyboardEvent, orden: Vista[]) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = orden.indexOf(vista);
    const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + orden.length) % orden.length;
    const siguiente = orden[j];
    if (siguiente === undefined) return;
    e.preventDefault();
    setPestana(siguiente);
    setEditando(null);
    requestAnimationFrame(() => raiz.current?.querySelector<HTMLElement>(`#cq-pestana-${siguiente}`)?.focus());
  }
  const ordenPestanas: Vista[] = [...areas.map((a) => a.id), 'persona'];

  return (
    <div class="cuadrante" ref={raiz}>
      <h2>Cuadrante</h2>
      <div class="cq-barra" role="group" aria-label="Semana">
        <button type="button" class="boton" onClick={() => irASemana(sumarDias(lunes, -7))}>
          Semana anterior
        </button>
        <button type="button" class="boton" onClick={() => irASemana(lunesDe(hoyISO()))} disabled={esEstaSemana}>
          Esta semana
        </button>
        <button type="button" class="boton" onClick={() => irASemana(sumarDias(lunes, 7))}>
          Semana siguiente
        </button>
        <strong class="cq-semana" aria-live="polite">
          Semana del {formatearFecha(lunes)} al {formatearFecha(sumarDias(lunes, 6))}
          {ciclo ? ` · Semana ${ciclo.etiqueta}` : ''}
        </strong>
        <Generar almacen={almacen} lunes={lunes} ejecutar={ejecutar} arrancar={arranque} />
        <CopiarExcel estado={estado} lunes={lunes} />
        <label class="cq-ir">
          Ir a la semana de
          <input
            type="date"
            value={lunes}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (/^\d{4}-\d{2}-\d{2}$/.test(v)) irASemana(lunesDe(v));
            }}
          />
        </label>
        <button type="button" class="boton peligro cq-vaciar" onClick={() => setVaciando(true)} disabled={asignaciones.length === 0}>
          Vaciar semana
        </button>
      </div>

      {resultado && (
        <div class={`cq-semaforo cq-semaforo-${resultado.semaforo}`} role="status" aria-live="polite">
          <IconoSemaforo semaforo={resultado.semaforo} />
          <strong>{textoSemaforoCompacto(resultado)}</strong>
          <button
            type="button"
            class="boton cq-mini"
            onClick={() => {
              const destino = document.getElementById('pv-incumplimientos');
              if (!destino) return;
              if (typeof destino.scrollIntoView === 'function') destino.scrollIntoView({ block: 'start' });
              destino.focus();
            }}
          >
            Ver incumplimientos
          </button>
        </div>
      )}

      {fuera.length > 0 && (
        <section class="cq-fuera" aria-labelledby="cq-fuera-titulo">
          <h3 id="cq-fuera-titulo">Asignaciones fuera del horario ({fuera.length})</h3>
          <p class="ayuda">Estas asignaciones ya no encajan en el horario de los puestos y no aparecen en la rejilla. Quítalas o corrige el horario.</p>
          <ul class="cq-lista-fuera">
            {fuera.map(({ asignacion: a, motivo }) => {
              const puesto = estado.puestos.find((x) => x.id === a.puestoId);
              const texto = `${codigo(a.personaId)}, ${formatearDiaFecha(a.fecha)}, ${puesto?.nombre ?? 'puesto desconocido'}: ${motivo}`;
              return (
                <li key={a.id} class="cq-fuera-item" tabIndex={-1} data-fuera={a.id}>
                  <span>{texto}</span>
                  <button
                    type="button"
                    class="boton cq-mini"
                    aria-label={`Quitar la asignación de ${texto}`}
                    onClick={() => almacen.aplicar(`Quitar la asignación de ${texto}`, (e) => quitar(e, lunes, [a.id]))}
                  >
                    Quitar
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {vaciando && (
        <div class="cq-vaciando">
          <label class="casilla">
            <input type="checkbox" checked={respetarCandados} onChange={(e) => setRespetarCandados(e.currentTarget.checked)} />
            Respetar las asignaciones con candado
          </label>
          <Confirmacion
            id="cq-vaciar"
            titulo="Vaciar la semana"
            texto={`Se quitarán ${respetarCandados ? 'las asignaciones sin candado' : 'todas las asignaciones'} de la semana del ${formatearFecha(lunes)}. Se puede deshacer.`}
            textoConfirmar="Vaciar semana"
            alConfirmar={aplicarVaciado}
            alCancelar={() => setVaciando(false)}
          />
        </div>
      )}

      <div class="pestanas cq-pestanas" role="tablist" aria-label="Vista del cuadrante">
        {areas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            id={`cq-pestana-${a.id}`}
            class="pestana"
            aria-selected={vista === a.id}
            aria-controls="cq-panel"
            tabIndex={vista === a.id ? 0 : -1}
            onClick={() => {
              setPestana(a.id);
              setEditando(null);
            }}
            onKeyDown={(e) => teclaPestana(e, ordenPestanas)}
          >
            <IconoDeArea icono={a.icono} />
            {a.nombre}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          id="cq-pestana-persona"
          class="pestana"
          aria-selected={vista === 'persona'}
          aria-controls="cq-panel"
          tabIndex={vista === 'persona' ? 0 : -1}
          onClick={() => {
            setPestana('persona');
            setEditando(null);
          }}
          onKeyDown={(e) => teclaPestana(e, ordenPestanas)}
        >
          Por persona
        </button>
      </div>

      <div id="cq-panel" role="tabpanel" aria-labelledby={`cq-pestana-${vista}`}>
        {vista === 'persona' ? (
          <VistaPersona
            estado={estado}
            lunes={lunes}
            asignaciones={asignaciones}
            personaId={personaVista}
            alElegir={setPersonaVista}
            marcasAsignacion={marcasAsignacion}
            alIrA={(clave, areaId) => {
              setPestana(areaId);
              setPendiente({ clave });
            }}
          />
        ) : area ? (
          <VistaArea
            area={area}
            estado={estado}
            almacen={almacen}
            lunes={lunes}
            asignaciones={asignaciones}
            porClave={porClave}
            marcasAsignacion={marcasAsignacion}
            marcasHueco={marcasHueco}
            personas={personas}
            codigo={codigo}
            editando={editando}
            todoElBloque={todoElBloque}
            alCambiarBloque={setTodoElBloque}
            alAbrir={abrirEditor}
            alCerrar={cerrarEditor}
            formPausa={formPausa}
            alFormPausa={setFormPausa}
            motor={motor}
          />
        ) : (
          <p class="vacio">No hay áreas activas. Actívalas o créalas en Puestos.</p>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Vista por área ─────────────────────────

interface PropsVistaArea {
  area: Area;
  estado: EstadoApp;
  almacen: AlmacenApp;
  lunes: FechaISO;
  asignaciones: readonly Asignacion[];
  porClave: Map<ClaveHueco, AsignacionPuesto>;
  marcasAsignacion: Map<Id, MarcaCelda[]>;
  marcasHueco: Map<ClaveHueco, MarcaCelda[]>;
  personas: Map<Id, Persona>;
  codigo: (id: Id) => string;
  editando: HuecoEditable | null;
  todoElBloque: boolean;
  alCambiarBloque: (v: boolean) => void;
  alAbrir: (h: HuecoEditable, el: HTMLElement) => void;
  alCerrar: () => void;
  formPausa: FechaISO | null;
  alFormPausa: (f: FechaISO | null) => void;
  motor: Pick<Motor, 'sugerir'>;
}

function VistaArea(p: PropsVistaArea) {
  const { area, estado, lunes, asignaciones } = p;
  const puestos = estado.puestos.filter((x) => x.areaId === area.id && x.activo).sort((a, b) => a.orden - b.orden);
  // Línea de tiempo común a toda la semana del área, para que los días queden alineados.
  const franjas = puestos.flatMap((x) => [x.horario.general, ...Object.values(x.horario.porDia)].flatMap((h) => h.franjas));
  if (franjas.length === 0) return <p class="vacio">Esta área no tiene puestos con horario.</p>;
  const inicio = Math.floor(Math.min(...franjas.map((f) => f.inicio)) / 60) * 60;
  const fin = Math.ceil(Math.max(...franjas.map((f) => f.fin)) / 60) * 60;
  const ancho = Math.round((fin - inicio) * PX_POR_MINUTO);
  const horas: number[] = [];
  for (let h = inicio; h <= fin; h += 60) horas.push(h);
  const color = /^#[0-9a-fA-F]{6}$/.test(area.color) ? area.color : '#888888';
  const estiloArea = `--area:${color};--ancho-pista:${ancho}px;--ancho-etiqueta:${ANCHO_ETIQUETA}px`;

  return (
    <div class="cq-area" style={estiloArea}>
      {fechasSemana(lunes).map((fecha) => {
        const dia = diaSemana(fecha);
        const filas = puestos.filter((x) => x.dias.includes(dia) && enRango(fecha, x.vigenteDesde, x.vigenteHasta));
        const editaAqui = p.editando && p.editando.fecha === fecha && puestos.some((x) => x.id === p.editando?.puestoId);
        return (
          <section key={fecha} class="cq-dia" aria-labelledby={`cq-dia-${fecha}`}>
            <h3 id={`cq-dia-${fecha}`}>{formatearDiaFecha(fecha)}</h3>
            {filas.length === 0 ? (
              <p class="ayuda">Esta área no tiene puestos este día.</p>
            ) : (
              <div class="cq-desplazable" tabIndex={0} role="region" aria-label={`Rejilla de ${formatearDiaFecha(fecha)}`}>
                <div class="cq-lienzo">
                  <div class="cq-fila cq-regla" aria-hidden="true">
                    <div class="cq-etiqueta" />
                    <div class="cq-pista">
                      {horas.map((h) => (
                        <span key={h} class="cq-marca-hora" style={{ left: `${((h - inicio) / (fin - inicio)) * 100}%` }}>
                          {aHora(h)}
                        </span>
                      ))}
                    </div>
                  </div>
                  {filas.flatMap((puesto) =>
                    Array.from({ length: puesto.plazas }, (_, plaza) => (
                      <FilaPuesto key={`${puesto.id}-${plaza}`} {...p} puesto={puesto} plaza={plaza} fecha={fecha} dia={dia} inicio={inicio} fin={fin} />
                    )),
                  )}
                </div>
              </div>
            )}
            {editaAqui && p.editando && <EditorHueco key={claveHueco(p.editando)} {...p} hueco={p.editando} />}
            <Pausas {...p} fecha={fecha} pausas={asignaciones.filter((a): a is AsignacionPausa => a.tipo === 'pausa' && a.fecha === fecha)} />
          </section>
        );
      })}
    </div>
  );
}

function FilaPuesto(p: PropsVistaArea & { puesto: Puesto; plaza: number; fecha: FechaISO; dia: DiaSemana; inicio: Minutos; fin: Minutos }) {
  const { puesto, plaza, fecha, estado } = p;
  const cerrado = puestoCerrado(estado, puesto.id, fecha);
  const horario = horarioDe(puesto, p.dia);
  const rotulo = puesto.plazas > 1 ? `${puesto.nombre} · plaza ${plaza + 1}` : puesto.nombre;

  function moverFlechas(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const celdas = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button')];
    const i = celdas.indexOf(e.target as HTMLElement);
    const destino = celdas[i + (e.key === 'ArrowRight' ? 1 : -1)];
    if (i < 0 || !destino) return;
    e.preventDefault();
    destino.focus();
  }

  return (
    <div class="cq-fila">
      <div class="cq-etiqueta">{rotulo}</div>
      <div class="cq-pista" onKeyDown={moverFlechas}>
        {cerrado && <span class="cq-cerrado">Puesto cerrado este día</span>}
        {!cerrado &&
          horario.franjas.map((f) => {
            const hueco: HuecoEditable = { fecha, puestoId: puesto.id, franjaId: f.id, plaza };
            const clave = claveHueco(hueco);
            const a = p.porClave.get(clave);
            const marcas = ordenarMarcas([
              ...(a ? (p.marcasAsignacion.get(a.id) ?? []) : []),
              ...(p.marcasHueco.get(clave) ?? []),
              ...(a ? [] : (['hueco'] as MarcaCelda[])),
            ]);
            const principal = marcas[0];
            const persona = a ? p.personas.get(a.personaId) : undefined;
            const partes = [a ? (persona?.codigo ?? 'persona desconocida') : 'sin cubrir'];
            if (a?.bloqueada) partes.push('bloqueada');
            for (const m of marcas) if (a || m !== 'hueco') partes.push(TEXTO_MARCA[m].toLowerCase());
            const etiqueta = `${nombreCelda(puesto, plaza)}, ${formatearDiaFecha(fecha)}, ${formatearIntervalo(f)}: ${partes.join(', ')}`;
            const abierta = p.editando !== null && claveHueco(p.editando) === clave;
            return (
              <button
                key={f.id}
                type="button"
                class={`cq-celda${a ? '' : ' cq-vacia'}${principal ? ` cq-top-${principal}` : ''}`}
                style={{
                  left: `calc(${((f.inicio - p.inicio) / (p.fin - p.inicio)) * 100}% + 1px)`,
                  width: `calc(${((f.fin - f.inicio) / (p.fin - p.inicio)) * 100}% - 2px)`,
                }}
                data-clave={clave}
                aria-label={etiqueta}
                title={etiqueta}
                aria-expanded={abierta}
                onClick={(e) => p.alAbrir(hueco, e.currentTarget)}
              >
                <span class="cq-codigo">
                  {a ? (persona?.codigo ?? '¿?') : <span class="cq-nadie">{aHora(f.inicio)}</span>}
                  {a?.bloqueada && <IconoCandado tamano={12} />}
                </span>
                {persona?.alias && <span class="cq-alias">{persona.alias}</span>}
                <span class="cq-marcas">
                  <Marcas marcas={marcas} />
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}

// ───────────────────────── Editor de hueco ─────────────────────────

function resumirMotivos(motivos: readonly string[]): string {
  const [primero, ...resto] = motivos;
  if (primero === undefined) return '';
  return resto.length > 0 ? `${primero}; +${resto.length} más` : primero;
}

function textoCandidato(codigo: string, c: Candidato): { texto: string; titulo: string } {
  const completo = c.motivos.join('; ');
  if (!c.permitido) {
    const motivo = c.motivos.length > 0 ? resumirMotivos(c.motivos) : 'incumple una regla obligatoria';
    return { texto: `${codigo} (no permitido: ${motivo})`, titulo: `${codigo}, no permitido: ${completo || motivo}` };
  }
  if (c.motivos.length === 0) return { texto: codigo, titulo: codigo };
  return { texto: `${codigo} (preferible: ${resumirMotivos(c.motivos)})`, titulo: `${codigo}, preferible: ${completo}` };
}

function opcionesDelHueco(
  estado: EstadoApp,
  lunes: FechaISO,
  hueco: HuecoEditable,
  asignaciones: readonly Asignacion[],
  todoElBloque: boolean,
  motor: Pick<Motor, 'sugerir'>,
  personas: Map<Id, Persona>,
): { persona: Persona; texto: string; titulo?: string }[] {
  const puesto = estado.puestos.find((x) => x.id === hueco.puestoId);
  if (!puesto) return [];
  const enBloque = horarioDe(puesto, diaSemana(hueco.fecha)).bloques.some((b) => b.franjaIds.includes(hueco.franjaId));
  const franjas = franjasAfectadas(puesto, hueco.fecha, hueco.franjaId, enBloque && todoElBloque);
  const huecoMotor = indiceHueco(estado, lunes, hueco, franjas.find((f) => f.id === hueco.franjaId), enBloque && todoElBloque);
  if (huecoMotor) {
    try {
      const lista = motor.sugerir(estado, lunes, [...asignaciones], huecoMotor).flatMap((c) => {
        const persona = personas.get(c.personaId);
        return persona ? [{ persona, ...textoCandidato(persona.codigo, c) }] : [];
      });
      if (lista.length > 0) return lista;
    } catch {
      // Si el motor falla se usa el orden básico de abajo.
    }
  }
  const ignorar = new Set(franjas.map((f) => claveHueco({ ...hueco, franjaId: f.id })));
  return estado.personas
    .map((persona) => ({ persona, motivo: motivoNoDisponible(estado, lunes, persona, puesto, hueco.fecha, franjas, ignorar) }))
    .sort((a, b) => Number(a.motivo !== null) - Number(b.motivo !== null) || a.persona.codigo.localeCompare(b.persona.codigo, 'es', { numeric: true }))
    .map(({ persona, motivo }) => ({ persona, texto: motivo ? `${persona.codigo} (${motivo})` : persona.codigo }));
}

/** Hueco del motor correspondiente a la celda (busca en el índice de huecos de la semana). */
function indiceHueco(estado: EstadoApp, lunes: FechaISO, h: HuecoEditable, franja: Franja | undefined, usarBloque: boolean): Hueco | null {
  if (!franja) return null;
  const clave = claveHueco(h);
  const encontrado = crearIndice(estado, lunes, []).huecos().find((x) => claveHueco({ fecha: x.fecha, puestoId: x.puestoId, franjaId: x.franjaId, plaza: x.plaza }) === clave);
  if (!encontrado) return null;
  // Sin «Aplicar a todo el bloque», el motor sugiere solo para ese hueco.
  return usarBloque ? encontrado : { ...encontrado, bloqueId: null };
}

function EditorHueco(p: PropsVistaArea & { hueco: HuecoEditable }) {
  const { estado, lunes, hueco, almacen } = p;
  const select = useRef<HTMLSelectElement>(null);
  const [elegida, setElegida] = useState<Id>(() => p.porClave.get(claveHueco(hueco))?.personaId ?? '');
  const puesto = estado.puestos.find((x) => x.id === hueco.puestoId);
  useEffect(() => {
    select.current?.focus();
  }, [hueco.fecha, hueco.puestoId, hueco.franjaId, hueco.plaza]);
  // Sugerencias del motor: permitidas primero (por coste) y no permitidas al final con su motivo.
  const opciones = useMemo(
    () => opcionesDelHueco(estado, lunes, hueco, p.asignaciones, p.todoElBloque, p.motor, p.personas),
    [estado, lunes, hueco.fecha, hueco.puestoId, hueco.franjaId, hueco.plaza, p.asignaciones, p.todoElBloque, p.motor, p.personas],
  );
  if (!puesto) return null;

  const horario = horarioDe(puesto, diaSemana(hueco.fecha));
  const enBloque = horario.bloques.some((b) => b.franjaIds.includes(hueco.franjaId));
  const todo = enBloque && p.todoElBloque;
  const franjas = franjasAfectadas(puesto, hueco.fecha, hueco.franjaId, todo);
  if (franjas.length === 0) return null;
  const claves = franjas.map((f) => claveHueco({ ...hueco, franjaId: f.id }));
  const actuales = claves.map((c) => p.porClave.get(c)).filter((a): a is AsignacionPuesto => a !== undefined);
  const propia = p.porClave.get(claveHueco(hueco));
  const bloqueada = propia?.bloqueada ?? false;
  const lugar = `${nombreCelda(puesto, hueco.plaza)}, ${formatearDiaFecha(hueco.fecha)} ${tramoDe(franjas)}`;
  const ignorar = new Set(claves);

  const puedeAsignar = elegida !== '' && elegida !== propia?.personaId && !bloqueada;
  function asignarA(personaId: Id) {
    if (!personaId || personaId === propia?.personaId) return;
    almacen.aplicar(`Asignar ${p.codigo(personaId)} a ${lugar}`, (e) => asignar(e, lunes, hueco, personaId, { todoElBloque: todo }));
  }
  function quitarTodo() {
    const ids = actuales.filter((a) => !a.bloqueada).map((a) => a.id);
    if (ids.length === 0) return;
    almacen.aplicar(`Quitar ${p.codigo(actuales[0]?.personaId ?? '')} de ${lugar}`, (e) => quitar(e, lunes, ids));
  }
  function alternarCandado() {
    const ids = actuales.map((a) => a.id);
    if (ids.length === 0) return;
    const nombre = p.codigo(propia?.personaId ?? actuales[0]?.personaId ?? '');
    almacen.aplicar(`${bloqueada ? 'Desbloquear' : 'Bloquear'} la asignación de ${nombre} en ${lugar}`, (e) => bloquear(e, lunes, ids, !bloqueada));
  }

  return (
    <div
      class="cq-editor"
      role="group"
      aria-label={`Editar hueco: ${lugar}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          p.alCerrar();
        }
      }}
    >
      <p class="cq-editor-titulo">
        <strong>{lugar}</strong>
      </p>
      <div class="fila">
        <label class="campo cq-campo">
          <span>Persona</span>
          <select
            ref={select}
            value={elegida}
            disabled={bloqueada}
            onChange={(e) => setElegida(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && puedeAsignar) {
                e.preventDefault();
                asignarA(elegida);
              }
            }}
          >
            <option value="">{propia ? '(elige otra persona)' : '(sin asignar)'}</option>
            {opciones.map(({ persona, texto, titulo }) => (
              <option key={persona.id} value={persona.id} title={titulo}>
                {texto}
              </option>
            ))}
          </select>
        </label>
        {enBloque && (
          <label class="casilla cq-bloque">
            <input type="checkbox" checked={p.todoElBloque} onChange={(e) => p.alCambiarBloque(e.currentTarget.checked)} />
            Aplicar a todo el bloque
          </label>
        )}
        <button type="button" class="boton primario" onClick={() => asignarA(elegida)} disabled={!puedeAsignar}>
          Asignar
        </button>
        <button type="button" class="boton" onClick={quitarTodo} disabled={bloqueada || actuales.length === 0}>
          Quitar
        </button>
        <button type="button" class="boton" onClick={alternarCandado} disabled={actuales.length === 0} aria-pressed={bloqueada}>
          <IconoCandado />
          {bloqueada ? 'Desbloquear' : 'Bloquear'}
        </button>
        <button type="button" class="boton" onClick={p.alCerrar}>
          Cerrar
        </button>
      </div>
      {bloqueada && <p class="ayuda">Esta asignación tiene candado: desbloquéala para cambiarla o quitarla.</p>}
    </div>
  );
}

// ───────────────────────── Pausas (comidas) ─────────────────────────

function Pausas(p: PropsVistaArea & { fecha: FechaISO; pausas: AsignacionPausa[] }) {
  const { almacen, lunes, fecha } = p;
  const ordenadas = [...p.pausas].sort((a, b) => a.inicio - b.inicio || p.codigo(a.personaId).localeCompare(p.codigo(b.personaId), 'es', { numeric: true }));
  const abierto = p.formPausa === fecha;
  const dia = formatearDiaFecha(fecha);
  return (
    <div class="cq-pausas">
      <h4>
        <IconoComida /> Comidas
      </h4>
      {ordenadas.length === 0 && <p class="ayuda">Sin comidas este día.</p>}
      <ul class="cq-lista-pausas">
        {ordenadas.map((a) => {
          const marcas = ordenarMarcas(p.marcasAsignacion.get(a.id) ?? []);
          const texto = `${p.codigo(a.personaId)} ${formatearIntervalo(a)}`;
          return (
            <li
              key={a.id}
              class={`cq-pausa${marcas[0] ? ` cq-top-${marcas[0]}` : ''}`}
              tabIndex={-1}
              data-pausa={a.id}
              aria-label={`Comida de ${texto}${a.bloqueada ? ', bloqueada' : ''}${marcas.map((m) => `, ${TEXTO_MARCA[m].toLowerCase()}`).join('')}`}
            >
              <span>{texto}</span>
              {a.bloqueada && <IconoCandado tamano={12} />}
              <span class="cq-marcas">
                <Marcas marcas={marcas} />
              </span>
              <button
                type="button"
                class="boton cq-mini"
                aria-label={`${a.bloqueada ? 'Desbloquear' : 'Bloquear'} la comida de ${texto}`}
                aria-pressed={a.bloqueada}
                onClick={() =>
                  almacen.aplicar(`${a.bloqueada ? 'Desbloquear' : 'Bloquear'} la comida de ${texto}, ${dia}`, (e) =>
                    bloquear(e, lunes, [a.id], !a.bloqueada),
                  )
                }
              >
                <IconoCandado tamano={12} />
              </button>
              <button
                type="button"
                class="boton cq-mini"
                aria-label={`Quitar la comida de ${texto}`}
                aria-disabled={a.bloqueada ? true : undefined}
                aria-describedby={a.bloqueada ? `cq-candado-${a.id}` : undefined}
                onClick={() => {
                  if (a.bloqueada) return;
                  almacen.aplicar(`Quitar la comida de ${texto}, ${dia}`, (e) => quitarPausa(e, lunes, a.id));
                }}
              >
                Quitar
              </button>
              {a.bloqueada && (
                <span id={`cq-candado-${a.id}`} class="ayuda">
                  Tiene candado: desbloquéala para quitarla.
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {abierto ? (
        <FormularioPausa {...p} cerrar={() => p.alFormPausa(null)} />
      ) : (
        <button type="button" class="boton" aria-label={`Añadir comida el ${dia}`} onClick={() => p.alFormPausa(fecha)}>
          Añadir comida
        </button>
      )}
    </div>
  );
}

function FormularioPausa(p: PropsVistaArea & { fecha: FechaISO; cerrar: () => void }) {
  const { estado, lunes, fecha, almacen } = p;
  const [personaId, setPersonaId] = useState<Id>('');
  const [inicio, setInicio] = useState<Minutos>(14 * 60);
  const [fin, setFin] = useState<Minutos>(15 * 60);
  const select = useRef<HTMLSelectElement>(null);
  useEffect(() => select.current?.focus(), []);
  const trabajan = new Set(p.asignaciones.filter((a) => a.tipo === 'puesto' && a.fecha === fecha).map((a) => a.personaId));
  const opciones = estado.personas
    .filter((x) => x.activa)
    .sort((a, b) => Number(!trabajan.has(a.id)) - Number(!trabajan.has(b.id)) || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  const valido = personaId !== '' && fin > inicio;
  const dia = formatearDiaFecha(fecha);
  const sufijo = `-${fecha}`;

  function anadir() {
    if (!valido) return;
    almacen.aplicar(`Añadir comida de ${p.codigo(personaId)}, ${dia} ${formatearIntervalo({ inicio, fin })}`, (e) =>
      anadirPausa(e, lunes, { fecha, personaId, inicio, fin }),
    );
    p.cerrar();
  }

  return (
    <div
      class="cq-form-pausa"
      role="group"
      aria-label={`Añadir comida el ${dia}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          p.cerrar();
        }
      }}
    >
      <label class="campo">
        <span>Persona</span>
        <select ref={select} value={personaId} onChange={(e) => setPersonaId(e.currentTarget.value)} aria-label={`Persona de la comida del ${dia}`}>
          <option value="">(elige una persona)</option>
          {opciones.map((x) => (
            <option key={x.id} value={x.id}>
              {trabajan.has(x.id) ? x.codigo : `${x.codigo} (no trabaja ese día)`}
            </option>
          ))}
        </select>
      </label>
      <CampoHora id={`cq-pausa-inicio${sufijo}`} etiqueta="Desde" valor={inicio} onCambio={setInicio} />
      <CampoHora id={`cq-pausa-fin${sufijo}`} etiqueta="Hasta" valor={fin} onCambio={setFin} />
      <button type="button" class="boton primario" onClick={anadir} disabled={!valido}>
        Añadir
      </button>
      <button type="button" class="boton" onClick={p.cerrar}>
        Cancelar
      </button>
      {fin <= inicio && <span class="error-campo">La hora de fin debe ser posterior a la de inicio.</span>}
    </div>
  );
}

// ───────────────────────── Vista por persona ─────────────────────────

interface PropsVistaPersona {
  estado: EstadoApp;
  lunes: FechaISO;
  asignaciones: readonly Asignacion[];
  personaId: Id;
  alElegir: (id: Id) => void;
  marcasAsignacion: Map<Id, MarcaCelda[]>;
  alIrA: (clave: ClaveHueco, areaId: Id) => void;
}

function VistaPersona(p: PropsVistaPersona) {
  const { estado, lunes } = p;
  const personas = [...estado.personas].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  const persona = personas.find((x) => x.id === p.personaId);
  const propias = persona ? p.asignaciones.filter((a) => a.personaId === persona.id) : [];
  let total = 0;
  let dias = 0;

  const bloques = fechasSemana(lunes).map((fecha) => {
    const entradas = propias
      .filter((a) => a.fecha === fecha)
      .map((a) => {
        if (a.tipo === 'pausa') return { a, inicio: a.inicio, fin: a.fin, puesto: undefined, motivo: null };
        const f = franjaDe(estado, a);
        const motivo = motivoFueraDeHorario(estado, a);
        const encaja = motivo === null && f !== undefined;
        return {
          a,
          inicio: encaja ? f.inicio : Number.MAX_SAFE_INTEGER,
          fin: encaja ? f.fin : Number.MAX_SAFE_INTEGER,
          puesto: estado.puestos.find((x) => x.id === a.puestoId),
          motivo: encaja ? null : (motivo ?? 'la franja ya no existe'),
        };
      })
      .sort((x, y) => x.inicio - y.inicio);
    const minutos = entradas.reduce((s, e) => s + (e.a.tipo === 'puesto' && e.motivo === null ? e.fin - e.inicio : 0), 0);
    total += minutos;
    if (minutos > 0) dias += 1;
    return { fecha, entradas, minutos };
  });

  return (
    <div class="cq-persona">
      <label class="campo cq-campo">
        <span>Persona</span>
        <select value={p.personaId} onChange={(e) => p.alElegir(e.currentTarget.value)}>
          <option value="">(elige una persona)</option>
          {personas.map((x) => (
            <option key={x.id} value={x.id}>
              {x.codigo}
              {x.activa ? '' : ' (inactiva)'}
            </option>
          ))}
        </select>
      </label>
      {!persona ? (
        <p class="vacio">Elige una persona para ver su semana.</p>
      ) : (
        <>
          <p class="cq-total">
            <strong>{persona.codigo}</strong>: {formatearDuracion(total)} de cobertura en {dias} {dias === 1 ? 'día' : 'días'}.
          </p>
          <ul class="cq-semana-persona">
            {bloques.map(({ fecha, entradas, minutos }) => (
              <li key={fecha} class="cq-dia-persona">
                <h3>
                  {formatearDiaFecha(fecha)} <span class="cq-minutos">{formatearDuracion(minutos)}</span>
                </h3>
                {entradas.length === 0 ? (
                  <p class="ayuda">Sin huecos ni comidas.</p>
                ) : (
                  <ul class="cq-entradas">
                    {entradas.map(({ a, inicio, fin, puesto, motivo }) => {
                      const marcas = ordenarMarcas(p.marcasAsignacion.get(a.id) ?? []);
                      const tramo = motivo === null ? formatearIntervalo({ inicio, fin }) : '';
                      return (
                        <li key={a.id} class={marcas[0] ? `cq-top-${marcas[0]}` : ''}>
                          {a.tipo === 'pausa' ? (
                            <span>
                              <IconoComida /> Comida {tramo}
                            </span>
                          ) : motivo !== null ? (
                            <span>
                              <IconoAviso tamano={12} /> Fuera del horario: {puesto?.nombre ?? 'puesto desconocido'} ({motivo})
                            </span>
                          ) : (
                            <button
                              type="button"
                              class="boton cq-mini"
                              aria-label={`Ver ${puesto?.nombre ?? 'puesto'}, ${formatearDiaFecha(fecha)}, ${tramo} en el cuadrante`}
                              onClick={() => puesto && p.alIrA(claveDeAsignacion(a), puesto.areaId)}
                            >
                              {tramo} · {puesto?.nombre ?? 'puesto desconocido'}
                            </button>
                          )}
                          {a.bloqueada && <IconoCandado tamano={12} />}
                          <span class="cq-marcas">
                            <Marcas marcas={marcas} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
