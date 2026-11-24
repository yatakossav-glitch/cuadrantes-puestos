/** Sección Rotación (ARQUITECTURA §12.4): ciclo, calendario, semanas tipo y patrones por persona. */
import { useEffect, useState } from 'preact/hooks';
import {
  MAX_CICLO, borrarSemanaTipo, cambiarPasoPatron, cambiarRotacion, erroresRotacion, etiquetasPorDefecto,
  guardarSemanaTipo, impactoCambiarRotacion, impactoGuardarSemanaTipo, pasoPatron, quitarPatron, renombrarSemanaTipo,
} from '../../edicion/rotacion';
import { NOMBRES_DIA_CORTO, formatearFecha, lunesDe, sumarDias } from '../../modelo/fechas';
import type { DiaSemana, Equipo, EstadoApp, FechaISO, Id, PasoPatron, Persona, Rotacion as RotacionDatos, SemanaTipo } from '../../modelo/tipos';
import { semanaDelCiclo } from '../../rotacion/ciclo';
import { calendarioCiclo } from '../../rotacion/semanaTipo';
import { Confirmacion } from '../componentes/Confirmacion';
import { CampoFecha, CampoNumero, CampoTexto, ListaErrores, SelectorDias } from '../componentes/campos';
import type { AlmacenApp } from '../estado';
import { IconoCalendario, IconoRotacion } from '../iconos';
import { usarAlmacen } from '../usarAlmacen';
import './Rotacion.css';

const NOMBRES_EQUIPO: Record<Equipo, string> = { M: 'Mañana', T: 'Tarde', A: 'Ambos' };
const EQUIPOS: Equipo[] = ['M', 'T', 'A'];
const SEMANAS_CALENDARIO = 8;

