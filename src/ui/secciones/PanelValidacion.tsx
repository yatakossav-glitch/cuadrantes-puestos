/**
 * Panel de validación del cuadrante (§10.1, §10.3): semáforo, lista de incumplimientos
 * y resúmenes por persona y por puesto. Componente de presentación: no calcula nada
 * de la semana, solo muestra lo que recibe.
 */
import { useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { formatearDuracion, formatearIntervalo } from '../../modelo/horas';
import { minutosDeTurno } from '../../edicion/horarios';
import type { ClaveHueco, DatosPlanificacion, FechaISO, Id } from '../../modelo/tipos';
import type { Incumplimiento, MarcaCelda, ResultadoValidacion, Semaforo } from '../../reglas/contrato';
import { METADATOS_GENERAL } from '../../reglas/metadatos-general';
import { METADATOS_RESTRICCION } from '../../reglas/metadatos-persona';
import type { ResumenPersona, ResumenPuesto } from '../../validacion/resumen';
import './PanelValidacion.css';

type Filtro = 'todos' | 'obligatorios' | 'preferencias';
type Vista = 'personas' | 'puestos';
type Orden = 'codigo' | 'horas' | 'desviacion';

const LIMITE = 50;
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DIAS_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const ETIQUETA_MARCA: Record<MarcaCelda, string> = {
  solape: 'Solape',
  noDisponible: 'No disponible',
  comidaSinTurno: 'Comida sin turno',
  hueco: 'Sin cubrir',
  aviso: 'Aviso',
};

export interface PropsPanelValidacion {
  resultado: ResultadoValidacion;
  resumen: { personas: ResumenPersona[]; puestos: ResumenPuesto[] };
  datos: DatosPlanificacion;
  /** Lunes de la semana mostrada; con él se muestran las horas de turno si hay horario. */
  lunes?: FechaISO;
  alIr: (destino: { asignacionId?: Id; hueco?: ClaveHueco }) => void;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function textoSemaforo(semaforo: Semaforo, obligatorios: number, preferencias: number): string {
  if (semaforo === 'verde') return 'Todo correcto';
  if (semaforo === 'ambar') return `Solo preferencias sin cumplir (${preferencias})`;
  const base = plural(obligatorios, 'incumplimiento obligatorio', 'incumplimientos obligatorios');
  return preferencias > 0 ? `${base} y ${plural(preferencias, 'preferencia', 'preferencias')} sin cumplir` : base;
}

function nombreTipo(i: Incumplimiento): string {
  const meta: { nombre: string } | undefined =
    i.origen === 'general'
      ? (METADATOS_GENERAL as Record<string, { nombre: string }>)[i.tipo]
      : (METADATOS_RESTRICCION as Record<string, { nombre: string }>)[i.tipo];
  return meta?.nombre ?? i.tipo;
}

export function IconoMarca({ marca }: { marca: MarcaCelda }) {
  const trazos: Record<MarcaCelda, JSX.Element> = {
    solape: (
      <>
        <rect x="3" y="6" width="11" height="11" rx="1" />
        <rect x="10" y="9" width="11" height="11" rx="1" />
      </>
    ),
    noDisponible: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M5.6 5.6 18.4 18.4" />
      </>
    ),
    comidaSinTurno: (
      <>
        <path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10" />
        <path d="M17 21V3c-2.5 1.5-3.5 4-3.5 7.5V14H17" />
      </>
    ),
    hueco: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3" />
      </>
    ),
    aviso: (
      <>
        <path d="M12 3 22 20H2z" />
        <path d="M12 10v4.5M12 17.2v.1" />
      </>
    ),
  };
  return <Svg>{trazos[marca]}</Svg>;
}

