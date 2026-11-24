import { useEffect, useRef } from 'preact/hooks';

export interface PropsConfirmacion {
  id: string;
  titulo: string;
  texto: string;
  /** Lista opcional bajo el texto (p. ej. las reglas afectadas). */
  lista?: string[];
  textoConfirmar: string;
  alConfirmar: () => void;
  alCancelar: () => void;
}

/** Diálogo de confirmación accesible: foco en Cancelar, Escape cierra. */
export function Confirmacion({ id, titulo, texto, lista, textoConfirmar, alConfirmar, alCancelar }: PropsConfirmacion) {
  const cancelar = useRef<HTMLButtonElement>(null);
  // Elemento con el foco al abrirse (se captura en el primer render, antes de mover el foco).
  const previo = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement);
  useEffect(() => {
    cancelar.current?.focus();
    return () => {
      const el = previo.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus();
    };
  }, []);
  return (
    <div
      class="confirmacion"
      role="alertdialog"
      aria-labelledby={`${id}-titulo`}
      aria-describedby={`${id}-texto`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          alCancelar();
        }
      }}
    >
      <p id={`${id}-titulo`}>
        <strong>{titulo}</strong>
      </p>
      <p id={`${id}-texto`}>{texto}</p>
      {lista && lista.length > 0 && (
        <ul class="lista-confirmacion">
          {lista.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      <div class="fila">
        <button type="button" class="boton peligro" onClick={alConfirmar}>
          {textoConfirmar}
        </button>
        <button type="button" class="boton" ref={cancelar} onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
