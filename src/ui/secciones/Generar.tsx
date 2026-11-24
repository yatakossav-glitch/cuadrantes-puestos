/** Generar semana (ARQUITECTURA §11.1): modo, progreso, resumen y aplicación como un paso de deshacer. */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AlmacenApp } from '../estado';
import { usarAlmacen } from '../usarAlmacen';
import { ejecutarMotor, MotorCancelado, type EjecucionMotor, type EjecutorMotor } from '../usarMotor';
import { MAX_ITERACIONES_POR_DEFECTO } from '../../motor/motor';
import type { PeticionMotor, ProgresoMotor, ResultadoMotor } from '../../motor/contrato';
import { formatearFecha } from '../../modelo/fechas';
import type { FechaISO, ModoMotor } from '../../modelo/tipos';
import { semanaDelCiclo } from '../../edicion/cuadrante';
import { crearIndice } from '../../validacion/indice';
import { validarSemana } from '../../validacion/validador';
import { CATALOGO } from '../../reglas/catalogo';
import { formatearIntervalo } from '../../modelo/horas';
import type { ExplicacionHueco } from '../../motor/contrato';
import type { CuadranteSemana } from '../../modelo/tipos';
import './Generar.css';

export interface PropsGenerar {
  almacen: AlmacenApp;
  lunes: FechaISO;
  /** Ejecutor del motor (inyectable en tests). */
  ejecutar?: EjecutorMotor;
  /** Petición externa de generar al momento (p. ej. «Ir a la semana y recubrir» desde Incidencias). */
  arrancar?: { modo: ModoMotor; nonce: number } | null;
}

const MODOS: { id: ModoMotor; etiqueta: string; descripcion: string }[] = [
  { id: 'semanaTipo', etiqueta: 'Partir de la semana tipo y cubrir huecos afectados', descripcion: 'Si la semana ya tiene asignaciones, parte de ellas en vez de copiar la semana tipo; si está vacía, copia la semana tipo. Después rehace solo lo que ya no encaja.' },
  { id: 'completarHuecos', etiqueta: 'Completar huecos sin tocar lo asignado', descripcion: 'Respeta todo lo que ya está puesto.' },
  { id: 'desdeCero', etiqueta: 'Generar desde cero (respeta candados)', descripcion: 'Parte de una semana vacía, salvo las asignaciones con candado.' },
];

const TEXTO_MODO: Record<ModoMotor, string> = {
  semanaTipo: 'partir de la semana tipo',
  completarHuecos: 'completar huecos',
  desdeCero: 'desde cero',
};

const TEXTO_FASE: Record<ProgresoMotor['fase'], string> = {
  preparacion: 'Preparando los datos',
  construccion: 'Colocando personas en los puestos',
  comidas: 'Colocando las comidas',
  mejora: 'Mejorando el reparto',
};

type Fase = 'cerrado' | 'configurando' | 'ejecutando' | 'resultado' | 'obsoleto' | 'error';

function porcentaje(fraccion: number): number {
  return Math.max(0, Math.min(100, Math.round(fraccion * 100)));
}

