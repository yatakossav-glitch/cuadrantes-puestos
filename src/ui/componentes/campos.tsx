/** Controles de formulario compartidos por los editores. Accesibles: label o fieldset/legend, aria-invalid y aria-describedby. */
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { NOMBRES_DIA, NOMBRES_DIA_CORTO } from '../../modelo/fechas';
import { aHora } from '../../modelo/horas';
import { DIAS_SEMANA } from '../../modelo/tipos';
import type { Ambito, Area, DiaSemana, Dureza, FechaISO, Id, Minutos, Puesto } from '../../modelo/tipos';
import { EJEMPLO_DURACION, leerDuracion, leerHora, textoDuracion } from './entrada';

/** Ayuda de duración; se usa la de './entrada' cuando exista. */

interface PropsRotulo {
  id: string;
  etiqueta: string;
  ayuda?: string;
  error?: string | null;
  children: ComponentChildren;
}

/** Etiqueta + control + ayuda + error, con los ids de aria enlazados. */
function Rotulo({ id, etiqueta, ayuda, error, children }: PropsRotulo) {
  return (
    <div class={error ? 'campo campo-error' : 'campo'}>
      <label for={id}>{etiqueta}</label>
      {children}
      {ayuda && (
        <small class="ayuda" id={`${id}-ayuda`}>
          {ayuda}
        </small>
      )}
      {error && (
        <small class="error-campo" id={`${id}-error`}>
          {error}
        </small>
      )}
    </div>
  );
}

