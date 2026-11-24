/** Sección Incidencias (ARQUITECTURA §12.4): ausencias y cierres de puesto, con su impacto en lo ya planificado. */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { AlmacenApp } from '../estado';
import { usarAlmacen } from '../usarAlmacen';
import type { EstadoApp, FechaISO, Id, Incidencia } from '../../modelo/tipos';
import { formatearDiaFecha, hoyISO } from '../../modelo/fechas';
import {
  afectadasPor,
  anadirIncidencia,
  avisosIncidencia,
  borrarIncidencia,
  crearAusencia,
  crearCierre,
  describirIncidencia,
  erroresIncidencia,
  impactoIncidencia,
  liberarAfectadas,
  momentoIncidencia,
  reemplazarIncidencia,
} from '../../edicion/incidencias';
import type { Momento } from '../../edicion/incidencias';
import { cuenta } from '../../edicion/comun';
import { nombrePuesto } from '../../reglas/texto';
import { Confirmacion } from '../componentes/Confirmacion';
import { CampoFecha, CampoHora, CampoTexto, Interruptor, ListaErrores, usarValidezAgregada } from '../componentes/campos';
import { IconoAusencia, IconoAviso, IconoPuesto } from '../iconos';
import './Incidencias.css';

type Filtro = 'proximas' | 'pasadas' | 'todas';

const TEXTO_MOMENTO: Record<Momento, string> = { pasada: 'Pasada', enCurso: 'En curso', futura: 'Próxima' };
const AYUDA_NOTA = 'Sin motivos ni datos personales: solo lo necesario para planificar';
const TRAMO_POR_DEFECTO = { inicio: 10 * 60, fin: 13 * 60 };

interface Borrador {
  nueva: boolean;
  valor: Incidencia;
}

/** Incidencia recién guardada cuyo impacto se está mostrando. */
interface Panel {
  inc: Incidencia;
  /** Semanas afectadas al guardar: se conservan para que sigan los botones de las demás. */
  semanas: FechaISO[];
}

function etiquetaCorta(inc: Incidencia, estado: EstadoApp): string {
  return inc.tipo === 'ausencia'
    ? `ausencia de ${estado.personas.find((p) => p.id === inc.personaId)?.codigo ?? 'persona desconocida'}`
    : `cierre de ${nombrePuesto(inc.puestoId, estado)}`;
}

