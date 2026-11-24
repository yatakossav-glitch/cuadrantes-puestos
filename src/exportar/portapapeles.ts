/** Escritura en el portapapeles (D13). Única parte de `exportar` que toca el navegador. */
import { aHTML, aTSV, type TablaExportada } from './excel';

export type ResultadoCopia = { ok: true } | { ok: false; error: string };

const ERROR_COPIA = 'No se ha podido copiar. Prueba a seleccionar la tabla y copiarla a mano.';

async function copiarConApi(html: string, texto: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.write !== 'function') return false;
    if (typeof ClipboardItem === 'undefined' || globalThis.isSecureContext === false) return false;
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([texto], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    return false;
  }
}

function copiarConEvento(html: string, texto: string): boolean {
  let escrito = false;
  const alCopiar = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    e.clipboardData.setData('text/html', html);
    e.clipboardData.setData('text/plain', texto);
    e.preventDefault();
    escrito = true;
  };
  document.addEventListener('copy', alCopiar);
  try {
    const hecho = document.execCommand('copy');
    return hecho && escrito;
  } catch {
    return false;
  } finally {
    document.removeEventListener('copy', alCopiar);
  }
}

/** Nunca lanza: devuelve `{ ok: false, error }` en español si ninguna vía funciona. */
export async function copiarTabla(t: TablaExportada): Promise<ResultadoCopia> {
  try {
    const html = aHTML(t);
    const texto = aTSV(t);
    if (await copiarConApi(html, texto)) return { ok: true };
    if (copiarConEvento(html, texto)) return { ok: true };
  } catch {
    // se cae al error genérico
  }
  return { ok: false, error: ERROR_COPIA };
}