function descrito(id: string, ayuda?: string, error?: string | null): string | undefined {
  const ids = [ayuda ? `${id}-ayuda` : '', error ? `${id}-error` : ''].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

interface PropsBase {
  id: string;
  etiqueta: string;
  ayuda?: string;
  error?: string | null;
  deshabilitado?: boolean;
}

// ───────────────────────── Texto y número ─────────────────────────

export function CampoTexto({
  id, etiqueta, ayuda, error, deshabilitado, valor, onCambio, maxLongitud,
}: PropsBase & { valor: string; onCambio: (v: string) => void; maxLongitud?: number }) {
  return (
    <Rotulo id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      <input
        id={id}
        type="text"
        value={valor}
        maxLength={maxLongitud}
        disabled={deshabilitado}
        aria-invalid={error ? true : undefined}
        aria-describedby={descrito(id, ayuda, error)}
        onInput={(e) => onCambio(e.currentTarget.value)}
      />
    </Rotulo>
  );
}

export function CampoNumero({
  id, etiqueta, ayuda, error, deshabilitado, valor, onCambio, min, max,
}: PropsBase & { valor: number; onCambio: (v: number) => void; min?: number; max?: number }) {
  const fuera = (min !== undefined && valor < min) || (max !== undefined && valor > max);
  const mensaje =
    error ??
    (fuera
      ? min !== undefined && max !== undefined
        ? `Debe estar entre ${min} y ${max}.`
        : min !== undefined
          ? `Debe ser al menos ${min}.`
          : `Debe ser como máximo ${max}.`
      : null);
  return (
    <Rotulo id={id} etiqueta={etiqueta} ayuda={ayuda} error={mensaje}>
      <input
        id={id}
        type="number"
        step={1}
        min={min}
        max={max}
        value={valor}
        disabled={deshabilitado}
        aria-invalid={mensaje ? true : undefined}
        aria-describedby={descrito(id, ayuda, mensaje)}
        onInput={(e) => {
          const t = e.currentTarget.value;
          if (t === '') return;
          const n = Number(t);
          if (Number.isFinite(n)) onCambio(Math.trunc(n));
        }}
      />
    </Rotulo>
  );
}

// ───────────────────────── Hora y duración (texto leído al salir) ─────────────────────────

interface PropsLeido extends PropsBase {
  valor: Minutos;
  onCambio: (v: Minutos) => void;
  /** false en cuanto el texto escrito no se entiende; true cuando vuelve a ser válido o se confirma. */
  onValidez?: (valido: boolean) => void;
}

/**
 * Agrega la validez de varios campos: devuelve `(id) => onValidez de ese campo` y avisa
 * con un único booleano (true si todos los campos son válidos).
 */
export function usarValidezAgregada(alCambiar?: (valido: boolean) => void): (id: string) => (valido: boolean) => void {
  const [invalidos, setInvalidos] = useState<string[]>([]);
  const alCambiarRef = useRef(alCambiar);
  alCambiarRef.current = alCambiar;
  useEffect(() => {
    alCambiarRef.current?.(invalidos.length === 0);
  }, [invalidos.length]);
  return useCallback(
    (id: string) => (valido: boolean) =>
      setInvalidos((prev) => (valido ? (prev.includes(id) ? prev.filter((x) => x !== id) : prev) : prev.includes(id) ? prev : [...prev, id])),
    [],
  );
}

function CampoLeido({
  id, etiqueta, ayuda, error, deshabilitado, valor, onCambio, onValidez, leer, formatear, mensajeError, placeholder,
}: PropsLeido & {
  leer: (t: string) => Minutos | null;
  formatear: (m: Minutos) => string;
  mensajeError: string;
  placeholder: string;
}) {
  const [texto, setTexto] = useState(formatear(valor));
  const [local, setLocal] = useState<string | null>(null);
  const onValidezRef = useRef(onValidez);
  onValidezRef.current = onValidez;
  useEffect(() => {
    setTexto(formatear(valor));
    setLocal(null);
    onValidezRef.current?.(true);
  }, [valor]);
  // Al desmontarse, un campo ya no puede estar inválido.
  useEffect(() => () => onValidezRef.current?.(true), []);
  const mensaje = error ?? local;

  function confirmar() {
    const m = leer(texto);
    if (m === null) {
      setLocal(mensajeError);
      onValidez?.(false);
      return;
    }
    setLocal(null);
    setTexto(formatear(m));
    onValidez?.(true);
    if (m !== valor) onCambio(m);
  }

  return (
    <Rotulo id={id} etiqueta={etiqueta} ayuda={ayuda} error={mensaje}>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        placeholder={placeholder}
        value={texto}
        disabled={deshabilitado}
        aria-invalid={mensaje ? true : undefined}
        aria-describedby={descrito(id, ayuda, mensaje)}
        onInput={(e) => {
          const t = e.currentTarget.value;
          setTexto(t);
          onValidez?.(leer(t) !== null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            confirmar();
          }
        }}
        onBlur={confirmar}
      />
    </Rotulo>
  );
}

/** Hora como texto («9:30», «930»); se interpreta al salir del campo o con Enter. */
export function CampoHora(p: PropsLeido) {
  return (
    <CampoLeido
      {...p}
      leer={leerHora}
      formatear={aHora}
      placeholder="HH:MM"
      mensajeError="No entiendo esa hora. Escríbela como 9:30 o 15:45."
    />
  );
}

/** Duración como texto («4h30», «4,5», «45 min»); se interpreta al salir del campo o con Enter. */
export function CampoDuracion(p: PropsLeido) {
  return (
    <CampoLeido
      {...p}
      leer={leerDuracion}
      formatear={textoDuracion}
      placeholder="4h30"
      mensajeError={`No entiendo esa duración. ${EJEMPLO_DURACION}`}
    />
  );
}

export function CampoFecha({
  id, etiqueta, ayuda, error, deshabilitado, valor, onCambio,
}: PropsBase & { valor: FechaISO | null; onCambio: (v: FechaISO | null) => void }) {
  return (
    <Rotulo id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      <input
        id={id}
        type="date"
        value={valor ?? ''}
        disabled={deshabilitado}
        aria-invalid={error ? true : undefined}
        aria-describedby={descrito(id, ayuda, error)}
        onInput={(e) => onCambio(e.currentTarget.value === '' ? null : e.currentTarget.value)}
      />
    </Rotulo>
  );
}

// ───────────────────────── Casillas ─────────────────────────

export function Interruptor({
  id, etiqueta, valor, onCambio, deshabilitado,
}: { id: string; etiqueta: string; valor: boolean; onCambio: (v: boolean) => void; deshabilitado?: boolean }) {
  return (
    <div class="casilla">
      <input
        id={id}
        type="checkbox"
        checked={valor}
        disabled={deshabilitado}
        onChange={(e) => onCambio(e.currentTarget.checked)}
      />
      <label for={id}>{etiqueta}</label>
    </div>
  );
}

export function SelectorDias({
  id, leyenda, valor, onCambio, ayuda,
}: { id: string; leyenda: string; valor: DiaSemana[]; onCambio: (v: DiaSemana[]) => void; ayuda?: string }) {
  return (
    <fieldset class="grupo" aria-describedby={ayuda ? `${id}-ayuda` : undefined}>
      <legend>{leyenda}</legend>
      <div class="casillas-en-linea">
        {DIAS_SEMANA.map((d) => (
          <div class="casilla" key={d}>
            <input
              id={`${id}-${d}`}
              type="checkbox"
              checked={valor.includes(d)}
              onChange={(e) => {
                const sin = valor.filter((x) => x !== d);
                onCambio(e.currentTarget.checked ? [...sin, d].sort((a, b) => a - b) : sin);
              }}
            />
            <label for={`${id}-${d}`} title={NOMBRES_DIA[d]}>
              {NOMBRES_DIA_CORTO[d]}
            </label>
          </div>
        ))}
      </div>
      {ayuda && (
        <small class="ayuda" id={`${id}-ayuda`}>
          {ayuda}
        </small>
      )}
    </fieldset>
  );
}

export function SelectorDureza({
  id, valor, onCambio, restringir, leyenda = 'Dureza',
}: {
  id: string;
  valor: Dureza;
  onCambio: (v: Dureza) => void;
  /** 'soloDura' o 'soloBlanda' fijan la dureza y deshabilitan la otra opción. */
  restringir?: 'soloDura' | 'soloBlanda';
  leyenda?: string;
}) {
  const dura = restringir === 'soloDura' ? true : restringir === 'soloBlanda' ? false : valor.dura;
  return (
    <fieldset class="grupo">
      <legend>{leyenda}</legend>
      <div class="casilla">
        <input
          id={`${id}-dura`}
          type="radio"
          name={id}
          checked={dura}
          disabled={restringir === 'soloBlanda'}
          onChange={() => onCambio({ ...valor, dura: true })}
        />
        <label for={`${id}-dura`}>Obligatoria (dura)</label>
      </div>
      <div class="casilla">
        <input
          id={`${id}-blanda`}
          type="radio"
          name={id}
          checked={!dura}
          disabled={restringir === 'soloDura'}
          onChange={() => onCambio({ ...valor, dura: false, peso: valor.peso >= 1 ? valor.peso : 10 })}
        />
        <label for={`${id}-blanda`}>Preferible (blanda)</label>
      </div>
      {!dura && (
        <CampoNumero
          id={`${id}-peso`}
          etiqueta="Peso (1–100)"
          ayuda="Cuanto mayor, más importa cumplirla."
          valor={valor.peso}
          min={1}
          max={100}
          onCambio={(peso) => onCambio({ ...valor, peso })}
        />
      )}
    </fieldset>
  );
}

export interface OpcionMarcable {
  valor: string;
  etiqueta: string;
  /** Encabezado bajo el que se agrupa (las opciones con el mismo grupo deben ir seguidas). */
  grupo?: string;
}

export function ListaMarcable({
  id, leyenda, opciones, valor, onCambio, vacio = 'No hay opciones disponibles.',
}: {
  id: string;
  leyenda: string;
  opciones: OpcionMarcable[];
  valor: string[];
  onCambio: (v: string[]) => void;
  vacio?: string;
}) {
  let grupoActual: string | undefined;
  return (
    <fieldset class="grupo">
      <legend>{leyenda}</legend>
      {opciones.length === 0 && <p class="ayuda">{vacio}</p>}
      {opciones.map((o, i) => {
        const encabezado = o.grupo !== undefined && o.grupo !== grupoActual ? o.grupo : null;
        grupoActual = o.grupo;
        return (
          <div key={o.valor}>
            {encabezado !== null && <div class="encabezado-grupo">{encabezado}</div>}
            <div class="casilla">
              <input
                id={`${id}-${i}`}
                type="checkbox"
                checked={valor.includes(o.valor)}
                onChange={(e) =>
                  onCambio(e.currentTarget.checked ? [...valor.filter((x) => x !== o.valor), o.valor] : valor.filter((x) => x !== o.valor))
                }
              />
              <label for={`${id}-${i}`}>{o.etiqueta}</label>
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}

/** Áreas y sus puestos con casillas. Vacío = se aplica a todos. */
export function SelectorAmbito({
  id, leyenda = 'Ámbito', valor, onCambio, areas, puestos,
  textoVacio = 'Si no marcas nada, se aplica a todos los puestos',
}: {
  id: string;
  leyenda?: string;
  valor: Ambito;
  onCambio: (v: Ambito) => void;
  areas: Area[];
  puestos: Puesto[];
  textoVacio?: string;
}) {
  const alternar = (lista: Id[], x: Id, marcado: boolean) => (marcado ? [...lista.filter((y) => y !== x), x] : lista.filter((y) => y !== x));
  return (
    <fieldset class="grupo">
      <legend>{leyenda}</legend>
      <p class="ayuda" id={`${id}-ayuda`}>
        {textoVacio}
      </p>
      {areas.map((a) => (
        <div class="ambito-area" key={a.id}>
          <div class="casilla">
            <input
              id={`${id}-area-${a.id}`}
              type="checkbox"
              checked={valor.areaIds.includes(a.id)}
              onChange={(e) => onCambio({ ...valor, areaIds: alternar(valor.areaIds, a.id, e.currentTarget.checked) })}
            />
            <label for={`${id}-area-${a.id}`}>
              <strong>{a.nombre}</strong> (toda el área)
            </label>
          </div>
          <div class="ambito-puestos">
            {puestos
              .filter((p) => p.areaId === a.id)
              .map((p) => (
                <div class="casilla" key={p.id}>
                  <input
                    id={`${id}-puesto-${p.id}`}
                    type="checkbox"
                    checked={valor.puestoIds.includes(p.id)}
                    onChange={(e) => onCambio({ ...valor, puestoIds: alternar(valor.puestoIds, p.id, e.currentTarget.checked) })}
                  />
                  <label for={`${id}-puesto-${p.id}`}>{p.nombre}</label>
                </div>
              ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

export function ListaErrores({ errores, titulo }: { errores: string[]; titulo?: string }) {
  if (errores.length === 0) return null;
  return (
    <div class="mensaje error" role="alert">
      {titulo && <strong>{titulo}</strong>}
      <ul>
        {errores.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    </div>
  );
}
