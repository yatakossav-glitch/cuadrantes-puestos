import { useEffect, useState } from 'preact/hooks';
import { NOMBRES_DIA, formatearFecha } from '../../modelo/fechas';
import { aHora, formatearDuracion, formatearIntervalo } from '../../modelo/horas';
import { DIAS_SEMANA } from '../../modelo/tipos';
import type { Area, DiaSemana, EstadoApp, HorarioDia, IconoArea, Id, Puesto } from '../../modelo/tipos';
import { anadirArea, borrarArea, crearArea, erroresArea, impactoBorrarArea, moverArea, reemplazarArea } from '../../edicion/areas';
import { actualizarConfig, erroresConfig } from '../../edicion/config';
import {
  anadirFranja, actualizarFranja, borrarFranja, crearBloque, deshacerBloque, personalizarDia,
  puedenFormarBloque, quitarPersonalizacion,
} from '../../edicion/horario';
import {
  anadirPuesto, aplicarCambioPuesto, borrarPuesto, crearPuesto, duplicarPuesto, erroresPuesto,
  impactoBorrarPuesto, impactoCambioPuesto, moverPuesto,
} from '../../edicion/puestos';
import { Confirmacion } from '../componentes/Confirmacion';
import { CampoFecha, CampoHora, CampoNumero, CampoTexto, Interruptor, ListaErrores, SelectorDias, usarValidezAgregada } from '../componentes/campos';
import type { AlmacenApp } from '../estado';
import { IconoDeArea } from '../iconos';
import { usarAlmacen } from '../usarAlmacen';
import './Puestos.css';

type Seleccion = { tipo: 'area'; id: Id } | { tipo: 'puesto'; id: Id } | null;
type DiaHorario = DiaSemana | 'general';

const ICONOS: { valor: IconoArea; nombre: string }[] = [
  { valor: 'caja', nombre: 'Caja' },
  { valor: 'paquete', nombre: 'Paquete' },
  { valor: 'bloques', nombre: 'Bloques' },
  { valor: 'libro', nombre: 'Libro' },
  { valor: 'tienda', nombre: 'Tienda' },
  { valor: 'etiqueta', nombre: 'Etiqueta' },
  { valor: 'reloj', nombre: 'Reloj' },
  { valor: 'usuarios', nombre: 'Usuarios' },
];

const capitalizar = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
const nombreDia = (d: DiaSemana): string => capitalizar(NOMBRES_DIA[d]);

const MENSAJE_HORA_INVALIDA = 'Hay una hora que no se entiende';

const porPresentacion = (a: Area, b: Area): number => a.planta - b.planta || a.orden - b.orden;

// ───────────────────────── Corte mañana/tarde ─────────────────────────

function CorteMananaTarde({ almacen, estado, onValidez }: { almacen: AlmacenApp; estado: EstadoApp; onValidez: (valido: boolean) => void }) {
  const corte = estado.config.corteMananaTarde;
  const [local, setLocal] = useState<number | null>(null);
  useEffect(() => setLocal(null), [corte]);
  const valor = local ?? corte;
  const errores = erroresConfig({ ...estado.config, corteMananaTarde: valor });
  const erroresCorte = errores.filter((e) => e.startsWith('El corte'));
  const [textoInvalido, setTextoInvalido] = useState(false);
  return (
    <section class="tarjeta corte" aria-label="Corte mañana/tarde">
      <CampoHora
        id="corte-manana-tarde"
        etiqueta="Corte mañana/tarde"
        ayuda="Una franja es de mañana si empieza antes de esta hora"
        valor={valor}
        error={erroresCorte[0] ?? (textoInvalido ? MENSAJE_HORA_INVALIDA : null)}
        onValidez={(v) => {
          setTextoInvalido(!v);
          onValidez(v);
        }}
        onCambio={(m) => {
          setLocal(m);
          if (erroresConfig({ ...estado.config, corteMananaTarde: m }).some((e) => e.startsWith('El corte'))) return;
          almacen.aplicar(`Cambiar corte mañana/tarde a ${aHora(m)}`, (e) => actualizarConfig(e, { corteMananaTarde: m }));
        }}
      />
    </section>
  );
}

