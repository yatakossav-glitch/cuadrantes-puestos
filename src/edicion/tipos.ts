/** Resultado de analizar una acción de edición antes de aplicarla. */
export interface Impacto {
  /** Motivos que impiden la acción (la interfaz no ofrece continuar). */
  bloqueos: string[];
  /** Lo que ocurrirá si se aplica, contado y nombrado en español. */
  efectos: string[];
}
