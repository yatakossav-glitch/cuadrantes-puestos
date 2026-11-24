import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { AlmacenApp } from '../estado';
import { crearEstadoEjemplo } from '../../datos-ejemplo/ejemplo';
import { conservarAlias } from '../../persistencia/alias';
import { CLAVE_ILEGIBLE } from '../../arranque';
import { exportarRespaldo, importarRespaldo } from '../../persistencia/respaldo';
import { Confirmacion } from '../componentes/Confirmacion';
import { IconoCopiar, IconoExportar, IconoImportar } from '../iconos';

type Mensaje = { tipo: 'ok' | 'error' | 'aviso'; texto: string; lista?: string[] };

function Aviso({ mensaje }: { mensaje: Mensaje | null }) {
  if (!mensaje) return null;
  return (
    <div class={`mensaje ${mensaje.tipo}`} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>
      {mensaje.texto}
      {mensaje.lista && mensaje.lista.length > 0 && (
        <ul>
          {mensaje.lista.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const AVISO_DESHACER = (hayIlegible: boolean) =>
  hayIlegible
    ? 'Lo que había guardado (y no se puede leer) se conserva aparte como copia no legible; esta acción no se puede deshacer para recuperarlo.'
    : 'Podrás deshacerlo después.';

function leerClave(clave: string): string | null {
  try {
    return globalThis.localStorage?.getItem(clave) ?? null;
  } catch {
    return null;
  }
}

export function Datos({ almacen, textoIlegible }: { almacen: AlmacenApp; textoIlegible?: () => string | null }) {
  const [sinAlias, setSinAlias] = useState(false);
  const [copia, setCopia] = useState('');
  const [msgExportar, setMsgExportar] = useState<Mensaje | null>(null);
  const [generando, setGenerando] = useState(false);
  const areaCopia = useRef<HTMLTextAreaElement>(null);

  const [texto, setTexto] = useState('');
  const [msgImportar, setMsgImportar] = useState<Mensaje | null>(null);
  const [confirmando, setConfirmando] = useState<'importar' | 'ejemplo' | null>(null);
  const [msgEjemplo, setMsgEjemplo] = useState<Mensaje | null>(null);
  const [caducada, setCaducada] = useState(false);
  const [msgIlegible, setMsgIlegible] = useState<Mensaje | null>(null);
  const copiaActual = useRef('');
  const botonImportar = useRef<HTMLButtonElement>(null);
  const botonEjemplo = useRef<HTMLButtonElement>(null);
  const areaIlegible = useRef<HTMLTextAreaElement>(null);
  copiaActual.current = copia;

  // Cualquier cambio en los datos invalida la copia generada y los mensajes anteriores.
  useEffect(
    () =>
      almacen.suscribir(() => {
        if (copiaActual.current !== '') setCaducada(true);
        setCopia('');
        setMsgExportar(null);
        setMsgImportar(null);
        setMsgEjemplo(null);
      }),
    [almacen],
  );

  const ilegible = textoIlegible ? textoIlegible() : null;

  function cerrarConfirmacion(volverA: RefObject<HTMLButtonElement | null>) {
    setConfirmando(null);
    setTimeout(() => volverA.current?.focus(), 0);
  }

  async function copiarIlegible() {
    const t = textoIlegible?.() ?? leerClave(CLAVE_ILEGIBLE);
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      setMsgIlegible({ tipo: 'ok', texto: 'Datos no legibles copiados al portapapeles.' });
    } catch {
      const area = areaIlegible.current;
      if (area) {
        area.value = t;
        area.hidden = false;
        area.focus();
        area.select();
      }
      setMsgIlegible({ tipo: 'aviso', texto: 'No se pudo copiar automáticamente. El texto está seleccionado: pulsa Ctrl+C (o Cmd+C).' });
    }
  }

  async function generar() {
    setGenerando(true);
    setMsgExportar(null);
    setCaducada(false);
    const base = almacen.obtener();
    try {
      const texto = await exportarRespaldo(base, { sinAlias });
      if (almacen.obtener() !== base) {
        setCaducada(true);
        return;
      }
      setCopia(texto);
      setMsgExportar({ tipo: 'ok', texto: 'Copia de seguridad generada. Cópiala y guárdala en un lugar seguro.' });
    } catch (e) {
      setMsgExportar({ tipo: 'error', texto: `No se pudo generar la copia: ${e instanceof Error ? e.message : 'error desconocido'}.` });
    } finally {
      setGenerando(false);
    }
  }

  async function copiar() {
    if (!copia) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copia);
      } else {
        throw new Error('sin portapapeles');
      }
      setMsgExportar({ tipo: 'ok', texto: 'Copiado al portapapeles.' });
    } catch {
      const area = areaCopia.current;
      let bien = false;
      if (area) {
        area.focus();
        area.select();
        try {
          bien = document.execCommand('copy');
        } catch {
          bien = false;
        }
      }
      setMsgExportar(
        bien
          ? { tipo: 'ok', texto: 'Copiado al portapapeles.' }
          : { tipo: 'aviso', texto: 'No se pudo copiar automáticamente. El texto está seleccionado: pulsa Ctrl+C (o Cmd+C).' },
      );
    }
  }

  async function importar() {
    cerrarConfirmacion(botonImportar);
    const r = await importarRespaldo(texto);
    if (!r.ok) {
      setMsgImportar({ tipo: 'error', texto: 'No se han importado los datos. Tus datos actuales siguen intactos.', lista: [r.error] });
      return;
    }
    almacen.reemplazar('Importar copia de seguridad', conservarAlias(almacen.obtener(), r.estado));
    setTexto('');
    setMsgImportar(
      r.avisos.length > 0
        ? { tipo: 'aviso', texto: 'Datos importados. Revisa estos avisos:', lista: r.avisos }
        : { tipo: 'ok', texto: 'Datos importados correctamente.' + (ilegible !== null ? ' Lo que había guardado se conserva aparte como copia no legible.' : ' Puedes deshacerlo desde el botón Deshacer.')+'' },
    );
  }

  function cargarEjemplo() {
    cerrarConfirmacion(botonEjemplo);
    almacen.reemplazar('Cargar datos de ejemplo', crearEstadoEjemplo());
    setMsgEjemplo({ tipo: 'ok', texto: 'Datos de ejemplo cargados.' + (ilegible !== null ? ' Lo que había guardado se conserva aparte como copia no legible.' : ' Puedes deshacerlo desde el botón Deshacer.')+'' });
  }

  return (
    <div>
      <h2>Datos</h2>
      <p class="ayuda">Los datos se guardan solo en este navegador. Haz copias de seguridad con regularidad.</p>

      {(ilegible !== null || leerClave(CLAVE_ILEGIBLE) !== null) && (
        <section class="tarjeta" aria-labelledby="titulo-ilegible">
          <h3 id="titulo-ilegible">Datos no legibles</h3>
          <p class="ayuda">
            Había datos guardados que la aplicación no ha podido leer. Se conservan aparte, sin modificar. Cópialos y envíalos a soporte para intentar recuperarlos.
          </p>
          <div class="fila">
            <button type="button" class="boton" onClick={copiarIlegible}>
              <IconoCopiar /> Copiar datos no legibles
            </button>
          </div>
          <textarea ref={areaIlegible} readOnly hidden aria-label="Datos no legibles" rows={4} />
          <Aviso mensaje={msgIlegible} />
        </section>
      )}

      <section class="tarjeta" aria-labelledby="titulo-exportar">
        <h3 id="titulo-exportar">Exportar</h3>
        <p class="ayuda">Genera un texto con todos los datos para guardarlo o llevarlo a otro ordenador.</p>
        <label class="casilla">
          <input type="checkbox" checked={sinAlias} onChange={(e) => setSinAlias(e.currentTarget.checked)} />
          <span>Exportar sin alias</span>
        </label>
        <div class="fila">
          <button type="button" class="boton primario" onClick={generar} disabled={generando}>
            <IconoExportar /> Generar copia de seguridad
          </button>
        </div>
        <label class="campo">
          <span>Copia de seguridad</span>
          <textarea ref={areaCopia} readOnly value={copia} rows={4} placeholder={caducada ? 'Los datos han cambiado desde la última copia. Genera una copia nueva.' : 'Aquí aparecerá el texto de la copia.'} />
        </label>
        <div class="fila">
          <button type="button" class="boton" onClick={copiar} disabled={!copia}>
            <IconoCopiar /> Copiar al portapapeles
          </button>
        </div>
        <Aviso mensaje={msgExportar} />
      </section>

      <section class="tarjeta" aria-labelledby="titulo-importar">
        <h3 id="titulo-importar">Importar</h3>
        <p class="ayuda">Pega una copia de seguridad. Sustituirá todos los datos actuales.</p>
        <label class="campo">
          <span>Texto de la copia</span>
          <textarea value={texto} rows={4} onInput={(e) => setTexto(e.currentTarget.value)} />
        </label>
        <div class="fila">
          <button
            type="button"
            class="boton"
            ref={botonImportar}
            disabled={texto.trim() === ''}
            onClick={() => setConfirmando('importar')}
          >
            <IconoImportar /> Importar
          </button>
        </div>
        {confirmando === 'importar' && (
          <Confirmacion
            id="conf-importar"
            titulo="Confirmar importación"
            texto={`Se sustituirán todos los datos actuales por los de la copia. ${AVISO_DESHACER(ilegible !== null)} ¿Continuar?`}
            textoConfirmar="Sí, sustituir datos"
            alConfirmar={importar}
            alCancelar={() => cerrarConfirmacion(botonImportar)}
          />
        )}
        <Aviso mensaje={msgImportar} />
      </section>

      <section class="tarjeta" aria-labelledby="titulo-ejemplo">
        <h3 id="titulo-ejemplo">Datos de ejemplo</h3>
        <p class="ayuda">Carga una planta ficticia con personas EMP-01 a EMP-29. Sustituye los datos actuales.</p>
        <div class="fila">
          <button type="button" class="boton" ref={botonEjemplo} onClick={() => setConfirmando('ejemplo')}>
            Cargar datos de ejemplo
          </button>
        </div>
        {confirmando === 'ejemplo' && (
          <Confirmacion
            id="conf-ejemplo"
            titulo="Confirmar carga de ejemplo"
            texto={`Se sustituirán todos los datos actuales por los de ejemplo. ${AVISO_DESHACER(ilegible !== null)} ¿Continuar?`}
            textoConfirmar="Sí, cargar ejemplo"
            alConfirmar={cargarEjemplo}
            alCancelar={() => cerrarConfirmacion(botonEjemplo)}
          />
        )}
        <Aviso mensaje={msgEjemplo} />
      </section>
    </div>
  );
}
