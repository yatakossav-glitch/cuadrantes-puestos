import { useMemo, useState } from 'preact/hooks';
import { tablaPlana, tablaPorArea, tablaPorPersona, type TablaExportada } from '../../exportar/excel';
import { copiarTabla } from '../../exportar/portapapeles';
import type { Config, EstadoApp, FechaISO } from '../../modelo/tipos';
import { IconoCopiar } from '../iconos';

type Formato = 'area' | 'persona' | 'plano';
const FILAS_VISTA_PREVIA = 8;

export interface PropsCopiarExcel {
  estado: EstadoApp;
  lunes: FechaISO;
  copiar?: (t: TablaExportada) => Promise<{ ok: true } | { ok: false; error: string }>;
}

/** Botón «Copiar para Excel» con panel de opciones y vista previa. */
export function CopiarExcel({ estado, lunes, copiar = copiarTabla }: PropsCopiarExcel) {
  const areas = useMemo(() => estado.areas.filter((a) => a.activa).sort((a, b) => a.orden - b.orden), [estado.areas]);
  const [abierto, setAbierto] = useState(false);
  const [formatoElegido, setFormato] = useState<Formato>('area');
  const [areaId, setAreaId] = useState<string>(areas[0]?.id ?? '');
  const [disposicion, setDisposicion] = useState<Config['exportacionArea']>(estado.config.exportacionArea);
  const [sinAlias, setSinAlias] = useState(true);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);

  // Sin áreas activas no hay formato «por área»: se pasa a «por persona».
  const formato: Formato = formatoElegido === 'area' && areas.length === 0 ? 'persona' : formatoElegido;
  const areaEfectiva = areas.some((a) => a.id === areaId) ? areaId : (areas[0]?.id ?? '');
  const tabla = useMemo<TablaExportada>(() => {
    const o = { sinAlias };
    if (formato === 'area') return tablaPorArea(estado, lunes, areaEfectiva, disposicion, o);
    if (formato === 'persona') return tablaPorPersona(estado, lunes, o);
    return tablaPlana(estado, lunes, o);
  }, [estado, lunes, formato, areaEfectiva, disposicion, sinAlias]);

  const cambiar = <T,>(poner: (v: T) => void) => (v: T) => {
    poner(v);
    setMensaje(null);
  };

  const alCopiar = async () => {
    const r = await copiar(tabla);
    setMensaje(r.ok ? { texto: 'Copiado: pégalo en Excel con Ctrl+V', error: false } : { texto: r.error, error: true });
  };

  const todos: { valor: Formato; texto: string }[] = [
    { valor: 'area', texto: 'Por área' },
    { valor: 'persona', texto: 'Por persona' },
    { valor: 'plano', texto: 'Listado completo' },
  ];
  const formatos = todos.filter((f) => f.valor !== 'area' || areas.length > 0);
  const sinContenido = tabla.filas.length <= 1;
  const previa = tabla.filas.slice(0, FILAS_VISTA_PREVIA);

  return (
    <div class="copiar-excel">
      <button type="button" class="boton" aria-expanded={abierto} aria-controls="panel-copiar-excel" onClick={() => setAbierto(!abierto)}>
        <IconoCopiar /> Copiar para Excel
      </button>
      {abierto && (
        <section id="panel-copiar-excel" class="panel" aria-label="Copiar para Excel" style={{ maxWidth: '100%', marginTop: '8px' }}>
          <fieldset class="campo">
            <legend>Formato</legend>
            {formatos.map((f) => (
              <div class="casilla" key={f.valor}>
                <input
                  type="radio"
                  id={`copiar-formato-${f.valor}`}
                  name="copiar-formato"
                  checked={formato === f.valor}
                  onChange={() => cambiar(setFormato)(f.valor)}
                />
                <label for={`copiar-formato-${f.valor}`}>{f.texto}</label>
              </div>
            ))}
          </fieldset>
          {formato === 'area' && (
            <>
              <div class="campo">
                <label for="copiar-area">Área</label>
                <select id="copiar-area" value={areaEfectiva} onChange={(e) => cambiar(setAreaId)(e.currentTarget.value)}>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div class="campo">
                <label for="copiar-disposicion">Disposición</label>
                <select
                  id="copiar-disposicion"
                  value={disposicion}
                  onChange={(e) => cambiar(setDisposicion)(e.currentTarget.value as Config['exportacionArea'])}
                >
                  <option value="diasEnColumnas">Días en columnas</option>
                  <option value="franjasEnColumnas">Franjas en columnas</option>
                </select>
              </div>
            </>
          )}
          <div class="casilla">
            <input id="copiar-sin-alias" type="checkbox" checked={sinAlias} onChange={(e) => cambiar(setSinAlias)(e.currentTarget.checked)} />
            <label for="copiar-sin-alias">Exportar sin alias</label>
          </div>
          {sinContenido && <p class="ayuda">Esta semana no tiene nada que copiar en este formato.</p>}
          <p class="ayuda">Vista previa de {tabla.titulo} (primeras {previa.length} de {tabla.filas.length} filas)</p>
          <div style={{ overflowX: 'auto', maxWidth: '100%' }} tabIndex={0} role="region" aria-label="Vista previa de la tabla">
            <table class="vista-previa-copiar">
              <tbody>
                {previa.map((fila, i) => (
                  <tr key={i}>
                    {fila.map((c, j) => (i === 0 ? <th key={j} scope="col">{c}</th> : <td key={j}>{c}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div class="fila" style={{ marginTop: '8px' }}>
            <button type="button" class="boton primario" disabled={sinContenido} onClick={alCopiar}>
              Copiar
            </button>
          </div>
          <p role="status" class={mensaje?.error ? 'error-campo' : 'ayuda'}>
            {mensaje?.texto ?? ''}
          </p>
        </section>
      )}
    </div>
  );
}
