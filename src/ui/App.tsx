import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { AlmacenApp } from './estado';
import { usarAlmacen } from './usarAlmacen';
import {
  IconoAviso,
  IconoCalendario,
  IconoCuadrante,
  IconoDeshacer,
  IconoExportar,
  IconoPersona,
  IconoPuesto,
  IconoRehacer,
  IconoReglas,
  IconoRotacion,
  type PropsIcono,
} from './iconos';
import { Datos } from './secciones/Datos';
import { Personas } from './secciones/Personas';
import { Puestos } from './secciones/Puestos';
import { Reglas } from './secciones/Reglas';
import { Incidencias } from './secciones/Incidencias';
import { Rotacion } from './secciones/Rotacion';
import { Cuadrante } from './secciones/Cuadrante';
import { PanelValidacion } from './secciones/PanelValidacion';
import { CATALOGO } from '../reglas/catalogo';
import { validarSemana } from '../validacion/validador';
import { crearIndice } from '../validacion/indice';
import { resumirSemana } from '../validacion/resumen';
import { hoyISO, lunesDe } from '../modelo/fechas';
import type { ClaveHueco, FechaISO, Id } from '../modelo/tipos';

type IdSeccion = 'cuadrante' | 'personas' | 'puestos' | 'reglas' | 'rotacion' | 'incidencias' | 'datos';

const SECCIONES: { id: IdSeccion; titulo: string; Icono: (p: PropsIcono) => JSX.Element }[] = [
  { id: 'cuadrante', titulo: 'Cuadrante', Icono: IconoCuadrante },
  { id: 'personas', titulo: 'Personas', Icono: IconoPersona },
  { id: 'puestos', titulo: 'Puestos', Icono: IconoPuesto },
  { id: 'reglas', titulo: 'Reglas', Icono: IconoReglas },
  { id: 'rotacion', titulo: 'Rotación', Icono: IconoRotacion },
  { id: 'incidencias', titulo: 'Incidencias', Icono: IconoCalendario },
  { id: 'datos', titulo: 'Datos', Icono: IconoExportar },
];

function esCampoDeTexto(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(el.type);
  }
  return false;
}

export interface PropsApp {
  almacen: AlmacenApp;
  /** Avisos de la carga inicial, que se muestran una vez (descartables). */
  avisosCarga?: string[];
  /** Aviso fijo de arranque (p. ej. datos guardados ilegibles). */
  avisoArranque?: string | null;
  /** Texto guardado que no se pudo leer, si lo hay (para ofrecer su copia en Datos). */
  textoIlegible?: () => string | null;
}