// ───────────────────────── Botones de la ficha ─────────────────────────

interface PropsBarra {
  errores: string[];
  modificado: boolean;
  alGuardar: () => void;
  alDescartar: () => void;
}

function BarraGuardar({ errores, modificado, alGuardar, alDescartar }: PropsBarra) {
  return (
    <div class="barra-guardar">
      <div class="fila">
        <button type="button" class="boton primario" disabled={errores.length > 0 || !modificado} onClick={alGuardar}>
          Guardar cambios
        </button>
        <button type="button" class="boton" disabled={!modificado} onClick={alDescartar}>
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
  );
}

// ───────────────────────── Ficha de área ─────────────────────────

function FichaArea({
  almacen, estado, area, alBorrar, alCambiarSucio, bloqueoExtra,
}: { almacen: AlmacenApp; estado: EstadoApp; area: Area; alBorrar: () => void; alCambiarSucio: (sucio: boolean) => void; bloqueoExtra: boolean }) {
  const [borrador, setBorrador] = useState<Area | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [bloqueos, setBloqueos] = useState<string[]>([]);
  const a = borrador ?? area;
  const cambiar = (c: Partial<Area>) => setBorrador({ ...a, ...c });
  const errores = [...erroresArea(estado, a), ...(bloqueoExtra ? [MENSAJE_HORA_INVALIDA] : [])];
  useEffect(() => {
    alCambiarSucio(borrador !== null);
    return () => alCambiarSucio(false);
  }, [borrador !== null]);
  const colorValido = /^#[0-9a-fA-F]{6}$/.test(a.color);

  const impacto = impactoBorrarArea(estado, area.id);
  function pedirBorrar() {
    if (impacto.bloqueos.length > 0) {
      setBloqueos(impacto.bloqueos);
      return;
    }
    setBloqueos([]);
    setConfirmando(true);
  }

  return (
    <div class="ficha ficha-puestos">
      <h3>Área: {area.nombre}</h3>
      <div class="rejilla-campos">
        <CampoTexto id="area-nombre" etiqueta="Nombre" valor={a.nombre} onCambio={(nombre) => cambiar({ nombre })} />
        <CampoNumero id="area-planta" etiqueta="Planta" valor={a.planta} min={0} max={99} onCambio={(planta) => cambiar({ planta })} />
        <div class="campo">
          <label for="area-color-selector">Color</label>
          <div class="fila-color">
            <input
              id="area-color-selector"
              type="color"
              value={colorValido ? a.color.toLowerCase() : '#000000'}
              onInput={(e) => cambiar({ color: e.currentTarget.value })}
            />
            <input
              id="area-color-texto"
              type="text"
              aria-label="Color en formato #rrggbb"
              value={a.color}
              maxLength={7}
              onInput={(e) => cambiar({ color: e.currentTarget.value })}
            />
          </div>
        </div>
      </div>
      <fieldset class="grupo">
        <legend>Icono</legend>
        <div class="casillas-en-linea">
          {ICONOS.map((i) => (
            <div class="casilla" key={i.valor}>
              <input
                id={`area-icono-${i.valor}`}
                type="radio"
                name="area-icono"
                checked={a.icono === i.valor}
                onChange={() => cambiar({ icono: i.valor })}
              />
              <label for={`area-icono-${i.valor}`}>
                <IconoDeArea icono={i.valor} /> {i.nombre}
              </label>
            </div>
          ))}
        </div>
      </fieldset>
      <Interruptor id="area-activa" etiqueta="Activa" valor={a.activa} onCambio={(activa) => cambiar({ activa })} />
      <BarraGuardar
        errores={errores}
        modificado={borrador !== null}
        alGuardar={() => {
          // Sobre el valor actual del almacén: solo los campos de la ficha, nunca `orden`.
          almacen.aplicar(`Editar ${a.nombre.trim()}`, (e) => {
            const actual = e.areas.find((x) => x.id === a.id);
            if (!actual) return e;
            return reemplazarArea(e, {
              ...actual,
              nombre: a.nombre.trim(),
              planta: a.planta,
              color: a.color,
              icono: a.icono,
              activa: a.activa,
            });
          });
          setBorrador(null);
        }}
        alDescartar={() => setBorrador(null)}
      />
      <div class="fila separada">
        <button type="button" class="boton peligro" onClick={pedirBorrar}>
          Borrar área
        </button>
      </div>
      {bloqueos.length > 0 && (
        <div class="mensaje error" role="alert">
          <strong>No se puede borrar el área «{area.nombre}»</strong>
          <ul>
            {bloqueos.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      {confirmando && (
        <Confirmacion
          id="confirmar-borrar-area"
          titulo={`Borrar el área «${area.nombre}»`}
          texto="El área se borrará. Podrás deshacerlo después."
          lista={impacto.efectos}
          textoConfirmar="Borrar área"
          alConfirmar={() => {
            setConfirmando(false);
            almacen.aplicar(`Borrar área ${area.nombre}`, (e) => borrarArea(e, area.id));
            alBorrar();
          }}
          alCancelar={() => setConfirmando(false)}
        />
      )}
    </div>
  );
}

// ───────────────────────── Horario de un puesto ─────────────────────────

function horarioActual(puesto: Puesto, dia: DiaHorario): HorarioDia {
  return dia === 'general' ? puesto.horario.general : (puesto.horario.porDia[dia] ?? puesto.horario.general);
}

function EditorHorario({ puesto, cambiar, onValidez }: { puesto: Puesto; cambiar: (p: Puesto) => void; onValidez: (valido: boolean) => void }) {
  const validez = usarValidezAgregada(onValidez);
  const [diaElegido, setDiaElegido] = useState<DiaHorario>('general');
  const [elegidas, setElegidas] = useState<Id[]>([]);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [nuevoDia, setNuevoDia] = useState('');

  const personalizados = DIAS_SEMANA.filter((d) => puesto.horario.porDia[d] !== undefined);
  const dia: DiaHorario = diaElegido === 'general' || puesto.horario.porDia[diaElegido] ? diaElegido : 'general';
  const horario = horarioActual(puesto, dia);
  const sinPersonalizar = DIAS_SEMANA.filter((d) => puesto.horario.porDia[d] === undefined);
  const nombreBloque = (franjaId: Id): string => horario.bloques.find((b) => b.franjaIds.includes(franjaId))?.nombre ?? '';

  function elegirDia(d: DiaHorario) {
    setDiaElegido(d);
    setElegidas([]);
    setMotivo(null);
  }

  function proponerFranja() {
    const ultima = horario.franjas.reduce<{ fin: number } | null>((m, f) => (m === null || f.fin > m.fin ? f : m), null);
    const inicio = ultima ? Math.min(ultima.fin, 1380) : 600;
    const fin = Math.min(inicio + 60, 1440);
    cambiar(anadirFranja(puesto, dia, { inicio, fin }));
  }

  function agrupar() {
    const problema = puedenFormarBloque(horario, elegidas);
    setMotivo(problema);
    if (problema) return;
    cambiar(crearBloque(puesto, dia, elegidas));
    setElegidas([]);
  }

  function separar() {
    const ids = horario.bloques.filter((b) => b.franjaIds.some((f) => elegidas.includes(f))).map((b) => b.id);
    let p = puesto;
    for (const id of ids) p = deshacerBloque(p, dia, id);
    cambiar(p);
    setElegidas([]);
    setMotivo(null);
  }

  const hayBloqueElegido = horario.bloques.some((b) => b.franjaIds.some((f) => elegidas.includes(f)));

  return (
    <section class="horario" aria-label="Horario del puesto">
      <h4>Horario</h4>
      <div class="pestanas-dia" role="group" aria-label="Horario por día">
        <button type="button" class="pestana-dia" aria-pressed={dia === 'general'} onClick={() => elegirDia('general')}>
          Todos los días
        </button>
        {personalizados.map((d) => (
          <button type="button" class="pestana-dia" key={d} aria-pressed={dia === d} onClick={() => elegirDia(d)}>
            {nombreDia(d)}
          </button>
        ))}
      </div>
      <div class="fila">
        {sinPersonalizar.length > 0 && (
          <>
            <label for="horario-nuevo-dia">Horario distinto para…</label>
            <select id="horario-nuevo-dia" value={nuevoDia} onChange={(e) => setNuevoDia(e.currentTarget.value)}>
              <option value="">Elige un día</option>
              {sinPersonalizar.map((d) => (
                <option key={d} value={String(d)}>
                  {nombreDia(d)}
                </option>
              ))}
            </select>
            <button
              type="button"
              class="boton"
              disabled={nuevoDia === ''}
              onClick={() => {
                const d = Number(nuevoDia) as DiaSemana;
                cambiar(personalizarDia(puesto, d));
                setNuevoDia('');
                elegirDia(d);
              }}
            >
              Crear horario propio
            </button>
          </>
        )}
        {dia !== 'general' && (
          <button
            type="button"
            class="boton"
            onClick={() => {
              cambiar(quitarPersonalizacion(puesto, dia));
              elegirDia('general');
            }}
          >
            Volver al horario general
          </button>
        )}
      </div>
      <p class="ayuda">
        {dia === 'general' ? 'Este horario vale para todos los días sin horario propio.' : `Horario propio del ${NOMBRES_DIA[dia]}.`}
      </p>
      <table class="tabla-franjas" aria-label={`Franjas de ${dia === 'general' ? 'todos los días' : NOMBRES_DIA[dia]}`}>
        <thead>
          <tr>
            <th scope="col">Elegir</th>
            <th scope="col">Inicio</th>
            <th scope="col">Fin</th>
            <th scope="col">Duración</th>
            <th scope="col">Bloque</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {horario.franjas.map((f) => {
            const rotulo = formatearIntervalo(f);
            const cambiarFranja = (c: { inicio?: number; fin?: number }) =>
              cambiar(actualizarFranja(puesto, dia, f.id, { inicio: c.inicio ?? f.inicio, fin: c.fin ?? f.fin }));
            return (
              <tr key={f.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Elegir la franja ${rotulo}`}
                    checked={elegidas.includes(f.id)}
                    onChange={(e) => {
                      setMotivo(null);
                      setElegidas(e.currentTarget.checked ? [...elegidas, f.id] : elegidas.filter((x) => x !== f.id));
                    }}
                  />
                </td>
                <td>
                  <CampoHora id={`franja-${f.id}-inicio`} etiqueta={`Inicio de la franja ${rotulo}`} valor={f.inicio} onCambio={(inicio) => cambiarFranja({ inicio })} onValidez={validez(`franja-${f.id}-inicio`)} />
                </td>
                <td>
                  <CampoHora id={`franja-${f.id}-fin`} etiqueta={`Fin de la franja ${rotulo}`} valor={f.fin} onCambio={(fin) => cambiarFranja({ fin })} onValidez={validez(`franja-${f.id}-fin`)} />
                </td>
                <td>{f.fin > f.inicio ? formatearDuracion(f.fin - f.inicio) : '—'}</td>
                <td>{nombreBloque(f.id) || '—'}</td>
                <td>
                  <button
                    type="button"
                    class="boton"
                    aria-label={`Borrar la franja ${rotulo}`}
                    onClick={() => {
                      setElegidas(elegidas.filter((x) => x !== f.id));
                      cambiar(borrarFranja(puesto, dia, f.id));
                    }}
                  >
                    Borrar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div class="fila">
        <button type="button" class="boton" onClick={proponerFranja}>
          Añadir franja
        </button>
        <button type="button" class="boton" disabled={elegidas.length === 0} onClick={agrupar}>
          Agrupar en bloque
        </button>
        <button type="button" class="boton" disabled={!hayBloqueElegido} onClick={separar}>
          Separar bloque
        </button>
      </div>
      {motivo && (
        <div class="mensaje aviso" role="alert">
          No se puede agrupar: {motivo}
        </div>
      )}
    </section>
  );
}

// ───────────────────────── Ficha de puesto ─────────────────────────

function FichaPuesto({
  almacen, estado, puesto, alBorrar, alDuplicar, alCambiarSucio, bloqueoExtra,
}: {
  almacen: AlmacenApp; estado: EstadoApp; puesto: Puesto; alBorrar: () => void; alDuplicar: (id: Id) => void;
  alCambiarSucio: (sucio: boolean) => void; bloqueoExtra: boolean;
}) {
  const [horaInvalida, setHoraInvalida] = useState(false);
  const [borrador, setBorrador] = useState<Puesto | null>(null);
  const [confirmando, setConfirmando] = useState<'guardar' | 'borrar' | null>(null);
  const p = borrador ?? puesto;
  const cambiar = (c: Partial<Puesto>) => setBorrador({ ...p, ...c });
  const errores = [...erroresPuesto(estado, p), ...(horaInvalida || bloqueoExtra ? [MENSAJE_HORA_INVALIDA] : [])];
  useEffect(() => {
    alCambiarSucio(borrador !== null);
    return () => alCambiarSucio(false);
  }, [borrador !== null]);
  const impactoGuardar = impactoCambioPuesto(estado, p);
  const impactoBorrar = impactoBorrarPuesto(estado, puesto.id);
  const areas = [...estado.areas].sort(porPresentacion);

  function aplicarGuardado() {
    const nombre = p.nombre.trim();
    // Sobre el valor actual del almacén: solo los campos de la ficha, nunca `orden`.
    almacen.aplicar(`Editar ${nombre}`, (e) => {
      const actual = e.puestos.find((x) => x.id === p.id);
      if (!actual) return e;
      return aplicarCambioPuesto(e, {
        ...actual,
        nombre,
        areaId: p.areaId,
        plazas: p.plazas,
        dias: p.dias,
        vigenteDesde: p.vigenteDesde,
        vigenteHasta: p.vigenteHasta,
        requiereHabilitacion: p.requiereHabilitacion,
        activo: p.activo,
        horario: p.horario,
      });
    });
    setBorrador(null);
    setConfirmando(null);
  }

  return (
    <div class="ficha ficha-puestos">
      <h3>Puesto: {puesto.nombre}</h3>
      <div class="rejilla-campos">
        <CampoTexto id="puesto-nombre" etiqueta="Nombre" valor={p.nombre} onCambio={(nombre) => cambiar({ nombre })} />
        <div class="campo">
          <label for="puesto-area">Área</label>
          <select id="puesto-area" value={p.areaId} onChange={(e) => cambiar({ areaId: e.currentTarget.value })}>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre} (planta {a.planta})
              </option>
            ))}
          </select>
        </div>
        <CampoNumero id="puesto-plazas" etiqueta="Plazas" valor={p.plazas} min={1} max={20} onCambio={(plazas) => cambiar({ plazas })} />
      </div>
      <SelectorDias id="puesto-dias" leyenda="Días en que existe el puesto" valor={p.dias} onCambio={(dias) => cambiar({ dias })} />
      <fieldset class="grupo">
        <legend>Vigencia (para puestos de temporada)</legend>
        <div class="rejilla-campos">
          <CampoFecha id="puesto-desde" etiqueta="Existe desde" valor={p.vigenteDesde} onCambio={(vigenteDesde) => cambiar({ vigenteDesde })} />
          <CampoFecha id="puesto-hasta" etiqueta="Existe hasta" valor={p.vigenteHasta} onCambio={(vigenteHasta) => cambiar({ vigenteHasta })} />
        </div>
        <p class="ayuda">Déjalas vacías si el puesto existe siempre. Ejemplo: Caja 3 solo del 1 dic al 6 ene.</p>
      </fieldset>
      <div class="fila">
        <Interruptor id="puesto-habilitacion" etiqueta="Requiere habilitación" valor={p.requiereHabilitacion} onCambio={(requiereHabilitacion) => cambiar({ requiereHabilitacion })} />
        <Interruptor id="puesto-activo" etiqueta="Activo" valor={p.activo} onCambio={(activo) => cambiar({ activo })} />
      </div>
      <EditorHorario puesto={p} cambiar={setBorrador} onValidez={(v) => setHoraInvalida(!v)} />
      <BarraGuardar
        errores={errores}
        modificado={borrador !== null}
        alGuardar={() => (impactoGuardar.efectos.length > 0 ? setConfirmando('guardar') : aplicarGuardado())}
        alDescartar={() => setBorrador(null)}
      />
      <div class="fila separada">
        <button type="button" class="boton" onClick={() => alDuplicar(puesto.id)}>
          Duplicar puesto
        </button>
        <button type="button" class="boton peligro" onClick={() => setConfirmando('borrar')}>
          Borrar puesto
        </button>
      </div>
      {confirmando === 'guardar' && (
        <Confirmacion
          id="confirmar-guardar-puesto"
          titulo={`Guardar los cambios de «${p.nombre.trim()}»`}
          texto="Este cambio afectará a lo ya planificado. Podrás deshacerlo después."
          lista={impactoGuardar.efectos}
          textoConfirmar="Guardar y aplicar"
          alConfirmar={aplicarGuardado}
          alCancelar={() => setConfirmando(null)}
        />
      )}
      {confirmando === 'borrar' && (
        <Confirmacion
          id="confirmar-borrar-puesto"
          titulo={`Borrar el puesto «${puesto.nombre}»`}
          texto="El puesto se borrará. Podrás deshacerlo después."
          lista={impactoBorrar.efectos}
          textoConfirmar="Borrar puesto"
          alConfirmar={() => {
            setConfirmando(null);
            almacen.aplicar(`Borrar puesto ${puesto.nombre}`, (e) => borrarPuesto(e, puesto.id));
            alBorrar();
          }}
          alCancelar={() => setConfirmando(null)}
        />
      )}
    </div>
  );
}

// ───────────────────────── Sección ─────────────────────────

function BotonesOrden({ nombre, tipo, alMover, puedeSubir, puedeBajar }: {
  nombre: string; tipo: 'área' | 'puesto'; alMover: (s: -1 | 1) => void; puedeSubir: boolean; puedeBajar: boolean;
}) {
  return (
    <span class="orden">
      <button type="button" class="boton mini" aria-label={`Subir ${tipo} ${nombre}`} disabled={!puedeSubir} onClick={() => alMover(-1)}>
        Subir
      </button>
      <button type="button" class="boton mini" aria-label={`Bajar ${tipo} ${nombre}`} disabled={!puedeBajar} onClick={() => alMover(1)}>
        Bajar
      </button>
    </span>
  );
}

/** «Del 01/12/2026 al 06/01/2027», «Desde …», «Hasta …» o '' si no tiene vigencia. */
function textoVigencia(p: Puesto): string {
  const { vigenteDesde: d, vigenteHasta: h } = p;
  if (d && h) return `Del ${formatearFecha(d)} al ${formatearFecha(h)}`;
  if (d) return `Desde ${formatearFecha(d)}`;
  if (h) return `Hasta ${formatearFecha(h)}`;
  return '';
}

export function Puestos({ almacen }: { almacen: AlmacenApp }) {
  const estado = usarAlmacen(almacen);
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [sucio, setSucio] = useState(false);
  const [version, setVersion] = useState(0);
  const [pendiente, setPendiente] = useState<{ texto: string; accion: () => void } | null>(null);
  const [corteInvalido, setCorteInvalido] = useState(false);

  /** Ejecuta la acción; si la ficha tiene cambios sin guardar, antes pide confirmación y descarta el borrador. */
  function conConfirmacion(texto: string, accion: () => void) {
    if (sucio) setPendiente({ texto, accion });
    else accion();
  }

  const areas = [...estado.areas].sort(porPresentacion);
  const plantas = [...new Set(areas.map((a) => a.planta))];
  const puestosDe = (areaId: Id): Puesto[] => estado.puestos.filter((p) => p.areaId === areaId).sort((a, b) => a.orden - b.orden);

  function anadirNuevaArea() {
    const area = crearArea(estado);
    almacen.aplicar(`Añadir área ${area.nombre}`, (e) => anadirArea(e, area));
    setSeleccion({ tipo: 'area', id: area.id });
  }
  function anadirNuevoPuesto(areaId: Id) {
    const puesto = crearPuesto(estado, areaId);
    almacen.aplicar(`Añadir puesto ${puesto.nombre}`, (e) => anadirPuesto(e, puesto));
    setSeleccion({ tipo: 'puesto', id: puesto.id });
  }
  function duplicar(id: Id) {
    const antes = new Set(estado.puestos.map((p) => p.id));
    const original = estado.puestos.find((p) => p.id === id);
    almacen.aplicar(`Duplicar puesto ${original?.nombre ?? ''}`.trim(), (e) => duplicarPuesto(e, id));
    const copia = almacen.obtener().puestos.find((p) => !antes.has(p.id));
    if (copia) setSeleccion({ tipo: 'puesto', id: copia.id });
  }

  const areaSel = seleccion?.tipo === 'area' ? estado.areas.find((a) => a.id === seleccion.id) : undefined;
  const puestoSel = seleccion?.tipo === 'puesto' ? estado.puestos.find((p) => p.id === seleccion.id) : undefined;

  return (
    <div class="seccion-puestos">
      <h2>Puestos</h2>
      <CorteMananaTarde almacen={almacen} estado={estado} onValidez={(v) => setCorteInvalido(!v)} />
      <div class="disposicion-puestos">
        <nav class="lista-puestos" aria-label="Áreas y puestos">
          {plantas.map((planta) => {
            const delaPlanta = areas.filter((a) => a.planta === planta);
            return (
              <section key={planta} aria-label={`Planta ${planta}`}>
                <h3>Planta {planta}</h3>
                {delaPlanta.map((area, i) => {
                  const puestos = puestosDe(area.id);
                  const esSel = seleccion?.tipo === 'area' && seleccion.id === area.id;
                  return (
                    <div class="bloque-area" key={area.id}>
                      <div class="fila-lista">
                        <button
                          type="button"
                          class={esSel ? 'elemento seleccionado' : 'elemento'}
                          aria-current={esSel ? 'true' : undefined}
                          onClick={() => conConfirmacion(`Tienes cambios sin guardar. ¿Descartarlos y abrir el área ${area.nombre}?`, () => setSeleccion({ tipo: 'area', id: area.id }))}
                        >
                          <span class="muestra" style={{ background: area.color }} aria-hidden="true" />
                          <IconoDeArea icono={area.icono} />
                          <span class="nombre">{area.nombre}</span>
                          {!area.activa && <span class="etiqueta-inactiva">inactiva</span>}
                        </button>
                        <BotonesOrden
                          nombre={area.nombre}
                          tipo="área"
                          puedeSubir={i > 0}
                          puedeBajar={i < delaPlanta.length - 1}
                          alMover={(s) =>
                            conConfirmacion('Tienes cambios sin guardar. ¿Descartarlos y cambiar el orden?', () =>
                              almacen.aplicar(`${s === -1 ? 'Subir' : 'Bajar'} área ${area.nombre}`, (e) => moverArea(e, area.id, s)),
                            )
                          }
                        />
                      </div>
                      <ul class="puestos-de-area">
                        {puestos.map((puesto, j) => {
                          const sel = seleccion?.tipo === 'puesto' && seleccion.id === puesto.id;
                          return (
                            <li class="fila-lista" key={puesto.id}>
                              <button
                                type="button"
                                class={sel ? 'elemento seleccionado' : 'elemento'}
                                aria-current={sel ? 'true' : undefined}
                                onClick={() => conConfirmacion(`Tienes cambios sin guardar. ¿Descartarlos y abrir el puesto ${puesto.nombre}?`, () => setSeleccion({ tipo: 'puesto', id: puesto.id }))}
                              >
                                <span class="nombre">{puesto.nombre}</span>
                                {!puesto.activo && <span class="etiqueta-inactiva">inactivo</span>}
                                {textoVigencia(puesto) && <span class="ayuda">{textoVigencia(puesto)}</span>}
                              </button>
                              <BotonesOrden
                                nombre={puesto.nombre}
                                tipo="puesto"
                                puedeSubir={j > 0}
                                puedeBajar={j < puestos.length - 1}
                                alMover={(s) =>
                                  conConfirmacion('Tienes cambios sin guardar. ¿Descartarlos y cambiar el orden?', () =>
                                    almacen.aplicar(`${s === -1 ? 'Subir' : 'Bajar'} puesto ${puesto.nombre}`, (e) => moverPuesto(e, puesto.id, s)),
                                  )
                                }
                              />
                            </li>
                          );
                        })}
                      </ul>
                      <button type="button" class="boton mini anadir" aria-label={`Añadir puesto a ${area.nombre}`} onClick={() => conConfirmacion('Tienes cambios sin guardar. ¿Descartarlos y añadir un puesto nuevo?', () => anadirNuevoPuesto(area.id))}>
                        Añadir puesto
                      </button>
                    </div>
                  );
                })}
              </section>
            );
          })}
          <button type="button" class="boton" onClick={() => conConfirmacion('Tienes cambios sin guardar. ¿Descartarlos y añadir un área nueva?', anadirNuevaArea)}>
            Añadir área
          </button>
        </nav>
        <div class="detalle-puestos">
          {areaSel && <FichaArea
              key={`${areaSel.id}-${version}`}
              almacen={almacen}
              estado={estado}
              area={areaSel}
              alBorrar={() => setSeleccion(null)}
              alCambiarSucio={setSucio}
              bloqueoExtra={corteInvalido}
            />}
          {puestoSel && (
            <FichaPuesto
              key={`${puestoSel.id}-${version}`}
              almacen={almacen}
              estado={estado}
              puesto={puestoSel}
              alBorrar={() => setSeleccion(null)}
              alDuplicar={(id) => conConfirmacion('Tienes cambios sin guardar. ¿Descartarlos y duplicar el puesto guardado?', () => duplicar(id))}
              alCambiarSucio={setSucio}
              bloqueoExtra={corteInvalido}
            />
          )}
          {pendiente && (
            <Confirmacion
              id="puestos-pendiente"
              titulo="Cambios sin guardar"
              texto={pendiente.texto}
              textoConfirmar="Descartar cambios"
              alConfirmar={() => {
                const { accion } = pendiente;
                setPendiente(null);
                setVersion((v) => v + 1);
                accion();
              }}
              alCancelar={() => setPendiente(null)}
            />
          )}
          {!areaSel && !puestoSel && <p class="vacio">Elige un área o un puesto de la lista para ver su ficha.</p>}
        </div>
      </div>
    </div>
  );
}
