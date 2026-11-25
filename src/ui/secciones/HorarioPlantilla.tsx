/** Horario semanal de la plantilla (ARQUITECTURA §13.3): pegar desde Excel, vista previa, guardar y editar. */
import { useMemo, useState } from 'preact/hooks';
import {
  cambiarTurno,
  crearPersonasDesdeCodigos,
  describirTurno,
  guardarHorario,
  horarioDesdeLectura,
  impactoGuardarHorario,
  minutosDeTurno,
  quitarHorario,
} from '../../edicion/horarios';
import { letrasPorDefecto, leerCelda, leerHorario } from '../../importar/horario';
import type { CeldaLeida, TurnoConLetra } from '../../importar/horario';
import { NOMBRES_DIA, NOMBRES_DIA_CORTO, fechasSemana, formatearFecha, hoyISO, lunesDe, sumarDias } from '../../modelo/fechas';
import { duracion, formatearDuracion } from '../../modelo/horas';
import type { EstadoApp, FechaISO, HorarioSemana, Id, Intervalo } from '../../modelo/tipos';
import { semanaDelCiclo } from '../../rotacion/ciclo';
import { Confirmacion } from '../componentes/Confirmacion';
import { CampoFecha, CampoHora, CampoTexto, ListaErrores } from '../componentes/campos';
import type { AlmacenApp } from '../estado';
import { usarAlmacen } from '../usarAlmacen';
import './HorarioPlantilla.css';

export interface PropsHorarioPlantilla {
  almacen: AlmacenApp;
  alIrASemana: (lunes: FechaISO) => void;
}

const sumaMinutos = (tramos: readonly Intervalo[]) => tramos.reduce((s, t) => s + duracion(t), 0);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const porCodigo = (estado: EstadoApp, a: Id, b: Id) =>
  (estado.personas.find((p) => p.id === a)?.codigo ?? a).localeCompare(estado.personas.find((p) => p.id === b)?.codigo ?? b, 'es', { numeric: true });

function textoSemana(estado: EstadoApp, lunes: FechaISO): string {
  const ciclo = estado.rotacion.longitudCiclo > 1 ? semanaDelCiclo(estado.rotacion, lunes) : null;
  return `Semana del ${formatearFecha(lunes)} al ${formatearFecha(sumarDias(lunes, 6))}${ciclo ? ` · Semana ${ciclo.etiqueta}` : ''}`;
}

function textoCelda(c: CeldaLeida | null): string {
  if (c === null) return 'No venía';
  if (c.error) return `Error: ${c.error}`;
  return c.libre ? 'Libra' : describirTurno(c.tramos);
}

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

function textoInicial(tramos: readonly Intervalo[]): string {
  return tramos.length === 0 ? 'L' : describirTurno([...tramos]);
}