function Svg({ children }: { children: JSX.Element }) {
  return (
    <svg class="icono" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export function IconoSemaforo({ semaforo }: { semaforo: Semaforo }) {
  if (semaforo === 'verde') {
    return (
      <Svg>
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m7.5 12.5 3 3 6-6.5" />
        </>
      </Svg>
    );
  }
  return semaforo === 'ambar' ? <IconoMarca marca="aviso" /> : (
    <Svg>
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 16v.1" />
      </>
    </Svg>
  );
}

function etiquetaPersona(datos: DatosPlanificacion, id: Id): string {
  const p = datos.personas.find((x) => x.id === id);
  if (!p) return id;
  return p.alias ? `${p.codigo} (${p.alias})` : p.codigo;
}

function textoDesviacion(d: number | null): string {
  if (d === null) return '';
  if (d === 0) return 'en objetivo';
  const horas = formatearDuracion(Math.abs(d));
  return d > 0 ? `+${horas} de más` : `−${horas} de menos`;
}

const horasODia = (min: number) => (min > 0 ? formatearDuracion(min) : '');

export function PanelValidacion({ resultado, resumen, datos, lunes, alIr }: PropsPanelValidacion) {
  const horario = lunes ? datos.horarios[lunes] : undefined;
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [agrupar, setAgrupar] = useState(false);
  const [verTodos, setVerTodos] = useState(false);
  const [vista, setVista] = useState<Vista>('personas');
  const [orden, setOrden] = useState<Orden>('codigo');

  const obligatorios = resultado.incumplimientos.filter((i) => i.dura);
  const preferencias = resultado.incumplimientos.filter((i) => !i.dura);

  const visibles = useMemo(() => {
    const base =
      filtro === 'obligatorios' ? obligatorios : filtro === 'preferencias' ? preferencias : [...obligatorios, ...preferencias];
    return base;
  }, [resultado, filtro]);
  const recortados = verTodos ? visibles : visibles.slice(0, LIMITE);

  const VISTAS: Vista[] = ['personas', 'puestos'];
  function teclasPestana(e: KeyboardEvent, indice: number) {
    let destino = -1;
    if (e.key === 'ArrowRight') destino = (indice + 1) % VISTAS.length;
    else if (e.key === 'ArrowLeft') destino = (indice - 1 + VISTAS.length) % VISTAS.length;
    else if (e.key === 'Home') destino = 0;
    else if (e.key === 'End') destino = VISTAS.length - 1;
    const nueva = VISTAS[destino];
    if (nueva === undefined) return;
    e.preventDefault();
    setVista(nueva);
    document.getElementById(`pv-pestana-${nueva}`)?.focus();
  }

  const alIrA = (i: Incumplimiento) => {
    const asignacionId = i.asignacionIds[0];
    if (asignacionId !== undefined) return alIr({ asignacionId });
    const hueco = i.huecos[0];
    if (hueco !== undefined) alIr({ hueco });
  };

  const elemento = (i: Incumplimiento, n: number) => {
    const navegable = i.asignacionIds.length > 0 || i.huecos.length > 0;
    return (
      <li key={n} class={`pv-item ${i.dura ? 'obligatorio' : 'preferencia'}`}>
        <button
          type="button"
          class="pv-incumplimiento"
          aria-disabled={navegable ? undefined : true}
          onClick={() => {
            if (navegable) alIrA(i);
          }}
        >
          <span class="pv-etiqueta">
            <IconoMarca marca={i.marca} />
            {ETIQUETA_MARCA[i.marca]}
          </span>
          <span class="pv-mensaje">{i.mensaje}</span>
          <span class="pv-nivel">{i.dura ? 'Obligatorio' : 'Preferencia'}</span>
        </button>
      </li>
    );
  };

  const grupos = useMemo(() => {
    const mapa = new Map<string, Incumplimiento[]>();
    for (const i of recortados) {
      const t = nombreTipo(i);
      mapa.set(t, [...(mapa.get(t) ?? []), i]);
    }
    return [...mapa.entries()];
  }, [recortados]);

  const personas = useMemo(() => {
    const activas = resumen.personas.filter((r) => {
      const p = datos.personas.find((x) => x.id === r.personaId);
      return r.minutosSemana > 0 || p?.activa === true;
    });
    const codigo = (r: ResumenPersona) => datos.personas.find((x) => x.id === r.personaId)?.codigo ?? r.personaId;
    const porCodigo = (a: ResumenPersona, b: ResumenPersona) => codigo(a).localeCompare(codigo(b), 'es', { numeric: true });
    return [...activas].sort((a, b) => {
      if (orden === 'horas') return b.minutosSemana - a.minutosSemana || porCodigo(a, b);
      if (orden === 'desviacion') {
        return Math.abs(b.desviacion ?? 0) - Math.abs(a.desviacion ?? 0) || porCodigo(a, b);
      }
      return porCodigo(a, b);
    });
  }, [resumen, datos, orden]);

  const nombreArea = (id: Id) => datos.areas.find((a) => a.id === id)?.nombre ?? id;
  const areasUsadas = useMemo(
    () => datos.areas.filter((a) => personas.some((r) => (r.porArea[a.id] ?? 0) > 0)),
    [datos, personas],
  );

  return (
    <section class="panel-validacion" aria-label="Validación del cuadrante">
      <div class={`pv-semaforo ${resultado.semaforo}`} role="status" aria-live="polite">
        <IconoSemaforo semaforo={resultado.semaforo} />
        <div>
          <strong>{textoSemaforo(resultado.semaforo, obligatorios.length, preferencias.length)}</strong>
          <small class="pv-penalizacion">Penalización blanda total: {resultado.penalizacionBlanda}</small>
        </div>
      </div>

      <div class="pv-bloque">
        <h3 id="pv-incumplimientos" tabIndex={-1}>
          Incumplimientos ({resultado.incumplimientos.length})
        </h3>
        <div class="pv-herramientas">
          <div role="group" aria-label="Filtrar incumplimientos" class="pv-filtros">
            {(['todos', 'obligatorios', 'preferencias'] as const).map((f) => (
              <button
                key={f}
                type="button"
                class="boton"
                aria-pressed={filtro === f}
                onClick={() => {
                  setFiltro(f);
                  setVerTodos(false);
                }}
              >
                {f === 'todos' ? 'Todos' : f === 'obligatorios' ? 'Obligatorios' : 'Preferencias'}
              </button>
            ))}
          </div>
          <label class="pv-agrupar">
            <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.currentTarget.checked)} />
            Agrupar por tipo
          </label>
        </div>
        {visibles.length === 0 ? (
          <p class="ayuda">No hay incumplimientos en este filtro.</p>
        ) : agrupar ? (
          grupos.map(([nombre, lista]) => (
            <div key={nombre} class="pv-grupo">
              <h4>
                {nombre} ({lista.length})
              </h4>
              <ul class="pv-lista">{lista.map(elemento)}</ul>
            </div>
          ))
        ) : (
          <ul class="pv-lista">{recortados.map(elemento)}</ul>
        )}
        {!verTodos && visibles.length > LIMITE && (
          <button type="button" class="boton" onClick={() => setVerTodos(true)}>
            Mostrar todos ({visibles.length})
          </button>
        )}
      </div>

      <div class="pv-bloque">
        <div class="pestanas pv-pestanas" role="tablist" aria-label="Resúmenes de la semana">
          {(
            [
              ['personas', 'Por persona'],
              ['puestos', 'Cobertura por puesto'],
            ] as const
          ).map(([id, texto], indice) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`pv-pestana-${id}`}
              class="pestana"
              aria-selected={vista === id}
              aria-controls="pv-panel"
              tabIndex={vista === id ? 0 : -1}
              onKeyDown={(e) => teclasPestana(e, indice)}
              onClick={() => setVista(id)}
            >
              {texto}
            </button>
          ))}
        </div>
        <div id="pv-panel" role="tabpanel" aria-labelledby={`pv-pestana-${vista}`}>
          {vista === 'personas' ? (
            <>
              <label class="pv-orden">
                Ordenar por{' '}
                <select value={orden} onChange={(e) => setOrden(e.currentTarget.value as Orden)}>
                  <option value="codigo">Código</option>
                  <option value="horas">Horas de la semana</option>
                  <option value="desviacion">Desviación</option>
                </select>
              </label>
              <div class="pv-tabla-caja">
                <table class="pv-tabla">
                  <caption class="pv-oculto">Horas por persona y día</caption>
                  <thead>
                    <tr>
                      <th scope="col">Persona</th>
                      {DIAS.map((d, n) => (
                        <th key={d} scope="col" title={DIAS_LARGO[n]}>
                          <abbr title={DIAS_LARGO[n]}>{d}</abbr>
                        </th>
                      ))}
                      <th scope="col">Total</th>
                      {horario && <th scope="col">Turno</th>}
                      <th scope="col">Días</th>
                      {areasUsadas.map((a) => (
                        <th key={a.id} scope="col">{a.nombre}</th>
                      ))}
                      <th scope="col">Domingo</th>
                      <th scope="col">Objetivo</th>
                      <th scope="col">Desviación</th>
                      <th scope="col">Avisos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personas.map((r) => (
                      <tr key={r.personaId}>
                        <th scope="row">{etiquetaPersona(datos, r.personaId)}</th>
                        {r.minutosDia.map((m, n) => (
                          <td key={n}>{horasODia(m)}</td>
                        ))}
                        <td>{horasODia(r.minutosSemana)}</td>
                        {horario && <td>{horasODia(minutosDeTurno(horario, r.personaId))}</td>}
                        <td>{r.dias || ''}</td>
                        {areasUsadas.map((a) => (
                          <td key={a.id}>{horasODia(r.porArea[a.id] ?? 0)}</td>
                        ))}
                        <td>{r.jornadaDomingo ? formatearIntervalo(r.jornadaDomingo) : ''}</td>
                        <td>{r.objetivo === null ? '' : formatearDuracion(r.objetivo)}</td>
                        <td class={r.desviacion !== null && r.desviacion !== 0 ? 'pv-desviada' : ''}>
                          {textoDesviacion(r.desviacion)}
                        </td>
                        <td>{r.avisos || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div class="pv-tabla-caja">
              <table class="pv-tabla">
                <caption class="pv-oculto">Cobertura por puesto</caption>
                <thead>
                  <tr>
                    <th scope="col">Puesto</th>
                    <th scope="col">Huecos cubiertos</th>
                    <th scope="col">Cobertura</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.puestos.map((r) => {
                    const puesto = datos.puestos.find((p) => p.id === r.puestoId);
                    return (
                      <tr key={r.puestoId}>
                        <th scope="row">
                          {puesto?.nombre ?? r.puestoId}
                          {puesto && <small class="pv-area"> ({nombreArea(puesto.areaId)})</small>}
                        </th>
                        <td>
                          {r.cubiertos} / {r.huecos}
                        </td>
                        <td>
                          <div class="pv-barra-fila">
                            <div class="pv-barra" aria-hidden="true">
                              <div class={`pv-relleno ${r.porcentaje === 100 ? 'completo' : ''}`} style={{ width: `${r.porcentaje}%` }} />
                            </div>
                            <span>{r.porcentaje} %</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
