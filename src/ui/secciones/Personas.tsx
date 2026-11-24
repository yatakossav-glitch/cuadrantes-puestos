/** Sección Personas (ARQUITECTURA §9.3): lista con filtros a la izquierda y ficha con borrador a la derecha. */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { AlmacenApp } from '../estado';
import { usarAlmacen } from '../usarAlmacen';
import type { Equipo, EstadoApp, Id, Minutos, Persona, RestriccionPersona, TipoRestriccion } from '../../modelo/tipos';
import { nuevoId } from '../../modelo/ids';
import {
  anadirPersona,
  borrarPersona,
  crearPersona,
  duplicarPersona,
  erroresPersona,
  impactoBorrarPersona,
  reemplazarPersona,
} from '../../edicion/personas';
import {
  METADATOS_RESTRICCION,
  crearRestriccion,
  TIPOS_RESTRICCION_ORDENADOS,
  describirRestriccion,
  erroresRestriccion,
} from '../../reglas/metadatos-persona';
import type { CampoParam } from '../../reglas/metadatos';
import { Confirmacion } from '../componentes/Confirmacion';
import { EditorParams } from '../componentes/EditorParams';
import {
  CampoDuracion,
  CampoFecha,
  CampoTexto,
  Interruptor,
  ListaErrores,
  ListaMarcable,
  SelectorDureza,
} from '../componentes/campos';
import type { OpcionMarcable } from '../componentes/campos';
import './Personas.css';

const NOMBRES_EQUIPO: Record<Equipo, string> = { M: 'Mañana', T: 'Tarde', A: 'Ambos' };
const EQUIPOS: Equipo[] = ['M', 'T', 'A'];
const DURACION_POR_DEFECTO: Minutos = 40 * 60;

interface Borrador {
  id: Id;
  /** Persona tal y como estaba al empezar a editar. */
  base: Persona;
  valor: Persona;
}

type Pendiente = { texto: string; accion: () => void };

const MOTIVO_INVALIDO = 'Hay un valor que no se entiende';

/** Quita de la lista los ids que ya no existen en el almacén. */
const existentes = (ids: Id[], vivos: Set<Id>) => ids.filter((i) => vivos.has(i));

const mismo = (a: Persona, b: Persona) => JSON.stringify(a) === JSON.stringify(b);

function Selector({
  id, etiqueta, valor, opciones, onCambio,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  opciones: { valor: string; texto: string }[];
  onCambio: (v: string) => void;
}) {
  return (
    <div class="campo">
      <label for={id}>{etiqueta}</label>
      <select id={id} value={valor} onChange={(e) => onCambio(e.currentTarget.value)}>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </div>
  );
}

function DuracionAnulable({
  id, etiqueta, ayuda, valor, onCambio, onValidez,
}: {
  id: string;
  etiqueta: string;
  ayuda?: string;
  valor: Minutos | null;
  onCambio: (v: Minutos | null) => void;
  onValidez: (valido: boolean) => void;
}) {
  return (
    <div class="duracion-anulable">
      {valor !== null && <CampoDuracion id={id} etiqueta={etiqueta} ayuda={ayuda} valor={valor} onCambio={onCambio} onValidez={onValidez} />}
      {valor === null && (
        <div class="campo">
          <span>{etiqueta}</span>
          {ayuda && <small class="ayuda">{ayuda}</small>}
        </div>
      )}
      <Interruptor
        id={`${id}-sindefinir`}
        etiqueta="Sin definir"
        valor={valor === null}
        onCambio={(sin) => {
          onValidez(true);
          onCambio(sin ? null : DURACION_POR_DEFECTO);
        }}
      />
    </div>
  );
}

function nombresHabilitaciones(p: Persona, estado: EstadoApp): string {
  const nombres: string[] = [];
  for (const a of estado.areas) if (p.habilitaciones.includes(a.id)) nombres.push(a.nombre);
  for (const pu of estado.puestos) if (p.habilitaciones.includes(pu.id)) nombres.push(pu.nombre);
  return nombres.join(', ');
}