function EditorSemana({
  almacen, estado, horario, letras, alTerminar,
}: {
  almacen: AlmacenApp;
  estado: EstadoApp;
  horario: HorarioSemana;
  letras: TurnoConLetra[];
  alTerminar: (mensaje: string | null) => void;
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
  const hayError = Object.values(leidas).some((c) => c.error !== null);

  function guardar() {
    almacen.aplicar(`Editar el horario de la semana del ${formatearFecha(horario.lunes)}`, (e) => {
      let r = e;
      for (const k of cambios) {
        const [p, f] = k.split('|') as [Id, FechaISO];
        const c = leidas[k];
        if (c && c.error === null) r = cambiarTurno(r, horario.lunes, p, f, c.libre ? [] : c.tramos);
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

// ───────────────────────── Componente principal ─────────────────────────

export function HorarioPlantilla({ almacen, alIrASemana }: PropsHorarioPlantilla) {
  const estado = usarAlmacen(almacen);
  const [lunes, setLunes] = useState<FechaISO>(() => sumarDias(lunesDe(hoyISO()), 7));
  const [texto, setTexto] = useState('');
  const [letras, setLetras] = useState<TurnoConLetra[]>(() => letrasPorDefecto(almacen.obtener()));
  const [leido, setLeido] = useState<{ texto: string; lunes: FechaISO; letras: TurnoConLetra[] } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [guardado, setGuardado] = useState<FechaISO | null>(null);
  const [editando, setEditando] = useState<FechaISO | null>(null);
  const [quitando, setQuitando] = useState<FechaISO | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const lectura = useMemo(
    () => (leido ? leerHorario(leido.texto, leido.lunes, estado, leido.letras) : null),
    [leido, estado],
  );
  const horarioNuevo = useMemo(() => (lectura ? horarioDesdeLectura(lectura, new Date().toISOString()) : null), [lectura]);

  function irA(destino: FechaISO) {
    setLunes(destino);
    setLeido(null);
    setConfirmando(false);
  }

  function guardar() {
    if (!horarioNuevo) return;
    almacen.aplicar(`Guardar el horario de la semana del ${formatearFecha(horarioNuevo.lunes)}`, (e) => guardarHorario(e, horarioNuevo));
    setConfirmando(false);
    setGuardado(horarioNuevo.lunes);
    setLeido(null);
    setTexto('');
  }

  const semanas = Object.keys(estado.horarios).sort();
  const impacto = confirmando && horarioNuevo ? impactoGuardarHorario(estado, horarioNuevo) : null;
  const faltan = lectura?.codigosDesconocidos ?? [];

  return (
    <div class="hp">
      <p class="ayuda">Pega el horario de la semana que te pasan en Excel. Con él, el cuadrante solo reparte a cada persona dentro de su turno.</p>

      <div class="hp-semana" role="group" aria-label="Semana del horario">
        <button type="button" class="boton" onClick={() => irA(sumarDias(lunes, -7))}>
          Semana anterior
        </button>
        <button type="button" class="boton" onClick={() => irA(sumarDias(lunes, 7))}>
          Semana siguiente
        </button>
        <CampoFecha id="hp-fecha" etiqueta="Ir a la semana de" valor={lunes} onCambio={(v) => v && irA(lunesDe(v))} />
      </div>
      <p class="hp-texto-semana" aria-live="polite">
        <strong>{textoSemana(estado, lunes)}</strong>
        {estado.horarios[lunes] ? ' · ya tiene horario (se reemplazará al guardar)' : ''}
      </p>

      <label class="campo">
        <span>Pega aquí el horario copiado de Excel</span>
        <textarea
          rows={6}
          value={texto}
          onInput={(e) => {
            setTexto(e.currentTarget.value);
            setLeido(null);
            setConfirmando(false);
          }}
          aria-describedby="hp-ayuda-pegar"
        />
      </label>
      <p class="ayuda" id="hp-ayuda-pegar">
        Selecciona en Excel la tabla (códigos y días), cópiala con Ctrl+C y pégala aquí. Valen horas como 10:00-15:45, turnos partidos (10-14 y 17-21), M, T y L (libra).
      </p>

      <EditorLetras
        letras={letras}
        alCambiar={(l) => {
          setLetras(l);
          setLeido(null);
        }}
      />

      <div class="fila">
        <button
          type="button"
          class="boton primario"
          disabled={texto.trim() === ''}
          onClick={() => {
            setGuardado(null);
            setMensaje(null);
            setLeido({ texto, lunes, letras });
          }}
        >
          Leer horario
        </button>
      </div>

      {lectura && (
        <div class="hp-previa">
          <h4>Esto es lo que se ha entendido</h4>
          <p class="ayuda">{lectura.columnas}</p>
          <ListaErrores errores={lectura.errores} titulo="Hay que corregir antes de guardar:" />
          {lectura.avisos.length > 0 && (
            <div class="mensaje aviso" role="status">
              <strong>Avisos</strong>
              <ul>
                {lectura.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {faltan.length > 0 && (
            <div class="fila">
              <button
                type="button"
                class="boton"
                onClick={() => almacen.aplicar('Crear personas del horario', (e) => crearPersonasDesdeCodigos(e, faltan))}
              >
                {faltan.length === 1 ? 'Crear la persona que falta' : `Crear las ${faltan.length} personas que faltan`}
              </button>
            </div>
          )}
          <div class="hp-caja">
            <table class="hp-tabla">
              <caption class="hp-oculto">Horario entendido de la semana del {formatearFecha(lectura.lunes)}</caption>
              <thead>
                <tr>
                  <th scope="col">Persona</th>
                  {NOMBRES_DIA_CORTO.map((d) => (
                    <th key={d} scope="col">{d}</th>
                  ))}
                  <th scope="col">Horas</th>
                </tr>
              </thead>
              <tbody>
                {lectura.filas.map((f, i) => (
                  <tr key={i}>
                    <th scope="row">
                      {f.codigo}
                      {f.personaId === null && <small> (no existe)</small>}
                    </th>
                    {f.dias.map((c, n) => (
                      <td key={n} class={c?.error ? 'hp-error' : ''}>
                        {textoCelda(c)}
                      </td>
                    ))}
                    <td>{formatearDuracion(f.dias.reduce((s, c) => s + (c && !c.error ? sumaMinutos(c.tramos) : 0), 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div class="fila">
            <button type="button" class="boton primario" disabled={lectura.errores.length > 0} onClick={() => setConfirmando(true)}>
              Guardar horario de la semana
            </button>
          </div>
          {impacto && (
            <Confirmacion
              id="hp-conf-guardar"
              titulo="Guardar horario"
              texto={`Se guardará el horario de la semana del ${formatearFecha(lectura.lunes)}.`}
              lista={impacto.efectos}
              textoConfirmar="Sí, guardar horario"
              alConfirmar={guardar}
              alCancelar={() => setConfirmando(false)}
            />
          )}
        </div>
      )}

      {guardado && (
        <div class="mensaje ok" role="status">
          Horario de la semana del {formatearFecha(guardado)} guardado.{' '}
          <button type="button" class="boton" onClick={() => alIrASemana(guardado)}>
            Ir a la semana
          </button>
        </div>
      )}
      {mensaje && (
        <div class="mensaje ok" role="status">
          {mensaje}
        </div>
      )}

      <h4>Semanas con horario</h4>
      {semanas.length === 0 ? (
        <p class="vacio">Todavía no hay ningún horario guardado.</p>
      ) : (
        <ul class="hp-semanas">
          {semanas.map((s) => {
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
                        setEditando(editando === s ? null : s);
                        setMensaje(null);
                      }}
                    >
                      Ver y editar
                    </button>
                    <button type="button" class="boton peligro" aria-label={`Quitar el horario de la semana del ${formatearFecha(s)}`} onClick={() => setQuitando(s)}>
                      Quitar
                    </button>
                  </span>
                </div>
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
                    key={`${s}-${h.actualizado ?? ''}`}
                    almacen={almacen}
                    estado={estado}
                    horario={h}
                    letras={letras}
                    alTerminar={(m) => {
                      setEditando(null);
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
