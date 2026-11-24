import { useState } from 'preact/hooks';
import './Reglas.css';
import type { EstadoValidacion, ReglaGeneral, TipoReglaGeneral } from '../../modelo/tipos';
import type { CampoParam } from '../../reglas/metadatos';
import { METADATOS_GENERAL, TIPOS_GENERAL_ORDENADOS, crearReglaGeneral, describirRegla, erroresRegla } from '../../reglas/metadatos-general';
import { ambitoVaciado } from '../../edicion/comun';
import { anadirRegla, borrarRegla, cambiarEstadoRegla, duplicarRegla, reemplazarRegla, validarPendientes } from '../../edicion/reglas';
import { nuevoId } from '../../modelo/ids';
import type { AlmacenApp } from '../estado';
import { usarAlmacen } from '../usarAlmacen';
import { Confirmacion } from '../componentes/Confirmacion';
import { EditorParams } from '../componentes/EditorParams';
import { CampoTexto, Interruptor, ListaErrores, SelectorDureza } from '../componentes/campos';
import { IconoAviso } from '../iconos';

const NOMBRE_ESTADO: Record<EstadoValidacion, string> = {
  pendiente: 'Pendiente de validar',
  validada: 'Validada',
  descartada: 'Descartada',
};

const GRUPOS: { estado: EstadoValidacion; titulo: string }[] = [
  { estado: 'pendiente', titulo: 'Pendientes de validar' },
  { estado: 'validada', titulo: 'Validadas' },
  { estado: 'descartada', titulo: 'Descartadas' },
];

const textoDureza = (r: ReglaGeneral) => (r.dura ? 'Obligatoria' : `Preferible (peso ${r.peso})`);

type Confirmando = 'validarTodas' | 'borrar' | null;

interface Edicion {
  id: string;
  /** Regla guardada tal y como estaba al empezar a editar. */
  base: ReglaGeneral;
  valor: ReglaGeneral;
}

interface Pendiente {
  titulo: string;
  texto: string;
  textoConfirmar: string;
  accion: () => void;
}

const igual = (a: ReglaGeneral, b: ReglaGeneral) => JSON.stringify(a) === JSON.stringify(b);
const TEXTO_VACIADA =
  'Esta regla se quedó sin puestos al borrar un área o un puesto. Si la activas sin elegir puestos, se aplicará a TODOS los puestos.';
const MOTIVO_INVALIDO = 'Hay un valor que no se entiende';