const etiquetaDe = (r: RotacionDatos, i: number): string => r.etiquetas[i] ?? String(i + 1);
const igual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function Selector({
  id, etiqueta, valor, opciones, onCambio,
}: { id: string; etiqueta: string; valor: string; opciones: { valor: string; texto: string }[]; onCambio: (v: string) => void }) {
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

interface Pendiente {
  id: string;
  titulo: string;
  texto: string;
  lista: string[];
  textoConfirmar: string;
  accion: () => void;
}

/** Texto del paso de un patrón: «Mañana, libra sáb». */
function resumenPaso(p: PasoPatron): string {
  const partes: string[] = [p.equipo ? NOMBRES_EQUIPO[p.equipo] : 'Habitual'];
  if (p.diasLibres.length > 0) partes.push(`libra ${p.diasLibres.map((d) => NOMBRES_DIA_CORTO[d].toLowerCase()).join(', ')}`);
  return partes.join(', ');
}

function resumenPorDia(s: SemanaTipo): string {
  const cuentas = [0, 0, 0, 0, 0, 0, 0];
  for (const a of s.asignaciones) cuentas[a.dia] = (cuentas[a.dia] ?? 0) + 1;
  return cuentas.map((n, d) => `${NOMBRES_DIA_CORTO[d]} ${n}`).join(' · ');
}

// ───────────────────────── Ciclo ─────────────────────────

function Ciclo({ almacen, estado, pedir }: { almacen: AlmacenApp; estado: EstadoApp; pedir: (p: Pendiente) => void }) {
  const [borrador, setBorrador] = useState<RotacionDatos | null>(null);
  const r = borrador ?? estado.rotacion;
  const modificado = borrador !== null && !igual(borrador, estado.rotacion);
  const errores = erroresRotacion(r);
  const cambiar = (c: Partial<RotacionDatos>) => setBorrador({ ...r, ...c });

  function cambiarLongitud(n: number) {
    const largo = Math.min(Math.max(n, 0), 26);
    const defecto = etiquetasPorDefecto(largo);
    cambiar({ longitudCiclo: n, etiquetas: defecto.map((d, i) => r.etiquetas[i] ?? d) });
  }

  function guardar() {
    if (!borrador) return;
    const nueva = borrador;
    const aplicar = () => {
      almacen.aplicar('Cambiar la rotación', (e) => cambiarRotacion(e, nueva));
      setBorrador(null);
    };
    const impacto = impactoCambiarRotacion(estado, nueva);
    if (impacto.efectos.length === 0) aplicar();
    else {
      pedir({ id: 'rotacion-ciclo', titulo: '¿Guardar la nueva rotación?', texto: 'Esto es lo que va a ocurrir:', lista: impacto.efectos, textoConfirmar: 'Guardar rotación', accion: aplicar });
    }
  }

  return (
    <section class="ficha rotacion-bloque" aria-labelledby="rot-ciclo-titulo">
      <h3 id="rot-ciclo-titulo">
        <IconoRotacion /> Ciclo de rotación
      </h3>
      <p class="ayuda">Con un ciclo de 1 semana no hay rotación. Con 2 o más, cada semana lleva una letra que se repite.</p>
      <div class="rejilla-campos">
        <CampoNumero id="rot-longitud" etiqueta="Semanas del ciclo" valor={r.longitudCiclo} min={1} max={MAX_CICLO} onCambio={cambiarLongitud} />
        <CampoFecha
          id="rot-referencia"
          etiqueta="Lunes de la semana A"
          ayuda="Un lunes cualquiera que sea la primera semana del ciclo"
          valor={r.lunesReferencia}
          onCambio={(v) => cambiar({ lunesReferencia: v ?? '' })}
        />
      </div>
      <div class="rotacion-etiquetas" role="group" aria-label="Etiquetas de las semanas">
        {r.etiquetas.map((e, i) => (
          <CampoTexto
            key={i}
            id={`rot-etiqueta-${i}`}
            etiqueta={`Semana ${i + 1}`}
            valor={e}
            maxLongitud={12}
            onCambio={(v) => cambiar({ etiquetas: r.etiquetas.map((x, k) => (k === i ? v : x)) })}
          />
        ))}
      </div>
      <div class="barra-guardar">
        <div class="fila">
          <button type="button" class="boton primario" disabled={!modificado || errores.length > 0} onClick={guardar}>
            Guardar cambios
          </button>
          <button type="button" class="boton" disabled={!modificado} onClick={() => setBorrador(null)}>
            Descartar cambios
          </button>
        </div>
        {modificado && (
          <p class="ayuda" role="status">
            Hay cambios sin guardar.
          </p>
        )}
        <ListaErrores errores={errores} titulo="Revisa estos puntos antes de guardar" />
      </div>
    </section>
  );
}

// ───────────────────────── Calendario ─────────────────────────

function Calendario({ estado, lunesVisible }: { estado: EstadoApp; lunesVisible: FechaISO }) {
  const filas = calendarioCiclo(estado.rotacion, lunesDe(lunesVisible), SEMANAS_CALENDARIO);
  return (
    <section class="ficha rotacion-bloque" aria-labelledby="rot-cal-titulo">
      <h3 id="rot-cal-titulo">
        <IconoCalendario /> Próximas {SEMANAS_CALENDARIO} semanas
      </h3>
      <div class="rotacion-marco" tabIndex={0} role="region" aria-label="Calendario del ciclo">
        <table class="rotacion-tabla">
          <thead>
            <tr>
              <th scope="col">Semana del</th>
              <th scope="col">Al</th>
              <th scope="col">Ciclo</th>
              <th scope="col">Semana tipo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const tipo = estado.semanasTipo.find((s) => s.indiceCiclo === f.indice);
              return (
                <tr key={f.lunes}>
                  <td>{formatearFecha(f.lunes)}</td>
                  <td>{formatearFecha(sumarDias(f.lunes, 6))}</td>
                  <th scope="row">{f.etiqueta}</th>
                  <td>{tipo ? tipo.nombre || 'Guardada' : 'Sin guardar'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ───────────────────────── Semanas tipo ─────────────────────────

function FilaSemanaTipo({ almacen, estado, semana, pedir }: { almacen: AlmacenApp; estado: EstadoApp; semana: SemanaTipo; pedir: (p: Pendiente) => void }) {
  const [nombre, setNombre] = useState<string | null>(null);
  const etiqueta = etiquetaDe(estado.rotacion, semana.indiceCiclo);
  const valor = nombre ?? semana.nombre;
  const idCampo = `rot-tipo-nombre-${semana.id}`;
  return (
    <li>
      <div class="fila-edicion">
        <CampoTexto id={idCampo} etiqueta={`Nombre de la semana tipo ${etiqueta}`} valor={valor} onCambio={setNombre} />
        <button
          type="button"
          class="boton"
          disabled={valor.trim() === '' || valor.trim() === semana.nombre}
          aria-label={`Renombrar la semana tipo ${etiqueta}`}
          onClick={() => {
            almacen.aplicar(`Renombrar la semana tipo ${etiqueta}`, (e) => renombrarSemanaTipo(e, semana.id, valor));
            setNombre(null);
          }}
        >
          Renombrar
        </button>
        <button
          type="button"
          class="boton"
          aria-label={`Borrar la semana tipo ${etiqueta}`}
          onClick={() =>
            pedir({
              id: `rot-borrar-${semana.id}`,
              titulo: `¿Borrar la semana tipo ${etiqueta}?`,
              texto: `Se perderán sus ${semana.asignaciones.length} asignaciones. Se puede deshacer.`,
              lista: [],
              textoConfirmar: 'Borrar',
              accion: () => almacen.aplicar(`Borrar la semana tipo ${etiqueta}`, (e) => borrarSemanaTipo(e, semana.id)),
            })
          }
        >
          Borrar
        </button>
      </div>
      <p class="ayuda">
        Semana {etiqueta}: {semana.asignaciones.length} asignaciones. {resumenPorDia(semana)}
      </p>
    </li>
  );
}

function SemanasTipo({ almacen, estado, lunesVisible, pedir }: { almacen: AlmacenApp; estado: EstadoApp; lunesVisible: FechaISO; pedir: (p: Pendiente) => void }) {
  const [lunes, setLunes] = useState<FechaISO>(lunesDe(lunesVisible));
  const [indiceElegido, setIndiceElegido] = useState<number | null>(null);
  const [nombreElegido, setNombreElegido] = useState<string | null>(null);
  useEffect(() => {
    setLunes(lunesDe(lunesVisible));
    setIndiceElegido(null);
    setNombreElegido(null);
  }, [lunesVisible]);

  const r = estado.rotacion;
  const porDefecto = Math.min(semanaDelCiclo(r, lunes).indice, Math.max(0, r.longitudCiclo - 1));
  const indice = indiceElegido ?? porDefecto;
  const etiqueta = etiquetaDe(r, indice);
  const previa = estado.semanasTipo.find((s) => s.indiceCiclo === indice);
  const nombre = nombreElegido ?? previa?.nombre ?? `Semana ${etiqueta}`;
  const impacto = impactoGuardarSemanaTipo(estado, lunes, indice);
  const irA = (nuevo: FechaISO) => {
    setLunes(nuevo);
    setIndiceElegido(null);
  };
  const ordenadas = [...estado.semanasTipo].sort((a, b) => a.indiceCiclo - b.indiceCiclo);

  return (
    <section class="ficha rotacion-bloque" aria-labelledby="rot-tipo-titulo">
      <h3 id="rot-tipo-titulo">Semanas tipo</h3>
      <p class="ayuda">Una semana tipo por cada semana del ciclo. «Generar» puede partir de ella.</p>
      {ordenadas.length === 0 ? (
        <p class="ayuda">Todavía no hay ninguna semana tipo guardada.</p>
      ) : (
        <ul class="lista-ficha">
          {ordenadas.map((s) => (
            <FilaSemanaTipo key={s.id} almacen={almacen} estado={estado} semana={s} pedir={pedir} />
          ))}
        </ul>
      )}

      <h4>Guardar una semana como semana tipo</h4>
      <div class="rotacion-selector-semana" role="group" aria-label="Semana que se va a guardar">
        <button type="button" class="boton" onClick={() => irA(sumarDias(lunes, -7))}>
          Semana anterior
        </button>
        <strong aria-live="polite">
          Semana del {formatearFecha(lunes)} al {formatearFecha(sumarDias(lunes, 6))}
        </strong>
        <button type="button" class="boton" onClick={() => irA(sumarDias(lunes, 7))}>
          Semana siguiente
        </button>
      </div>
      <div class="rejilla-campos">
        <Selector
          id="rot-tipo-indice"
          etiqueta="Guardar como semana del ciclo"
          valor={String(indice)}
          opciones={r.etiquetas.map((e, i) => ({ valor: String(i), texto: e }))}
          onCambio={(v) => {
            setIndiceElegido(Number(v));
            setNombreElegido(null);
          }}
        />
        <CampoTexto id="rot-tipo-nombre" etiqueta="Nombre" valor={nombre} onCambio={setNombreElegido} />
      </div>
      <ListaErrores errores={impacto.bloqueos} />
      {impacto.bloqueos.length === 0 && impacto.efectos.length > 0 && (
        <ul class="rotacion-efectos" aria-label="Qué ocurrirá al guardar">
          {impacto.efectos.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <div class="fila">
        <button
          type="button"
          class="boton primario"
          disabled={impacto.bloqueos.length > 0 || nombre.trim() === ''}
          onClick={() =>
            pedir({
              id: 'rot-guardar-tipo',
              titulo: `¿Guardar la semana del ${formatearFecha(lunes)} como semana tipo ${etiqueta}?`,
              texto: 'Esto es lo que va a ocurrir:',
              lista: impacto.efectos,
              textoConfirmar: 'Guardar semana tipo',
              accion: () => almacen.aplicar(`Guardar la semana del ${formatearFecha(lunes)} como semana tipo ${etiqueta}`, (e) => guardarSemanaTipo(e, lunes, indice, nombre)),
            })
          }
        >
          Guardar la semana del {formatearFecha(lunes)} como semana tipo {etiqueta}
        </button>
      </div>
    </section>
  );
}

// ───────────────────────── Patrones por persona ─────────────────────────

interface BorradorPatron {
  personaId: Id;
  pasos: PasoPatron[];
}

function pasosDe(p: Persona, n: number): PasoPatron[] {
  return Array.from({ length: n }, (_, i) => pasoPatron(p, i));
}

function Patrones({ almacen, estado, pedir }: { almacen: AlmacenApp; estado: EstadoApp; pedir: (p: Pendiente) => void }) {
  const n = estado.rotacion.longitudCiclo;
  const [borrador, setBorrador] = useState<BorradorPatron | null>(null);
  const [nueva, setNueva] = useState('');
  // Un borrador con la longitud antigua no vale: se descarta al cambiar el ciclo.
  useEffect(() => setBorrador(null), [n]);
  const conPatron = estado.personas.filter((p) => p.patron.length > 0);
  const sinPatron = estado.personas.filter((p) => p.patron.length === 0 && p.activa);
  const editada = borrador ? estado.personas.find((p) => p.id === borrador.personaId) : undefined;
  const modificado = borrador !== null && editada !== undefined && !igual(borrador.pasos, pasosDe(editada, n));

  function cambiarPaso(i: number, c: Partial<PasoPatron>) {
    if (!borrador) return;
    setBorrador({ ...borrador, pasos: borrador.pasos.map((p, k) => (k === i ? { ...p, ...c } : p)) });
  }

  function guardar() {
    if (!borrador || !editada) return;
    const { personaId, pasos } = borrador;
    almacen.aplicar(`Cambiar el patrón de ${editada.codigo}`, (e) => pasos.reduce((acc, p) => cambiarPasoPatron(acc, personaId, p), e));
    setBorrador(null);
  }

  return (
    <section class="ficha rotacion-bloque" aria-labelledby="rot-patrones-titulo">
      <h3 id="rot-patrones-titulo">Patrones por persona</h3>
      <p class="ayuda">Para quien cambia de equipo o libra días concretos según la semana del ciclo.</p>
      {conPatron.length === 0 ? (
        <p class="ayuda">Nadie tiene patrón todavía.</p>
      ) : (
        <div class="rotacion-marco" tabIndex={0} role="region" aria-label="Personas con patrón">
          <table class="rotacion-tabla">
            <thead>
              <tr>
                <th scope="col">Persona</th>
                {estado.rotacion.etiquetas.slice(0, n).map((e, i) => (
                  <th scope="col" key={i}>
                    Semana {e}
                  </th>
                ))}
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {conPatron.map((p) => (
                <tr key={p.id} class={borrador?.personaId === p.id ? 'seleccionada' : ''}>
                  <th scope="row">{p.codigo}</th>
                  {pasosDe(p, n).map((paso, i) => (
                    <td key={i}>{resumenPaso(paso)}</td>
                  ))}
                  <td>
                    <div class="fila rotacion-acciones">
                      <button type="button" class="boton" aria-label={`Editar el patrón de ${p.codigo}`} onClick={() => setBorrador({ personaId: p.id, pasos: pasosDe(p, n) })}>
                        Editar
                      </button>
                      <button
                        type="button"
                        class="boton"
                        aria-label={`Quitar el patrón de ${p.codigo}`}
                        onClick={() =>
                          pedir({
                            id: `rot-quitar-${p.id}`,
                            titulo: `¿Quitar el patrón de ${p.codigo}?`,
                            texto: 'Volverá a su equipo habitual y sin días libres por rotación. Se puede deshacer.',
                            lista: [],
                            textoConfirmar: 'Quitar patrón',
                            accion: () => {
                              almacen.aplicar(`Quitar el patrón de ${p.codigo}`, (e) => quitarPatron(e, p.id));
                              setBorrador((b) => (b?.personaId === p.id ? null : b));
                            },
                          })
                        }
                      >
                        Quitar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div class="fila-edicion rotacion-nueva">
        <Selector
          id="rot-patron-persona"
          etiqueta="Persona sin patrón"
          valor={nueva}
          opciones={[{ valor: '', texto: 'Elige una persona' }, ...sinPatron.map((p) => ({ valor: p.id, texto: p.codigo }))]}
          onCambio={setNueva}
        />
        <button
          type="button"
          class="boton"
          disabled={nueva === ''}
          onClick={() => {
            setBorrador({ personaId: nueva, pasos: Array.from({ length: n }, (_, i) => ({ indiceCiclo: i, equipo: null, diasLibres: [] })) });
            setNueva('');
          }}
        >
          Añadir patrón
        </button>
      </div>

      {borrador && editada && (
        <div class="rotacion-editor" role="group" aria-label={`Patrón de ${editada.codigo}`}>
          <h4>Patrón de {editada.codigo}</h4>
          {borrador.pasos.map((paso, i) => {
            const etiqueta = etiquetaDe(estado.rotacion, i);
            return (
              <fieldset class="grupo" key={i}>
                <legend>Semana {etiqueta}</legend>
                <Selector
                  id={`rot-patron-equipo-${i}`}
                  etiqueta={`Equipo en la semana ${etiqueta}`}
                  valor={paso.equipo ?? ''}
                  opciones={[
                    { valor: '', texto: `El habitual (${NOMBRES_EQUIPO[editada.equipo]})` },
                    ...EQUIPOS.map((q) => ({ valor: q, texto: NOMBRES_EQUIPO[q] })),
                  ]}
                  onCambio={(v) => cambiarPaso(i, { equipo: EQUIPOS.find((q) => q === v) ?? null })}
                />
                <SelectorDias
                  id={`rot-patron-libres-${i}`}
                  leyenda={`Días libres en la semana ${etiqueta}`}
                  valor={paso.diasLibres}
                  onCambio={(v: DiaSemana[]) => cambiarPaso(i, { diasLibres: v })}
                />
              </fieldset>
            );
          })}
          <div class="fila">
            <button type="button" class="boton primario" disabled={!modificado} onClick={guardar}>
              Guardar cambios
            </button>
            <button type="button" class="boton" onClick={() => setBorrador(null)}>
              Descartar cambios
            </button>
          </div>
          {modificado && (
            <p class="ayuda" role="status">
              Hay cambios sin guardar. Los días libres cuentan como no disponibilidad al validar y generar.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ───────────────────────── Sección ─────────────────────────

export function Rotacion({ almacen, lunesVisible }: { almacen: AlmacenApp; lunesVisible: FechaISO }) {
  const estado = usarAlmacen(almacen);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  return (
    <div class="seccion-rotacion">
      <Ciclo almacen={almacen} estado={estado} pedir={setPendiente} />
      <Calendario estado={estado} lunesVisible={lunesVisible} />
      <SemanasTipo almacen={almacen} estado={estado} lunesVisible={lunesVisible} pedir={setPendiente} />
      <Patrones almacen={almacen} estado={estado} pedir={setPendiente} />
      {pendiente && (
        <Confirmacion
          id={pendiente.id}
          titulo={pendiente.titulo}
          texto={pendiente.texto}
          lista={pendiente.lista}
          textoConfirmar={pendiente.textoConfirmar}
          alConfirmar={() => {
            const accion = pendiente.accion;
            setPendiente(null);
            accion();
          }}
          alCancelar={() => setPendiente(null)}
        />
      )}
    </div>
  );
}