export function Personas({ almacen }: { almacen: AlmacenApp }) {
  const estado = usarAlmacen(almacen);
  const [seleccion, setSeleccion] = useState<Id | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [soloActivas, setSoloActivas] = useState(false);
  const [filtroEquipo, setFiltroEquipo] = useState<'' | Equipo>('');
  const [filtroArea, setFiltroArea] = useState('');
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false);
  const [foco, setFoco] = useState<string | null>(null);
  const [invalidos, setInvalidos] = useState<ReadonlySet<string>>(new Set());
  const [avisoLimpieza, setAvisoLimpieza] = useState<string | null>(null);
  const [tipoNuevo, setTipoNuevo] = useState<TipoRestriccion>(TIPOS_RESTRICCION_ORDENADOS[0] ?? 'diasNoDisponibles');

  useEffect(() => {
    if (foco === null) return;
    document.getElementById(foco)?.focus();
    setFoco(null);
  }, [foco]);

  const marcarValidez = (id: string) => (valido: boolean) =>
    setInvalidos((prev) => {
      if (prev.has(id) === !valido) return prev;
      const nuevo = new Set(prev);
      if (valido) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  const olvidarValidez = (prefijo: string) =>
    setInvalidos((prev) => {
      const nuevo = new Set([...prev].filter((k) => !k.startsWith(prefijo)));
      return nuevo.size === prev.size ? prev : nuevo;
    });
  const descartarBorrador = () => {
    setBorrador(null);
    setInvalidos(new Set());
  };

  // Si se borra un área o puesto que el borrador usa, se quita del borrador: no se podría corregir de otro modo.
  useEffect(() => {
    if (!borrador) return;
    const vivos = new Set<Id>([...estado.areas.map((a) => a.id), ...estado.puestos.map((p) => p.id)]);
    const v = borrador.valor;
    const habilitaciones = existentes(v.habilitaciones, vivos);
    let cambiado = habilitaciones.length !== v.habilitaciones.length;
    const restricciones = v.restricciones.map((r) => {
      if (r.tipo !== 'noAsignarA') return r;
      const areaIds = existentes(r.params.ambito.areaIds, vivos);
      const puestoIds = existentes(r.params.ambito.puestoIds, vivos);
      if (areaIds.length === r.params.ambito.areaIds.length && puestoIds.length === r.params.ambito.puestoIds.length) return r;
      cambiado = true;
      return { ...r, params: { ...r.params, ambito: { ...r.params.ambito, areaIds, puestoIds } } };
    });
    if (!cambiado) return;
    setBorrador({ ...borrador, valor: { ...v, habilitaciones, restricciones } });
    setAvisoLimpieza('Se han quitado de la ficha áreas o puestos que ya no existen.');
  }, [estado.areas, estado.puestos, borrador]);

  const guardada = seleccion === null ? undefined : estado.personas.find((p) => p.id === seleccion);
  const hayBorrador = borrador !== null && borrador.id === seleccion && guardada !== undefined;
  const sucio = hayBorrador && !mismo(borrador.valor, borrador.base);
  const persona: Persona | undefined = hayBorrador && sucio ? borrador.valor : guardada;

  const areasOrdenadas = useMemo(
    () => [...estado.areas].sort((a, b) => a.planta - b.planta || a.orden - b.orden),
    [estado.areas],
  );

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return estado.personas.filter((p) => {
      if (soloActivas && !p.activa) return false;
      if (filtroEquipo && p.equipo !== filtroEquipo) return false;
      if (q && !p.codigo.toLowerCase().includes(q) && !(p.alias ?? '').toLowerCase().includes(q)) return false;
      if (filtroArea) {
        const enArea = p.habilitaciones.includes(filtroArea) ||
          estado.puestos.some((pu) => pu.areaId === filtroArea && p.habilitaciones.includes(pu.id));
        if (!enArea) return false;
      }
      return true;
    });
  }, [estado, busqueda, soloActivas, filtroEquipo, filtroArea]);

  /** Ejecuta la acción; si hay cambios sin guardar, antes pide confirmación. */
  function conConfirmacion(texto: string, accion: () => void) {
    if (sucio) setPendiente({ texto, accion });
    else accion();
  }

  function seleccionar(id: Id | null, enfocar?: string) {
    setSeleccion(id);
    descartarBorrador();
    setAvisoLimpieza(null);
    setConfirmandoBorrar(false);
    if (enfocar) setFoco(enfocar);
  }

  function editar(cambio: (p: Persona) => Persona) {
    if (!persona || !guardada) return;
    const base = hayBorrador && sucio ? borrador.base : guardada;
    setBorrador({ id: persona.id, base, valor: cambio(persona) });
  }

  // ───────── Acciones ─────────

  function anadir() {
    conConfirmacion('Tienes cambios sin guardar. ¿Descartarlos y añadir una persona nueva?', () => {
      const nueva = crearPersona(almacen.obtener());
      almacen.aplicar(`Añadir ${nueva.codigo}`, (e) => anadirPersona(e, nueva));
      seleccionar(nueva.id, 'persona-codigo');
    });
  }

  function duplicar() {
    if (!guardada) return;
    conConfirmacion('Tienes cambios sin guardar. ¿Descartarlos y duplicar la persona guardada?', () => {
      const generados: Id[] = [];
      const ids = () => {
        const id = nuevoId('per');
        generados.push(id);
        return id;
      };
      almacen.aplicar(`Duplicar ${guardada.codigo}`, (e) => duplicarPersona(e, guardada.id, ids));
      const nuevaId = generados[0];
      if (nuevaId) seleccionar(nuevaId, 'persona-codigo');
    });
  }

  function guardar() {
    if (!persona || !sucio) return;
    const limpia: Persona = { ...persona, codigo: persona.codigo.trim(), alias: persona.alias?.trim() ? persona.alias.trim() : null };
    almacen.aplicar(`Editar ${limpia.codigo}`, (e) => reemplazarPersona(e, limpia));
    descartarBorrador();
  }

  function borrar() {
    if (!guardada) return;
    const indice = visibles.findIndex((p) => p.id === guardada.id);
    const vecina = visibles[indice + 1] ?? visibles[indice - 1];
    almacen.aplicar(`Borrar ${guardada.codigo}`, (e) => borrarPersona(e, guardada.id));
    seleccionar(vecina?.id ?? null, vecina ? `fila-${vecina.id}` : 'personas-anadir');
  }

  function alternarActiva(p: Persona) {
    almacen.aplicar(`${p.activa ? 'Desactivar' : 'Activar'} ${p.codigo}`, (e) =>
      reemplazarPersona(e, { ...p, activa: !p.activa }),
    );
    if (borrador && borrador.id === p.id) {
      setBorrador({ ...borrador, base: { ...borrador.base, activa: !p.activa }, valor: { ...borrador.valor, activa: !p.activa } });
    }
  }

  // ───────── Errores ─────────

  const errores: string[] = persona
    ? [
        ...erroresPersona(estado, persona),
        ...(invalidos.size > 0 ? [MOTIVO_INVALIDO] : []),
        ...persona.restricciones.flatMap((r) =>
          erroresRestriccion(r, estado).map((m) => `${persona.codigo.trim() || 'La persona'} · ${describirRestriccion(r, estado)}: ${m}`),
        ),
      ]
    : [];

  const opcionesHabilitacion: OpcionMarcable[] = areasOrdenadas.flatMap((a) => [
    { valor: a.id, etiqueta: `Toda el área ${a.nombre}`, grupo: a.nombre },
    ...estado.puestos.filter((pu) => pu.areaId === a.id).map((pu) => ({ valor: pu.id, etiqueta: pu.nombre, grupo: a.nombre })),
  ]);

  const impacto = confirmandoBorrar && guardada ? impactoBorrarPersona(estado, guardada.id) : null;

  return (
    <section class="personas" aria-labelledby="personas-titulo">
      <div class="personas-lista">
        <h2 id="personas-titulo">Personas</h2>
        <div class="personas-filtros">
          <div class="campo">
            <label for="personas-buscar">Buscar por código o alias</label>
            <input
              id="personas-buscar"
              type="search"
              value={busqueda}
              onInput={(e) => setBusqueda(e.currentTarget.value)}
            />
          </div>
          <Selector
            id="personas-f-activas"
            etiqueta="Mostrar"
            valor={soloActivas ? 'activas' : 'todas'}
            opciones={[{ valor: 'todas', texto: 'Todas' }, { valor: 'activas', texto: 'Solo activas' }]}
            onCambio={(v) => setSoloActivas(v === 'activas')}
          />
          <Selector
            id="personas-f-equipo"
            etiqueta="Equipo"
            valor={filtroEquipo}
            opciones={[{ valor: '', texto: 'Todos' }, ...EQUIPOS.map((q) => ({ valor: q, texto: NOMBRES_EQUIPO[q] }))]}
            onCambio={(v) => setFiltroEquipo(v === 'M' || v === 'T' || v === 'A' ? v : '')}
          />
          <Selector
            id="personas-f-area"
            etiqueta="Habilitada en"
            valor={filtroArea}
            opciones={[{ valor: '', texto: 'Cualquier área' }, ...areasOrdenadas.map((a) => ({ valor: a.id, texto: a.nombre }))]}
            onCambio={setFiltroArea}
          />
        </div>
        <div class="fila" style={{ marginBottom: '6px' }}>
          <button type="button" id="personas-anadir" class="boton primario" onClick={anadir}>
            Añadir persona
          </button>
          <span class="ayuda" role="status" style={{ margin: 0 }}>
            {visibles.length} de {estado.personas.length} personas
          </span>
        </div>
        <div class="personas-tabla-marco">
          <table class="personas-tabla">
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Alias</th>
                <th scope="col">Equipo</th>
                <th scope="col">Habilitaciones</th>
                <th scope="col" class="num">Restr.</th>
                <th scope="col">Activa</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id} class={`${p.id === seleccion ? 'seleccionada' : ''} ${p.activa ? '' : 'inactiva'}`}>
                  <td>
                    <button
                      type="button"
                      id={`fila-${p.id}`}
                      class="enlace-fila"
                      aria-current={p.id === seleccion ? 'true' : undefined}
                      onClick={() => {
                        if (p.id !== seleccion) conConfirmacion(`Tienes cambios sin guardar en ${persona?.codigo ?? 'la ficha'}. ¿Descartarlos y abrir ${p.codigo}?`, () => seleccionar(p.id));
                      }}
                    >
                      {p.codigo}
                    </button>
                  </td>
                  <td>{p.alias ?? ''}</td>
                  <td>{NOMBRES_EQUIPO[p.equipo]}</td>
                  <td>{nombresHabilitaciones(p, estado)}</td>
                  <td class="num">{p.restricciones.length}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={p.activa}
                      aria-label={`Activa ${p.codigo}`}
                      onChange={() => alternarActiva(p)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibles.length === 0 && <p class="vacio">No hay personas que coincidan con los filtros.</p>}
        </div>
      </div>

      <div class="personas-ficha">
        {pendiente && (
          <Confirmacion
            id="personas-pendiente"
            titulo="Cambios sin guardar"
            texto={pendiente.texto}
            textoConfirmar="Descartar cambios"
            alConfirmar={() => {
              const { accion } = pendiente;
              setPendiente(null);
              descartarBorrador();
              accion();
            }}
            alCancelar={() => setPendiente(null)}
          />
        )}
        {avisoLimpieza && persona && (
          <p class="mensaje aviso" role="status">
            {avisoLimpieza}
          </p>
        )}
        {!persona && <p class="vacio">Elige una persona de la lista o añade una nueva.</p>}
        {persona && guardada && (
          <div class="ficha personas-ficha-cuerpo">
            <h3>Ficha de {guardada.codigo}</h3>
            <div class="rejilla-campos">
              <CampoTexto id="persona-codigo" etiqueta="Código" valor={persona.codigo} onCambio={(v) => editar((p) => ({ ...p, codigo: v }))} />
              <CampoTexto
                id="persona-alias"
                etiqueta="Alias (opcional)"
                ayuda="Solo se guarda en este navegador; la copia de seguridad puede excluirlo"
                valor={persona.alias ?? ''}
                maxLongitud={40}
                onCambio={(v) => editar((p) => ({ ...p, alias: v === '' ? null : v }))}
              />
              <Selector
                id="persona-equipo"
                etiqueta="Equipo"
                valor={persona.equipo}
                opciones={EQUIPOS.map((q) => ({ valor: q, texto: NOMBRES_EQUIPO[q] }))}
                onCambio={(v) => editar((p) => ({ ...p, equipo: v === 'T' || v === 'A' ? v : 'M' }))}
              />
              <Interruptor id="persona-activa" etiqueta="Activa" valor={persona.activa} onCambio={(v) => editar((p) => ({ ...p, activa: v }))} />
              <CampoFecha id="persona-alta" etiqueta="Alta" valor={persona.alta} onCambio={(v) => editar((p) => ({ ...p, alta: v }))} />
              <CampoFecha id="persona-baja" etiqueta="Baja" valor={persona.baja} onCambio={(v) => editar((p) => ({ ...p, baja: v }))} />
              <DuracionAnulable
                id="persona-contrato"
                etiqueta="Horas de contrato a la semana"
                valor={persona.contratoMinSemana}
                onValidez={marcarValidez('persona-contrato')}
                onCambio={(v) => editar((p) => ({ ...p, contratoMinSemana: v }))}
              />
              <DuracionAnulable
                id="persona-objetivo"
                etiqueta="Objetivo de cobertura a la semana"
                ayuda="Horas que se quieren cubrir con esta persona; no es lo mismo que el contrato."
                valor={persona.objetivoCoberturaMinSemana}
                onValidez={marcarValidez('persona-objetivo')}
                onCambio={(v) => editar((p) => ({ ...p, objetivoCoberturaMinSemana: v }))}
              />
            </div>

            <ListaMarcable
              id="persona-hab"
              leyenda="Habilitaciones"
              opciones={opcionesHabilitacion}
              valor={persona.habilitaciones}
              vacio="Aún no hay áreas ni puestos."
              onCambio={(v) => editar((p) => ({ ...p, habilitaciones: v }))}
            />

            <h3>Restricciones</h3>
            {persona.restricciones.length === 0 && <p class="ayuda">Sin restricciones.</p>}
            <ul class="lista-ficha">
              {persona.restricciones.map((r, i) => {
                const meta = METADATOS_RESTRICCION[r.tipo];
                const idR = `restr-${r.id}`;
                const cambiar = (nueva: RestriccionPersona) =>
                  editar((p) => ({ ...p, restricciones: p.restricciones.map((x) => (x.id === r.id ? nueva : x)) }));
                return (
                  <li key={r.id}>
                    <div class="restriccion-titulo">
                      <strong>{describirRestriccion(r, estado)}</strong>
                      <button
                        type="button"
                        class="boton"
                        aria-label={`Quitar restricción ${i + 1}: ${meta.nombre}`}
                        onClick={() => {
                          olvidarValidez(idR);
                          editar((p) => ({ ...p, restricciones: p.restricciones.filter((x) => x.id !== r.id) }));
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                    <EditorParams
                      campos={meta.campos as unknown as ReadonlyArray<CampoParam<object>>}
                      valor={r.params as object}
                      datos={estado}
                      idBase={idR}
                      onValidez={marcarValidez(idR)}
                      onCambio={(params) => cambiar({ ...r, params } as unknown as RestriccionPersona)}
                    />
                    <SelectorDureza
                      id={`${idR}-dureza`}
                      valor={{ dura: r.dura, peso: r.peso }}
                      restringir={meta.dureza === 'soloDura' ? 'soloDura' : meta.dureza === 'soloBlanda' ? 'soloBlanda' : undefined}
                      onCambio={(d) => cambiar({ ...r, dura: d.dura, peso: d.peso } as RestriccionPersona)}
                    />
                    <Interruptor id={`${idR}-activa`} etiqueta="Restricción activa" valor={r.activa} onCambio={(v) => cambiar({ ...r, activa: v } as RestriccionPersona)} />
                    <div class="restriccion-nota">
                      <CampoTexto
                        id={`${idR}-nota`}
                        etiqueta="Nota"
                        ayuda="Sin datos personales ni motivos: solo lo necesario para planificar"
                        valor={r.nota}
                        onCambio={(v) => cambiar({ ...r, nota: v } as RestriccionPersona)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div class="restriccion-nueva">
              <Selector
                id="persona-tipo-restriccion"
                etiqueta="Tipo de restricción"
                valor={tipoNuevo}
                opciones={TIPOS_RESTRICCION_ORDENADOS.map((t) => ({ valor: t, texto: METADATOS_RESTRICCION[t].nombre }))}
                onCambio={(v) => {
                  const t = TIPOS_RESTRICCION_ORDENADOS.find((x) => x === v);
                  if (t) setTipoNuevo(t);
                }}
              />
              <button
                type="button"
                class="boton"
                onClick={() => editar((p) => ({ ...p, restricciones: [...p.restricciones, crearRestriccion(tipoNuevo, estado)] }))}
              >
                Añadir restricción
              </button>
            </div>

            <div class="personas-acciones">
              <ListaErrores errores={errores} titulo="No se puede guardar todavía" />
              <div class="fila">
                <button type="button" class="boton primario" disabled={!sucio || errores.length > 0} onClick={guardar}>
                  Guardar cambios
                </button>
                <button type="button" class="boton" disabled={!sucio} onClick={descartarBorrador}>
                  Descartar cambios
                </button>
                <button type="button" class="boton" onClick={duplicar}>
                  Duplicar
                </button>
                <button
                  type="button"
                  id="personas-ficha-borrar"
                  class="boton peligro"
                  onClick={() => conConfirmacion('Tienes cambios sin guardar. ¿Descartarlos y continuar con el borrado?', () => setConfirmandoBorrar(true))}
                >
                  Borrar
                </button>
              </div>
              {sucio && <p class="ayuda" role="status">Hay cambios sin guardar.</p>}
              {impacto && impacto.bloqueos.length > 0 && (
                <div class="mensaje aviso" role="alert">
                  No se puede borrar {guardada.codigo}:
                  <ul>
                    {impacto.bloqueos.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                  <button type="button" class="boton" onClick={() => setConfirmandoBorrar(false)}>
                    Entendido
                  </button>
                </div>
              )}
              {impacto && impacto.bloqueos.length === 0 && (
                <Confirmacion
                  id="personas-borrar"
                  titulo={`Borrar ${guardada.codigo}`}
                  texto={
                    impacto.efectos.length > 0
                      ? 'Al borrar esta persona ocurrirá lo siguiente. Podrás deshacerlo después.'
                      : 'Se borrará la persona. No tiene asignaciones ni incidencias. Podrás deshacerlo después.'
                  }
                  lista={impacto.efectos}
                  textoConfirmar="Borrar"
                  alConfirmar={borrar}
                  alCancelar={() => {
                    setConfirmandoBorrar(false);
                    setFoco('personas-ficha-borrar');
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