export function Reglas({ almacen }: { almacen: AlmacenApp }) {
  const estado = usarAlmacen(almacen);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [paramsInvalidos, setParamsInvalidos] = useState(false);
  const [confirmando, setConfirmando] = useState<Confirmando>(null);
  const [anadiendo, setAnadiendo] = useState(false);
  const [tipoNuevo, setTipoNuevo] = useState<TipoReglaGeneral>(TIPOS_GENERAL_ORDENADOS[0] ?? 'sinSolapes');

  const pendientes = estado.reglas.filter((r) => r.estado === 'pendiente').length;
  const guardada = estado.reglas.find((r) => r.id === seleccion) ?? null;
  const hayCambios = guardada !== null && edicion !== null && edicion.id === guardada.id && !igual(edicion.valor, edicion.base);
  const borrador = guardada ? (hayCambios && edicion ? edicion.valor : guardada) : null;
  // La regla guardada cambió por otro camino (deshacer, estado…) mientras había un borrador.
  const obsoleto = hayCambios && edicion !== null && guardada !== null && !igual(edicion.base, guardada);

  const errores = borrador
    ? [
        ...(borrador.nombre.trim() === '' ? ['El nombre no puede estar vacío'] : []),
        ...erroresRegla(borrador, estado),
        ...(paramsInvalidos ? [MOTIVO_INVALIDO] : []),
      ]
    : [];

  function editar(cambio: Partial<ReglaGeneral>) {
    if (!guardada || !borrador) return;
    const base = hayCambios && edicion ? edicion.base : guardada;
    setEdicion({ id: guardada.id, base, valor: { ...borrador, ...cambio } as ReglaGeneral });
  }

  function descartarBorrador() {
    setEdicion(null);
    setParamsInvalidos(false);
  }

  /** Ejecuta la acción; si hay cambios sin guardar, antes pide confirmación. */
  function conConfirmacion(texto: string, accion: () => void) {
    if (hayCambios) setPendiente({ titulo: 'Cambios sin guardar', texto, textoConfirmar: 'Sí, descartar y continuar', accion });
    else accion();
  }

  /** Pide confirmación si activar la regla la dejaría aplicándose a todos los puestos por error. */
  function conAvisoDeActivacion(regla: ReglaGeneral, activa: boolean, accion: () => void) {
    if (activa && ambitoVaciado(regla)) {
      setPendiente({ titulo: 'Activar una regla sin puestos', texto: TEXTO_VACIADA, textoConfirmar: 'Activar igualmente', accion });
    } else accion();
  }

  function seleccionar(id: string) {
    setSeleccion(id);
    descartarBorrador();
    setConfirmando(null);
  }

  function alternarActivaFila(r: ReglaGeneral, activa: boolean) {
    conAvisoDeActivacion(r, activa, () => {
      almacen.aplicar(`${activa ? 'Activar' : 'Desactivar'} regla «${r.nombre}»`, (s) => reemplazarRegla(s, { ...r, activa }));
      if (hayCambios && edicion && edicion.id === r.id) {
        setEdicion({ ...edicion, base: { ...edicion.base, activa }, valor: { ...edicion.valor, activa } });
      }
    });
  }

  function aplicarEstado(r: ReglaGeneral, nuevo: EstadoValidacion, descripcion: string) {
    almacen.aplicar(descripcion, (e) => cambiarEstadoRegla(e, r.id, nuevo));
  }

  function guardar() {
    if (!guardada || !borrador || errores.length > 0) return;
    almacen.aplicar(`Editar regla «${guardada.nombre}»`, (e) => reemplazarRegla(e, borrador));
    descartarBorrador();
  }

  function anadir() {
    conConfirmacion('Tienes cambios sin guardar en la regla abierta. ¿Descartarlos y añadir una regla nueva?', crearNueva);
  }

  function crearNueva() {
    const regla = crearReglaGeneral(tipoNuevo, estado);
    almacen.aplicar(`Añadir regla «${regla.nombre}»`, (e) => anadirRegla(e, regla));
    seleccionar(regla.id);
    setAnadiendo(false);
  }

  function duplicar(r: ReglaGeneral) {
    const id = nuevoId('regla');
    almacen.aplicar(`Duplicar regla «${r.nombre}»`, (e) => duplicarRegla(e, r.id, () => id));
    seleccionar(id);
  }

  function borrar(r: ReglaGeneral) {
    almacen.aplicar(`Borrar regla «${r.nombre}»`, (e) => borrarRegla(e, r.id));
    setSeleccion(null);
    descartarBorrador();
    setConfirmando(null);
  }

  const meta = borrador ? METADATOS_GENERAL[borrador.tipo] : null;

  return (
    <section aria-labelledby="reglas-titulo">
      <div class="reglas-cabecera">
        <div>
          <h2 id="reglas-titulo">Reglas</h2>
          <p class="ayuda">Condiciones que debe cumplir cualquier cuadrante. Las obligatorias no admiten excepciones; las preferibles se intentan cumplir.</p>
        </div>
        <button type="button" class="boton" aria-expanded={anadiendo} onClick={() => setAnadiendo(!anadiendo)}>
          Añadir regla
        </button>
      </div>

      {pendientes > 0 && (
        <div class="reglas-banda" role="status">
          <IconoAviso />
          <p>
            Hay {pendientes} {pendientes === 1 ? 'regla pendiente' : 'reglas pendientes'} de validar. Se cargaron a partir de un cuadrante real y
            aún no están confirmadas.
          </p>
          <button type="button" class="boton" onClick={() => setConfirmando('validarTodas')}>
            Validar todas
          </button>
        </div>
      )}
      {confirmando === 'validarTodas' && (
        <Confirmacion
          id="conf-validar-todas"
          titulo="Validar todas las reglas pendientes"
          texto={`Se validarán todas las pendientes (${pendientes === 1 ? '1 regla validada' : `${pendientes} reglas validadas`}). Podrás deshacerlo después.`}
          textoConfirmar="Sí, validar todas"
          alConfirmar={() => {
            almacen.aplicar('Validar todas las reglas', validarPendientes);
            setConfirmando(null);
          }}
          alCancelar={() => setConfirmando(null)}
        />
      )}

      {pendiente && (
        <Confirmacion
          id="conf-regla-pendiente"
          titulo={pendiente.titulo}
          texto={pendiente.texto}
          textoConfirmar={pendiente.textoConfirmar}
          alConfirmar={() => {
            const { accion } = pendiente;
            setPendiente(null);
            accion();
          }}
          alCancelar={() => setPendiente(null)}
        />
      )}

      {anadiendo && (
        <div class="reglas-anadir">
          <label class="campo" for="regla-tipo-nuevo">
            <span>Tipo de regla</span>
            <select id="regla-tipo-nuevo" value={tipoNuevo} onChange={(e) => setTipoNuevo(e.currentTarget.value as TipoReglaGeneral)}>
              {TIPOS_GENERAL_ORDENADOS.map((t) => (
                <option key={t} value={t}>
                  {METADATOS_GENERAL[t].nombre}: {METADATOS_GENERAL[t].ayuda}
                </option>
              ))}
            </select>
          </label>
          <p class="ayuda">{METADATOS_GENERAL[tipoNuevo].ayuda}</p>
          <div class="fila">
            <button type="button" class="boton primario" onClick={anadir}>
              Crear regla de este tipo
            </button>
            <button type="button" class="boton" onClick={() => setAnadiendo(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div class="reglas-cuerpo">
        <div>
          {estado.reglas.length === 0 && <p class="vacio">No hay reglas. Pulsa «Añadir regla» para crear la primera.</p>}
          {GRUPOS.map(({ estado: grupo, titulo }) => {
            const reglas = estado.reglas.filter((r) => r.estado === grupo);
            if (reglas.length === 0) return null;
            return (
              <div class="reglas-grupo" key={grupo}>
                <h3>
                  {titulo} ({reglas.length})
                </h3>
                <ul class="reglas-lista">
                  {reglas.map((r) => {
                    const fallos = erroresRegla(r, estado);
                    return (
                      <li
                        key={r.id}
                        class={`regla-fila${r.id === seleccion ? ' seleccionada' : ''}${r.estado === 'descartada' ? ' descartada' : ''}`}
                      >
                        <button
                          type="button"
                          class="regla-nombre"
                          aria-current={r.id === seleccion ? 'true' : undefined}
                          onClick={() => {
                            if (r.id === seleccion) return;
                            conConfirmacion(
                              `Tienes cambios sin guardar en «${guardada?.nombre ?? 'la regla abierta'}». ¿Descartarlos y abrir «${r.nombre}»?`,
                              () => seleccionar(r.id),
                            );
                          }}
                        >
                          {r.nombre}
                        </button>
                        <div class="casilla" style="margin:0">
                          <input
                            id={`regla-activa-${r.id}`}
                            type="checkbox"
                            checked={r.activa}
                            aria-label={`Activa: ${r.nombre}`}
                            onChange={(e) => {
                              const activa = e.currentTarget.checked;
                              // Si hace falta confirmar, la casilla no cambia hasta que se acepte.
                              e.currentTarget.checked = r.activa;
                              alternarActivaFila(r, activa);
                            }}
                          />
                          <label for={`regla-activa-${r.id}`} aria-hidden="true">
                            Activa
                          </label>
                        </div>
                        <p class="regla-descripcion">{describirRegla(r, estado)}</p>
                        <p class="regla-meta">
                          {r.estado === 'descartada' ? 'Descartada: no se aplica' : `${textoDureza(r)} · ${NOMBRE_ESTADO[r.estado]}`}
                          {r.estado !== 'descartada' && !r.activa ? ' · Desactivada' : ''}
                        </p>
                        {fallos.length > 0 && (
                          <p class="regla-aviso">
                            <IconoAviso /> Revisa los parámetros: {fallos[0]}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        <div>
          {!guardada || !borrador || !meta ? (
            <p class="vacio">Elige una regla de la lista para ver y editar su ficha.</p>
          ) : (
            <div class="ficha regla-ficha" role="group" aria-label={`Ficha de la regla ${guardada.nombre}`}>
              <h3>Ficha de la regla</h3>
              <p class="ayuda">
                Estado: <strong>{NOMBRE_ESTADO[guardada.estado]}</strong>
                {guardada.estado === 'descartada' ? ' (no se aplica)' : ''}
              </p>
              <div class="fila">
                {guardada.estado !== 'validada' && (
                  <button
                    type="button"
                    class="boton"
                    disabled={hayCambios}
                    onClick={() => aplicarEstado(guardada, 'validada', `Validar regla «${guardada.nombre}»`)}
                  >
                    Validar
                  </button>
                )}
                {guardada.estado !== 'descartada' && (
                  <button
                    type="button"
                    class="boton"
                    disabled={hayCambios}
                    onClick={() => aplicarEstado(guardada, 'descartada', `Descartar regla «${guardada.nombre}»`)}
                  >
                    Descartar regla
                  </button>
                )}
                {guardada.estado !== 'descartada' && (
                  <span class="ayuda" style="margin:0">
                    No se aplicará, pero se conserva
                  </span>
                )}
                {guardada.estado !== 'pendiente' && (
                  <button
                    type="button"
                    class="boton"
                    disabled={hayCambios}
                    onClick={() => aplicarEstado(guardada, 'pendiente', `Volver a pendiente la regla «${guardada.nombre}»`)}
                  >
                    Volver a pendiente
                  </button>
                )}
              </div>
              {obsoleto && (
                <div class="mensaje aviso" role="alert">
                  <p>La regla ha cambiado mientras la editabas. Tus cambios se conservan; si guardas, sustituirán a la versión actual.</p>
                  <button type="button" class="boton" onClick={descartarBorrador}>
                    Descartar el borrador
                  </button>
                </div>
              )}
              {hayCambios && <p class="ayuda">Guarda o deshaz los cambios antes de cambiar el estado de la regla.</p>}

              <CampoTexto id="regla-nombre" etiqueta="Nombre" valor={borrador.nombre} maxLongitud={80} onCambio={(nombre) => editar({ nombre })} />
              <p>
                <strong>Tipo:</strong> {meta.nombre}
              </p>
              <p class="ayuda">{meta.ayuda}</p>

              {meta.campos.length > 0 && (
                <EditorParams
                  idBase={`regla-${borrador.id}`}
                  campos={meta.campos as unknown as ReadonlyArray<CampoParam<object>>}
                  valor={borrador.params as object}
                  datos={estado}
                  onValidez={(valido) => setParamsInvalidos(!valido)}
                  onCambio={(params) => editar({ params } as Partial<ReglaGeneral>)}
                />
              )}

              <SelectorDureza
                id={`regla-dureza-${borrador.id}`}
                valor={{ dura: borrador.dura, peso: borrador.peso }}
                restringir={meta.dureza === 'ambas' ? undefined : meta.dureza}
                onCambio={(d) => editar({ dura: d.dura, peso: d.peso })}
              />
              <Interruptor
                id="regla-activa"
                etiqueta="Regla activa" valor={borrador.activa}
                onCambio={(activa) => conAvisoDeActivacion(borrador, activa, () => editar({ activa }))}
              />
              <label class="campo" for="regla-nota">
                <span>Nota</span>
                <textarea
                  id="regla-nota"
                  value={borrador.nota}
                  onInput={(e) => editar({ nota: e.currentTarget.value })}
                />
                <span class="ayuda">Sin datos personales ni motivos: solo lo necesario para planificar.</span>
              </label>

              <ListaErrores errores={errores} titulo="No se puede guardar todavía" />
              <div class="fila">
                <button type="button" class="boton primario" disabled={errores.length > 0 || !hayCambios} onClick={guardar}>
                  Guardar cambios
                </button>
                <button type="button" class="boton" disabled={!hayCambios} onClick={descartarBorrador}>
                  Descartar cambios
                </button>
                <button type="button" class="boton" disabled={hayCambios} onClick={() => duplicar(guardada)}>
                  Duplicar
                </button>
                <button type="button" class="boton peligro" onClick={() => setConfirmando('borrar')}>
                  Borrar
                </button>
              </div>
              {confirmando === 'borrar' && (
                <Confirmacion
                  id="conf-borrar-regla"
                  titulo={`Borrar la regla «${guardada.nombre}»`}
                  texto="La regla dejará de existir. Podrás deshacerlo después. Si solo quieres que no se aplique, usa «Descartar regla» o desactívala."
                  textoConfirmar="Sí, borrar regla"
                  alConfirmar={() => borrar(guardada)}
                  alCancelar={() => setConfirmando(null)}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