export function App({ almacen, avisosCarga = [], avisoArranque = null, textoIlegible }: PropsApp) {
  const estado = usarAlmacen(almacen);
  const [seccion, setSeccion] = useState<IdSeccion>('cuadrante');
  const [lunes, setLunes] = useState<FechaISO>(() => lunesDe(hoyISO()));
  const [foco, setFoco] = useState<{ asignacionId?: Id; hueco?: ClaveHueco; nonce: number } | null>(null);
  const [peticionHorario, setPeticionHorario] = useState<{ lunes: FechaISO; nonce: number } | null>(null);
  const [peticion, setPeticion] = useState<{ lunes: FechaISO; recubrir: boolean; nonce: number } | null>(null);
  function irASemana(destino: FechaISO, recubrir: boolean) {
    setPeticion({ lunes: destino, recubrir, nonce: Date.now() });
    setSeccion('cuadrante');
  }
  const validacion = useMemo(() => {
    const asignaciones = estado.cuadrantes[lunes]?.asignaciones ?? [];
    const resultado = validarSemana(estado, lunes, asignaciones, CATALOGO);
    const resumen = resumirSemana(crearIndice(estado, lunes, asignaciones), estado, resultado);
    return { resultado, resumen };
  }, [estado, lunes]);
  const [avisosVisibles, setAvisosVisibles] = useState(avisosCarga);
  const [avisoArranqueVisible, setAvisoArranqueVisible] = useState(avisoArranque);
  const botones = useRef<Record<string, HTMLButtonElement | null>>({});

  const puedeDeshacer = almacen.puedeDeshacer();
  const puedeRehacer = almacen.puedeRehacer();
  const descDeshacer = almacen.descripcionDeshacer();
  const descRehacer = almacen.descripcionRehacer();
  const errorGuardado = almacen.errorGuardado();

  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (esCampoDeTexto(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        almacen.deshacer();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        almacen.rehacer();
      }
    }
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [almacen]);

  function teclasPestana(e: KeyboardEvent, indice: number) {
    let destino = -1;
    if (e.key === 'ArrowRight') destino = (indice + 1) % SECCIONES.length;
    else if (e.key === 'ArrowLeft') destino = (indice - 1 + SECCIONES.length) % SECCIONES.length;
    else if (e.key === 'Home') destino = 0;
    else if (e.key === 'End') destino = SECCIONES.length - 1;
    if (destino < 0) return;
    e.preventDefault();
    const s = SECCIONES[destino];
    if (!s) return;
    setSeccion(s.id);
    botones.current[s.id]?.focus();
  }

  return (
    <div class="app">
      <header class="cabecera">
        <h1>Cuadrantes de puestos</h1>
        <div class="acciones">
          <button
            type="button"
            class="boton"
            disabled={!puedeDeshacer}
            onClick={() => almacen.deshacer()}
            title={descDeshacer ? `Deshacer: ${descDeshacer} (Ctrl+Z)` : 'Nada que deshacer'}
          >
            <IconoDeshacer /> Deshacer
          </button>
          <button
            type="button"
            class="boton"
            disabled={!puedeRehacer}
            onClick={() => almacen.rehacer()}
            title={descRehacer ? `Rehacer: ${descRehacer} (Ctrl+Y)` : 'Nada que rehacer'}
          >
            <IconoRehacer /> Rehacer
          </button>
        </div>
      </header>

      {errorGuardado !== null && (
        <div class="banda error" role="alert">
          <IconoAviso />
          <div>
            No se están guardando los cambios: {errorGuardado} Usa «Exportar datos» en la sección Datos para conservar una copia de seguridad.
            <div class="fila">
              <button type="button" class="boton" onClick={() => setSeccion('datos')}>
                Ir a Datos
              </button>
            </div>
          </div>
        </div>
      )}

      {avisoArranqueVisible && (
        <div class="banda aviso" role="alert">
          <IconoAviso />
          <div>
            {avisoArranqueVisible}
            <div class="fila">
              <button type="button" class="boton" onClick={() => setAvisoArranqueVisible(null)}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {avisosVisibles.length > 0 && (
        <div class="banda aviso" role="status">
          <IconoAviso />
          <div>
            Avisos al cargar los datos guardados:
            <ul>
              {avisosVisibles.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
            <div class="fila">
              <button type="button" class="boton" onClick={() => setAvisosVisibles([])}>
                Cerrar avisos
              </button>
            </div>
          </div>
        </div>
      )}

      <nav aria-label="Secciones">
        <div class="pestanas" role="tablist" aria-label="Secciones de la aplicación">
          {SECCIONES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              class="pestana"
              id={`pestana-${s.id}`}
              aria-selected={seccion === s.id}
              aria-controls={`panel-${s.id}`}
              tabIndex={seccion === s.id ? 0 : -1}
              ref={(el) => {
                botones.current[s.id] = el;
              }}
              onClick={() => setSeccion(s.id)}
              onKeyDown={(e) => teclasPestana(e, i)}
            >
              <s.Icono /> {s.titulo}
            </button>
          ))}
        </div>
      </nav>

      <main class="contenido">
        {SECCIONES.map((s) => (
          <div
            key={s.id}
            role="tabpanel"
            id={`panel-${s.id}`}
            aria-labelledby={`pestana-${s.id}`}
            tabIndex={0}
            hidden={s.id !== seccion}
          >
            {s.id === 'cuadrante' ? (
              <div>
                <Cuadrante almacen={almacen} resultado={validacion.resultado} foco={foco} alCambiarSemana={setLunes} peticion={peticion} alImportarHorario={(l) => {
                  setPeticionHorario({ lunes: l, nonce: Date.now() });
                  setSeccion('datos');
                }} />
                <PanelValidacion
                  resultado={validacion.resultado}
                  resumen={validacion.resumen}
                  datos={estado}
                  lunes={lunes}
                  alIr={(destino) => setFoco({ ...destino, nonce: Date.now() })}
                />
              </div>
            ) : s.id === 'datos' ? (
              <Datos almacen={almacen} textoIlegible={textoIlegible} alIrASemana={(l) => irASemana(l, false)} peticionHorario={peticionHorario} />
            ) : s.id === 'personas' ? (
              <Personas almacen={almacen} />
            ) : s.id === 'puestos' ? (
              <Puestos almacen={almacen} />
            ) : s.id === 'reglas' ? (
              <Reglas almacen={almacen} />
            ) : s.id === 'rotacion' ? (
              <Rotacion almacen={almacen} lunesVisible={lunes} />
            ) : s.id === 'incidencias' ? (
              <Incidencias almacen={almacen} alIrASemana={irASemana} />
            ) : (
              <div>
                <h2>{s.titulo}</h2>
                <div class="vacio">Disponible en una próxima fase.</div>
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