function PanelImpacto({
  estado, inc, semanas, almacen, alIrASemana, alCerrar,
}: {
  estado: EstadoApp;
  inc: Incidencia;
  semanas: FechaISO[];
  almacen: AlmacenApp;
  alIrASemana: (lunes: FechaISO, recubrir: boolean) => void;
  alCerrar: () => void;
}) {
  const afectadas = afectadasPor(estado, inc);
  const impacto = impactoIncidencia(estado, inc);
  const sinCandado = afectadas.reduce((n, s) => n + s.asignacionIds.length - s.conCandado, 0);

  const quitar = () => almacen.aplicar(`Quitar asignaciones afectadas por la ${etiquetaCorta(inc, estado)}`, (e) => liberarAfectadas(e, inc));
  const irARecubrir = (lunes: FechaISO) => {
    const de = afectadas.find((s) => s.lunes === lunes);
    if (de && de.asignacionIds.length > de.conCandado) {
      almacen.aplicar(`Quitar asignaciones afectadas por la ${etiquetaCorta(inc, estado)} (semana del ${formatearDiaFecha(lunes)})`, (e) =>
        liberarAfectadas(e, inc, lunes),
      );
    }
    alIrASemana(lunes, true);
  };

  return (
    <section class="incidencias-panel mensaje aviso" aria-labelledby="incidencias-panel-titulo">
      <h3 id="incidencias-panel-titulo">
        <IconoAviso /> Incidencia guardada: afecta a lo ya planificado
      </h3>
      <div role="status">
        {afectadas.length === 0 ? (
          <p>Ya no quedan asignaciones afectadas.</p>
        ) : (
          <ul>
            {impacto.efectos.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </div>
      <div class="fila">
        <button type="button" id="incidencias-quitar" class="boton primario" disabled={sinCandado === 0} onClick={quitar}>
          Quitar las afectadas
        </button>
        <button type="button" class="boton" onClick={alCerrar}>
          Cerrar
        </button>
      </div>
      {semanas.length > 0 && (
        <ul class="incidencias-semanas">
          {semanas.map((lunes) => {
            const s = afectadas.find((x) => x.lunes === lunes);
            return (
              <li key={lunes}>
                <span>
                  Semana del {formatearDiaFecha(lunes)}{' '}
                  {s ? `(${cuenta(s.asignacionIds.length, 'asignación', 'asignaciones')})` : '(ya tratada)'}
                </span>
                <span class="fila">
                  <button type="button" class="boton" onClick={() => irARecubrir(lunes)}>
                    Ir a la semana y recubrir
                  </button>
                  <button type="button" class="boton" onClick={() => alIrASemana(lunes, false)}>
                    Ir a la semana
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function Incidencias({
  almacen, alIrASemana,
}: {
  almacen: AlmacenApp;
  alIrASemana: (lunes: FechaISO, recubrir: boolean) => void;
}) {
  const estado = usarAlmacen(almacen);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('proximas');
  const [busqueda, setBusqueda] = useState('');
  const [aBorrar, setABorrar] = useState<Incidencia | null>(null);
  const [horasValidas, setHorasValidas] = useState(true);
  const validez = usarValidezAgregada(setHorasValidas);
  const [foco, setFoco] = useState<string | null>(null);

  useEffect(() => {
    if (foco === null) return;
    document.getElementById(foco)?.focus();
    setFoco(null);
  }, [foco]);

  const hoy = hoyISO();

  const personasOrdenadas = useMemo(
    () => [...estado.personas].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es')),
    [estado.personas],
  );

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return [...estado.incidencias]
      .filter((i) => {
        const m = momentoIncidencia(i, hoy);
        if (filtro === 'proximas' && m === 'pasada') return false;
        if (filtro === 'pasadas' && m !== 'pasada') return false;
        return q === '' || describirIncidencia(i, estado).toLowerCase().includes(q);
      })
      .sort((a, b) => a.desde.localeCompare(b.desde) || a.hasta.localeCompare(b.hasta));
  }, [estado, filtro, busqueda, hoy]);

  function nuevaAusencia() {
    const primera = personasOrdenadas.find((p) => p.activa) ?? personasOrdenadas[0];
    setPanel(null);
    setBorrador({ nueva: true, valor: crearAusencia(primera?.id ?? '', hoy) });
    setFoco('inc-persona');
  }
  function nuevoCierre() {
    setPanel(null);
    setBorrador({ nueva: true, valor: crearCierre(estado.puestos[0]?.id ?? '', hoy) });
    setFoco('inc-puesto');
  }
  function editar(inc: Incidencia) {
    setPanel(null);
    setBorrador({ nueva: false, valor: inc });
    setFoco(inc.tipo === 'ausencia' ? 'inc-persona' : 'inc-puesto');
  }
  function cerrarFicha() {
    setBorrador(null);
    setHorasValidas(true);
  }

  function cambiar(cambio: Partial<Incidencia>) {
    if (!borrador) return;
    setBorrador({ ...borrador, valor: { ...borrador.valor, ...cambio } as Incidencia });
  }

  const errores = borrador ? erroresIncidencia(estado, borrador.valor) : [];
  const avisos = borrador ? avisosIncidencia(estado, borrador.valor) : [];

  function guardar() {
    if (!borrador || errores.length > 0 || !horasValidas) return;
    const inc: Incidencia = { ...borrador.valor, nota: borrador.valor.nota.trim() };
    const accion = borrador.nueva ? 'Añadir' : 'Editar';
    almacen.aplicar(`${accion} ${etiquetaCorta(inc, estado)}`, (e) => (borrador.nueva ? anadirIncidencia(e, inc) : reemplazarIncidencia(e, inc)));
    cerrarFicha();
    // El estado ya incluye la incidencia: se calcula el impacto sobre él.
    const semanas = afectadasPor(almacen.obtener(), inc).map((s) => s.lunes);
    setPanel(semanas.length > 0 ? { inc, semanas } : null);
  }

  function borrar(inc: Incidencia) {
    almacen.aplicar(`Borrar ${etiquetaCorta(inc, estado)}`, (e) => borrarIncidencia(e, inc.id));
    setABorrar(null);
    if (borrador?.valor.id === inc.id) cerrarFicha();
    setFoco('incidencias-nueva-ausencia');
  }

  const v = borrador?.valor;
  const opcionesFiltro: { valor: Filtro; texto: string }[] = [
    { valor: 'proximas', texto: 'En curso y próximas' },
    { valor: 'pasadas', texto: 'Pasadas' },
    { valor: 'todas', texto: 'Todas' },
  ];

  return (
    <section class="incidencias" aria-labelledby="incidencias-titulo">
      <h2 id="incidencias-titulo">Incidencias</h2>
      <p class="ayuda">Ausencias de personas y cierres de puestos en fechas concretas.</p>
      <div class="fila">
        <button type="button" id="incidencias-nueva-ausencia" class="boton primario" onClick={nuevaAusencia}>
          <IconoAusencia /> Nueva ausencia
        </button>
        <button type="button" class="boton" onClick={nuevoCierre}>
          <IconoPuesto /> Nuevo cierre de puesto
        </button>
      </div>

      {panel && <PanelImpacto estado={estado} inc={panel.inc} semanas={panel.semanas} almacen={almacen} alIrASemana={alIrASemana} alCerrar={() => setPanel(null)} />}

      {borrador && v && (
        <form
          class="incidencias-ficha"
          aria-labelledby="incidencias-ficha-titulo"
          onSubmit={(e) => {
            e.preventDefault();
            guardar();
          }}
        >
          <h3 id="incidencias-ficha-titulo">
            {borrador.nueva ? 'Nueva' : 'Editar'} {v.tipo === 'ausencia' ? 'ausencia' : 'cierre de puesto'}
          </h3>
          {v.tipo === 'ausencia' ? (
            <div class="campo">
              <label for="inc-persona">Persona</label>
              <select id="inc-persona" value={v.personaId} onChange={(e) => cambiar({ personaId: e.currentTarget.value })}>
                {v.personaId === '' || !estado.personas.some((p) => p.id === v.personaId) ? <option value={v.personaId}>Elige una persona</option> : null}
                {personasOrdenadas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo}
                    {p.activa ? '' : ' (inactiva)'}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div class="campo">
              <label for="inc-puesto">Puesto</label>
              <select id="inc-puesto" value={v.puestoId} onChange={(e) => cambiar({ puestoId: e.currentTarget.value as Id })}>
                {!estado.puestos.some((p) => p.id === v.puestoId) ? <option value={v.puestoId}>Elige un puesto</option> : null}
                {estado.puestos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nombrePuesto(p.id, estado)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div class="incidencias-fechas">
            <CampoFecha id="inc-desde" etiqueta="Desde" valor={v.desde} onCambio={(f) => cambiar({ desde: f ?? '' })} />
            <CampoFecha id="inc-hasta" etiqueta="Hasta (inclusive)" valor={v.hasta} onCambio={(f) => cambiar({ hasta: f ?? '' })} />
          </div>
          {v.tipo === 'ausencia' && (
            <>
              <Interruptor
                id="inc-todo-dia"
                etiqueta="Todo el día"
                valor={v.tramo === null}
                onCambio={(todo) => {
                  setHorasValidas(true);
                  cambiar({ tramo: todo ? null : { ...TRAMO_POR_DEFECTO } });
                }}
              />
              {v.tramo !== null && (
                <div class="incidencias-fechas">
                  <CampoHora
                    id="inc-inicio"
                    etiqueta="Desde la hora"
                    valor={v.tramo.inicio}
                    onValidez={validez('inicio')}
                    onCambio={(inicio) => v.tramo && cambiar({ tramo: { ...v.tramo, inicio } })}
                  />
                  <CampoHora
                    id="inc-fin"
                    etiqueta="Hasta la hora"
                    valor={v.tramo.fin}
                    onValidez={validez('fin')}
                    onCambio={(fin) => v.tramo && cambiar({ tramo: { ...v.tramo, fin } })}
                  />
                </div>
              )}
            </>
          )}
          <CampoTexto id="inc-nota" etiqueta="Nota (opcional)" ayuda={AYUDA_NOTA} valor={v.nota} onCambio={(nota) => cambiar({ nota })} />
          {avisos.length > 0 && (
            <div class="mensaje aviso" role="status">
              <strong>Ten en cuenta</strong>
              <ul>
                {avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <ListaErrores errores={[...errores, ...(horasValidas ? [] : ['Hay una hora que no se entiende'])]} />
          <div class="fila incidencias-acciones">
            <button type="submit" class="boton primario" disabled={errores.length > 0 || !horasValidas}>
              Guardar cambios
            </button>
            <button type="button" class="boton" onClick={cerrarFicha}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div class="incidencias-filtros">
        <div class="campo">
          <label for="inc-filtro">Mostrar</label>
          <select id="inc-filtro" value={filtro} onChange={(e) => setFiltro(e.currentTarget.value as Filtro)}>
            {opcionesFiltro.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </div>
        <div class="campo">
          <label for="inc-buscar">Buscar por código o puesto</label>
          <input id="inc-buscar" type="search" value={busqueda} onInput={(e) => setBusqueda(e.currentTarget.value)} />
        </div>
      </div>
      <p class="ayuda" role="status">
        {cuenta(visibles.length, 'incidencia', 'incidencias')} de {estado.incidencias.length}
      </p>

      {aBorrar && (
        <Confirmacion
          id="incidencias-borrar"
          titulo="Borrar incidencia"
          texto={`¿Borrar «${describirIncidencia(aBorrar, estado)}»? Podrás deshacerlo.`}
          textoConfirmar="Borrar"
          alConfirmar={() => borrar(aBorrar)}
          alCancelar={() => setABorrar(null)}
        />
      )}

      {visibles.length === 0 ? (
        <p class="vacio">No hay incidencias que mostrar.</p>
      ) : (
        <ul class="incidencias-lista">
          {visibles.map((inc) => {
            const momento = momentoIncidencia(inc, hoy);
            const afectadas = afectadasPor(estado, inc).reduce((n, s) => n + s.asignacionIds.length, 0);
            return (
              <li key={inc.id} class={`incidencia momento-${momento}`}>
                <div class="incidencia-texto">
                  <strong>{describirIncidencia(inc, estado)}</strong>
                  <span class="incidencia-meta">
                    <span class="incidencia-momento">{TEXTO_MOMENTO[momento]}</span>
                    {' · '}
                    {afectadas === 0 ? 'Sin asignaciones afectadas' : `Afecta a ${cuenta(afectadas, 'asignación', 'asignaciones')}`}
                  </span>
                  {inc.nota !== '' && <span class="incidencia-nota">{inc.nota}</span>}
                </div>
                <div class="fila">
                  <button type="button" class="boton" aria-label={`Editar: ${describirIncidencia(inc, estado)}`} onClick={() => editar(inc)}>
                    Editar
                  </button>
                  <button type="button" class="boton" aria-label={`Borrar: ${describirIncidencia(inc, estado)}`} onClick={() => setABorrar(inc)}>
                    Borrar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
