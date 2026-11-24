/**
 * Ejecuta el motor en un Web Worker en línea; si no se puede crear (o falla al arrancar),
 * lo ejecuta en el hilo principal (ARQUITECTURA §11.1).
 */
import Trabajador from '../motor/trabajador?worker&inline';
import { motor } from '../motor/motor';
import type { PeticionMotor, ProgresoMotor, ResultadoMotor } from '../motor/contrato';

export class MotorCancelado extends Error {
  constructor() {
    super('Generación cancelada.');
    this.name = 'MotorCancelado';
  }
}

export interface EjecucionMotor {
  promesa: Promise<ResultadoMotor>;
  cancelar(): void;
}

export type EjecutorMotor = (peticion: PeticionMotor, alProgresar: (p: ProgresoMotor) => void) => EjecucionMotor;

type Mensaje = { tipo: 'progreso'; progreso: ProgresoMotor } | { tipo: 'resultado'; resultado: ResultadoMotor } | { tipo: 'error'; mensaje: string };

function leerMensaje(d: unknown): Mensaje | null {
  if (typeof d !== 'object' || d === null) return null;
  const m = d as { tipo?: unknown; progreso?: unknown; resultado?: unknown; mensaje?: unknown };
  if (m.tipo === 'progreso' && m.progreso) return { tipo: 'progreso', progreso: m.progreso as ProgresoMotor };
  if (m.tipo === 'resultado' && m.resultado) return { tipo: 'resultado', resultado: m.resultado as ResultadoMotor };
  if (m.tipo === 'error') return { tipo: 'error', mensaje: typeof m.mensaje === 'string' ? m.mensaje : 'No se pudo generar el cuadrante.' };
  return null;
}

export function ejecutarMotor(peticion: PeticionMotor, alProgresar: (p: ProgresoMotor) => void): EjecucionMotor {
  let terminada = false;
  let detener: () => void = () => {};

  const promesa = new Promise<ResultadoMotor>((resolver, rechazar) => {
    const acabar = (accion: () => void) => {
      if (terminada) return;
      terminada = true;
      accion();
    };

    function enHiloPrincipal() {
      const temporizador = setTimeout(() => {
        if (terminada) return;
        try {
          const resultado = motor.generar(peticion, (p) => {
            if (!terminada) alProgresar(p);
          });
          acabar(() => resolver(resultado));
        } catch (e) {
          const detalle = e instanceof Error && e.message ? ` (${e.message})` : '';
          acabar(() => rechazar(new Error(`No se pudo generar el cuadrante${detalle}.`)));
        }
      }, 0);
      detener = () => {
        clearTimeout(temporizador);
        acabar(() => rechazar(new MotorCancelado()));
      };
    }

    let trabajador: Worker | null = null;
    try {
      trabajador = new Trabajador();
    } catch {
      trabajador = null;
    }
    if (!trabajador) {
      enHiloPrincipal();
      return;
    }

    const w = trabajador;
    let recibioAlgo = false;
    detener = () => {
      w.terminate();
      acabar(() => rechazar(new MotorCancelado()));
    };
    w.onmessage = (e: MessageEvent<unknown>) => {
      const m = leerMensaje(e.data);
      if (!m || terminada) return;
      recibioAlgo = true;
      if (m.tipo === 'progreso') alProgresar(m.progreso);
      else if (m.tipo === 'resultado') {
        w.terminate();
        acabar(() => resolver(m.resultado));
      } else {
        w.terminate();
        acabar(() => rechazar(new Error(m.mensaje)));
      }
    };
    w.onerror = () => {
      w.terminate();
      if (terminada) return;
      // Si el worker ni siquiera arrancó (p. ej. bloqueado por el navegador), se usa el hilo principal.
      if (!recibioAlgo) enHiloPrincipal();
      else acabar(() => rechazar(new Error('El motor se detuvo de forma inesperada.')));
    };
    try {
      w.postMessage({ tipo: 'generar', peticion });
    } catch {
      w.terminate();
      enHiloPrincipal();
    }
  });

  return { promesa, cancelar: () => detener() };
}
