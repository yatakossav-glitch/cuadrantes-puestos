/**
 * Web Worker del motor (ARQUITECTURA §11.1).
 * Mensajes de entrada: { tipo: 'generar', peticion }.
 * Mensajes de salida: { tipo: 'progreso', progreso } … { tipo: 'resultado', resultado } | { tipo: 'error', mensaje }.
 */
import type { PeticionMotor, ProgresoMotor, ResultadoMotor } from './contrato';
import { motor } from './motor';

export type MensajeEntrada = { tipo: 'generar'; peticion: PeticionMotor };
export type MensajeSalida =
  | { tipo: 'progreso'; progreso: ProgresoMotor }
  | { tipo: 'resultado'; resultado: ResultadoMotor }
  | { tipo: 'error'; mensaje: string };

interface ContextoTrabajador {
  postMessage(mensaje: MensajeSalida): void;
  onmessage: ((e: MessageEvent<unknown>) => void) | null;
}

export function esMensajeEntrada(m: unknown): m is MensajeEntrada {
  return typeof m === 'object' && m !== null && (m as { tipo?: unknown }).tipo === 'generar' && 'peticion' in m;
}

const contexto = self as unknown as ContextoTrabajador;

contexto.onmessage = (e) => {
  if (!esMensajeEntrada(e.data)) return;
  try {
    const resultado = motor.generar(e.data.peticion, (progreso) => contexto.postMessage({ tipo: 'progreso', progreso }));
    contexto.postMessage({ tipo: 'resultado', resultado });
  } catch (error) {
    const detalle = error instanceof Error && error.message ? ` (${error.message})` : '';
    contexto.postMessage({ tipo: 'error', mensaje: `No se pudo generar el cuadrante${detalle}.` });
  }
};