export function Generar({ almacen, lunes, ejecutar = ejecutarMotor, arrancar = null }: PropsGenerar) {
  const estado = usarAlmacen(almacen);
  const ciclo = semanaDelCiclo(estado.rotacion, lunes);
  const hayTipo = useMemo(
    () => estado.semanasTipo.some((s) => s.indiceCiclo === ciclo.indice && s.asignaciones.length > 0),
    [estado.semanasTipo, ciclo.indice],
  );

  const [fase, setFase] = useState<Fase>('cerrado');
  const [modo, setModo] = useState<ModoMotor>(hayTipo ? 'semanaTipo' : 'completarHuecos');
  const [variante, setVariante] = useState(0);
  const [progreso, setProgreso] = useState<ProgresoMotor | null>(null);
  const [resultado, setResultado] = useState<ResultadoMotor | null>(null);
  const [mensajeError, setMensajeError] = useState('');
  const [modoUsado, setModoUsado] = useState<ModoMotor>(modo);
  const [semillaUsada, setSemillaUsada] = useState(0);
  // Arranque externo que espera a que la usuaria decida qué hacer con un resultado sin aplicar.
  const [arranquePendiente, setArranquePendiente] = useState<ModoMotor | null>(null);
  const ejecucion = useRef<EjecucionMotor | null>(null);
  // Estado de la semana cuando se lanzó el motor (para no pisar cambios posteriores).
  const foto = useRef<CuadranteSemana | undefined>(undefined);
  const disparador = useRef<HTMLButtonElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const primerRadio = useRef<HTMLInputElement>(null);
  const cancelarRef = useRef<HTMLButtonElement>(null);

  function detener() {
    ejecucion.current?.cancelar();
    ejecucion.current = null;
  }

  // Al cambiar de semana se cancela y se cierra; al desmontar, se cancela.
  useEffect(() => {
    setFase('cerrado');
    setResultado(null);
    setVariante(0);
    setArranquePendiente(null);
    return detener;
  }, [lunes]);

  // Arranque pedido desde fuera: va después del efecto de `lunes` para que, si cambia la semana, gane el arranque.
  useEffect(() => {
    if (!arrancar) return;
    if (fase === 'resultado' || fase === 'obsoleto') {
      setArranquePendiente(arrancar.modo);
      return;
    }
    setVariante(0);
    lanzar(arrancar.modo, 0);
  }, [arrancar?.nonce]);

  useEffect(() => {
    if (fase === 'configurando') primerRadio.current?.focus();
    else if (fase === 'ejecutando') cancelarRef.current?.focus();
    else if (fase === 'resultado' || fase === 'error') titulo.current?.focus();
  }, [fase]);

  function abrir() {
    setModo(hayTipo ? 'semanaTipo' : 'completarHuecos');
    setVariante(0);
    setResultado(null);
    setFase('configurando');
  }

  function cerrar() {
    detener();
    setArranquePendiente(null);
    setFase('cerrado');
    setResultado(null);
    disparador.current?.focus();
  }

  function lanzar(modoElegido: ModoMotor, varianteElegida: number) {
    detener();
    setArranquePendiente(null);
    foto.current = almacen.obtener().cuadrantes[lunes];
    const semilla = estado.config.semilla + varianteElegida;
    const peticion: PeticionMotor = {
      datos: estado,
      lunes,
      actuales: estado.cuadrantes[lunes]?.asignaciones ?? [],
      modo: modoElegido,
      semilla,
      maxIteraciones: MAX_ITERACIONES_POR_DEFECTO,
      limiteMs: estado.config.limiteMotorMs,
    };
    setModoUsado(modoElegido);
    setSemillaUsada(semilla);
    setProgreso(null);
    setResultado(null);
    setFase('ejecutando');
    let actual: EjecucionMotor;
    try {
      actual = ejecutar(peticion, setProgreso);
    } catch (e) {
      setMensajeError(e instanceof Error ? e.message : 'No se pudo generar el cuadrante.');
      setFase('error');
      return;
    }
    ejecucion.current = actual;
    actual.promesa.then(
      (r) => {
        if (ejecucion.current !== actual) return;
        ejecucion.current = null;
        setResultado(r);
        setFase(almacen.obtener().cuadrantes[lunes] === foto.current ? 'resultado' : 'obsoleto');
      },
      (e: unknown) => {
        if (ejecucion.current !== actual || e instanceof MotorCancelado) return;
        ejecucion.current = null;
        setMensajeError(e instanceof Error ? e.message : 'No se pudo generar el cuadrante.');
        setFase('error');
      },
    );
  }

  function otraVariante() {
    const siguiente = variante + 1;
    setVariante(siguiente);
    lanzar(modoUsado, siguiente);
  }

  function aplicar() {
    if (!resultado) return;
    if (almacen.obtener().cuadrantes[lunes] !== foto.current) {
      setFase('obsoleto');
      return;
    }
    const asignaciones = resultado.asignaciones;
    const meta = { modo: modoUsado, semilla: semillaUsada, generado: new Date().toISOString() };
    almacen.aplicar(`Generar semana del ${formatearFecha(lunes).slice(0, 5)} (${TEXTO_MODO[modoUsado]})`, (e) => ({
      ...e,
      cuadrantes: { ...e.cuadrantes, [lunes]: { lunes, asignaciones, meta } },
    }));
    cerrar();
  }

  const totalHuecos = useMemo(
    () => (fase === 'resultado' ? crearIndice(estado, lunes, []).huecos().length : 0),
    [fase, estado.puestos, estado.areas, estado.incidencias, lunes],
  );

  const obligatorios = useMemo(
    () =>
      fase === 'resultado' && resultado
        ? validarSemana(estado, lunes, resultado.asignaciones, CATALOGO)
            .incumplimientos.filter((i) => i.dura && i.marca !== 'hueco')
            .map((i) => i.mensaje)
        : [],
    [fase, resultado],
  );

  const etiquetaProgreso = progreso ? TEXTO_FASE[progreso.fase] : 'Preparando los datos';
  const valor = progreso ? porcentaje(progreso.fraccion) : 0;

  return (
    <div class="gen">
      <button
        type="button"
        class="boton primario"
        ref={disparador}
        aria-expanded={fase !== 'cerrado'}
        aria-controls="gen-panel"
        onClick={() => (fase === 'cerrado' ? abrir() : cerrar())}
      >
        Generar semana
      </button>
      {fase !== 'cerrado' && (
        <section
          id="gen-panel"
          class="gen-panel"
          aria-labelledby="gen-titulo"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              cerrar();
            }
          }}
        >
          <h3 id="gen-titulo" ref={titulo} tabIndex={-1}>
            Generar la semana del {formatearFecha(lunes)}
          </h3>

          {arranquePendiente !== null && (fase === 'resultado' || fase === 'obsoleto') && (
            <div role="alert" class="gen-aviso">
              <p>Hay un resultado sin aplicar. ¿Lo descartas y recubres los huecos?</p>
              <div class="fila">
                <button
                  type="button"
                  class="boton primario"
                  onClick={() => {
                    setVariante(0);
                    lanzar(arranquePendiente, 0);
                  }}
                >
                  Descartar y recubrir
                </button>
                <button type="button" class="boton" onClick={() => setArranquePendiente(null)}>
                  Mantener el resultado
                </button>
              </div>
            </div>
          )}

          {fase === 'configurando' && (
            <>
              <fieldset class="gen-modos">
                <legend>Modo</legend>
                {MODOS.map((m, i) => {
                  const desactivado = m.id === 'semanaTipo' && !hayTipo;
                  return (
                  <label key={m.id} class="casilla gen-modo">
                    <input
                      type="radio"
                      name="gen-modo"
                      value={m.id}
                      checked={modo === m.id}
                      disabled={desactivado}
                      ref={m.id === modo ? primerRadio : undefined}
                      onChange={() => setModo(m.id)}
                    />
                    <span>
                      {m.etiqueta}
                      <span class="ayuda gen-ayuda-modo">
                        {desactivado ? `No hay semana tipo para la semana ${ciclo.etiqueta}.` : m.descripcion}
                      </span>
                    </span>
                  </label>
                  );
                })}
              </fieldset>
              {modo === 'desdeCero' && (
                <p class="gen-aviso" role="note">
                  Se reemplazará todo lo que no tenga candado. Se puede deshacer.
                </p>
              )}
              <div class="fila">
                <button type="button" class="boton primario" onClick={() => lanzar(modo, 0)}>
                  Empezar
                </button>
                <button type="button" class="boton" onClick={cerrar}>
                  Cerrar
                </button>
              </div>
            </>
          )}

          {fase === 'ejecutando' && (
            <div class="gen-progreso">
              <div
                class="gen-barra"
                role="progressbar"
                aria-label="Progreso de la generación"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={valor}
                aria-valuetext={`${etiquetaProgreso}, ${valor} %`}
              >
                <div class="gen-barra-relleno" style={{ width: `${valor}%` }} />
              </div>
              <p class="gen-fase" role="status">
                {etiquetaProgreso} ({valor} %)
                {progreso ? ` · huecos sin cubrir: ${progreso.huecosSinCubrir}` : ''}
              </p>
              <button type="button" class="boton" ref={cancelarRef} onClick={cerrar}>
                Cancelar
              </button>
            </div>
          )}

          {fase === 'obsoleto' && (
            <div role="alert" class="gen-aviso">
              <p>La semana ha cambiado mientras se generaba. Vuelve a generar para no perder esos cambios.</p>
              <div class="fila">
                <button type="button" class="boton primario" onClick={() => lanzar(modoUsado, variante)}>
                  Volver a generar
                </button>
                <button type="button" class="boton" onClick={cerrar}>
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {fase === 'error' && (
            <div role="alert" class="gen-error">
              <p>{mensajeError}</p>
              <div class="fila">
                <button type="button" class="boton" onClick={() => setFase('configurando')}>
                  Volver
                </button>
                <button type="button" class="boton" onClick={cerrar}>
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {fase === 'resultado' && resultado && (
            <Resumen
              resultado={resultado}
              obligatorios={obligatorios}
              totalHuecos={totalHuecos}
              alAplicar={aplicar}
              alDescartar={cerrar}
              alOtraVariante={otraVariante}
            />
          )}
        </section>
      )}
    </div>
  );
}

function Resumen({
  resultado,
  obligatorios,
  totalHuecos,
  alAplicar,
  alDescartar,
  alOtraVariante,
}: {
  resultado: ResultadoMotor;
  obligatorios: string[];
  totalHuecos: number;
  alAplicar: () => void;
  alDescartar: () => void;
  alOtraVariante: () => void;
}) {
  const grupos = agruparHuecos(resultado.sinCubrir);
  const sinCubrir = resultado.sinCubrir.length;
  const cubiertos = Math.max(0, totalHuecos - sinCubrir);
  const cobertura = totalHuecos > 0 ? Math.round((cubiertos / totalHuecos) * 100) : 100;
  return (
    <div class="gen-resumen">
      <p role="status">
        <strong>Cobertura: {cobertura} %</strong>
        {totalHuecos > 0 ? ` (${cubiertos} de ${totalHuecos} huecos)` : ''}. Preferencias no cumplidas: {resultado.penalizacionBlanda} puntos (cuanto más bajo, mejor).
      </p>
      {resultado.cortadoPorTiempo && (
        <p class="gen-aviso" role="note">
          Se alcanzó el límite de tiempo antes de terminar de mejorar el reparto. El resultado es válido, pero quizá se pueda mejorar: prueba otra variante.
        </p>
      )}
      {obligatorios.length > 0 && (
        <div class="gen-aviso" role="note">
          <p>
            {obligatorios.length === 1
              ? 'Queda 1 aviso obligatorio que el generador no ha podido resolver:'
              : `Quedan ${obligatorios.length} avisos obligatorios que el generador no ha podido resolver:`}
          </p>
          <ul>
            {obligatorios.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {sinCubrir > 0 && (
        <details class="gen-detalle">
          <summary>Huecos sin cubrir ({grupos.length})</summary>
          <ul>
            {grupos.map((x) => (
              <li key={`${x.hueco.fecha}|${x.hueco.puestoId}|${x.hueco.franjaId}|${x.hueco.plaza}`}>
                {x.resumen}
                {x.descartes.length > 0 && (
                  <details class="gen-descartes">
                    <summary>Por qué no puede cada persona ({x.descartes.length})</summary>
                    <ul>
                      {x.descartes.map((d) => (
                        <li key={d.personaId}>{d.motivo}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {resultado.comidasPendientes.length > 0 && (
        <details class="gen-detalle">
          <summary>Comidas pendientes ({resultado.comidasPendientes.length})</summary>
          <ul>
            {resultado.comidasPendientes.map((c) => (
              <li key={`${c.personaId}|${c.fecha}`}>{c.motivo}</li>
            ))}
          </ul>
        </details>
      )}
      <div class="fila">
        <button type="button" class="boton primario" onClick={alAplicar}>
          Aplicar
        </button>
        <button type="button" class="boton" onClick={alDescartar}>
          Descartar
        </button>
        <button type="button" class="boton" onClick={alOtraVariante}>
          Probar otra variante
        </button>
      </div>
    </div>
  );
}

/**
 * Junta las explicaciones de franjas consecutivas del mismo puesto, día y plaza (y bloque, si lo hay)
 * en una sola con el intervalo completo.
 */
export function agruparHuecos(lista: readonly ExplicacionHueco[]): ExplicacionHueco[] {
  const grupos = new Map<string, ExplicacionHueco[]>();
  for (const x of lista) {
    const h = x.hueco;
    const clave = `${h.puestoId}|${h.fecha}|${h.plaza}|${h.bloqueId ?? h.franjaId}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), x]);
  }
  return [...grupos.values()].map((g) => {
    const primero = g[0];
    if (!primero || g.length === 1) return primero as ExplicacionHueco;
    const inicio = Math.min(...g.map((x) => x.hueco.inicio));
    const fin = Math.max(...g.map((x) => x.hueco.fin));
    const propio = formatearIntervalo(primero.hueco);
    const completo = formatearIntervalo({ inicio, fin });
    const resumen = primero.resumen.includes(propio) ? primero.resumen.replace(propio, completo) : `${primero.resumen} (${completo})`;
    const vistos = new Set<string>();
    const descartes = g
      .flatMap((x) => x.descartes)
      .filter((d) => {
        const k = `${d.personaId}|${d.motivo}`;
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      });
    return { hueco: { ...primero.hueco, inicio, fin }, resumen, descartes };
  });
}
